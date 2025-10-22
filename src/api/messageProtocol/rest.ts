/**
 * REST API implementation of the message protocol
 */

import { SessionInitiationResult } from '../../wasm/types';
import {
  EncryptedMessage,
  IMessageProtocol,
  MessageProtocolResponse,
} from './types';

export class RestMessageProtocol implements IMessageProtocol {
  constructor(
    private baseUrl: string,
    private timeout: number = 10000,
    private retryAttempts: number = 3
  ) {}

  async fetchMessages(discussionKey: string): Promise<EncryptedMessage[]> {
    const url = `${this.baseUrl}/messages/${encodeURIComponent(discussionKey)}`;

    try {
      const response = await this.makeRequest<EncryptedMessage[]>(url, {
        method: 'GET',
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch messages');
      }

      // Convert timestamp strings back to Date objects
      return response.data.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      throw error;
    }
  }

  async sendMessage(
    discussionKey: string,
    message: EncryptedMessage
  ): Promise<void> {
    const url = `${this.baseUrl}/messages/${encodeURIComponent(discussionKey)}`;

    try {
      const response = await this.makeRequest<void>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...message,
          ciphertext: Array.from(message.ciphertext),
          ct: Array.from(message.ct),
          rand: Array.from(message.rand),
          nonce: Array.from(message.nonce),
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

  async createOutgoingSession(
    contactId: string,
    recipientPublicKey: Uint8Array
  ): Promise<SessionInitiationResult> {
    const url = `${this.baseUrl}/sessions/outgoing`;

    try {
      const response = await this.makeRequest<SessionInitiationResult>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactId,
          recipientPublicKey: Array.from(recipientPublicKey),
        }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create outgoing session');
      }

      // Convert arrays back to Uint8Array
      const data = response.data;
      return {
        ...data,
        postData: {
          ct: new Uint8Array(data.postData.ct),
          rand: new Uint8Array(data.postData.rand),
          ciphertext: new Uint8Array(data.postData.ciphertext),
        },
        session: {
          ...data.session,
          masterKey: new Uint8Array(data.session.masterKey),
          innerKey: new Uint8Array(data.session.innerKey),
          nextPublicKey: new Uint8Array(data.session.nextPublicKey),
          nextPrivateKey: new Uint8Array(data.session.nextPrivateKey),
          createdAt: new Date(data.session.createdAt),
          updatedAt: new Date(data.session.updatedAt),
        },
      };
    } catch (error) {
      console.error('Failed to create outgoing session:', error);
      throw error;
    }
  }

  async feedIncomingAnnouncement(
    announcementData: Uint8Array
  ): Promise<SessionInitiationResult> {
    const url = `${this.baseUrl}/sessions/incoming`;

    try {
      const response = await this.makeRequest<SessionInitiationResult>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          announcementData: Array.from(announcementData),
        }),
      });

      if (!response.success || !response.data) {
        throw new Error(
          response.error || 'Failed to process incoming announcement'
        );
      }

      // Convert arrays back to Uint8Array
      const data = response.data;
      return {
        ...data,
        postData: {
          ct: new Uint8Array(data.postData.ct),
          rand: new Uint8Array(data.postData.rand),
          ciphertext: new Uint8Array(data.postData.ciphertext),
        },
        session: {
          ...data.session,
          masterKey: new Uint8Array(data.session.masterKey),
          innerKey: new Uint8Array(data.session.innerKey),
          nextPublicKey: new Uint8Array(data.session.nextPublicKey),
          nextPrivateKey: new Uint8Array(data.session.nextPrivateKey),
          createdAt: new Date(data.session.createdAt),
          updatedAt: new Date(data.session.updatedAt),
        },
      };
    } catch (error) {
      console.error('Failed to process incoming announcement:', error);
      throw error;
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
