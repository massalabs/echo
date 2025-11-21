import { db, UserProfile } from '../../db';
import { useAccountStore } from '../accountStore';

// Prefer the active profile in state; otherwise read the last logged in user from DB (by lastSeen)
export async function getActiveOrFirstProfile(): Promise<UserProfile | null> {
  const state = useAccountStore.getState();
  if (state.userProfile) return state.userProfile;

  // Get all profiles and return the one with the most recent lastSeen date
  const allProfiles = await db.userProfile.toCollection().toArray();
  if (allProfiles.length === 0) return null;

  // Sort by lastSeen in descending order and return the first (most recent)
  allProfiles.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  return allProfiles[0];
}
