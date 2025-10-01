/**
 * Utility functions for formatting wallet addresses
 */

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
