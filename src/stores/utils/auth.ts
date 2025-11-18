import { EncryptionKey } from '../../assets/generated/wasm/gossip_wasm';
import { validateMnemonic } from '../../crypto/bip39';
import { decrypt, deriveKey } from '../../crypto/encryption';
import { biometricService } from '../../crypto/biometricService';
import { UserProfile } from '../../db';

export interface AuthResult {
  mnemonic: string;
  encryptionKey: EncryptionKey;
}
export async function auth(
  profile: UserProfile,
  password?: string
): Promise<AuthResult> {
  const salt = profile.security.encKeySalt;
  if (!salt || salt.length < 8) {
    throw new Error(
      'Account is missing encryption key salt. Please re-authenticate and re-create your account after updating the app.'
    );
  }

  let enKeySeed: string;
  // Check if this is a biometric account
  if (profile.security.webauthn?.credentialId) {
    // For biometric accounts, authenticate using the unified biometric service
    const authResult = await biometricService.authenticate(
      profile.security.webauthn.credentialId,
      'Authenticate to access your account'
    );

    if (!authResult.success) {
      throw new Error(authResult.error || 'Biometric authentication failed');
    }

    // Derive EncryptionKey from public WebAuthn fields
    enKeySeed =
      profile.security.webauthn.credentialId +
      Buffer.from(profile.security.webauthn.publicKey).toString('base64');
  } else if (password) {
    enKeySeed = password;
  } else {
    throw new Error('Invalid authentication method or missing password');
  }

  try {
    const encryptionKey = await deriveKey(enKeySeed, salt);
    const mnemonic = await decrypt(
      profile.security.mnemonicBackup.encryptedMnemonic,
      profile.security.mnemonicBackup.nonce,
      encryptionKey
    );

    if (!validateMnemonic(mnemonic)) {
      throw new Error('Failed to validate mnemonic');
    }

    return {
      mnemonic,
      encryptionKey,
    };
  } catch (error) {
    throw new Error(
      `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
