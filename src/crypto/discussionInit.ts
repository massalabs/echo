/**
 * Discussion Initialization Module
 *
 * Implements initialization using the new WASM SessionManager API.
 */

import { db, Discussion, DiscussionMessage } from '../db';
import { getSessionModule } from '../wasm';
import { useAccountStore } from '../stores/accountStore';
import { createMessageProtocol } from '../api/messageProtocol';
import { UserPublicKeys } from '../assets/generated/wasm/echo_wasm';
import { messageReceptionService } from '../services/messageReception';

/**
 * Discussion Initialization Logic using high-level SessionManager API
 */

/**
 * Initialize a discussion with a contact using SessionManager
 * @param contactUserId - The user ID of the contact to start a discussion with
 * @param recipientUserId - The recipient's 32-byte user ID (base58check encoded)
 * @returns The discussion ID and session information
 */
export async function initializeDiscussion(
  contactUserId: string,
  contactPublicKeys: UserPublicKeys
): Promise<{
  discussionId: number;
  announcement: Uint8Array;
}> {
  try {
    const sessionModule = await getSessionModule();

    const { ourPk, ourSk, userProfile } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    if (!userProfile?.userId) throw new Error('No authenticated user');

    // Establish outgoing session and get announcement bytes
    const announcement = await sessionModule.establishOutgoingSession(
      contactPublicKeys,
      ourPk,
      ourSk
    );

    // Store discussion in database with UI metadata and keep announcement on discussion
    // Broadcast announcement to bulletin and obtain counter

    // TODO HAndle fail to broadcast announcement
    const annSvc = await messageReceptionService.getInstance();
    const result = await annSvc.sendAnnouncement(announcement);
    if (!result.success) {
      throw new Error(
        `Failed to broadcast outgoing session: ${result.error || 'Unknown error'}`
      );
    }

    // Store discussion in database
    const discussionId = await db.discussions.add({
      ownerUserId: userProfile.userId,
      contactUserId,
      direction: 'initiated',
      status: 'pending',
      nextSeeker: undefined,
      initiationAnnouncement: announcement,
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('Created discussion for contact:', contactUserId);

    return { discussionId, announcement };
  } catch (error) {
    console.error('Failed to initialize discussion:', error);
    throw new Error('Discussion initialization failed');
  }
}

/**
 * Process an incoming discussion initiation using SessionManager
 * @param contactId - The ID of the contact who initiated the discussion
 * @param announcementData - The announcement data from the blockchain
 * @returns The discussion ID and session information
 */
export async function processIncomingInitiation(
  contactUserId: string,
  announcementData: Uint8Array
): Promise<{
  discussionId: number;
}> {
  try {
    const sessionModule = await getSessionModule();

    const { ourPk, ourSk, userProfile } = useAccountStore.getState();
    if (!ourPk || !ourSk) throw new Error('WASM keys unavailable');
    if (!userProfile?.userId) throw new Error('No authenticated user');

    await sessionModule.feedIncomingAnnouncement(
      announcementData,
      ourPk,
      ourSk
    );

    // Store discussion in database with UI metadata
    const discussionId = await db.discussions.add({
      ownerUserId: userProfile.userId,
      contactUserId,
      direction: 'received',
      status: 'active',
      nextSeeker: undefined,
      unreadCount: 1, // Incoming discussion has 1 unread
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Store the incoming announcement as initiation message
    await db.discussionMessages.add({
      discussionId,
      messageType: 'initiation',
      direction: 'incoming',
      ciphertext: announcementData,
      ct: new Uint8Array(0),
      rand: new Uint8Array(0),
      nonce: new Uint8Array(12),
      status: 'delivered',
      timestamp: new Date(),
    });

    console.log('Created discussion for contact:', contactUserId);

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
  contactUserId: string
): Promise<Discussion[]> {
  return await db.discussions
    .where('contactUserId')
    .equals(contactUserId)
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
