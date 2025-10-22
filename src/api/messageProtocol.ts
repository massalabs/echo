export type {
  EncryptedMessage,
  IMessageProtocol,
  MessageProtocolResponse,
} from './messageProtocol/types';
export { RestMessageProtocol } from './messageProtocol/rest';
export { MockMessageProtocol } from './messageProtocol/mock';
import type { IMessageProtocol } from './messageProtocol/types';

/**
 * Factory function to create message protocol instances
 */
export async function createMessageProtocol(
  type: 'rest' | 'mock' = 'mock',
  config?: Partial<{ baseUrl: string; timeout: number; retryAttempts: number }>
): Promise<IMessageProtocol> {
  switch (type) {
    case 'rest': {
      const { RestMessageProtocol } = await import('./messageProtocol/rest');
      return new RestMessageProtocol(
        config?.baseUrl || 'http://localhost:3000/api',
        config?.timeout || 10000,
        config?.retryAttempts || 3
      );
    }
    case 'mock': {
      const { MockMessageProtocol } = await import('./messageProtocol/mock');
      return new MockMessageProtocol();
    }
    default:
      throw new Error(`Unsupported message protocol type: ${type}`);
  }
}
