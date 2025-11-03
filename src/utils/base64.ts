export function encodeToBase64(data: Uint8Array): string {
  return btoa(
    Array.from(data)
      .map(byte => String.fromCharCode(byte))
      .join('')
  );
}

export function decodeFromBase64(b64: string): Uint8Array {
  const decoded = atob(b64);
  return new Uint8Array(Array.from(decoded).map(char => char.charCodeAt(0)));
}
