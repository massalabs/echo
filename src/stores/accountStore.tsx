import { create } from 'zustand';
import { db, UserProfile } from '../db';
import { encryptPrivateKey, deriveKey } from '../crypto/keyDerivation';
import {
  createWebAuthnCredential,
  authenticateWithWebAuthn,
  encryptPrivateKeyWithWebAuthn,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from '../crypto/webauthn';
import {
  generateMnemonic,
  encryptMnemonic,
  decryptMnemonic,
  accountFromMnemonic,
  Bip39BackupDisplay,
} from '../crypto/bip39';
import { JsonRpcProvider, Provider, PublicApiUrl } from '@massalabs/massa-web3';

interface AccountState {
  userProfile: UserProfile | null;
  encryptionKey: CryptoKey | null;
  isInitialized: boolean;
  isLoading: boolean;
  webauthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  provider: Provider | null;
  // Balance state
  masBalance: bigint | null;
  isBalanceLoading: boolean;
  lastBalanceUpdate: Date | null;
  initializeAccountWithBiometrics: (username: string) => Promise<void>;
  loadAccountWithBiometrics: () => Promise<void>;
  initializeAccount: (username: string, password: string) => Promise<void>;
  loadAccount: (password: string) => Promise<void>;
  resetAccount: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  checkPlatformAvailability: () => Promise<void>;
  // Balance methods
  fetchBalance: () => Promise<void>;
  refreshBalance: () => Promise<void>;

  // Mnemonic backup methods
  showMnemonicBackup: (password?: string) => Promise<Bip39BackupDisplay>;
  createMnemonicBackup: (mnemonic: string) => Promise<void>;
  getMnemonicBackupInfo: () => { createdAt: Date; backedUp: boolean } | null;
  markMnemonicBackupComplete: () => Promise<void>;
  hasMnemonicBackup: () => boolean;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  // Initial state
  userProfile: null,
  encryptionKey: null,
  isInitialized: false,
  isLoading: true,
  webauthnSupported: isWebAuthnSupported(),
  platformAuthenticatorAvailable: false,
  provider: null,
  // Balance state
  masBalance: null,
  isBalanceLoading: false,
  lastBalanceUpdate: null,
  // Actions
  initializeAccount: async (username: string, password: string) => {
    console.log('initializeAccount');
    try {
      set({ isLoading: true });

      // Generate a BIP39 mnemonic and create account from it
      const mnemonic = generateMnemonic(256);
      const account = await accountFromMnemonic(mnemonic);

      // Derive encryption key and store it in memory
      const { key: encryptionKey, salt } = await deriveKey(password);

      // Encrypt the private key using the crypto module
      const { encryptedKey, iv, kdf } = await encryptPrivateKey(
        account.privateKey.toBytes() as BufferSource,
        password
      );

      // Encrypt the mnemonic for storage
      const encryptedMnemonic = await encryptMnemonic(mnemonic, password);

      const walletInfos = {
        address: account.address.toString(),
        publicKey: account.publicKey.toString(),
      };

      const newProfile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        username,
        displayName: username,
        wallet: walletInfos,
        security: {
          encryptedKey,
          iv,
          password: {
            salt,
            kdf,
          },
          mnemonicBackup: {
            // for now, we store the encrypted mnemonic in order to provide backup feature later
            // we could not store it, and only provide private key backup
            mnemonic: encryptedMnemonic.encryptedMnemonic,
            iv: encryptedMnemonic.iv,
            salt: encryptedMnemonic.salt,
            createdAt: new Date(),
            backedUp: false,
          },
        },
        status: 'online',
        lastSeen: new Date(),
      };

      // TODO: add RPC management in settings
      const provider = await JsonRpcProvider.fromRPCUrl(
        PublicApiUrl.Buildnet,
        account
      );

      const profileId = await db.userProfile.add(newProfile as UserProfile);
      const createdProfile = await db.userProfile.get(profileId);

      if (createdProfile) {
        set({
          userProfile: createdProfile,
          encryptionKey,
          provider,
          isInitialized: true,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Error creating user profile:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  loadAccount: async (password: string) => {
    try {
      set({ isLoading: true });

      const profile = await db.userProfile.toCollection().first();
      if (!profile) {
        throw new Error('No user profile found');
      }

      // Derive encryption key using stored salt
      const salt = profile.security?.password?.salt;
      if (!salt) {
        throw new Error('Password parameters not found');
      }
      const { key: encryptionKey } = await deriveKey(password, salt);

      set({
        userProfile: profile,
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
      await db.userProfile.clear();
      set({
        userProfile: null,
        encryptionKey: null,
        isInitialized: false,
        isLoading: false,
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
    console.log('initializeAccountWithBiometrics');
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

      // Create WebAuthn credential
      const webauthnKey = await createWebAuthnCredential(username);

      // Encrypt the private key using WebAuthn-derived key
      const { encryptedKey, iv, credentialId } =
        await encryptPrivateKeyWithWebAuthn(
          account.privateKey.toBytes() as BufferSource,
          webauthnKey
        );

      // Encrypt the mnemonic using WebAuthn-derived key
      const encryptedMnemonic = await encryptMnemonic(
        mnemonic,
        webauthnKey.privateKey.toString()
      );

      const walletInfos = {
        address: account.address.toString(),
        publicKey: account.publicKey.toString(),
      };

      const newProfile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        username,
        displayName: username,
        wallet: walletInfos,
        security: {
          encryptedKey,
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
            mnemonic: encryptedMnemonic.encryptedMnemonic,
            iv: encryptedMnemonic.iv,
            salt: encryptedMnemonic.salt,
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
  loadAccountWithBiometrics: async () => {
    try {
      set({ isLoading: true });

      const profile = await db.userProfile.toCollection().first();
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

      set({
        userProfile: profile,
        encryptionKey: webauthnKey.privateKey,
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
      const profile = await db.userProfile.toCollection().first();
      if (!profile) {
        throw new Error('No user profile found');
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
          {
            encryptedMnemonic: profile.security.mnemonicBackup.mnemonic,
            iv: profile.security.mnemonicBackup.iv,
            salt: profile.security.mnemonicBackup.salt,
          },
          webauthnKey.privateKey.toString()
        );
      } else if (profile.security.password?.salt && password) {
        // For password-based accounts, use the provided password
        decryptedMnemonic = await decryptMnemonic(
          {
            encryptedMnemonic: profile.security.mnemonicBackup.mnemonic,
            iv: profile.security.mnemonicBackup.iv,
            salt: profile.security.mnemonicBackup.salt,
          },
          password
        );
      } else {
        throw new Error('Invalid authentication method or missing password');
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

  createMnemonicBackup: async (mnemonic: string) => {
    try {
      const profile = await db.userProfile.toCollection().first();
      if (!profile) {
        throw new Error('No user profile found');
      }

      // Encrypt the mnemonic for storage
      const encryptedMnemonic = await encryptMnemonic(
        mnemonic,
        'mnemonic-backup-key'
      );

      const updatedProfile = {
        ...profile,
        security: {
          ...profile.security,
          mnemonicBackup: {
            mnemonic: encryptedMnemonic.encryptedMnemonic,
            iv: encryptedMnemonic.iv,
            salt: encryptedMnemonic.salt,
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
      const profile = await db.userProfile.toCollection().first();
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

  // Balance methods
  fetchBalance: async () => {
    const { provider } = get();
    if (!provider) {
      console.warn('No provider available for balance fetch');
      return;
    }

    try {
      set({ isBalanceLoading: true });
      // The balance() method should return the balance for the account associated with the provider
      // false = non-final data (faster), true = final data (slower but more reliable)
      const balance = await provider.balance(false);
      set({
        masBalance: balance,
        lastBalanceUpdate: new Date(),
        isBalanceLoading: false,
      });
    } catch (error) {
      console.error('Error fetching balance:', error);
      set({ isBalanceLoading: false });
      throw error;
    }
  },

  refreshBalance: async () => {
    const { fetchBalance } = get();
    await fetchBalance();
  },
}));
