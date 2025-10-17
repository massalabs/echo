use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub(crate) struct SessionInitPayload {
    pub(crate) seeker_prefix: Vec<u8>,
    pub(crate) unix_timestamp_millis: u128,
}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Message {
    pub timestamp: u128,
    pub contents: Vec<u8>,
}

#[derive(Zeroize, ZeroizeOnDrop)]

pub struct SendOutgoingMessageOutput {
    pub seeker: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

#[derive(Zeroize, ZeroizeOnDrop)]

pub struct FeedIncomingMessageOutput {
    pub message: Message,
    pub newly_acknowledged_self_seekers: Vec<Vec<u8>>,
}

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct IncomingInitiationRequest {
    agraphon_announcement: crypto_agraphon::IncomingAnnouncement,
    pub(crate) origin_public_keys: auth::UserPublicKeys,
    pub(crate) timestamp_millis: u128,
    seeker_prefix: Vec<u8>,
}

impl IncomingInitiationRequest {
    pub fn try_from(
        bytes: &[u8],
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
    ) -> Option<Self> {
        // parse announcement precursor
        let incoming_announcement_precursor =
            crypto_agraphon::IncomingAnnouncementPrecursor::try_from_incoming_announcement_bytes(
                bytes,
                &our_pk.kem_public_key,
                &our_sk.kem_secret_key,
            )?;

        // get auth payload and key
        let auth_payload = incoming_announcement_precursor.auth_payload();
        let auth_key = incoming_announcement_precursor.auth_key();

        // deserialize announcement contents
        let auth_blob: auth::AuthBlob = bincode::deserialize(auth_payload).ok()?;

        // verify auth blob
        if !auth_blob.verify(auth_key) {
            return None;
        }

        // deserialize inner data
        let init_payload: SessionInitPayload =
            bincode::deserialize(auth_blob.public_payload()).ok()?;

        // check seeker prefix length
        let _seeker_prefix_length: u8 = init_payload.seeker_prefix.len().try_into().ok()?;

        // finalize agraphon announcement
        let agraphon_announcement = incoming_announcement_precursor
            .finalize(auth_blob.public_keys().kem_public_key.clone())?;

        Some(Self {
            agraphon_announcement: agraphon_announcement.clone(),
            origin_public_keys: auth_blob.public_keys().clone(),
            timestamp_millis: init_payload.unix_timestamp_millis,
            seeker_prefix: init_payload.seeker_prefix.clone(),
        })
    }
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OutgoingInitiationRequest {
    agraphon_announcement: crypto_agraphon::OutgoingAnnouncement,
    pub(crate) timestamp_millis: u128,
    seeker_prefix: Vec<u8>,
}

impl OutgoingInitiationRequest {
    pub fn new(
        our_pk: &auth::UserPublicKeys,
        our_sk: &auth::UserSecretKeys,
        peer_pk: &auth::UserPublicKeys,
        seeker_prefix: &[u8],
        timestamp_millis: u128,
    ) -> (Vec<u8>, Self) {
        // prepare agraphon outgoing announcement precursor
        let agraphon_announcement_precursor =
            crypto_agraphon::OutgoingAnnouncementPrecursor::new(&peer_pk.kem_public_key);

        // get auth key
        let auth_key = agraphon_announcement_precursor.auth_key();

        // create initiation payload
        let _seeker_prefix_length: u8 = seeker_prefix
            .len()
            .try_into()
            .expect("Seeker prefix length too long");
        let session_init_payload = SessionInitPayload {
            seeker_prefix: seeker_prefix.to_vec(),
            unix_timestamp_millis: timestamp_millis,
        };
        let session_init_payload_bytes = bincode::serialize(&session_init_payload)
            .expect("Failed to serialize outgoing session initiation request");

        // create auth blob
        let auth_blob =
            auth::AuthBlob::new(our_pk.clone(), our_sk, session_init_payload_bytes, auth_key);
        let auth_payload_bytes =
            Zeroizing::new(bincode::serialize(&auth_blob).expect("Failed to serialize auth blob"));

        // finalize announcement
        let (announcement_bytes, announcement) =
            agraphon_announcement_precursor.finalize(auth_payload_bytes.as_slice());

        (announcement_bytes, Self {
            agraphon_announcement: announcement,
            timestamp_millis,
            seeker_prefix: seeker_prefix.to_vec(),
        })
    }
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Session {
    agraphon_instance: crypto_agraphon::Agraphon,
    peer_public_keys: auth::UserPublicKeys,
    peer_seeker_prefix: Vec<u8>,
    self_seeker_prefix: Vec<u8>,
}

impl Session {
    pub fn from_initiation_request_pair(
        outgoing_initiation_request: &OutgoingInitiationRequest,
        incoming_initiation_request: &IncomingInitiationRequest,
    ) -> Self {
        // create agraphon instance
        let agraphon_instance = crypto_agraphon::Agraphon::from_announcement_pair(
            &outgoing_initiation_request.agraphon_announcement,
            &incoming_initiation_request.agraphon_announcement,
        );

        // create session
        Self {
            agraphon_instance,
            peer_public_keys: incoming_initiation_request.origin_public_keys.clone(),
            peer_seeker_prefix: incoming_initiation_request.seeker_prefix.clone(),
            self_seeker_prefix: outgoing_initiation_request.seeker_prefix.clone(),
        }
    }

