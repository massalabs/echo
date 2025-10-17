import { create } from 'zustand';
import { db, UserProfile } from '../db';
import {
  encryptPrivateKey,
  deriveKey,
  decryptPrivateKey,
} from '../crypto/encryption';
// import { addDebugLog } from '../components/DebugOverlay';
import {
  createWebAuthnCredential,
  authenticateWithWebAuthn,
  encryptPrivateKeyWithWebAuthn,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from '../crypto/webauthn';
import {
  generateMnemonic,
  accountFromMnemonic,
  Bip39BackupDisplay,
  validateMnemonic,
} from '../crypto/bip39';
import { encryptMnemonic, decryptMnemonic } from '../crypto/encryption';
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
import { createSelectors } from './createSelectors';

async function createProfileFromAccount(
  username: string,
  account: Account,
  security: UserProfile['security']
): Promise<UserProfile> {
  const walletInfos = {
    address: account.address.toString(),
    publicKey: account.publicKey.toString(),
  };

  const newProfile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
    username,
    wallet: walletInfos,
    security,
    status: 'online',
    lastSeen: new Date(),
  };

  const profileId = await db.userProfile.add(newProfile as UserProfile);
  const createdProfile = await db.userProfile.get(profileId);
  if (!createdProfile) {
    throw new Error('Failed to create user profile');
  }
  return createdProfile;
}

async function provisionAccount(
  username: string,
  account: Account,
  mnemonic: string | undefined,
  opts: { useBiometrics: boolean; password?: string }
): Promise<{ profile: UserProfile; encryptionKey: CryptoKey }> {
  let built:
    | { security: UserProfile['security']; encryptionKey: CryptoKey }
    | undefined;

  if (opts.useBiometrics) {
    built = await buildSecurityFromWebAuthn(account, mnemonic, username);
  } else {
    const password = opts.password?.trim();
    if (!password) {
      throw new Error('Password is required');
    }
    built = await buildSecurityFromPassword(account, mnemonic, password);
  }

  const profile = await createProfileFromAccount(
    username,
    account,
    built.security
  );
  return { profile, encryptionKey: built.encryptionKey };
}

// Prefer the active profile in state; otherwise read the first from DB
async function getActiveOrFirstProfile(
  getState: () => AccountState
): Promise<UserProfile | null> {
  const state = getState();
  if (state.userProfile) return state.userProfile;
  return (await db.userProfile.toCollection().first()) || null;
}

// Helpers to build security blobs and in-memory keys
async function buildSecurityFromPassword(
  account: Account,
  mnemonic: string | undefined,
  password: string
): Promise<{
  security: UserProfile['security'];
  encryptionKey: CryptoKey;
}> {
  const { encryptedPrivateKey, iv, salt } = await encryptPrivateKey(
    account.privateKey.toBytes() as BufferSource,
    password
  );
  const { key: encryptionKey } = await deriveKey(password, salt);

  // Optionally encrypt mnemonic with WebCrypto AES-GCM using the same encryptionKey
  let mnemonicBackup: UserProfile['security']['mnemonicBackup'] | undefined;
  if (mnemonic) {
    const { encryptedMnemonic, iv: ivMnemonic } = await encryptMnemonic(
      mnemonic,
      encryptionKey
    );
    mnemonicBackup = {
      encryptedMnemonic,
      iv: ivMnemonic,
      createdAt: new Date(),
      backedUp: false,
    };
  }

  const security: UserProfile['security'] = {
    encryptedPrivateKey,
    iv,
    password: {
      salt,
      kdf: { name: 'PBKDF2', iterations: 150000, hash: 'SHA-256' },
    },
    mnemonicBackup,
  };

  return { security, encryptionKey };
}

