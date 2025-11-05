import { create } from 'zustand';
import { db, UserProfile } from '../db';

import { encrypt, deriveKey } from '../crypto/encryption';
import {
  createWebAuthnCredential,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from '../crypto/webauthn';
import { generateMnemonic, validateMnemonic } from '../crypto/bip39';
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
import {
  generateUserKeys,
  EncryptionKey,
  generateNonce,
  SessionModule,
} from '../wasm';
import {
  UserPublicKeys,
  UserSecretKeys,
} from '../assets/generated/wasm/echo_wasm';
import bs58check from 'bs58check';
import { getActiveOrFirstProfile } from './utils/getAccount';
import { ensureWasmInitialized } from '../wasm/loader';
import { auth } from './utils/auth';

async function createProfileFromAccount(
  username: string,
  userId: string,
  security: UserProfile['security'],
  session: Uint8Array
): Promise<UserProfile> {
  const existing = await db.userProfile.get(userId);
  if (existing) {
    // Merge with existing profile; prefer newly provided security fields when present
    const mergedSecurity: UserProfile['security'] = {
      ...existing.security,
      ...security,
      webauthn: security.webauthn ?? existing.security.webauthn,
      encKeySalt: security.encKeySalt ?? existing.security.encKeySalt,
      mnemonicBackup: security.mnemonicBackup,
    };

    const updatedProfile: UserProfile = {
      ...existing,
      // Preserve existing username if already set; do not silently overwrite
      username: existing.username || username,
      security: mergedSecurity,
      session,
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
    session,
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
  opts: { useBiometrics: boolean; password?: string },
  session: SessionModule
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

  // Serialize and encrypt the session
  const sessionBlob = session.toEncryptedBlob(built.encryptionKey);

  const profile = await createProfileFromAccount(
    username,
    userId,
    built.security,
    sessionBlob
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

  if (!mnemonic) {
    throw new Error('Mnemonic is required for account creation');
  }

  const { encryptedData: encryptedMnemonic, nonce: nonceForBackup } =
    await encrypt(mnemonic, key);
  const mnemonicBackup: UserProfile['security']['mnemonicBackup'] = {
    encryptedMnemonic,
    nonce: nonceForBackup,
    createdAt: new Date(),
    backedUp: false,
  };

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
  if (!mnemonic) {
    throw new Error('Mnemonic is required for account creation');
  }

  const { encryptedData: encryptedMnemonic, nonce: nonceForBackup } =
    await encrypt(mnemonic, derivedKey);
  const mnemonicBackup: UserProfile['security']['mnemonicBackup'] = {
    encryptedMnemonic,
    nonce: nonceForBackup,
    createdAt: new Date(),
    backedUp: false,
  };

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
  // WASM session module
  session: SessionModule | null;
  initializeAccountWithBiometrics: (username: string) => Promise<void>;
  initializeAccount: (username: string, password: string) => Promise<void>;
  loadAccount: (password?: string, userId?: string) => Promise<void>;
  restoreAccountFromMnemonic: (
    username: string,
    mnemonic: string,
    opts: { useBiometrics: boolean; password?: string }
  ) => Promise<void>;
  resetAccount: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  checkPlatformAvailability: () => Promise<void>;

  // Mnemonic backup methods
  showBackup: (password?: string) => Promise<{
    mnemonic: string;
    account: Account;
  }>;
  getMnemonicBackupInfo: () => { createdAt: Date; backedUp: boolean } | null;
  markMnemonicBackupComplete: () => Promise<void>;

  // Account detection methods
  hasExistingAccount: () => Promise<boolean>;
  getExistingAccountInfo: () => Promise<UserProfile | null>;
  getAllAccounts: () => Promise<UserProfile[]>;

  // Session persistence
  persistSession: () => Promise<void>;
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
  session: null,
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

      // Initialize WASM and create session
      await ensureWasmInitialized();
      const session = new SessionModule(() => {
        get().persistSession();
      });

      const { profile, encryptionKey } = await provisionAccount(
        username,
        userId,
        mnemonic,
        {
          useBiometrics: false,
          password,
        },
        session
      );

      set({
        userProfile: profile,
        encryptionKey,
        account,
        ourPk: userPublicKeys,
        ourSk: userSecretKeys,
        session,
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

      // Initialize WASM and create session
      await ensureWasmInitialized();
      const session = new SessionModule(() => {
        get().persistSession();
      });

      const { profile, encryptionKey } = await provisionAccount(
        username,
        userId,
        mnemonic,
        opts,
        session
      );

      set({
        account,
        userProfile: profile,
        encryptionKey,
        ourPk: userPublicKeys,
        ourSk: userSecretKeys,
        session,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error restoring account from mnemonic:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  loadAccount: async (password?: string, userId?: string) => {
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

      const { mnemonic, encryptionKey } = await auth(profile, password);

      const keys = await generateUserKeys(mnemonic);
      const ourPk = keys.public_keys();
      const ourSk = keys.secret_keys();
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(ourSk.massa_secret_key)
      );

      // Initialize WASM and load session from profile
      await ensureWasmInitialized();
      const session = new SessionModule(() => {
        get().persistSession();
      });

      session.load(profile, encryptionKey);

      set({
        userProfile: profile,
        account,
        encryptionKey,
        ourPk,
        ourSk,
        session,
        isInitialized: true,
        isLoading: false,
      });

      try {
        session.refresh();
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

      // Cleanup session
      const state = get();
      if (state.session) {
        state.session.cleanup();
      }

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
        ourPk: null,
        ourSk: null,
        session: null,
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

      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(keys.secret_keys().massa_secret_key)
      );

      // Initialize WASM and create session
      await ensureWasmInitialized();
      const session = new SessionModule(() => {
        get().persistSession();
      });

      const { profile, encryptionKey } = await provisionAccount(
        username,
        userId,
        mnemonic,
        {
          useBiometrics: true,
        },
        session
      );

      set({
        userProfile: profile,
        encryptionKey,
        account,
        ourPk: userPublicKeys,
        ourSk: keys.secret_keys(),
        session,
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

  showBackup: async (
    password?: string
  ): Promise<{
    mnemonic: string;
    account: Account;
  }> => {
    try {
      const state = get();
      const profile = state.userProfile;
      const ourSk = state.ourSk;
      if (!profile || !ourSk) {
        throw new Error('No authenticated user');
      }

      const { mnemonic } = await auth(profile, password);

      const massaSecretKey = ourSk.massa_secret_key;
      const account = await Account.fromPrivateKey(
        PrivateKey.fromBytes(massaSecretKey)
      );

      const backupInfo = {
        mnemonic,
        account,
      };

      return backupInfo;
    } catch (error) {
      console.error('Error showing mnemonic backup:', error);
      throw error;
    }
  },

  getMnemonicBackupInfo: () => {
    const state = get();
    const mnemonicBackup = state.userProfile?.security.mnemonicBackup;
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
      if (!profile) {
        throw new Error('No user profile found');
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

  persistSession: async () => {
    const state = get();
    const { session, userProfile, encryptionKey } = state;

    if (!session || !userProfile || !encryptionKey) {
      console.warn(
        'No session, user profile, or encryption key to persist, skipping persistence'
      );
      return; // Nothing to persist
    }

    try {
      // Serialize the session
      const sessionBlob = session.toEncryptedBlob(encryptionKey);

      // Update the profile with the new session blob
      const updatedProfile = {
        ...userProfile,
        session: sessionBlob,
        updatedAt: new Date(),
      };

      await db.userProfile.update(userProfile.userId, updatedProfile);

      // Update the store with the new profile
      set({ userProfile: updatedProfile });
    } catch (error) {
      console.error('Error persisting session:', error);
      // Don't throw - persistence failures shouldn't break the app
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
