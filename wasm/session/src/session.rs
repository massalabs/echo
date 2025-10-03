use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

use crate::types::SessionId;
use crate::utils::timestamp_millis;

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct SessionInitInfos {
    pub(crate) session_id: SessionId,
    pub(crate) unix_timestamp_millis: u128,
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Session {
    pub(crate) init_info: SessionInitInfos,
    agraphon_instance: crypto_agraphon::Agraphon,
}

impl Session {
    /// Creates a new outgoing session.
    #[allow(dead_code)]
    pub fn new_outgoing(
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
        peer_pk: &auth::UserPublicKeys,
    ) -> (Self, Vec<u8>) {
        let cur_timestamp = timestamp_millis();

        // generate a random session id
        let session_id = SessionId::new();

        // create outgoing announcement precursor
        let outgoing_announcement =
            crypto_agraphon::OutgoingAnnouncementPrecursor::new(&peer_pk.kem_public_key);

        // create session init payload
        let init_info = SessionInitInfos {
            session_id,
            unix_timestamp_millis: cur_timestamp,
        };

        // serialize session init payload
        let public_payload =
            bincode::serialize(&init_info).expect("Failed to serialize session init payload");

        // create auth_blob
        let auth_blob = auth::AuthBlob::new(
            our_pk.clone(),
            our_sk,
            public_payload,
            outgoing_announcement.auth_key(),
        );

        // serialize auth_blob
        let auth_blob_serialized =
            Zeroizing::new(bincode::serialize(&auth_blob).expect("Failed to serialize auth_blob"));
        // Note: the auth blob is constant sized => announcement length leakage in agraphon is not an issue

        // finalize announcement
        let (announcement_bytes, announcement) =
            outgoing_announcement.finalize(auth_blob_serialized.as_slice(), &our_pk.kem_public_key);

        // create agraphon instance
        let agraphon_instance = crypto_agraphon::Agraphon::from_outgoing_announcement(
            announcement,
            peer_pk.kem_public_key.clone(),
        );

        // create session
        (
            Self {
                init_info,
                agraphon_instance,
            },
            announcement_bytes,
        )
    }

    pub fn try_incoming(
        announcement_bytes: &[u8],
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
    ) -> Option<(Self, auth::UserPublicKeys)> {
        // Decrypt the incoming announcement
        let incoming_announcement_precursor =
            crypto_agraphon::IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
                announcement_bytes,
                &our_pk.kem_public_key,
                &our_sk.kem_secret_key,
            )?;

        // Get the auth_payload and auth_key
        let auth_payload = incoming_announcement_precursor.auth_payload();
        let auth_key = incoming_announcement_precursor.auth_key();

        // Deserialize the auth_blob from auth_payload
        let auth_blob: auth::AuthBlob = bincode::deserialize(auth_payload).ok()?;

        // Verify the auth_blob
        if !auth_blob.verify(auth_key) {
            return None;
        }

        // Deserialize the session init payload from public_payload
        let init_info: SessionInitInfos = bincode::deserialize(auth_blob.public_payload()).ok()?;

        // Extract peer's public keys from the verified auth_blob
        let peer_pk = auth_blob.public_keys().clone();

        // Finalize the incoming announcement
        let incoming_announcement =
            incoming_announcement_precursor.finalize(peer_pk.kem_public_key.clone())?;

        // Create agraphon instance
        let agraphon_instance = crypto_agraphon::Agraphon::try_from_incoming_announcement(
            incoming_announcement,
            &our_pk.kem_public_key,
        )?;

        // Create session
        Some((
            Self {
                init_info,
                agraphon_instance,
            },
            peer_pk,
        ))
    }

    /// Encrypts and sends an outgoing message.
    #[allow(dead_code)]
    pub fn send_outgoing_message(&mut self, message: &[u8]) -> ([u8; 32], Vec<u8>) {
        self.agraphon_instance.send_outgoing_message(message)
    }

    /// Gets the list of possible incoming message seekers.
    pub fn possible_incoming_message_seekers(&self) -> Vec<(u64, [u8; 32])> {
        self.agraphon_instance.possible_incoming_message_seekers()
    }

    /// Tries to decrypt and process an incoming message.
    #[allow(dead_code)]
    pub fn try_feed_incoming_message(
        &mut self,
        parent_id: u64,
        self_static_sk: &auth::UserSecretKeys,
        message: &[u8],
    ) -> Option<Vec<u8>> {
        self.agraphon_instance.try_feed_incoming_message(
            parent_id,
            &self_static_sk.kem_secret_key,
            message,
        )
    }

    /// Gets the lag length.
    #[allow(dead_code)]
    pub fn lag_length(&self) -> u64 {
        self.agraphon_instance.lag_length()
    }
}
