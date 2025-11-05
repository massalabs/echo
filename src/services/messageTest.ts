// /**
//  * Message Test Service (simulation helpers for dev/test)
//  */

// import bs58check from 'bs58check';
// import { db } from '../db';
// import { useAccountStore } from '../stores/accountStore';
// import { generateUserKeys, SessionModule } from '../wasm';
// import {
//   IMessageProtocol,
//   EncryptedMessage,
//   createMessageProtocol,
// } from '../api/messageProtocol';
// import { MessageResult } from './message';

// class MessageTestService {
//   private _messageProtocol: IMessageProtocol | null = null;

//   private async getMessageProtocol(): Promise<IMessageProtocol> {
//     if (!this._messageProtocol) {
//       this._messageProtocol = createMessageProtocol();
//     }
//     return this._messageProtocol;
//   }

//   /**
//    * Simulate receiving a message for an existing discussion
//    */
//   async simulateReceivedMessage(discussionId: number): Promise<MessageResult> {
//     try {
//       console.log('Simulating received message for discussion:', discussionId);

//       const { ourPk } = useAccountStore.getState();
//       if (!ourPk) throw new Error('WASM public keys unavailable');
//       const ourUserId = ourPk.derive_id();

//       const discussion = await db.discussions.get(discussionId);
//       if (!discussion) {
//         return {
//           success: false,
//           newMessagesCount: 0,
//           error: 'Discussion not found',
//         };
//       }

//       const contactUserId = discussion.contactUserId;

//       const ownerUserId2 = useAccountStore.getState().userProfile?.userId;
//       if (!ownerUserId2) throw new Error('No authenticated user');
//       const contact = await db.getContactByOwnerAndUserId(
//         ownerUserId2,
//         contactUserId
//       );
//       if (!contact) {
//         return {
//           success: false,
//           newMessagesCount: 0,
//           error: 'Contact not found',
//         };
//       }

//       const contactIdentity = await generateUserKeys(
//         `test_user_${contact.name}`
//       );
//       const contactPublicKeys = contactIdentity.public_keys();
//       const contactSecretKeys = contactIdentity.secret_keys();

//       const sessionModule = new SessionModule();
//       await sessionModule.init();

//       const messages = await db.messages
//         .where('contactUserId')
//         .equals(contactUserId)
//         .filter(m => m.direction === 'incoming')
//         .toArray();
//       if (messages.length === 0) {
//         if (!discussion.initiationAnnouncement) {
//           throw new Error('No initiation announcement found');
//         }

//         await sessionModule.feedIncomingAnnouncement(
//           discussion.initiationAnnouncement,
//           contactPublicKeys,
//           contactSecretKeys
//         );
//         await sessionModule.establishOutgoingSession(
//           ourPk,
//           contactPublicKeys,
//           contactSecretKeys
//         );
//       }

//       const peerList = await sessionModule.peerList();
//       console.log(
//         'peers',
//         peerList.map(p => bs58check.encode(p))
//       );
//       console.log(
//         'peer status',
//         await sessionModule.peerSessionStatus(ourUserId)
//       );

//       const testContent =
//         'This is a simulated received message for testing purposes.';
//       const messageContent = new TextEncoder().encode(testContent);

//       const sendOutput = await sessionModule.sendMessage(
//         ourUserId,
//         messageContent
//       );
//       if (!sendOutput) {
//         throw new Error('sendMessage returned null');
//       }

//       const { seeker, data: ciphertext } = sendOutput;
//       const mockMessage: EncryptedMessage = {
//         seeker,
//         ciphertext,
//       };

//       const messageProtocol = await this.getMessageProtocol();
//       await messageProtocol.sendMessage(seeker, mockMessage);

//       console.log(
//         'Successfully simulated received message for discussion:',
//         discussionId
//       );
//       return { success: true, newMessagesCount: 1 };
//     } catch (error) {
//       console.error('Failed to simulate received message:', error);
//       return {
//         success: false,
//         newMessagesCount: 0,
//         error: error instanceof Error ? error.message : 'Unknown error',
//       };
//     }
//   }
// }

// export const messageTestService = new MessageTestService();
