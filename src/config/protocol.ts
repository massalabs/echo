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
  // baseUrl: import.meta.env.VITE_PROTOCOL_API_URL || 'http://localhost:3000/api',
  baseUrl: 'http://145.239.66.206:3001/api',
  timeout: 10000, // 10 seconds
  retryAttempts: 3,
};

export const endpoints = {
  messages: '/messages',
  sessions: '/sessions',
} as const;

export type MessageProtocolType = 'rest' | 'mock';

export const defaultMessageProtocol: MessageProtocolType = 'rest';
