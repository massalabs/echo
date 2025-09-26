import { create } from 'zustand'
import { db, UserProfile } from '../db'

interface AccountState {
  userProfile: UserProfile | null
  isInitialized: boolean
  isLoading: boolean
  initializeAccount: (username: string) => Promise<void>
  resetAccount: () => Promise<void>
  setLoading: (loading: boolean) => void
}

export const useAccountStore = create<AccountState>((set) => ({
  // Initial state
  userProfile: null,
  isInitialized: false,
  isLoading: true,

  // Actions
  initializeAccount: async (username: string) => {
    try {
      set({ isLoading: true })
      
      // Create a simple mock account
      const account = {
        address: `massa_${crypto.randomUUID()}`,
        publicKey: `public_${crypto.randomUUID()}`,
        privateKey: `private_${crypto.randomUUID()}`
      }
      
      const newProfile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        username,
        displayName: username,
        account,
        status: 'online',
        lastSeen: new Date()
      }
      
      const profileId = await db.userProfile.add(newProfile as UserProfile)
      const createdProfile = await db.userProfile.get(profileId)
      
      if (createdProfile) {
        set({ 
          userProfile: createdProfile, 
          isInitialized: true, 
          isLoading: false 
        })
      }
    } catch (error) {
      console.error('Error creating user profile:', error)
      set({ isLoading: false })
      throw error
    }
  },

  resetAccount: async () => {
    try {
      set({ isLoading: true })
      await db.userProfile.clear()
      set({ 
        userProfile: null, 
        isInitialized: false, 
        isLoading: false 
      })
    } catch (error) {
      console.error('Error resetting account:', error)
      set({ isLoading: false })
      throw error
    }
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading })
  }
}))

