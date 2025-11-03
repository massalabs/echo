import { create } from 'zustand';
import { db, UserProfile } from '../db';

import { encrypt, decrypt, deriveKey } from '../crypto/encryption';
import {
  createWebAuthnCredential,
  authenticateWithWebAuthn,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from '../crypto/webauthn';
import {
  generateMnemonic,
  Bip39BackupDisplay,
  validateMnemonic,
} from '../crypto/bip39';
import {
  JsonRpcProvider,
  Provider,
  PublicApiUrl,
  Account,
  PrivateKey,
  NetworkName,
} from '@massalabs/massa-web3';
import { useAppStore } from './appStore';
import { useWalletStore } from './walletStore';
import { createSelectors } from './utils/createSelectors';
import { generateUserKeys, EncryptionKey, generateNonce } from '../wasm';
import {
  UserPublicKeys,
  UserSecretKeys,
} from '../assets/generated/wasm/echo_wasm';
import bs58check from 'bs58check';
import { getActiveOrFirstProfile } from './utils/getAccount';
import { getSessionModule } from '../wasm/loader';

async function createProfileFromAccount(
  username: string,
  userId: string,
  security: UserProfile['security']
): Promise<UserProfile> {
  const existing = await db.userProfile.get(userId);
  if (existing) {
    // Merge with existing profile; prefer newly provided security fields when present
    const mergedSecurity: UserProfile['security'] = {
      ...existing.security,
      ...security,
      webauthn: security.webauthn ?? existing.security.webauthn,
      encKeySalt: security.encKeySalt ?? existing.security.encKeySalt,
      mnemonicBackup:
        security.mnemonicBackup ?? existing.security.mnemonicBackup,
    };

    const updatedProfile: UserProfile = {
      ...existing,
      // Preserve existing username if already set; do not silently overwrite
      username: existing.username || username,
      security: mergedSecurity,
      status: existing.status ?? 'online',
      lastSeen: new Date(),
      updatedAt: new Date(),
    };
    await db.userProfile.put(updatedProfile);
    return updatedProfile;
  }

  const newProfile: UserProfile = {
    userId,
    username,
    security,
    status: 'online',
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.userProfile.add(newProfile);
  return newProfile;
}

async function provisionAccount(
  username: string,
  userId: string,
  mnemonic: string | undefined,
  opts: { useBiometrics: boolean; password?: string }
): Promise<{ profile: UserProfile; encryptionKey: EncryptionKey }> {
  let built:
    | { security: UserProfile['security']; encryptionKey: EncryptionKey }
    | undefined;

  if (opts.useBiometrics) {
    built = await buildSecurityFromWebAuthn(mnemonic, username, userId);
  } else {
    const password = opts.password?.trim();
    if (!password) {
      throw new Error('Password is required');
    }
    built = await buildSecurityFromPassword(mnemonic, password);
  }

  const profile = await createProfileFromAccount(
    username,
    userId,
    built.security
  );
  return { profile, encryptionKey: built.encryptionKey };
}

// Helpers to build security blobs and in-memory keys
async function buildSecurityFromPassword(
  mnemonic: string | undefined,
  password: string
): Promise<{
  security: UserProfile['security'];
  encryptionKey: EncryptionKey;
}> {
  const salt = (await generateNonce()).to_bytes();
  const key = await deriveKey(password, salt);

  let mnemonicBackup: UserProfile['security']['mnemonicBackup'] | undefined;
  if (mnemonic) {
    const { encryptedData: encryptedMnemonic, nonce: nonceForBackup } =
      await encrypt(mnemonic, key);
    mnemonicBackup = {
      encryptedMnemonic,
      nonce: nonceForBackup,
      createdAt: new Date(),
      backedUp: false,
    };
  }

  const security: UserProfile['security'] = {
    encKeySalt: salt,
    mnemonicBackup,
  };

  return { security, encryptionKey: key };
}

async function buildSecurityFromWebAuthn(
  mnemonic: string | undefined,
  username: string,
  userId: string
): Promise<{
  security: UserProfile['security'];
  encryptionKey: EncryptionKey;
}> {
  const webauthnKey = await createWebAuthnCredential(
    `Gossip-${username}-${userId}`
  );
  const { credentialId, publicKey } = webauthnKey;

  // Derive EncryptionKey deterministically from credentialId + publicKey
  const seedHash = credentialId + Buffer.from(publicKey).toString('base64');
  const salt = (await generateNonce()).to_bytes();
  const derivedKey = await deriveKey(seedHash, salt);

  // Encrypt mnemonic with derived key using AEAD (store nonce with ciphertext)
  let mnemonicBackup: UserProfile['security']['mnemonicBackup'] | undefined;
  if (mnemonic) {
    const { encryptedData: encryptedMnemonic, nonce: nonceForBackup } =
      await encrypt(mnemonic, derivedKey);
    mnemonicBackup = {
      encryptedMnemonic,
      nonce: nonceForBackup,
      createdAt: new Date(),
      backedUp: false,
    };
  }

  const security: UserProfile['security'] = {
    webauthn: {
      credentialId,
      publicKey: webauthnKey.publicKey,
    },
    encKeySalt: salt,
    mnemonicBackup,
  };

  return { security, encryptionKey: derivedKey };
}

interface AccountState {
  userProfile: UserProfile | null;
  encryptionKey: EncryptionKey | null;
  isInitialized: boolean;
  isLoading: boolean;
  webauthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  account: Account | null;
  provider: Provider | null;
  // In-memory WASM keys (not persisted)
  ourPk?: UserPublicKeys | null;
  ourSk?: UserSecretKeys | null;
  initializeAccountWithBiometrics: (username: string) => Promise<void>;
  loadAccountWithBiometrics: () => Promise<void>;
  initializeAccount: (username: string, password: string) => Promise<void>;
  loadAccount: (password: string, userId?: string) => Promise<void>;
  restoreAccountFromMnemonic: (
    username: string,
    mnemonic: string,
    opts: { useBiometrics: boolean; password?: string }
  ) => Promise<void>;
  resetAccount: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  checkPlatformAvailability: () => Promise<void>;

  // Mnemonic backup methods
  showMnemonicBackup: (password?: string) => Promise<Bip39BackupDisplay>;
  showPrivateKey: (password?: string) => Promise<string>;
  createMnemonicBackup: (mnemonic: string) => Promise<void>;
  getMnemonicBackupInfo: () => { createdAt: Date; backedUp: boolean } | null;
  markMnemonicBackupComplete: () => Promise<void>;
  hasMnemonicBackup: () => boolean;

  // Account detection methods
  hasExistingAccount: () => Promise<boolean>;
  getExistingAccountInfo: () => Promise<UserProfile | null>;
  getAllAccounts: () => Promise<UserProfile[]>;
}

const useAccountStoreBase = create<AccountState>((set, get) => ({
  // Initial state
  userProfile: null,
  encryptionKey: null,
  isInitialized: false,
  isLoading: true,
  webauthnSupported: isWebAuthnSupported(),
  platformAuthenticatorAvailable: false,
  account: null,
  provider: null,
  ourPk: null,
  ourSk: null,
  // Actions
  initializeAccount: async (username: string, password: string) => {
    try {
      set({ isLoading: true });

      const mnemonic = generateMnemonic(256);
      const keys = await generateUserKeys(mnemonic);
      const userPublicKeys = keys.public_keys();
      const userSecretKeys = keys.secret_keys();
      const userIdBytes = userPublicKeys.derive_id();
      const userId = bs58check.encode(userIdBytes);

      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(userSecretKeys.massa_secret_key)
      );

      const { profile, encryptionKey } = await provisionAccount(
        username,
        userId,
        mnemonic,
        {
          useBiometrics: false,
          password,
        }
      );

      set({
        userProfile: profile,
        encryptionKey,
        account,
        ourPk: userPublicKeys,
        ourSk: userSecretKeys,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error creating user profile:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  restoreAccountFromMnemonic: async (
    username: string,
    mnemonic: string,
    opts: { useBiometrics: boolean; password?: string }
  ) => {
    try {
      set({ isLoading: true });

      // Validate mnemonic
      if (!validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
      }

      const keys = await generateUserKeys(mnemonic);
      const userPublicKeys = keys.public_keys();
      const userSecretKeys = keys.secret_keys();
      const userIdBytes = userPublicKeys.derive_id();
      const userId = bs58check.encode(userIdBytes);

      const massaSecretKey = keys.secret_keys().massa_secret_key;
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(massaSecretKey)
      );

      const { profile, encryptionKey } = await provisionAccount(
        username,
        userId,
        mnemonic,
        opts
      );

      set({
        account,
        userProfile: profile,
        encryptionKey,
        ourPk: userPublicKeys,
        ourSk: userSecretKeys,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error restoring account from mnemonic:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  loadAccount: async (password: string, userId?: string) => {
    try {
      set({ isLoading: true });

      // If userId is provided, load that specific account, otherwise use active or first
      let profile: UserProfile | null;
      if (userId) {
        profile = (await db.userProfile.get(userId)) || null;
      } else {
        profile = await getActiveOrFirstProfile();
      }

      if (!profile) {
        throw new Error('No user profile found');
      }

      // Derive EncryptionKey using stored salt
      const salt = profile.security?.encKeySalt;
      if (!salt) {
        throw new Error('Password parameters not found');
      }
      const encryptionKey = await deriveKey(password, salt);

      // Reconstruct account from mnemonic backup
      if (!profile.security?.mnemonicBackup) {
        throw new Error('Mnemonic backup not available to restore account');
      }
      const decryptedMnemonic = await decrypt(
        profile.security.mnemonicBackup.encryptedMnemonic,
        profile.security.mnemonicBackup.nonce,
        encryptionKey
      );
      const keys = await generateUserKeys(decryptedMnemonic);
      const ourPk = keys.public_keys();
      const ourSk = keys.secret_keys();
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(ourSk.massa_secret_key)
      );

      set({
        userProfile: profile,
        account,
        encryptionKey,
        ourPk,
        ourSk,
        isInitialized: true,
        isLoading: false,
      });
      try {
        const sessionModule = await getSessionModule();
        await sessionModule.refresh();
      } catch (e) {
        console.error('Session refresh after login failed:', e);
      }
    } catch (error) {
      console.error('Error loading account:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  resetAccount: async () => {
    try {
      set({ isLoading: true });
      // Delete only the current account, not all accounts
      const currentProfile = await getActiveOrFirstProfile();
      if (currentProfile?.userId != null) {
        await db.userProfile.delete(currentProfile.userId);
      }

      // Determine if any accounts remain after deletion
      let hasAnyAccount = false;
      try {
        const remaining = await db.userProfile.count();
        hasAnyAccount = remaining > 0;
      } catch (_countErr) {
        hasAnyAccount = false;
      }

      set({
        account: null,
        userProfile: null,
        encryptionKey: null,
        isLoading: false,
        isInitialized: hasAnyAccount,
      });
    } catch (error) {
      console.error('Error resetting account:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  checkPlatformAvailability: async () => {
    try {
      const available = await isPlatformAuthenticatorAvailable();
      set({ platformAuthenticatorAvailable: available });
    } catch (error) {
      console.error('Error checking platform availability:', error);
      set({ platformAuthenticatorAvailable: false });
    }
  },

  // WebAuthn-based account initialization
  initializeAccountWithBiometrics: async (username: string) => {
    try {
      set({ isLoading: true });

      // Check WebAuthn support
      if (!isWebAuthnSupported()) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      const platformAvailable = await isPlatformAuthenticatorAvailable();
      if (!platformAvailable) {
        throw new Error(
          'Biometric authentication is not available on this device'
        );
      }

      // Generate a BIP39 mnemonic and create account from it
      const mnemonic = generateMnemonic(256);

      const keys = await generateUserKeys(mnemonic);
      const userPublicKeys = keys.public_keys();
      const userIdBytes = userPublicKeys.derive_id();
      const userId = bs58check.encode(userIdBytes);

      const massaSecretKey = keys.secret_keys().massa_secret_key;
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(massaSecretKey)
      );

      // Create WebAuthn credential
      const webauthnKey = await createWebAuthnCredential(
        `Gossip-${username}-${userId}`
      );
      const { credentialId, publicKey } = webauthnKey;

      // Encrypt mnemonic with WebCrypto AES-GCM using WebAuthn-derived key
      // Use derived EncryptionKey already returned in provisionAccount path; here still creating profile
      const seed = credentialId + Buffer.from(publicKey).toString('base64');
      const salt = (await generateNonce()).to_bytes();
      const derivedKey = await deriveKey(seed, salt);
      const { encryptedData: encryptedMnemonic, nonce: nonce } = await encrypt(
        mnemonic,
        derivedKey
      );

      const newProfile: UserProfile = {
        userId,
        username,
        security: {
          webauthn: {
            credentialId,
            publicKey,
          },
          encKeySalt: salt,
          mnemonicBackup: {
            encryptedMnemonic,
            nonce,
            createdAt: new Date(),
            backedUp: false,
          },
        },
        status: 'online',
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.userProfile.add(newProfile);

      set({
        userProfile: newProfile,
        encryptionKey: derivedKey,
        account,
        ourPk: userPublicKeys,
        ourSk: keys.secret_keys(),
        isInitialized: true,
        isLoading: false,
        platformAuthenticatorAvailable: platformAvailable,
      });
    } catch (error) {
      console.error('Error creating user profile with biometrics:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // WebAuthn-based account loading
  loadAccountWithBiometrics: async (userId?: string) => {
    try {
      set({ isLoading: true });

      let profile: UserProfile | null;
      if (userId) {
        profile = (await db.userProfile.get(userId)) || null;
      } else {
        // Prefer currently authenticated user if present
        profile = await getActiveOrFirstProfile();
      }
      if (!profile) {
        throw new Error('No user profile found');
      }

      if (!profile.security?.webauthn?.credentialId) {
        throw new Error(
          'No WebAuthn credential found. Please use password authentication or recreate your account.'
        );
      }

      await authenticateWithWebAuthn(profile.security.webauthn.credentialId);

      // Reconstruct account from mnemonic backup
      if (!profile.security?.mnemonicBackup) {
        throw new Error('Mnemonic backup not available to restore account');
      }
      // Re-derive EncryptionKey from credentialId + publicKey
      const seed =
        profile.security.webauthn.credentialId +
        Buffer.from(profile.security.webauthn.publicKey).toString('base64');

      const salt = profile.security.encKeySalt;
      if (!salt || salt.length < 8) {
        throw new Error(
          'Biometric account is missing KDF salt. Please re-authenticate and re-create your account after updating the app.'
        );
      }
      const encryptionKey = await deriveKey(seed, salt);
      const decryptedMnemonic = await decrypt(
        profile.security.mnemonicBackup.encryptedMnemonic,
        profile.security.mnemonicBackup.nonce,
        encryptionKey
      );
      const keys = await generateUserKeys(decryptedMnemonic);
      const ourPk = keys.public_keys();
      const ourSk = keys.secret_keys();
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(ourSk.massa_secret_key)
      );

      set({
        userProfile: profile,
        encryptionKey,
        account,
        ourPk,
        ourSk,
        isInitialized: true,
        isLoading: false,
      });
      try {
        const sessionModule = await getSessionModule();
        await sessionModule.refresh();
      } catch (e) {
        console.error('Session refresh after biometric login failed:', e);
      }
    } catch (error) {
      console.error('Error loading account with biometrics:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // Mnemonic backup methods
  showMnemonicBackup: async (password?: string) => {
    try {
      const state = get();
      const profile = state.userProfile;
      if (!profile) {
        throw new Error('No authenticated user');
      }

      if (!profile.security?.mnemonicBackup) {
        throw new Error(
          'Mnemonic backup is not available for this account. Please create a new account to use the backup feature.'
        );
      }

      let decryptedMnemonic: string;

      const salt = profile.security.encKeySalt;
      if (!salt || salt.length < 8) {
        throw new Error(
          'Biometric account is missing KDF salt. Please re-authenticate and re-create your account after updating the app.'
        );
      }

      // Check if this is a biometric account
      if (profile.security.webauthn?.credentialId) {
        // For biometric accounts, authenticate with WebAuthn first (gate UI)
        await authenticateWithWebAuthn(profile.security.webauthn.credentialId);
        // Derive EncryptionKey from public WebAuthn fields
        const seed =
          profile.security.webauthn.credentialId +
          Buffer.from(profile.security.webauthn.publicKey).toString('base64');

        const key = await deriveKey(seed, salt);
        decryptedMnemonic = await decrypt(
          profile.security.mnemonicBackup.encryptedMnemonic,
          profile.security.mnemonicBackup.nonce,
          key
        );
      } else if (password) {
        // For password-based accounts, use the provided password
        try {
          const key = await deriveKey(password, salt);
          decryptedMnemonic = await decrypt(
            profile.security.mnemonicBackup.encryptedMnemonic,
            profile.security.mnemonicBackup.nonce,
            key
          );
        } catch (_e) {
          // CryptoJS decryption throws on bad password; surface a clear error
          throw new Error('Invalid password. Please try again.');
        }
      } else {
        throw new Error('Invalid authentication method or missing password');
      }

      if (!validateMnemonic(decryptedMnemonic)) {
        throw new Error('Failed to validate mnemonic');
      }

      const keys = await generateUserKeys(decryptedMnemonic);
      const massaSecretKey = keys.secret_keys().massa_secret_key;
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(massaSecretKey)
      );

      const backupInfo = {
        mnemonic: decryptedMnemonic,
        account,
        createdAt: profile.security.mnemonicBackup.createdAt,
      };

      return backupInfo;
    } catch (error) {
      console.error('Error showing mnemonic backup:', error);
      throw error;
    }
  },

  // Private key export (not for Echo account restoration)
  showPrivateKey: async (_password?: string) => {
    try {
      const state = get();
      const profile = state.userProfile;
      if (!profile) {
        throw new Error('No authenticated user');
      }
      // Prefer in-memory secret keys if available
      const sk = get().ourSk;
      if (sk) {
        return PrivateKey.fromBytes(sk.massa_secret_key).toString();
      }

      throw new Error('Private key unavailable');
    } catch (error) {
      console.error('Error exporting private key:', error);
      throw error;
    }
  },

  createMnemonicBackup: async (mnemonic: string) => {
    try {
      const state = get();
      const profile = state.userProfile;
      if (!profile) {
        throw new Error('No authenticated user');
      }

      // Encrypt the mnemonic for storage using the active session key
      const key = get().encryptionKey;
      if (!key) {
        throw new Error('No active encryption key');
      }
      const { encryptedData: encryptedMnemonic, nonce: nonceForBackup } =
        await encrypt(mnemonic, key);

      const updatedProfile = {
        ...profile,
        security: {
          ...profile.security,
          mnemonicBackup: {
            encryptedMnemonic,
            nonce: nonceForBackup,
            createdAt: new Date(),
            backedUp: false,
          },
        },
      };

      await db.userProfile.update(profile.userId, updatedProfile);
      set({ userProfile: updatedProfile });
    } catch (error) {
      console.error('Error creating mnemonic backup:', error);
      throw error;
    }
  },

  getMnemonicBackupInfo: () => {
    const state = get();
    const mnemonicBackup = state.userProfile?.security?.mnemonicBackup;
    if (!mnemonicBackup) return null;

    return {
      createdAt: mnemonicBackup.createdAt,
      backedUp: mnemonicBackup.backedUp,
    };
  },

  markMnemonicBackupComplete: async () => {
    try {
      const state = get();
      const profile = state.userProfile;
      if (!profile || !profile.security?.mnemonicBackup) {
        throw new Error('No mnemonic backup found');
      }

      const updatedProfile = {
        ...profile,
        security: {
          ...profile.security,
          mnemonicBackup: {
            ...profile.security.mnemonicBackup,
            backedUp: true,
          },
        },
      };

      await db.userProfile.update(profile.userId, updatedProfile);
      set({ userProfile: updatedProfile });
    } catch (error) {
      console.error('Error marking mnemonic backup as complete:', error);
      throw error;
    }
  },

  hasMnemonicBackup: () => {
    const state = get();
    return !!state.userProfile?.security?.mnemonicBackup;
  },

  // Account detection methods
  hasExistingAccount: async () => {
    try {
      // Ensure database is ready
      await db.open();
      const count = await db.userProfile.count();
      return count > 0;
    } catch (error) {
      console.error('Error checking for existing account:', error);
      return false;
    }
  },

  getExistingAccountInfo: async () => {
    try {
      return await getActiveOrFirstProfile();
    } catch (error) {
      console.error('Error getting existing account info:', error);
      return null;
    }
  },

  getAllAccounts: async () => {
    try {
      // Ensure database is ready
      await db.open();
      const profiles = await db.userProfile.toCollection().toArray();
      return profiles;
    } catch (error) {
      console.error('Error getting all accounts:', error);
      return [];
    }
  },
}));

// TODO: Investigate potential race conditions when rapidly switching accounts
// - Multiple async operations (provider creation, token initialization, balance refresh) may overlap
// - Consider adding cancellation tokens or operation queuing to prevent state inconsistencies
// - Test scenario: rapidly switch between accounts to identify any timing issues
useAccountStoreBase.subscribe(async (state, prevState) => {
  if (state.account === prevState.account) return;

  try {
    const networkName = useAppStore.getState().networkName;
    const publicApiUrl =
      networkName === NetworkName.Buildnet
        ? PublicApiUrl.Buildnet
        : PublicApiUrl.Mainnet;

    if (state.account) {
      const provider = await JsonRpcProvider.fromRPCUrl(
        publicApiUrl,
        state.account
      );

      useAccountStoreBase.setState({ provider });
      await useWalletStore.getState().initializeTokens();
      await useWalletStore.getState().refreshBalances();
    } else {
      useAccountStoreBase.setState({ provider: null });
    }
  } catch (error) {
    console.error('Error initializing provider or refreshing balances:', error);
  }
});

export const useAccountStore = createSelectors(useAccountStoreBase);
