import {
  generate_user_keys,
  UserPublicKeys,
  UserSecretKeys,
} from '../assets/wasm/echo_wasm';
import { Account } from '@massalabs/massa-web3';

export interface userIdKeys {
  public_keys: UserPublicKeys;
  secret_keys: UserSecretKeys;
  userId: string;
  account: Account;
}

export async function generate_user_keys_wasm(
  passphrase: string,
  secondary_public_key: Uint8Array
): Promise<userIdKeys> {
  const keys = generate_user_keys(passphrase, secondary_public_key);
  const public_keys = keys.public_keys();
  const secret_keys = keys.secret_keys();
  const userId = public_keys.derive_id().toString();
  const account = await Account.fromPrivateKey(
    secret_keys.get_massa_key_pair_bytes().toString()
  );
  return {
    public_keys,
    secret_keys,
    userId: userId,
    account: account,
  };
}
