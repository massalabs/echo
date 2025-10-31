/**
 * REST API implementation of the message protocol
 */

import {
  EncryptedMessage,
  IMessageProtocol,
  MessageProtocolResponse,
} from './types';

type EncryptedMessageWire = {
  seeker: number[];
  ciphertext: number[];
  timestamp: string | number;
};

export class RestMessageProtocol implements IMessageProtocol {
  constructor(
    private baseUrl: string,
    private timeout: number = 10000,
    private retryAttempts: number = 3
  ) {}

  async fetchMessages(seekers: Uint8Array[]): Promise<EncryptedMessage[]> {
    const url = `${this.baseUrl}/messages/query`;

    try {
      const response = await this.makeRequest<EncryptedMessageWire[]>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seekers: seekers.map(s => Array.from(s)),
        }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch messages');
      }

      // Convert timestamp strings back to Date objects and arrays to Uint8Array
      return response.data.map<EncryptedMessage>(msg => ({
        seeker: new Uint8Array(msg.seeker),
        ciphertext: new Uint8Array(msg.ciphertext),
        timestamp: new Date(msg.timestamp),
      }));
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      throw error;
    }
  }

  async sendMessage(
    seeker: Uint8Array,
    message: EncryptedMessage
  ): Promise<void> {
    // Encode seeker as base64url (URL-safe base64) for URL
    const binaryString = Array.from(seeker)
      .map(byte => String.fromCharCode(byte))
      .join('');
    const seekerBase64 = btoa(binaryString)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const url = `${this.baseUrl}/messages/${encodeURIComponent(seekerBase64)}`;

    try {
      const response = await this.makeRequest<void>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seeker: Array.from(message.seeker),
          ciphertext: Array.from(message.ciphertext),
          timestamp: message.timestamp.toISOString(),
        }),
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  // Broadcast an outgoing session announcement produced by WASM
  async createOutgoingSession(announcement: Uint8Array): Promise<void> {
    const url = `${this.baseUrl}/sessions/outgoing`;

    const response = await this.makeRequest<void>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        announcement: Array.from(announcement),
      }),
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to broadcast outgoing session');
    }
  }

  // Broadcast an incoming session response produced by WASM
  async feedIncomingAnnouncement(announcement: Uint8Array): Promise<void> {
    const url = `${this.baseUrl}/sessions/incoming`;

    const response = await this.makeRequest<void>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        announcement: Array.from(announcement),
      }),
    });

    if (!response.success) {
      throw new Error(
        response.error || 'Failed to broadcast incoming announcement'
      );
    }
  }

  async fetchAnnouncements(): Promise<Uint8Array[]> {
    const url = `${this.baseUrl}/announcements`;

    try {
      const response = await this.makeRequest<{ announcements: number[][] }>(
        url,
        {
          method: 'GET',
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch announcements');
      }

      // Convert number arrays back to Uint8Array
      return response.data.announcements.map(arr => new Uint8Array(arr));
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      throw error;
    }
  }

  private async makeRequest<T>(
    url: string,
    options: RequestInit
  ): Promise<MessageProtocolResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return { success: true, data };
      } catch (error) {
        lastError = error as Error;
        console.warn(`Request attempt ${attempt} failed:`, error);

        if (attempt < this.retryAttempts) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Request failed after all retry attempts',
    };
  }
}