async function buildSecurityFromWebAuthn(
  account: Account,
  mnemonic: string | undefined,
  username: string
): Promise<{
  security: UserProfile['security'];
  encryptionKey: CryptoKey;
}> {
  const webauthnKey = await createWebAuthnCredential(username);
  const { encryptedPrivateKey, iv, credentialId } =
    await encryptPrivateKeyWithWebAuthn(
      account.privateKey.toBytes() as BufferSource,
      webauthnKey
    );
  // Optionally encrypt mnemonic with WebCrypto AES-GCM using WebAuthn-derived key
  let mnemonicBackup: UserProfile['security']['mnemonicBackup'] | undefined;
  if (mnemonic) {
    const { encryptedMnemonic, iv: ivMnemonic } = await encryptMnemonic(
      mnemonic,
      webauthnKey.privateKey
    );
    mnemonicBackup = {
      encryptedMnemonic,
      iv: ivMnemonic,
      createdAt: new Date(),
      backedUp: false,
    };
  }

  const security: UserProfile['security'] = {
    encryptedPrivateKey,
    iv,
    webauthn: {
      credentialId,
      publicKey: webauthnKey.publicKey,
      counter: webauthnKey.counter,
      deviceType: webauthnKey.deviceType,
      backedUp: webauthnKey.backedUp,
      transports: webauthnKey.transports,
    },
    mnemonicBackup,
  };

  return { security, encryptionKey: webauthnKey.privateKey };
}

