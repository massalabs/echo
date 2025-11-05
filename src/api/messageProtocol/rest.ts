/**
 * REST API implementation of the message protocol
 */

import {
  EncryptedMessage,
  IMessageProtocol,
  MessageProtocolResponse,
} from './types';
import { encodeToBase64, decodeFromBase64 } from '../../utils/base64';

const BULLETIN_ENDPOINT = '/bulletin';
const MESSAGES_ENDPOINT = '/messages';

type apiResponseMessages = {
  key: string;
  value: string;
};

export class RestMessageProtocol implements IMessageProtocol {
  constructor(
    private baseUrl: string,
    private timeout: number = 10000,
    private retryAttempts: number = 3
  ) {}

  async fetchMessages(seekers: Uint8Array[]): Promise<EncryptedMessage[]> {
    const url = `${this.baseUrl}${MESSAGES_ENDPOINT}/fetch`;
    try {
      const response = await this.makeRequest<apiResponseMessages[]>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Backend expects exactly { seekers: string[] }
        body: JSON.stringify({ seekers: seekers.map(encodeToBase64) }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch messages');
      }

      return response.data.map((item: apiResponseMessages) => {
        const seeker = decodeFromBase64(item.key);
        const ciphertext = decodeFromBase64(item.value);

        return {
          seeker,
          ciphertext,
          timestamp: new Date(), // TODO: add timestamp from server
        };
      });
    } catch (error) {
      console.log('-----------Failed to fetch messages in rest.ts', error);
      throw error;
    }
  }

  async sendMessage(
    seeker: Uint8Array,
    message: EncryptedMessage
  ): Promise<void> {
    // Encode seeker as base64url (URL-safe base64) for URL
    const seekerBase64 = encodeToBase64(seeker);
    const url = `${this.baseUrl}${MESSAGES_ENDPOINT}/`;

    try {
      const response = await this.makeRequest<void>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: seekerBase64,
          value: encodeToBase64(message.ciphertext),
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
  async sendAnnouncement(announcement: Uint8Array): Promise<string> {
    const url = `${this.baseUrl}${BULLETIN_ENDPOINT}`;

    const response = await this.makeRequest<{ counter: string }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: encodeToBase64(announcement),
      }),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to broadcast outgoing session');
    }

    return response.data.counter;
  }

  async fetchAnnouncements(): Promise<Uint8Array[]> {
    const url = `${this.baseUrl}${BULLETIN_ENDPOINT}`;

    try {
      const response = await this.makeRequest<{ data: string[] }>(url, {
        method: 'GET',
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch announcements');
      }

      return response.data.data.map(row => decodeFromBase64(row));
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
          // Try to include server-provided error details for easier debugging
          let errorDetail = '';
          try {
            const text = await response.text();
            if (text) errorDetail = ` | Body: ${text}`;
          } catch (_) {
            // ignore body read errors
          }
          throw new Error(
            `HTTP ${response.status}: ${response.statusText} | URL: ${url}${errorDetail}`
          );
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
