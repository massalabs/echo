/**
 * Discussion Initialization Module
 *
 * Implements the post-quantum secure discussion initialization protocol
 * using the high-level WASM SessionManager API.
 *
 * This module uses the SessionManager's createOutgoingSession and
 * feedIncomingAnnouncement methods for session management.
 */

import { db, Discussion, DiscussionMessage } from '../db';
import {
  wasmLoader,
  SessionModule,
  SessionInitiationResult,
  Session,
} from '../wasm';

/**
 * Initialize WASM modules
 */
export async function initializeWasmModules(): Promise<void> {
  await wasmLoader.loadModules();
}

/**
 * Get the session module
 */
function getSessionModule(): SessionModule {
  return wasmLoader.getModule<SessionModule>('session');
}

/**
 * Discussion Initialization Logic using high-level SessionManager API
 */

/**
 * Initialize a discussion with a contact using SessionManager
 * @param contactUserId - The user ID of the contact to start a discussion with
 * @param recipientUserId - The recipient's 32-byte user ID (hex string)
 * @returns The discussion ID and session information
 */
export async function initializeDiscussion(
  contactUserId: string,
  recipientUserId: string
): Promise<{
  discussionId: number;
  sessionId: string;
  postData: {
    ct: Uint8Array;
    rand: Uint8Array;
    ciphertext: Uint8Array;
  };
  transactionHash: string;
}> {
  try {
    // Ensure WASM modules are initialized
    await initializeWasmModules();

    // Convert user ID (hex string) to Uint8Array for the session module
    const recipientUserIdBytes = new Uint8Array(
      recipientUserId.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    // Use SessionManager to create outgoing session
    const sessionModule = getSessionModule();
    const result: SessionInitiationResult =
      await sessionModule.createOutgoingSession(
        contactUserId,
        recipientUserIdBytes
      );

    // Store discussion in database
    const discussionId = await db.discussions.add({
      contactUserId,
      direction: 'initiated',
      status: 'pending',
      masterKey: result.session.masterKey,
      innerKey: result.session.innerKey,
      nextPublicKey: result.session.nextPublicKey,
      nextPrivateKey: result.session.nextPrivateKey,
      version: result.session.version,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Store the initiation message
    await db.discussionMessages.add({
      discussionId,
      messageType: 'initiation',
      direction: 'outgoing',
      ciphertext: result.postData.ciphertext,
      ct: result.postData.ct,
      rand: result.postData.rand,
      nonce: new Uint8Array(12), // Mock nonce
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

    return {
      discussionId,
      sessionId: result.sessionId,
      postData: result.postData,
      transactionHash: result.transactionHash,
    };
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
  sessionId: string;
  session: Session;
}> {
  try {
    // Ensure WASM modules are initialized
    await initializeWasmModules();

    // Use SessionManager to process incoming announcement
    const sessionModule = getSessionModule();
    const result: SessionInitiationResult =
      await sessionModule.feedIncomingAnnouncement(announcementData);

    // Store discussion in database
    const discussionId = await db.discussions.add({
      contactUserId,
      direction: 'received',
      status: 'active',
      masterKey: result.session.masterKey,
      innerKey: result.session.innerKey,
      nextPublicKey: result.session.nextPublicKey,
      nextPrivateKey: new Uint8Array(0), // Recipient doesn't have the private key
      version: result.session.version,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Store the initiation message
    await db.discussionMessages.add({
      discussionId,
      messageType: 'initiation',
      direction: 'incoming',
      ciphertext: result.postData.ciphertext,
      ct: result.postData.ct,
      rand: result.postData.rand,
      nonce: new Uint8Array(12), // Mock nonce
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

    return {
      discussionId,
      sessionId: result.sessionId,
      session: result.session,
    };
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
