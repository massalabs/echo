/**
 * Mock Message Protocol Implementation
 *
 * This file contains a mock implementation of the message protocol
 * that simulates backend responses without requiring a real server.
 * Useful for development and testing when the backend is not available.
 */

import { IMessageProtocol, EncryptedMessage } from './types';
import { SessionInitiationResult } from '../../wasm/types';

export class MockMessageProtocol implements IMessageProtocol {
  private mockMessages: Map<string, EncryptedMessage[]> = new Map();
  private mockAnnouncements: Uint8Array[] = [];

  constructor() {
    console.log('Mock message protocol initialized');
  }

  async fetchMessages(discussionKey: string): Promise<EncryptedMessage[]> {
    console.log('Mock: Fetching messages for discussion key:', discussionKey);

    // Return empty array for now - in a real implementation, this would
    // simulate fetching from a key-value store
    const messages = this.mockMessages.get(discussionKey) || [];

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return messages;
  }

  async sendMessage(
    discussionKey: string,
    message: EncryptedMessage
  ): Promise<void> {
    console.log('Mock: Sending message to discussion key:', discussionKey);

    // Store the message in our mock storage
    if (!this.mockMessages.has(discussionKey)) {
      this.mockMessages.set(discussionKey, []);
    }

    const messages = this.mockMessages.get(discussionKey)!;
    messages.push(message);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('Mock: Message sent successfully');
  }

  async createOutgoingSession(
    contactId: string,
    _recipientPublicKey: Uint8Array
  ): Promise<SessionInitiationResult> {
    console.log('Mock: Creating outgoing session for contact:', contactId);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Generate mock session data
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const discussionKey = this.generateDiscussionKey(masterKey);

    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      masterKey,
      innerKey: crypto.getRandomValues(new Uint8Array(32)),
      nextPublicKey: crypto.getRandomValues(new Uint8Array(1184)),
      nextPrivateKey: crypto.getRandomValues(new Uint8Array(2400)),
      version: 1,
      status: 'pending' as const,
      discussionKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const postData = {
      ciphertext: crypto.getRandomValues(new Uint8Array(128)),
      ct: crypto.getRandomValues(new Uint8Array(32)),
      rand: crypto.getRandomValues(new Uint8Array(32)),
    };

    console.log('Mock: Outgoing session created successfully');

    return {
      sessionId: session.id,
      session,
      postData,
      transactionHash: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    };
  }

  async feedIncomingAnnouncement(
    _announcementData: Uint8Array
  ): Promise<SessionInitiationResult> {
    console.log('Mock: Processing incoming announcement');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 250));

    // Generate mock session data for incoming announcement
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const discussionKey = this.generateDiscussionKey(masterKey);

    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      masterKey,
      innerKey: crypto.getRandomValues(new Uint8Array(32)),
      nextPublicKey: crypto.getRandomValues(new Uint8Array(1184)),
      nextPrivateKey: crypto.getRandomValues(new Uint8Array(2400)),
      version: 1,
      status: 'active' as const,
      discussionKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const postData = {
      ciphertext: crypto.getRandomValues(new Uint8Array(128)),
      ct: crypto.getRandomValues(new Uint8Array(32)),
      rand: crypto.getRandomValues(new Uint8Array(32)),
    };

    console.log('Mock: Incoming announcement processed successfully');

    return {
      sessionId: session.id,
      session,
      postData,
      transactionHash: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    };
  }

  async fetchAnnouncements(): Promise<Uint8Array[]> {
    console.log('Mock: Fetching announcements');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // Return empty array for now - in a real implementation, this would
    // simulate fetching from a global announcement channel
    return this.mockAnnouncements;
  }

  private generateDiscussionKey(masterKey: Uint8Array): string {
    const hexKey = Array.from(masterKey)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return `discussion_${hexKey.substring(0, 16)}`;
  }

  // Helper methods for testing
  addMockMessage(discussionKey: string, message: EncryptedMessage): void {
    if (!this.mockMessages.has(discussionKey)) {
      this.mockMessages.set(discussionKey, []);
    }
    this.mockMessages.get(discussionKey)!.push(message);
  }

  addMockAnnouncement(announcement: Uint8Array): void {
    this.mockAnnouncements.push(announcement);
  }

  clearMockData(): void {
    this.mockMessages.clear();
    this.mockAnnouncements = [];
  }
}
