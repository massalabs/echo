import { Capacitor } from '@capacitor/core';

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
  if (Capacitor.isNativePlatform()) {
    // For native apps, you might want to use a production URL
    return 'https://gossip.app';
  }

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
  let url = `${baseUrl}/add/${userId}`;

  if (userName) {
    url += `?name=${encodeURIComponent(userName)}`;
  }

  return url;
}
