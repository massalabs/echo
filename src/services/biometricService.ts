import { Capacitor } from '@capacitor/core';
import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  BiometryType,
} from '@aparajita/capacitor-biometric-auth';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  createWebAuthnCredential,
  authenticateWithWebAuthn,
} from '../crypto/webauthn';
import { EncryptionKey, generateEncryptionKeyFromSeed } from '../wasm';
import { encodeUserId } from '../utils';

export interface BiometricAvailability {
  available: boolean;
  biometryType?: 'fingerprint' | 'face' | 'none';
  method?: 'capacitor' | 'webauthn' | 'none';
}

export interface BiometricCredentials {
  encryptionKey: EncryptionKey;
}

export interface BiometricCreationData extends BiometricCredentials {
  authMethod: 'capacitor' | 'webauthn';
  credentialId?: string;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
  data?: BiometricCredentials;
}

export interface BiometricCreationResult {
  success: boolean;
  error?: string;
  data?: BiometricCreationData;
}

/**
 * Unified biometric service that uses Capacitor Biometric Auth as default
 * with WebAuthn as fallback for web platforms
 */
export class BiometricService {
  private static instance: BiometricService;
  private isNative: boolean;
  private capacitorAvailable: boolean;
  private isWebAuthnSupported: boolean;

  private constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.capacitorAvailable =
      this.isNative && this.checkCapacitorAvailability();
    this.isWebAuthnSupported = isWebAuthnSupported();
  }

  public static getInstance(): BiometricService {
    if (!BiometricService.instance) {
      BiometricService.instance = new BiometricService();
    }
    return BiometricService.instance;
  }

  private checkCapacitorAvailability(): boolean {
    try {
      return (
        typeof BiometricAuth !== 'undefined' &&
        typeof BiometricAuth.checkBiometry === 'function'
      );
    } catch {
      return false;
    }
  }

  /**
   * Internal method that performs all biometric checks once
   * Returns both methods and detailed availability information
   */
  private async performBiometricChecks(): Promise<{
    capacitorAvailable: boolean;
    webauthnAvailable: boolean;
    capacitorBiometryType: BiometryType | undefined;
  }> {
    let capacitorAvailable = false;
    let webauthnAvailable = false;
    let capacitorBiometryType: BiometryType | undefined;
    // Check Capacitor Biometric Auth
    if (this.capacitorAvailable) {
      try {
        const { isAvailable, biometryType } =
          await BiometricAuth.checkBiometry();
        capacitorAvailable = isAvailable;
        capacitorBiometryType = biometryType;
      } catch (error) {
        console.warn('Capacitor biometric not available:', error);
      }
    }

    // Check WebAuthn
    if (this.isWebAuthnSupported) {
      try {
        webauthnAvailable = await isPlatformAuthenticatorAvailable();
      } catch (error) {
        console.warn('WebAuthn not available:', error);
      }
    }

    return { capacitorAvailable, webauthnAvailable, capacitorBiometryType };
  }

  /**
   * Check if biometric authentication is available with detailed information
   * Returns both availability details and which methods are supported
   */
  public async checkAvailability(): Promise<BiometricAvailability> {
    const { capacitorAvailable, webauthnAvailable, capacitorBiometryType } =
      await this.performBiometricChecks();

    // Try Capacitor Biometric Auth first (native)
    if (capacitorAvailable) {
      return {
        available: true,
        biometryType: this.mapBiometryType(capacitorBiometryType!),
        method: 'capacitor' as const,
      };
    }

    // Fallback to WebAuthn
    if (webauthnAvailable) {
      return {
        available: webauthnAvailable,
        biometryType: 'fingerprint',
        method: 'webauthn' as const,
      };
    }

    return {
      available: false,
      biometryType: 'none',
      method: 'none' as const,
    };
  }

  /**
   * Create a new biometric credential
   */
  public async createCredential(
    username: string,
    userId: Uint8Array,
    salt: Uint8Array
  ): Promise<BiometricCreationResult> {
    // For native platforms, create biometric credentials without WebAuthn browser APIs
    if (this.capacitorAvailable) {
      try {
        // temp workaround waiting for secure storage implem
        const seed = encodeUserId(userId);
        const encryptionKey = await generateEncryptionKeyFromSeed(seed, salt);

        const verifyResult = await this.authenticate('capacitor', seed, salt);

        if (!verifyResult.success) {
          throw new Error(
            verifyResult.error ||
              'Biometric verification failed. Please try again.'
          );
        }

        // const encryptionKey = await generateEncryptionKey();

        return {
          success: true,
          data: {
            encryptionKey,
            authMethod: 'capacitor',
          },
        };
      } catch (error) {
        console.error('Native biometric credential creation failed:', error);
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to create biometric credential',
        };
      }
    }

    // Fallback to WebAuthn only for web
    try {
      const webAuthnResult = await createWebAuthnCredential(
        username,
        userId,
        salt
      );
      return {
        success: true,
        data: {
          credentialId: webAuthnResult.credentialId,
          encryptionKey: webAuthnResult.encryptionKey,
          authMethod: 'webauthn',
        },
      };
    } catch (error) {
      console.error('WebAuthn credential creation failed:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create biometric credential',
      };
    }
  }

  /**
   * Authenticate using existing biometric credential
   * @param method - The authentication method to use
   * @param credentialId - The credential ID to authenticate with (required for WebAuthn PRF)
   * @param salt - The salt used during credential creation (required for WebAuthn PRF)
   */
  public async authenticate(
    method: 'capacitor' | 'webauthn',
    credentialId?: string,
    salt?: Uint8Array
  ): Promise<BiometricResult> {
    try {
      // Use Capacitor Biometric Auth for native platforms
      if (method === 'capacitor' && this.capacitorAvailable) {
        await BiometricAuth.authenticate({
          reason: 'Authenticate to access your account',
          allowDeviceCredential: true,
        });

        // temp workaround waiting for secure storage implem
        const encryptionKey = await generateEncryptionKeyFromSeed(
          credentialId!,
          salt!
        );

        return { success: true, data: { encryptionKey } };
      } else if (method === 'webauthn' && this.isWebAuthnSupported) {
        if (!credentialId || !salt) {
          throw new Error(
            'Credential ID and salt are required for WebAuthn authentication'
          );
        }
        const webAuthnResult = await authenticateWithWebAuthn(
          credentialId,
          salt
        );
        return {
          success: true,
          data: webAuthnResult,
        };
      }
      throw new Error(
        `Invalid or not available authentication method ${method}`
      );
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      if (
        error instanceof BiometryError &&
        error.code === BiometryErrorType.userCancel
      ) {
        return {
          success: false,
          error: 'Authentication was cancelled',
        };
      }
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Biometric authentication failed',
      };
    }
  }

  /**
   * Get the current platform and authentication method info
   */
  public getPlatformInfo() {
    return {
      isNative: this.isNative,
      capacitorAvailable: this.capacitorAvailable,
      platform: Capacitor.getPlatform(),
      webAuthnSupported: isWebAuthnSupported(),
    };
  }

  /**
   * Map Capacitor biometry type to our simplified type
   */
  private mapBiometryType(type: BiometryType): 'fingerprint' | 'face' | 'none' {
    switch (type) {
      case BiometryType.touchId:
      case BiometryType.fingerprintAuthentication:
        return 'fingerprint';
      case BiometryType.faceId:
      case BiometryType.faceAuthentication:
        return 'face';
      case BiometryType.none:
      default:
        return 'none';
    }
  }
}

// Export singleton instance
export const biometricService = BiometricService.getInstance();
