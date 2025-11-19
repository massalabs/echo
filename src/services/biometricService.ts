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

export interface BiometricResult {
  success: boolean;
  error?: string;
}

export interface BiometricAvailability {
  available: boolean;
  biometryType?: 'fingerprint' | 'face' | 'none';
  reason?: string;
  method?: 'capacitor' | 'webauthn' | 'none';
}

export interface BiometricMethods {
  capacitor: boolean;
  webauthn: boolean;
  any: boolean;
}

export interface CreateCredentialResult extends BiometricResult {
  credentialId?: string;
  publicKey?: ArrayBuffer;
}

/**
 * Unified biometric service that uses Capacitor Biometric Auth as default
 * with WebAuthn as fallback for web platforms
 */
export class BiometricService {
  private static instance: BiometricService;
  private isNative: boolean;
  private capacitorAvailable: boolean;

  private constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.capacitorAvailable =
      this.isNative && this.checkCapacitorAvailability();
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
   * Check which biometric methods are available
   */
  public async checkBiometricMethods(): Promise<BiometricMethods> {
    const methods: BiometricMethods = {
      capacitor: false,
      webauthn: false,
      any: false,
    };

    // Check Capacitor Biometric Auth
    if (this.capacitorAvailable) {
      try {
        const result = await BiometricAuth.checkBiometry();
        methods.capacitor = result.isAvailable;
      } catch (error) {
        console.warn('Capacitor biometric check failed:', error);
        methods.capacitor = false;
      }
    }

    // Check WebAuthn
    if (isWebAuthnSupported()) {
      try {
        const platformAvailable = await isPlatformAuthenticatorAvailable();
        methods.webauthn = platformAvailable;
      } catch (error) {
        console.warn('WebAuthn availability check failed:', error);
        methods.webauthn = false;
      }
    }

    methods.any = methods.capacitor || methods.webauthn;
    return methods;
  }

  /**
   * Check if biometric authentication is available
   */
  public async checkAvailability(): Promise<BiometricAvailability> {
    const methods = await this.checkBiometricMethods();

    // Try Capacitor Biometric Auth first (native)
    if (methods.capacitor) {
      try {
        const result = await BiometricAuth.checkBiometry();

        const availability = {
          available: result.isAvailable,
          biometryType: this.mapBiometryType(result.biometryType),
          reason: result.reason || undefined,
          method: 'capacitor' as const,
        };

        return availability;
      } catch (error) {
        console.warn('Capacitor biometric check failed:', error);
      }
    }

    // Fallback to WebAuthn
    if (methods.webauthn) {
      try {
        const platformAvailable = await isPlatformAuthenticatorAvailable();

        const availability: BiometricAvailability = {
          available: platformAvailable,
          biometryType: platformAvailable ? 'fingerprint' : 'none',
          method: 'webauthn' as const,
        };

        return availability;
      } catch (error) {
        console.warn('WebAuthn availability check failed:', error);
      }
    }

    return {
      available: false,
      biometryType: 'none',
      reason: 'No biometric authentication available',
      method: 'none' as const,
    };
  }

  /**
   * Create a new biometric credential
   */
  public async createCredential(
    username: string,
    userId: Uint8Array,
    _reason?: string
  ): Promise<CreateCredentialResult> {
    // For native platforms, create biometric credentials without WebAuthn browser APIs
    if (this.capacitorAvailable) {
      try {
        // Generate a unique credential ID for this account
        const credentialId = await this.generateCredentialId(username, userId);

        // Verify that the user can unlock with biometrics before saving the session
        // This ensures the biometric device is actually accessible and working
        const verifyResult = await biometricService.authenticate(
          credentialId,
          'Verify biometric access to complete account setup'
        );

        if (!verifyResult.success) {
          throw new Error(
            verifyResult.error ||
              'Biometric verification failed. Please try again.'
          );
        }

        // Generate a random public key identifier for consistency with WebAuthn format
        // For native platforms, we generate a random identifier since we don't have
        // access to the actual WebAuthn public key. This is used only for key derivation.
        const publicKeyArray = crypto.getRandomValues(new Uint8Array(32));
        const publicKey = publicKeyArray.buffer;

        return {
          success: true,
          credentialId,
          publicKey,
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
      const webAuthnResult = await createWebAuthnCredential(username, userId);
      return {
        success: true,
        credentialId: webAuthnResult.credentialId,
        publicKey: webAuthnResult.publicKey,
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
   */
  public async authenticate(
    credentialId: string,
    reason?: string
  ): Promise<BiometricResult> {
    // Use Capacitor Biometric Auth for native platforms
    if (this.capacitorAvailable) {
      try {
        await BiometricAuth.authenticate({
          reason: reason || 'Authenticate to access your account',
          allowDeviceCredential: true,
        });

        return { success: true };
      } catch (error) {
        console.error('Native biometric authentication failed:', error);
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

    // Use WebAuthn for web platforms only
    try {
      await authenticateWithWebAuthn(credentialId);
      return { success: true };
    } catch (error) {
      console.error('WebAuthn authentication failed:', error);
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

  /**
   * Generate a unique credential ID for biometric account
   */
  private async generateCredentialId(
    username: string,
    userId: Uint8Array
  ): Promise<string> {
    const timestamp = Date.now().toString();
    const data = `${username}:${Buffer.from(userId).toString('base64')}:${timestamp}`;
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(data)
    );
    const hash = new Uint8Array(hashBuffer);
    return btoa(String.fromCharCode(...hash))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

// Export singleton instance
export const biometricService = BiometricService.getInstance();
