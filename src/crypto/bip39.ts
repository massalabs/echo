/**
 * BIP39 utilities for mnemonic generation, validation, and seed derivation
 */

import * as bip39 from 'bip39';
import * as CryptoJS from 'crypto-js';
import { Account, PrivateKey } from '@massalabs/massa-web3';

export interface Bip39BackupDisplay {
  mnemonic: string;
  account: Account;
  createdAt: Date;
}

/**
 * Generate a new BIP39 mnemonic phrase
 * @param strength - Entropy strength in bits (128, 160, 192, 224, 256)
 * @returns Generated mnemonic phrase
 */
export function generateMnemonic(strength = 256): string {
  return bip39.generateMnemonic(strength);
}

/**
 * Validate a BIP39 mnemonic phrase
 * @param mnemonic - The mnemonic phrase to validate
 * @returns True if valid, false otherwise
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Generate a seed from mnemonic and optional passphrase
 * @param mnemonic - The BIP39 mnemonic phrase
 * @param passphrase - Optional passphrase (empty string if not provided)
 * @returns Uint8Array seed
 */
export function mnemonicToSeed(
  mnemonic: string,
  passphrase?: string
): Uint8Array {
  const actualPassphrase = passphrase || '';
  return bip39.mnemonicToSeedSync(mnemonic, actualPassphrase);
}

export async function accountFromMnemonic(
  mnemonic: string,
  passphrase?: string
): Promise<Account> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = mnemonicToSeed(mnemonic, passphrase);

  const pkeyVersion = 1;
  const privateKeyBytes = seed.slice(0, 32);
  const privateKey = new Uint8Array([...[pkeyVersion], ...privateKeyBytes]);

  const pkey = PrivateKey.fromBytes(privateKey);
  const account = await Account.fromPrivateKey(pkey);
  return account;
}

/**
 * Encrypt mnemonic for secure storage
 * @param mnemonic - The mnemonic to encrypt
 * @param password - The encryption password
 * @returns Encrypted mnemonic data
 */
export async function encryptMnemonic(
  mnemonic: string,
  password: string
): Promise<{
  encryptedMnemonic: string;
  iv: string;
  salt: string;
}> {
  const salt = CryptoJS.lib.WordArray.random(128 / 8);
  const iv = CryptoJS.lib.WordArray.random(128 / 8);

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 10000,
  });

  const encrypted = CryptoJS.AES.encrypt(mnemonic, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    encryptedMnemonic: encrypted.toString(),
    iv: iv.toString(CryptoJS.enc.Hex),
    salt: salt.toString(CryptoJS.enc.Hex),
  };
}

/**
 * Decrypt mnemonic from secure storage
 * @param encryptedData - The encrypted mnemonic data
 * @param password - The decryption password
 * @returns Decrypted mnemonic
 */
export async function decryptMnemonic(
  encryptedData: {
    encryptedMnemonic: string;
    iv: string;
    salt: string;
  },
  password: string
): Promise<string> {
  const salt = CryptoJS.enc.Hex.parse(encryptedData.salt);
  const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 10000,
  });

  const decrypted = CryptoJS.AES.decrypt(encryptedData.encryptedMnemonic, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}
