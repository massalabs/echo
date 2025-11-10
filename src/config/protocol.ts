/**
 * Protocol API Configuration
 *
 * Centralized configuration for the message protocol API endpoints.
 * This allows easy switching between different protocol implementations.
 */

export interface ProtocolConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

export const protocolConfig: ProtocolConfig = {
  baseUrl: import.meta.env.VITE_PROTOCOL_API_URL
    ? `${import.meta.env.VITE_PROTOCOL_API_URL}/api`
    : 'http://145.239.66.206:3001/api',
  timeout: 10000,
  retryAttempts: 3,
};

export type MessageProtocolType = 'rest' | 'mock';

export const defaultMessageProtocol: MessageProtocolType = 'rest';
