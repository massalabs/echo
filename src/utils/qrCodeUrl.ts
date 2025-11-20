/**
 * Get the base URL for QR code generation
 * Uses current window location for web, or environment variable for native/fallback
 */
export function getBaseUrl(): string {
  // For web, use current origin (works automatically in dev/staging/prod)
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }

  // Fallback to environment variable if available
  const envUrl = import.meta.env.VITE_APP_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  // Final fallback (shouldn't happen in normal usage)
  return 'https://gossip.app';
}

/**
 * Generate QR code URL for sharing contact
 * Format: https://domain/add/{userId}?name={userName}
 */
export function generateQRCodeUrl(
  userId: string,
  userName?: string | null
): string {
  const baseUrl = getBaseUrl();
  // Encode userId as defensive best practice (Bech32 is already URL-safe, but encoding
  // ensures compatibility and follows URL encoding standards)
  // React Router will automatically decode it when using useParams()
  let url = `${baseUrl}/add/${encodeURIComponent(userId)}`;

  if (userName) {
    url += `?name=${encodeURIComponent(userName)}`;
  }

  return url;
}
