/**
 * Mock Message Protocol Implementation
 *
 * This file contains a mock implementation of the message protocol
 * that simulates backend responses without requiring a real server.
 * Useful for development and testing when the backend is not available.
 */

import { IMessageProtocol, EncryptedMessage } from './types';

export class MockMessageProtocol implements IMessageProtocol {
  private mockMessages: Map<string, EncryptedMessage[]> = new Map();
  private mockAnnouncements: Uint8Array[] = [];

  async fetchMessages(seekers: Uint8Array[]): Promise<EncryptedMessage[]> {
    console.log('Mock: Fetching messages for seekers:', seekers.length);

    // For the mock, concatenate messages for all seeker hex strings
    const collected: EncryptedMessage[] = [];
    for (const seeker of seekers) {
      const key = Array.from(seeker)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const msgs = this.mockMessages.get(key) || [];
      // attach seeker on returned messages
      collected.push(...msgs.map(m => ({ ...m, seeker })));
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return collected;
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

  // Broadcast an outgoing session announcement produced by WASM
  async createOutgoingSession(announcement: Uint8Array): Promise<void> {
    console.log('Mock: Broadcasting outgoing session announcement');
    // For the mock, push to announcements so receivers can fetch it
    this.mockAnnouncements.push(announcement);
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // Broadcast an incoming session response produced by WASM
  async feedIncomingAnnouncement(announcement: Uint8Array): Promise<void> {
    console.log('Mock: Broadcasting incoming session response');
    // For the mock, also push to announcements
    this.mockAnnouncements.push(announcement);
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  async fetchAnnouncements(): Promise<Uint8Array[]> {
    console.log('Mock: Fetching announcements');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // Return empty array for now - in a real implementation, this would
    // simulate fetching from a global announcement channel
    return this.mockAnnouncements;
  }

  // Helper methods for testing
  addMockMessage(seekerHexKey: string, message: EncryptedMessage): void {
    if (!this.mockMessages.has(seekerHexKey)) {
      this.mockMessages.set(seekerHexKey, []);
    }
    this.mockMessages.get(seekerHexKey)!.push(message);
  }

  addMockAnnouncement(announcement: Uint8Array): void {
    this.mockAnnouncements.push(announcement);
  }

  clearMockData(): void {
    this.mockMessages.clear();
    this.mockAnnouncements = [];
  }
}
