import { UserIdModule } from './types';

export class MockUserIdModule implements UserIdModule {
  async init(): Promise<void> {
    console.log('Mock user ID module initialized');
  }

  cleanup(): void {
    // No cleanup needed for mock
  }

  /**
   * Derive a user ID from Massa public key and other parameters
   * This is a mock implementation that creates a deterministic user ID
   * based on the public key and username using a simple hash function
   */
  async deriveUserId(
    publicKey: Uint8Array,
    username: string,
    additionalParams?: Uint8Array
  ): Promise<string> {
    // Create a combined input for hashing
    const usernameBytes = new TextEncoder().encode(username);
    const combinedLength =
      publicKey.length + usernameBytes.length + (additionalParams?.length || 0);
    const combined = new Uint8Array(combinedLength);

    let offset = 0;
    combined.set(publicKey, offset);
    offset += publicKey.length;

    combined.set(usernameBytes, offset);
    offset += usernameBytes.length;

    if (additionalParams) {
      combined.set(additionalParams, offset);
    }

    // Use a simple hash function to create a 32-byte output
    // In a real implementation, this would use a proper cryptographic hash
    const hash = await crypto.subtle.digest('SHA-256', combined);
    const hashBytes = new Uint8Array(hash);

    // Convert to hex string (64 characters for 32 bytes)
    return Array.from(hashBytes, byte =>
      byte.toString(16).padStart(2, '0')
    ).join('');
  }
}
