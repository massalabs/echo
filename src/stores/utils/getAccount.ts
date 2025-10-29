import { db, UserProfile } from '../../db';
import { useAccountStore } from '../accountStore';

// Prefer the active profile in state; otherwise read the first from DB
export async function getActiveOrFirstProfile(): Promise<UserProfile | null> {
  const state = useAccountStore.getState();
  if (state.userProfile) return state.userProfile;
  return (await db.userProfile.toCollection().first()) || null;
}
