import { create } from 'zustand';
import { db, UserProfile } from '../db';
import { Account } from '@massalabs/massa-web3';
import { encryptPrivateKey, deriveKey } from '../crypto/keyDerivation';

interface AccountState {
  userProfile: UserProfile | null;
  encryptionKey: CryptoKey | null;
  isInitialized: boolean;
  isLoading: boolean;
  initializeAccount: (username: string, password: string) => Promise<void>;
  loadAccount: (password: string) => Promise<void>;
  resetAccount: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAccountStore = create<AccountState>(set => ({
  // Initial state
  userProfile: null,
  encryptionKey: null,
  isInitialized: false,
  isLoading: true,

  // Actions
  initializeAccount: async (username: string, password: string) => {
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

      const accountInfos = {
        address: account.address.toString(),
        publicKey: account.publicKey.toString(),
      };

      const newProfile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        username,
        displayName: username,
        account: accountInfos,
        encryptedKey,
        iv,
        salt,
        kdf,
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
      const { key: encryptionKey } = await deriveKey(password, profile.salt);

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
}));
