import { db } from '../db';

export type UpdateContactNameResult =
  | { ok: true; trimmedName: string }
  | {
      ok: false;
      reason: 'empty' | 'duplicate' | 'error';
      message: string;
    };

export async function updateContactName(
  ownerUserId: string,
  contactUserId: string,
  newName: string
): Promise<UpdateContactNameResult> {
  const trimmed = newName.trim();
  if (!trimmed)
    return { ok: false, reason: 'empty', message: 'Name cannot be empty.' };
  try {
    const list = await db.getContactsByOwner(ownerUserId);
    const duplicate = list.find(
      c =>
        c.userId !== contactUserId &&
        c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate)
      return {
        ok: false,
        reason: 'duplicate',
        message: 'This name is already used by another contact.',
      };

    await db.contacts
      .where('[ownerUserId+userId]')
      .equals([ownerUserId, contactUserId])
      .modify({ name: trimmed });

    return { ok: true, trimmedName: trimmed };
  } catch (e) {
    console.error('updateContactName failed', e);
    return {
      ok: false,
      reason: 'error',
      message: 'Failed to update name. Please try again.',
    };
  }
}
