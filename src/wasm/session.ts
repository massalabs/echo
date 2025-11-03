/**
 * Session Module Implementation
 *
 * This file contains the real WASM implementation of the SessionModule
 * using SessionManagerWrapper and related WASM classes.
 */

import { ensureWasmInitialized } from './loader';
import {
  SessionConfig,
  SessionManagerWrapper,
  UserPublicKeys,
  UserSecretKeys,
  ReceiveMessageOutput,
  SendMessageOutput,
  SessionStatus,
} from '../assets/generated/wasm/echo_wasm';

export class SessionModule {
  private sessionManager: SessionManagerWrapper | null = null;
  private sessionConfig: SessionConfig | null = null;

  async init(): Promise<void> {
    await ensureWasmInitialized();
    // Create session configuration with default settings
    this.sessionConfig = SessionConfig.new_default();
    this.sessionManager = new SessionManagerWrapper(this.sessionConfig);
  }

  cleanup(): void {
    this.sessionManager?.free();
    this.sessionManager = null;
    this.sessionConfig?.free();
    this.sessionConfig = null;
  }

  /**
   * Establish an outgoing session with a peer via the underlying WASM wrapper
   */
  async establishOutgoingSession(
    peerPk: UserPublicKeys,
    ourPk: UserPublicKeys,
    ourSk: UserSecretKeys
  ): Promise<Uint8Array> {
    if (!this.sessionManager) {
      await this.init();
    }
    // sessionManager is set after init

    return this.sessionManager!.establish_outgoing_session(
      peerPk,
      ourPk,
      ourSk
    );
  }

  /**
   * Feed an incoming announcement into the session manager
   */
  async feedIncomingAnnouncement(
    announcementBytes: Uint8Array,
    ourPk: UserPublicKeys,
    ourSk: UserSecretKeys
  ): Promise<UserPublicKeys | undefined> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.feed_incoming_announcement(
      announcementBytes,
      ourPk,
      ourSk
    );
  }

  /**
   * Get the list of message board read keys (seekers) to monitor
   */
  async getMessageBoardReadKeys(): Promise<Array<Uint8Array>> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.get_message_board_read_keys();
  }

  /**
   * Process an incoming ciphertext from the message board
   */
  async feedIncomingMessageBoardRead(
    seeker: Uint8Array,
    ciphertext: Uint8Array,
    ourSk: UserSecretKeys
  ): Promise<ReceiveMessageOutput | undefined> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.feed_incoming_message_board_read(
      seeker,
      ciphertext,
      ourSk
    );
  }

  /**
   * Send a message to a peer
   */
  async sendMessage(
    peerId: Uint8Array,
    message: Uint8Array
  ): Promise<SendMessageOutput | undefined> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.send_message(peerId, message);
  }

  /**
   * List all known peer IDs
   */
  async peerList(): Promise<Array<Uint8Array>> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.peer_list();
  }

  /**
   * Get the session status for a peer
   */
  async peerSessionStatus(peerId: Uint8Array): Promise<SessionStatus> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.peer_session_status(peerId);
  }

  /**
   * Discard a peer and all associated session state
   */
  async peerDiscard(peerId: Uint8Array): Promise<void> {
    if (!this.sessionManager) {
      await this.init();
    }

    this.sessionManager!.peer_discard(peerId);
  }

  /**
   * Refresh sessions, returning peer IDs that need keep-alive messages
   */
  async refresh(): Promise<Array<Uint8Array>> {
    if (!this.sessionManager) {
      await this.init();
    }

    return this.sessionManager!.refresh();
  }
}
