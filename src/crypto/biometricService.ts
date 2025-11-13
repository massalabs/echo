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
} from './webauthn';

export interface BiometricResult {
  success: boolean;
  error?: string;
}

export interface BiometricAvailability {
  available: boolean;
  biometryType?: 'fingerprint' | 'face' | 'none';
  reason?: string;
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
   * Check if biometric authentication is available
   */
  public async checkAvailability(): Promise<BiometricAvailability> {
    // Try Capacitor Biometric Auth first (native)
    if (this.capacitorAvailable) {
      try {
        const result = await BiometricAuth.checkBiometry();
        return {
          available: result.isAvailable,
          biometryType: this.mapBiometryType(result.biometryType),
          reason: result.reason || undefined,
        };
      } catch (error) {
        console.warn('Capacitor biometric check failed:', error);
      }
    }

    // Fallback to WebAuthn
    if (isWebAuthnSupported()) {
      try {
        const platformAvailable = await isPlatformAuthenticatorAvailable();
        return {
          available: platformAvailable,
          biometryType: platformAvailable ? 'fingerprint' : 'none',
        };
      } catch (error) {
        console.warn('WebAuthn availability check failed:', error);
      }
    }

    return {
      available: false,
      biometryType: 'none',
      reason: 'No biometric authentication available',
    };
  }

  /**
   * Create a new biometric credential
   */
  public async createCredential(
    username: string,
    userId: Uint8Array,
    reason?: string
  ): Promise<CreateCredentialResult> {
    // For native platforms, we use WebAuthn since Capacitor Biometric Auth doesn't support credential creation
    // The authentication will be handled by Capacitor Biometric Auth
    if (this.capacitorAvailable) {
      try {
        // First authenticate with native biometrics to ensure user consent
        await BiometricAuth.authenticate({
          reason: reason || 'Create biometric credential for secure access',
          allowDeviceCredential: true,
        });

        // Then create WebAuthn credential for the actual cryptographic operations
        const webAuthnResult = await createWebAuthnCredential(username, userId);
        return {
          success: true,
          credentialId: webAuthnResult.credentialId,
          publicKey: webAuthnResult.publicKey,
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
    // Try Capacitor Biometric Auth first (native)
    if (this.capacitorAvailable) {
      try {
        await BiometricAuth.authenticate({
          reason: reason || 'Authenticate to access your account',
          allowDeviceCredential: true,
        });

        // For native platforms, we still need to verify the WebAuthn credential
        // to ensure the cryptographic material is valid
        await authenticateWithWebAuthn(credentialId);
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

    // Fallback to WebAuthn
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
   * Check if we should use native biometrics or WebAuthn
   */
  public shouldUseNativeBiometrics(): boolean {
    return this.capacitorAvailable;
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
