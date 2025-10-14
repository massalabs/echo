import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Polyfill for Buffer
import { Buffer } from 'buffer';

// Setup SHA-512 for @noble/ed25519 (required for massa-web3)
import { sha512 } from '@noble/hashes/sha2';
import * as ed from '@noble/ed25519';
ed.utils.sha512Sync = (...m) => sha512(ed.utils.concatBytes(...m));

// Extend Window interface to include Buffer
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

window.Buffer = Buffer;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