    fn combine_seeker(seeker_prefix: &[u8], seeker_postfix: &[u8]) -> Vec<u8> {
        let seeker_prefix_length: u8 = seeker_prefix
            .len()
            .try_into()
            .expect("Seeker prefix length too long");
        [
            &[seeker_prefix_length], // length-prefix avoids telescoping
            seeker_prefix,
            seeker_postfix,
        ]
        .concat()
    }

    /// Sends an outgoing message on the session and returns the seeker and the encrypted message bytes.
    pub fn send_outgoing_message(&mut self, message: &Message) -> SendOutgoingMessageOutput {
        let msg_bytes =
            Zeroizing::new(bincode::serialize(message).expect("Failed to serialize message"));
        let send_result = self
            .agraphon_instance
            .send_outgoing_message(&msg_bytes, &self.peer_public_keys.kem_public_key);
        let seeker = Self::combine_seeker(&self.self_seeker_prefix, send_result.seeker.as_slice());
        SendOutgoingMessageOutput {
            seeker,
            ciphertext: send_result.message_bytes.clone(),
        }
    }

    /// Gets the list of possible incoming message seekers.
    pub fn next_peer_message_seeker(&self) -> Vec<u8> {
        let seeker_postfix = Zeroizing::new(self.agraphon_instance.get_next_peer_message_seeker());
        Self::combine_seeker(&self.peer_seeker_prefix, seeker_postfix.as_slice())
    }

    pub fn try_feed_incoming_message(
        &mut self,
        self_static_sk: &auth::UserSecretKeys,
        message: &[u8],
    ) -> Option<FeedIncomingMessageOutput> {
        let raw_msg = self
            .agraphon_instance
            .try_feed_incoming_message(&self_static_sk.kem_secret_key, message)?;

        // deserialize the message
        let message: Message = bincode::deserialize(&raw_msg.message_bytes).ok()?;

        // convert seekers
        let newly_acknowledged_self_seekers = raw_msg
            .newly_acknowledged_self_seekers
            .iter()
            .map(|seeker| Self::combine_seeker(&self.self_seeker_prefix, seeker))
            .collect();

        Some(FeedIncomingMessageOutput {
            message,
            newly_acknowledged_self_seekers,
        })
    }

    /// Gets the lag length.
    pub fn lag_length(&self) -> u64 {
        self.agraphon_instance.lag_length()
    }
}