interface AccountState {
  userProfile: UserProfile | null;
  encryptionKey: CryptoKey | null;
  isInitialized: boolean;
  isLoading: boolean;
  webauthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  account: Account | null;
  provider: Provider | null;
  initializeAccountWithBiometrics: (username: string) => Promise<void>;
  loadAccountWithBiometrics: () => Promise<void>;
  initializeAccount: (username: string, password: string) => Promise<void>;
  loadAccount: (password: string, accountId?: number) => Promise<void>;
  restoreAccountFromMnemonic: (
    username: string,
    mnemonic: string,
    opts: { useBiometrics: boolean; password?: string }
  ) => Promise<void>;
  restoreAccountFromPrivateKey: (
    username: string,
    privateKey: string,
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

const useAccountStoreBase = create<AccountState>((set, get, store) => ({
  // Initial state
  userProfile: null,
  encryptionKey: null,
  isInitialized: false,
  isLoading: true,
  webauthnSupported: isWebAuthnSupported(),
  platformAuthenticatorAvailable: false,
  account: null,
  provider: null,
  // Actions
  initializeAccount: async (username: string, password: string) => {
    try {
      set({ isLoading: true });

      // Generate a BIP39 mnemonic and create account from it
      const mnemonic = generateMnemonic(256);
      const account = await accountFromMnemonic(mnemonic);

      const { profile, encryptionKey } = await provisionAccount(
        username,
        account,
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

      // Create account instance from mnemonic
      const account = await accountFromMnemonic(mnemonic);

      const { profile, encryptionKey } = await provisionAccount(
        username,
        account,
        mnemonic,
        opts
      );

      set({
        account,
        userProfile: profile,
        encryptionKey,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error restoring account from mnemonic:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  restoreAccountFromPrivateKey: async (
    username: string,
    privateKey: string,
    opts: { useBiometrics: boolean; password?: string }
  ) => {
    try {
      set({ isLoading: true });

      const pkey = PrivateKey.fromString(privateKey);
      const account = await Account.fromPrivateKey(pkey);

      const { profile, encryptionKey } = await provisionAccount(
        username,
        account,
        undefined, // no mnemonic available
        opts
      );

      set({
        account,
        userProfile: profile,
        encryptionKey,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error restoring account from private key:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  loadAccount: async (password: string, accountId?: number) => {
    try {
      set({ isLoading: true });

      // If accountId is provided, load that specific account, otherwise use active or first
      let profile: UserProfile | null;
      if (accountId) {
        profile = (await db.userProfile.get(accountId)) || null;
      } else {
        profile = await getActiveOrFirstProfile(get);
      }

      if (!profile) {
        throw new Error('No user profile found');
      }

      // Derive encryption key using stored salt
      const salt = profile.security?.password?.salt;
      if (!salt) {
        throw new Error('Password parameters not found');
      }
      const { key: encryptionKey } = await deriveKey(password, salt);

      // Verify the password is correct by attempting to decrypt the private key
      const encryptedKey = profile.security?.encryptedPrivateKey;
      const iv = profile.security?.iv;
      if (!encryptedKey || !iv) {
        throw new Error('Encrypted key not found');
      }

      let account: Account;
      try {
        // Attempt to decrypt the private key - this will fail if password is wrong
        const rawBytes = new Uint8Array(
          await decryptPrivateKey(encryptedKey, iv, encryptionKey)
        );
        const pkey = PrivateKey.fromBytes(rawBytes);
        account = await Account.fromPrivateKey(pkey);
      } catch (_decryptError) {
        // If decryption fails, the password is incorrect
        throw new Error('Invalid password. Please try again.');
      }

      set({
        userProfile: profile,
        account,
        encryptionKey,
        isInitialized: true,
        isLoading: false,
      });
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
      const currentProfile = await getActiveOrFirstProfile(get);
      if (currentProfile?.id != null) {
        await db.userProfile.delete(currentProfile.id);
      }

      // Determine if any accounts remain after deletion
      let hasAnyAccount = false;
      try {
        const remaining = await db.userProfile.count();
        hasAnyAccount = remaining > 0;
      } catch (_countErr) {
        hasAnyAccount = false;
      }

      const initialState = store.getInitialState();
      set({
        ...initialState,
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
      const account = await accountFromMnemonic(mnemonic);
      console.log('Bio Private key:', account.privateKey.toString());

      // Create WebAuthn credential
      const webauthnKey = await createWebAuthnCredential(username);

      // Encrypt the private key using WebAuthn-derived key
      const { encryptedPrivateKey, iv, credentialId } =
        await encryptPrivateKeyWithWebAuthn(
          account.privateKey.toBytes() as BufferSource,
          webauthnKey
        );

      // Encrypt mnemonic with WebCrypto AES-GCM using WebAuthn-derived key
      const { encryptedMnemonic, iv: ivMnemonic } = await encryptMnemonic(
        mnemonic,
        webauthnKey.privateKey
      );

      const walletInfos = {
        address: account.address.toString(),
        publicKey: account.publicKey.toString(),
      };

      const newProfile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        username,
        wallet: walletInfos,
        security: {
          encryptedPrivateKey,
          iv,
          webauthn: {
            credentialId,
            publicKey: webauthnKey.publicKey,
            counter: webauthnKey.counter,
            deviceType: webauthnKey.deviceType,
            backedUp: webauthnKey.backedUp,
            transports: webauthnKey.transports,
          },
          mnemonicBackup: {
            encryptedMnemonic,
            iv: ivMnemonic,
            createdAt: new Date(),
            backedUp: false,
          },
        },
        status: 'online',
        lastSeen: new Date(),
      };

      const profileId = await db.userProfile.add(newProfile as UserProfile);
      const createdProfile = await db.userProfile.get(profileId);

      if (createdProfile) {
        set({
          userProfile: createdProfile,
          encryptionKey: webauthnKey.privateKey,
          isInitialized: true,
          isLoading: false,
          platformAuthenticatorAvailable: platformAvailable,
        });
      }
    } catch (error) {
      console.error('Error creating user profile with biometrics:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // WebAuthn-based account loading
  loadAccountWithBiometrics: async (accountId?: number) => {
    try {
      set({ isLoading: true });

      let profile: UserProfile | null;
      if (accountId) {
        profile = (await db.userProfile.get(accountId)) || null;
      } else {
        // Prefer currently authenticated user if present
        profile = await getActiveOrFirstProfile(get);
      }
      if (!profile) {
        throw new Error('No user profile found');
      }

      if (!profile.security?.webauthn?.credentialId) {
        throw new Error(
          'No WebAuthn credential found. Please use password authentication or recreate your account.'
        );
      }

      // Authenticate with WebAuthn
      const webauthnKey = await authenticateWithWebAuthn(
        profile.security.webauthn.credentialId
      );

      // Verify the derived key is correct by attempting to decrypt the private key
      const encryptedKey = profile.security?.encryptedPrivateKey;
      const iv = profile.security?.iv;
      if (!encryptedKey || !iv) {
        throw new Error('Encrypted key not found');
      }

      let account: Account;
      try {
        // Attempt to decrypt the private key - this will fail if the key is wrong
        const rawBytes = new Uint8Array(
          await decryptPrivateKey(encryptedKey, iv, webauthnKey.privateKey)
        );
        const pkey = PrivateKey.fromBytes(rawBytes);
        account = await Account.fromPrivateKey(pkey);
      } catch (_decryptError) {
        // If decryption fails, something is wrong with the credential or stored data
        throw new Error(
          'Failed to decrypt account data. The credential may be corrupted.'
        );
      }

      set({
        userProfile: profile,
        encryptionKey: webauthnKey.privateKey,
        account,
        isInitialized: true,
        isLoading: false,
      });
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

      // Check if this is a biometric account
      if (profile.security.webauthn?.credentialId) {
        // For biometric accounts, authenticate with WebAuthn first
        const webauthnKey = await authenticateWithWebAuthn(
          profile.security.webauthn.credentialId
        );

        // Decrypt using WebAuthn-derived key
        decryptedMnemonic = await decryptMnemonic(
          profile.security.mnemonicBackup.encryptedMnemonic,
          profile.security.mnemonicBackup.iv,
          webauthnKey.privateKey
        );
      } else if (profile.security.password?.salt && password) {
        // For password-based accounts, use the provided password
        try {
          const { key } = await deriveKey(
            password,
            profile.security.password.salt
          );
          decryptedMnemonic = await decryptMnemonic(
            profile.security.mnemonicBackup.encryptedMnemonic,
            profile.security.mnemonicBackup.iv,
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

      // Create account from the existing mnemonic to get the backup info
      const account = await accountFromMnemonic(decryptedMnemonic);

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

  // Private key export (string)
  showPrivateKey: async (password?: string) => {
    try {
      const state = get();
      const profile = state.userProfile;
      if (!profile) {
        throw new Error('No authenticated user');
      }

      const encryptedKey = profile.security?.encryptedPrivateKey;
      const iv = profile.security?.iv;
      if (!encryptedKey || !iv) {
        throw new Error('Encrypted key not found');
      }

      let dek: CryptoKey;
      if (profile.security.webauthn?.credentialId) {
        const webauthnKey = await authenticateWithWebAuthn(
          profile.security.webauthn.credentialId
        );
        dek = webauthnKey.privateKey;
      } else if (profile.security.password?.salt && password) {
        const { key } = await deriveKey(
          password,
          profile.security.password.salt
        );
        dek = key;
      } else {
        throw new Error('Password required');
      }

      const rawBytes = new Uint8Array(
        await decryptPrivateKey(encryptedKey, iv, dek)
      );

      return PrivateKey.fromBytes(rawBytes).toString();
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
      const { encryptedMnemonic, iv: ivMnemonic } = await encryptMnemonic(
        mnemonic,
        key
      );

      const updatedProfile = {
        ...profile,
        security: {
          ...profile.security,
          mnemonicBackup: {
            encryptedMnemonic,
            iv: ivMnemonic,
            createdAt: new Date(),
            backedUp: false,
          },
        },
      };

      await db.userProfile.update(profile.id!, updatedProfile);
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

      await db.userProfile.update(profile.id!, updatedProfile);
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
      return await getActiveOrFirstProfile(get);
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

useAccountStoreBase.subscribe(async (state, prevState) => {
  if (state.account === prevState.account) return;

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

    useAccountStoreBase.setState({ provider: provider });
    await useWalletStore.getState().initializeTokens();
    useWalletStore.getState().refreshBalances(false);
  }
});

export const useAccountStore = createSelectors(useAccountStoreBase);
