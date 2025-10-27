/**
 * Utility functions for formatting wallet addresses, public keys, and user IDs
 */

import { Address, PublicKey } from '@massalabs/massa-web3';
import bs58check from 'bs58check';

/**
 * Shortens a wallet address by showing the first few and last few characters
 * @param address - The full wallet address
 * @param startChars - Number of characters to show at the start (default: 6)
 * @param endChars - Number of characters to show at the end (default: 4)
 * @returns Shortened address string (e.g., "AU123...XYZ9")
 */
export function shortenAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address) return '';

  if (address.length <= startChars + endChars) {
    return address;
  }

  const start = address.slice(0, startChars);
  const end = address.slice(-endChars);

  return `${start}...${end}`;
}

/**
 * Formats a Massa address for display
 * @param address - The full Massa wallet address
 * @returns Formatted address string
 */
export function formatMassaAddress(address: string): string {
  if (!address) return '';

  // Massa addresses typically start with 'AU' and are quite long
  // Show first 8 characters and last 6 for better readability
  return shortenAddress(address, 8, 6);
}

export function isValidAddress(address: string): boolean {
  try {
    Address.fromString(address.trim());
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Validates a Massa public key string.
 * Massa public keys typically start with 'P' and are base58check encoded.
 * @param publicKey - The public key string to validate.
 * @returns True if the public key is valid, false otherwise.
 */
export function isValidMassaPublicKey(publicKey: string): boolean {
  try {
    // Attempt to create a PublicKey object from the string.
    // This will throw an error if the format is invalid.
    PublicKey.fromString(publicKey.trim());
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Formats a Massa public key for display
 * @param publicKey - The full Massa public key
 * @returns Formatted public key string
 */
export function formatMassaPublicKey(publicKey: string): string {
  if (!publicKey) return '';

  // Massa public keys typically start with 'P' and are quite long
  // Show first 8 characters and last 6 for better readability
  return shortenAddress(publicKey, 8, 6);
}

/**
 * Validates a 32-byte user ID (base58check encoded).
 * @param userId - The user ID string to validate (should be base58check encoded 32 bytes)
 * @returns True if the user ID is valid, false otherwise.
 */
export function isValidUserId(userId: string): boolean {
  if (!userId || typeof userId !== 'string') return false;

  try {
    // Decode the base58check string
    const decoded = bs58check.decode(userId.trim());

    // Check if it decodes to exactly 32 bytes
    return decoded.length === 32;
  } catch (_error) {
    return false;
  }
}

/**
 * Formats a user ID for display
 * @param userId - The full user ID (base58check encoded)
 * @returns Formatted user ID string
 */
export function formatUserId(userId: string): string {
  if (!userId) return '';

  // User IDs are base58check encoded, show first 8 and last 8 for readability
  return shortenAddress(userId, 8, 8);
}

/**
 * Mock that Generates a random 32-byte user ID
 * @returns Base58 string representing a 32-byte user ID
 */
export function generateUserId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bs58check.encode(bytes);
}
