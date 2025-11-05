// TODO: For announcement handle if there is already an announcement for this contact ?

/**
 * Discussion Initialization Module
 *
 * Implements initialization using the new WASM SessionManager API.
 */

import { Contact, db, Discussion, DiscussionMessage } from '../db';
import { useAccountStore } from '../stores/accountStore';
import { UserPublicKeys } from '../assets/generated/wasm/echo_wasm';
import { announcementService } from '../services/announcement';

/**
 * Discussion Initialization Logic using high-level SessionManager API
 */

/**
 * Initialize a discussion with a contact using SessionManager
 * @param contact - The contact to start a discussion with
 * @returns The discussion ID and session information
 */
export async function initializeDiscussion(contact: Contact): Promise<{
  discussionId: number;
  announcement: Uint8Array;
}> {
  try {
    const { ourPk, ourSk, userProfile, session } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    if (!userProfile?.userId) throw new Error('No authenticated user');
    if (!session) throw new Error('Session module not initialized');

    // Establish outgoing session and get announcement bytes
    const announcement = session.establishOutgoingSession(
      UserPublicKeys.from_bytes(contact.publicKeys),
      ourPk,
      ourSk
    );

    // Store discussion in database with UI metadata and keep announcement on discussion
    // Broadcast announcement to bulletin and obtain counter

    // TODO Handle fail to broadcast announcement
    const annSvc = await announcementService.getInstance();
    const result = await annSvc.sendAnnouncement(announcement);
    if (!result.success) {
      throw new Error(
        `Failed to broadcast outgoing session: ${result.error || 'Unknown error'}`
      );
    }

    // Store discussion in database
    const discussionId = await db.discussions.add({
      ownerUserId: userProfile.userId,
      contactUserId: contact.userId,
      direction: 'initiated',
      status: 'pending',
      nextSeeker: undefined,
      initiationAnnouncement: announcement,
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { discussionId, announcement };
  } catch (error) {
    console.error('Failed to initialize discussion:', error);
    throw new Error('Discussion initialization failed');
  }
}

export async function acceptDiscussionRequest(
  discussion: Discussion
): Promise<void> {
  try {
    const { ourPk, ourSk, session } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    if (!session) throw new Error('Session module not initialized');

    const contact = await db.getContactByOwnerAndUserId(
      discussion.ownerUserId,
      discussion.contactUserId
    );

    if (!contact) throw new Error('Contact not found');

    // establish outgoing session and get announcement bytes
    const announcement = session.establishOutgoingSession(
      UserPublicKeys.from_bytes(contact.publicKeys),
      ourPk,
      ourSk
    );

    // send announcement to contact
    const announcementSvc = await announcementService.getInstance();
    const result = await announcementSvc.sendAnnouncement(announcement);
    if (!result.success) {
      throw new Error(
        `Failed to send outgoing session: ${result.error || 'Unknown error'}`
      );
    }

    // TODO: Do we save the second announcement bytes?
    // update discussion status
    await db.discussions.update(discussion.id, {
      status: 'active',
      updatedAt: new Date(),
    });

    return;
  } catch (error) {
    console.error('Failed to accept pending discussion:', error);
    throw new Error('Failed to accept pending discussion');
  }
}

/**
 * Process an incoming discussion initiation using SessionManager
 * @param contactId - The ID of the contact who initiated the discussion
 * @param announcementData - The announcement data from the blockchain
 * @returns The discussion ID and session information
 */
export async function processIncomingAnnouncement(
  contact: Contact,
  announcementData: Uint8Array
): Promise<{
  discussionId: number;
}> {
  try {
    const { ourPk, ourSk, userProfile, session } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    if (!userProfile?.userId) throw new Error('No authenticated user');
    if (!session) throw new Error('Session module not initialized');

    session.feedIncomingAnnouncement(announcementData, ourPk, ourSk);

    // If we already have a pending initiated discussion with this contact,
    // upgrade it to active instead of creating a duplicate.
    const existing = await db.getDiscussionByOwnerAndContact(
      userProfile.userId,
      contact.userId
    );

    if (existing) {
      // If we initiated and were waiting, mark as active on response
      if (existing.status === 'pending' && existing.direction === 'initiated') {
        await db.discussions.update(existing.id!, {
          status: 'active',
          updatedAt: new Date(),
        });
        return { discussionId: existing.id! };
      }

      // If some discussion already exists, reuse it
      return { discussionId: existing.id! };
    }

    // Otherwise create a new pending received discussion
    const discussionId = await db.discussions.add({
      ownerUserId: userProfile.userId,
      contactUserId: contact.userId,
      initiationAnnouncement: announcementData,
      direction: 'received',
      status: 'pending',
      nextSeeker: undefined,
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('Created discussion for contact:', contact.userId);

    return { discussionId };
  } catch (error) {
    console.error('Failed to process incoming initiation:', error);
    throw new Error('Failed to process incoming initiation');
  }
}

/**
 * Get all discussions for a contact
 * @param contactId - The contact ID
 * @returns Array of discussions
 */
export async function getDiscussionsForContact(
  ownerUserId: string,
  contactUserId: string
): Promise<Discussion[]> {
  return await db.discussions
    .where('[ownerUserId+contactUserId]')
    .equals([ownerUserId, contactUserId])
    .toArray();
}

/**
 * Get all active discussions
 * @returns Array of active discussions
 */
export async function getActiveDiscussions(): Promise<Discussion[]> {
  return await db.discussions.where('status').equals('active').toArray();
}

/**
 * Get all pending discussions
 * @returns Array of pending discussions
 */
export async function getPendingDiscussions(): Promise<Discussion[]> {
  return await db.discussions.where('status').equals('pending').toArray();
}

/**
 * Update discussion status
 * @param discussionId - The discussion ID
 * @param status - The new status
 */
export async function updateDiscussionStatus(
  discussionId: number,
  status: 'pending' | 'active' | 'closed'
): Promise<void> {
  await db.discussions.update(discussionId, { status });
}

/**
 * Get discussion messages
 * @param discussionId - The discussion ID
 * @returns Array of discussion messages
 */
export async function getDiscussionMessages(
  discussionId: number
): Promise<DiscussionMessage[]> {
  return await db.discussionMessages
    .where('discussionId')
    .equals(discussionId)
    .toArray()
    .then(messages =>
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    );
}
