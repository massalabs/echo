/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_sessionconfig_free: (a: number, b: number) => void;
export const sessionconfig_new: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: bigint
) => number;
export const sessionconfig_new_default: () => number;
export const __wbg_userpublickeys_free: (a: number, b: number) => void;
export const userpublickeys_derive_id: (a: number) => [number, number];
export const userpublickeys_to_bytes: (
  a: number
) => [number, number, number, number];
export const userpublickeys_from_bytes: (
  a: number,
  b: number
) => [number, number, number];
export const __wbg_usersecretkeys_free: (a: number, b: number) => void;
export const usersecretkeys_to_bytes: (
  a: number
) => [number, number, number, number];
export const usersecretkeys_from_bytes: (
  a: number,
  b: number
) => [number, number, number];
export const usersecretkeys_get_massa_key_pair_bytes: (
  a: number
) => [number, number];
export const __wbg_userkeys_free: (a: number, b: number) => void;
export const userkeys_public_keys: (a: number) => [number, number, number];
export const userkeys_secret_keys: (a: number) => [number, number, number];
export const generate_user_keys: (
  a: number,
  b: number,
  c: number,
  d: number
) => [number, number, number];
export const __wbg_encryptionkey_free: (a: number, b: number) => void;
export const encryptionkey_generate: () => number;
export const encryptionkey_from_bytes: (
  a: number,
  b: number
) => [number, number, number];
export const encryptionkey_to_bytes: (a: number) => [number, number];
export const __wbg_nonce_free: (a: number, b: number) => void;
export const nonce_generate: () => number;
export const nonce_from_bytes: (
  a: number,
  b: number
) => [number, number, number];
export const nonce_to_bytes: (a: number) => [number, number];
export const aead_encrypt: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number
) => [number, number];
export const aead_decrypt: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number
) => [number, number];
export const __wbg_message_free: (a: number, b: number) => void;
export const message_new: (a: number, b: number) => number;
export const message_timestamp: (a: number) => number;
export const message_contents: (a: number) => [number, number];
export const __wbg_sendmessageoutput_free: (a: number, b: number) => void;
export const sendmessageoutput_seeker: (a: number) => [number, number];
export const sendmessageoutput_ciphertext: (a: number) => [number, number];
export const __wbg_receivemessageoutput_free: (a: number, b: number) => void;
export const receivemessageoutput_message: (a: number) => number;
export const receivemessageoutput_acknowledged_seekers: (a: number) => any;
export const __wbg_sessionmanagerwrapper_free: (a: number, b: number) => void;
export const sessionmanagerwrapper_new: (a: number) => number;
export const sessionmanagerwrapper_from_encrypted_blob: (
  a: number,
  b: number,
  c: number
) => [number, number, number];
export const sessionmanagerwrapper_to_encrypted_blob: (
  a: number,
  b: number
) => [number, number, number, number];
export const sessionmanagerwrapper_establish_outgoing_session: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number
) => [number, number];
export const sessionmanagerwrapper_feed_incoming_announcement: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => void;
export const sessionmanagerwrapper_get_message_board_read_keys: (
  a: number
) => any;
export const sessionmanagerwrapper_send_message: (
  a: number,
  b: number,
  c: number,
  d: number
) => [number, number, number];
export const sessionmanagerwrapper_feed_incoming_message_board_read: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number
) => number;
export const sessionmanagerwrapper_peer_list: (a: number) => any;
export const sessionmanagerwrapper_peer_session_status: (
  a: number,
  b: number,
  c: number
) => [number, number, number];
export const sessionmanagerwrapper_peer_discard: (
  a: number,
  b: number,
  c: number
) => [number, number];
export const sessionmanagerwrapper_refresh: (a: number) => any;
export const start: () => void;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_export_2: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (
  a: number,
  b: number,
  c: number,
  d: number
) => number;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
