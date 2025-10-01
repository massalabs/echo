import { create } from 'zustand';
import { db, UserProfile } from '../db';
import { Account } from '@massalabs/massa-web3';
import { encryptPrivateKey, deriveKey } from '../crypto/keyDerivation';
import {
  createWebAuthnCredential,
  authenticateWithWebAuthn,
  encryptPrivateKeyWithWebAuthn,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from '../crypto/webauthn';

interface AccountState {
  userProfile: UserProfile | null;
  encryptionKey: CryptoKey | null;
  isInitialized: boolean;
  isLoading: boolean;
  webauthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  initializeAccountWithBiometrics: (username: string) => Promise<void>;
  loadAccountWithBiometrics: () => Promise<void>;
  initializeAccount: (username: string, password: string) => Promise<void>;
  loadAccount: (password: string) => Promise<void>;
  resetAccount: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  checkPlatformAvailability: () => Promise<void>;
}

export const useAccountStore = create<AccountState>(set => ({
  // Initial state
  userProfile: null,
  encryptionKey: null,
  isInitialized: false,
  isLoading: true,
  webauthnSupported: isWebAuthnSupported(),
  platformAuthenticatorAvailable: false,

  // Actions
  initializeAccount: async (username: string, password: string) => {
    console.log('initializeAccount');
    try {
      set({ isLoading: true });

      const account = await Account.generate();

      // Derive encryption key and store it in memory
      const { key: encryptionKey, salt } = await deriveKey(password);

      // Encrypt the private key using the crypto module
      const { encryptedKey, iv, kdf } = await encryptPrivateKey(
        account.privateKey.toBytes() as BufferSource,
        password
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
          password: {
            salt,
            kdf,
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
          encryptionKey,
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

      // Generate Massa account
      const account = await Account.generate();

      // Create WebAuthn credential
      const webauthnKey = await createWebAuthnCredential(username);

      // Encrypt the private key using WebAuthn-derived key
      const { encryptedKey, iv, credentialId } =
        await encryptPrivateKeyWithWebAuthn(
          account.privateKey.toBytes() as BufferSource,
          webauthnKey
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
}));
