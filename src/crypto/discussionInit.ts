/**
 * Discussion Initialization Module
 *
 * Implements initialization using the new WASM SessionManager API.
 */

import { db, Discussion, DiscussionMessage } from '../db';
import { generateUserKeys, getSessionModule } from '../wasm';
import { getDecryptedWasmKeys } from '../stores/utils/wasmKeys';

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
  recipientUserId: string
): Promise<{
  discussionId: number;
  announcement: Uint8Array;
}> {
  try {
    const sessionModule = await getSessionModule();

    // Load our decrypted keys via shared helper
    const { ourPk, ourSk } = await getDecryptedWasmKeys();

    // Use mocked peer public keys
    const mockUserKeys = await generateUserKeys(recipientUserId);
    const peerPk = mockUserKeys.public_keys();

    // use zeros for now
    const seekerPrefix = new Uint8Array(32);

    // Establish outgoing session and get announcement bytes
    const announcement = await sessionModule.establishOutgoingSession(
      peerPk,
      ourPk,
      ourSk,
      seekerPrefix
    );

    // Store discussion in database
    const discussionId = await db.discussions.add({
      contactUserId,
      direction: 'initiated',
      status: 'pending',
      version: 1,
      discussionKey: contactUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Optionally persist the announcement as an initiation message metadata (ciphertext only for now)
    await db.discussionMessages.add({
      discussionId,
      messageType: 'initiation',
      direction: 'outgoing',
      ciphertext: announcement,
      ct: new Uint8Array(0),
      rand: new Uint8Array(0),
      nonce: new Uint8Array(12),
      status: 'sent',
      timestamp: new Date(),
    });

    // Check if discussion thread already exists
    const existingThread = await db.discussionThreads
      .where('contactUserId')
      .equals(contactUserId)
      .first();

    if (!existingThread) {
      // Create discussion thread for the UI only if it doesn't exist
      await db.discussionThreads.add({
        contactUserId,
        lastMessageId: undefined,
        lastMessageContent: 'Discussion started',
        lastMessageTimestamp: new Date(),
        unreadCount: 0,
        isPinned: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created discussion thread for contact:', contactUserId);
    } else {
      console.log(
        'Discussion thread already exists for contact:',
        contactUserId
      );
    }

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

    const { ourPk, ourSk } = await getDecryptedWasmKeys();

    await sessionModule.feedIncomingAnnouncement(
      announcementData,
      ourPk,
      ourSk
    );

    // Store discussion in database
    const discussionId = await db.discussions.add({
      contactUserId,
      direction: 'received',
      status: 'active',
      version: 1,
      discussionKey: contactUserId,
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

    // Check if discussion thread already exists
    const existingThread = await db.discussionThreads
      .where('contactUserId')
      .equals(contactUserId)
      .first();

    if (!existingThread) {
      // Create discussion thread for the UI only if it doesn't exist
      await db.discussionThreads.add({
        contactUserId,
        lastMessageId: undefined,
        lastMessageContent: 'Discussion started',
        lastMessageTimestamp: new Date(),
        unreadCount: 1, // Incoming discussion has 1 unread
        isPinned: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created discussion thread for contact:', contactUserId);
    } else {
      console.log(
        'Discussion thread already exists for contact:',
        contactUserId
      );
    }

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
