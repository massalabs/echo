// A low level Echo session

use crypto_cipher as cipher;
use crypto_kdf as kdf;
use crypto_kem as kem;
use crypto_rng as rng;
use std::collections::{HashMap, VecDeque};

const MASTER_KEY_SIZE: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Role {
    Initiator,
    Responder,
}

impl Role {
    fn to_bytes(&self) -> [u8; 1] {
        match self {
            Role::Initiator => [0],
            Role::Responder => [1],
        }
    }

    fn opposite(&self) -> Self {
        match self {
            Role::Initiator => Role::Responder,
            Role::Responder => Role::Initiator,
        }
    }
}

enum KeySource<T> {
    /// Ephemeral key stored locally
    Ephemeral(T),
    /// The static key of the user
    Static,
}

pub struct StaticKdf {
    mk_next: [u8; 32],
    seeker_next: [u8; 32],
}

impl StaticKdf {
    pub fn new(static_pk: &kem::PublicKey) -> Self {
        let mut mk_next = [0u8; 32];
        let mut seeker_next = [0u8; 32];
        let mut static_kdf = kdf::Extract::new("session.static_kem.salt---------".as_bytes());
        static_kdf.input_item(static_pk.as_bytes());
        let static_kdf = static_kdf.finalize();
        static_kdf.expand("session.static_kem.mk_next".as_bytes(), &mut mk_next);
        static_kdf.expand(
            "session.static_kem.seeker_next".as_bytes(),
            &mut seeker_next,
        );
        Self {
            mk_next,
            seeker_next,
        }
    }
}

struct HistoryItemSelf {
    local_id: u64,
    sk_next: KeySource<kem::SecretKey>,
    mk_next: [u8; MASTER_KEY_SIZE],
    seeker_next: [u8; 32],
}

impl HistoryItemSelf {
    pub fn initial(static_pk_self: &kem::PublicKey) -> Self {
        let static_kem = StaticKdf::new(static_pk_self);
        Self {
            local_id: 0,
            sk_next: KeySource::Static,
            mk_next: static_kem.mk_next,
            seeker_next: static_kem.seeker_next,
        }
    }
}

struct HistoryItemPeer {
    our_parent_id: u64, // parent ID on our side
    pk_next: kem::PublicKey,
    mk_next: [u8; MASTER_KEY_SIZE],
    seeker_next: [u8; 32],
}

impl HistoryItemPeer {
    pub fn initial(static_pk_peer: kem::PublicKey) -> Self {
        let static_kem = StaticKdf::new(&static_pk_peer);
        Self {
            our_parent_id: 0,
            pk_next: static_pk_peer,
            mk_next: static_kem.mk_next,
            seeker_next: static_kem.seeker_next,
        }
    }
}

struct AnnouncementRootKdf {
    cipher_key: cipher::Key,
    cipher_nonce: cipher::Nonce,
    auth_key: [u8; 32],
    integrity_seed: [u8; 32],
}

impl AnnouncementRootKdf {
    fn new(
        randomness: &[u8; 32],
        ss: &kem::SharedSecret,
        ct: &kem::Ciphertext,
        pk: &kem::PublicKey,
    ) -> Self {
        let mut cipher_key = [0u8; cipher::KEY_SIZE];
        let mut cipher_nonce = [0u8; cipher::NONCE_SIZE];
        let mut auth_key = [0u8; 32];
        let mut integrity_seed = [0u8; 32];

        let mut root_kdf = kdf::Extract::new("session.announcement_root_kdf.salt".as_bytes());
        root_kdf.input_item(randomness.as_slice());
        root_kdf.input_item(ss.as_bytes());
        root_kdf.input_item(ct.as_bytes());
        root_kdf.input_item(pk.as_bytes());
        root_kdf.input_item(&Role::Initiator.to_bytes());
        let root_kdf = root_kdf.finalize();
        root_kdf.expand(
            "session.announcement_root_kdf.cipher_key".as_bytes(),
            &mut cipher_key,
        );
        root_kdf.expand(
            "session.announcement_root_kdf.cipher_nonce".as_bytes(),
            &mut cipher_nonce,
        );
        root_kdf.expand(
            "session.announcement_root_kdf.auth_key".as_bytes(),
            &mut auth_key,
        );
        root_kdf.expand(
            "session.announcement_root_kdf.integrity_seed".as_bytes(),
            &mut integrity_seed,
        );

        Self {
            cipher_key: cipher_key.into(),
            cipher_nonce: cipher_nonce.into(),
            auth_key,
            integrity_seed,
        }
    }
}

pub struct MessageIntegrityKdf {
    mk_next: [u8; 32],
    integrity_key: [u8; 32],
    seeker_next: [u8; 32],
}

impl MessageIntegrityKdf {
    fn new(integrity_seed: &[u8; 32], pk_next: &kem::PublicKey, payload: &[u8]) -> Self {
        let mut mk_next = [0u8; 32];
        let mut integrity_key = [0u8; 32];
        let mut seeker_next = [0u8; 32];
        let mut integrity_kdf = kdf::Extract::new("session.integrity_kdf.salt------".as_bytes());
        integrity_kdf.input_item(integrity_seed.as_slice());
        integrity_kdf.input_item(pk_next.as_bytes());
        integrity_kdf.input_item(payload);
        let integrity_kdf = integrity_kdf.finalize();
        integrity_kdf.expand("session.integrity_kdf.mk_next".as_bytes(), &mut mk_next);
        integrity_kdf.expand(
            "session.integrity_kdf.integrity_key".as_bytes(),
            &mut integrity_key,
        );
        integrity_kdf.expand(
            "session.integrity_kdf.seeker_next".as_bytes(),
            &mut seeker_next,
        );
        Self {
            mk_next,
            integrity_key,
            seeker_next,
        }
    }
}

pub struct IncomingAnnouncementPrecursor {
    auth_payload: Vec<u8>,
    auth_key: [u8; 32],
    integrity_seed: [u8; 32],
    integrity_key: [u8; 32],
}

impl IncomingAnnouncementPrecursor {
    pub fn try_from_incoming_announcement_bytes(
        announcement_bytes: &[u8],
        our_pk: &kem::PublicKey,
        our_sk: &kem::SecretKey,
    ) -> Option<Self> {
        // get the 32 byte randomnes
        let randomnes: [u8; 32] = announcement_bytes.get(..32)?.try_into().ok()?;

        // get the KEM ct
        let ct_end_index = 32 + kem::CIPHERTEXT_SIZE;
        let ct_bytes: [u8; kem::CIPHERTEXT_SIZE] =
            announcement_bytes.get(32..ct_end_index)?.try_into().ok()?;
        let ct = kem::Ciphertext::from(ct_bytes);

        // get the encrypted message
        let encrypted_message = announcement_bytes.get(ct_end_index..)?;

        // decapsulate the shared secret
        let ss = kem::decapsulate(&our_sk, &ct);

        // root kdf
        let root_kdf = AnnouncementRootKdf::new(&randomnes, &ss, &ct, our_pk);

        // decrypt the message
        let mut plaintext = encrypted_message.to_vec();
        cipher::decrypt(&root_kdf.cipher_key, &root_kdf.cipher_nonce, &mut plaintext);

        // read the payload
        let payload_end_index = plaintext.len().checked_sub(32)?;
        let auth_payload = plaintext.get(..payload_end_index)?.to_vec();

        // read the integrity key
        let integrity_key: [u8; 32] = plaintext.get(payload_end_index..)?.try_into().ok()?;

        Some(Self {
            auth_payload,
            auth_key: root_kdf.auth_key,
            integrity_seed: root_kdf.integrity_seed,
            integrity_key,
        })
    }

    pub fn auth_payload(&self) -> &[u8] {
        &self.auth_payload
    }

    pub fn auth_key(&self) -> &[u8; 32] {
        &self.auth_key
    }

    pub fn finalize(self, pk_peer: kem::PublicKey) -> Option<IncomingAnnouncement> {
        // integrity KDF
        let integrity_kdf =
            MessageIntegrityKdf::new(&self.integrity_seed, &pk_peer, &self.auth_payload);

        // check message integrity
        if self.integrity_key != integrity_kdf.integrity_key {
            return None;
        }

        Some(IncomingAnnouncement {
            pk_peer,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        })
    }
}

pub struct IncomingAnnouncement {
    pk_peer: kem::PublicKey,
    mk_next: [u8; 32],
    seeker_next: [u8; 32],
}

pub struct OutgoingAnnouncementPrecursor {
    randomness: [u8; 32],
    kem_ct: kem::Ciphertext,
    root_kdf: AnnouncementRootKdf,
}

impl OutgoingAnnouncementPrecursor {
    pub fn new(pk_peer: &kem::PublicKey) -> Self {
        // KEM encapsulation with fresh randomness
        let mut kem_randomness = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut kem_randomness);
        let (kem_ct, kem_ss) = kem::encapsulate(pk_peer, kem_randomness);

        // fresh randomness for root kDF
        let mut root_kdf_randomness = [0u8; 32];
        rng::fill_buffer(&mut root_kdf_randomness);

        // root KDF
        let root_kdf = AnnouncementRootKdf::new(&root_kdf_randomness, &kem_ss, &kem_ct, pk_peer);

        Self {
            randomness: root_kdf_randomness,
            kem_ct,
            root_kdf,
        }
    }

    pub fn auth_key(&self) -> &[u8; 32] {
        &self.root_kdf.auth_key
    }

    pub fn finalize(self, auth_payload: &[u8], pk_self: &kem::PublicKey) -> OutgoingAnnouncement {
        // integrity KDF
        let integrity_kdf =
            MessageIntegrityKdf::new(&self.root_kdf.integrity_seed, pk_self, auth_payload);

        // fuse payload and integrity hash and encrypt
        let mut ciphertext = [auth_payload, &integrity_kdf.integrity_key].concat();
        cipher::encrypt(
            &self.root_kdf.cipher_key,
            &self.root_kdf.cipher_nonce,
            &mut ciphertext,
        );

        // assemble announcement bytes
        let announcement_bytes = [
            self.randomness.as_slice(),
            self.kem_ct.as_bytes(),
            &ciphertext,
        ]
        .concat();

        OutgoingAnnouncement {
            announcement_bytes,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        }
    }
}

pub struct OutgoingAnnouncement {
    announcement_bytes: Vec<u8>,
    mk_next: [u8; 32],
    seeker_next: [u8; 32],
}

impl OutgoingAnnouncement {
    pub fn announcement_bytes(&self) -> &[u8] {
        &self.announcement_bytes
    }
}

pub struct Session {
    // our role in this session
    role: Role,

    // history of our latest messages in the session
    self_msg_history: VecDeque<HistoryItemSelf>,

    // the latest session message we have seen from the peer
    latest_peer_msg: HistoryItemPeer,
}

impl Session {
    pub fn try_from_incoming_announcement(
        incoming_announcement: IncomingAnnouncement,
        pk_self: &kem::PublicKey,
    ) -> Option<Self> {
        // initialize self message history
        let mut self_msg_history = VecDeque::new();
        self_msg_history.push_back(HistoryItemSelf::initial(pk_self));

        // initialize latest peer message
        let latest_peer_msg = HistoryItemPeer {
            our_parent_id: 0,
            pk_next: incoming_announcement.pk_peer,
            mk_next: incoming_announcement.mk_next,
            seeker_next: incoming_announcement.seeker_next,
        };

        Some(Self {
            role: Role::Responder,
            self_msg_history,
            latest_peer_msg,
        })
    }

    pub fn from_outgoing_announcement(
        outgoing_announcement: OutgoingAnnouncement,
        pk_peer: kem::PublicKey,
    ) -> Self {
        // initialize self message history
        let mut self_msg_history = VecDeque::new();
        self_msg_history.push_back(HistoryItemSelf {
            local_id: 1,
            sk_next: KeySource::Static,
            mk_next: outgoing_announcement.mk_next,
            seeker_next: outgoing_announcement.seeker_next,
        });

        // initialize latest peer message
        let latest_peer_msg = HistoryItemPeer::initial(pk_peer);

        Self {
            role: Role::Initiator,
            self_msg_history,
            latest_peer_msg,
        }
    }

    /// get possible seekers where to find incoming messages
    /// Returns a vector of (local_id, seeker) pairs
    pub fn possible_incoming_message_seekers(&self) -> Vec<(u64, [u8; 32])> {
        let mut seekers = Vec::with_capacity(self.self_msg_history.len());
        for item in self.self_msg_history.iter().rev() {
            let seeker_kdf = SeekerKdf::new(&self.latest_peer_msg.seeker_next, &item.seeker_next);
            seekers.push((item.local_id, seeker_kdf.seeker));
        }
        seekers
    }

    fn get_self_message_by_id(&self, local_id: u64) -> Option<&HistoryItemSelf> {
        let first_id = self.self_msg_history.front()?.local_id;
        let index = local_id.checked_sub(first_id)?;
        self.self_msg_history.get(index.try_into().ok()?)
    }

    ///
    pub fn try_feed_incoming_message(
        &mut self,
        our_parent_id: u64,
        self_static_sk: &kem::SecretKey,
        message: &[u8],
    ) -> Option<Vec<u8>> {
        // parent messages
        let self_msg = &self.latest_peer_msg;
        let peer_msg = self.get_self_message_by_id(our_parent_id)?;

        // read KEM ct
        let msg_ct: [u8; kem::CIPHERTEXT_SIZE] =
            message.get(..kem::CIPHERTEXT_SIZE)?.try_into().ok()?;
        let msg_ct: kem::Ciphertext = msg_ct.into();

        // deduce KEM ss
        let msg_sk = match &peer_msg.sk_next {
            KeySource::Static => self_static_sk,
            KeySource::Ephemeral(sk) => sk,
        };
        let msg_ss = kem::decapsulate(msg_sk, &msg_ct);

        // message root kdf
        let msg_root_kdf = MessageRootKdf::new(
            &self_msg.mk_next,
            &peer_msg.mk_next,
            &msg_ss,
            &msg_ct,
            self.role.opposite(),
        );

        // read and decrypt content
        let mut content = message.get(kem::CIPHERTEXT_SIZE..)?.to_vec();
        cipher::decrypt(
            &msg_root_kdf.cipher_key,
            &msg_root_kdf.cipher_nonce,
            &mut content,
        );

        // read pk_next
        let pk_next: [u8; kem::PUBLIC_KEY_SIZE] =
            content.get(..kem::PUBLIC_KEY_SIZE)?.try_into().ok()?;
        let pk_next: kem::PublicKey = pk_next.into();

        // read the payload
        let payload_end_index = content.len().checked_sub(32)?;
        let payload = content
            .get(kem::PUBLIC_KEY_SIZE..payload_end_index)?
            .to_vec();

        // read the integrity key
        let integrity_key: [u8; 32] = content.get(payload_end_index..)?.try_into().ok()?;

        // integrity KDF
        let integrity_kdf =
            MessageIntegrityKdf::new(&msg_root_kdf.integrity_seed, &pk_next, &payload);

        // check message integrity
        if integrity_key != integrity_kdf.integrity_key {
            return None;
        }

        // update latest peer message
        self.latest_peer_msg = HistoryItemPeer {
            our_parent_id,
            pk_next,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        };

        // drop all our messages strictly before the parent referenced by this peer message
        while self
            .self_msg_history
            .front()
            .map_or(false, |msg| msg.local_id < our_parent_id)
        {
            self.self_msg_history.pop_front();
        }

        Some(payload)
    }

    /// send an ougoing message
    /// Warning: leaks plaintext length so make sure the payload is padded
    pub fn send_outgoing_message(&mut self, payload: &[u8]) -> Vec<u8> {
        let self_msg = self
            .self_msg_history
            .back()
            .expect("Self message history unexpectedly empty");
        let peer_msg = &self.latest_peer_msg;

        // KEM encapsulation with fresh randomness
        let mut kem_randomness = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut kem_randomness);
        let (msg_ct, msg_ss) = kem::encapsulate(&peer_msg.pk_next, kem_randomness);

        // message root kdf
        let msg_root_kdf = MessageRootKdf::new(
            &self_msg.mk_next,
            &peer_msg.mk_next,
            &msg_ss,
            &msg_ct,
            self.role,
        );

        // generate pk_next
        let mut pk_next_randomness = [0u8; kem::KEY_GENERATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut pk_next_randomness);
        let (sk_next, pk_next) = kem::generate_key_pair(pk_next_randomness);

        // integrity KDF
        let integrity_kdf: MessageIntegrityKdf =
            MessageIntegrityKdf::new(&msg_root_kdf.integrity_seed, &pk_next, &payload);

        // fuse pk_next, payload, and integrity hash and encrypt
        let mut ciphertext = [pk_next.as_bytes(), payload, &integrity_kdf.integrity_key].concat();
        cipher::encrypt(
            &msg_root_kdf.cipher_key,
            &msg_root_kdf.cipher_nonce,
            &mut ciphertext,
        );

        // push self message
        self.self_msg_history.push_back(HistoryItemSelf {
            local_id: self_msg.local_id + 1,
            sk_next: KeySource::Ephemeral(sk_next),
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        });

        // assemble message bytes
        let message_bytes = [msg_ct.as_bytes().as_slice(), &ciphertext].concat();

        message_bytes
    }

    /// get the number of messages that we have sent but that the peer side has not yet acknowledged
    pub fn get_self_lag(&self) -> u64 {
        // get our latest local ID
        let our_latest_local_id = self
            .self_msg_history
            .back()
            .expect("Self message history unexpectedly empty")
            .local_id;

        // get the last local ID that the peer side referenced
        let peer_latest_parent_local_id = self.latest_peer_msg.our_parent_id;

        // compute the lag
        let delta = our_latest_local_id
            .checked_sub(peer_latest_parent_local_id)
            .expect("Self lag is negative");

        delta
    }
}

pub struct SeekerKdf {
    seeker: [u8; 32],
}

impl SeekerKdf {
    pub fn new(p_self_seeker_next: &[u8], p_peer_seeker_next: &[u8]) -> Self {
        let mut seeker = [0u8; 32];
        let initial_salt = "session.seeker_kdf.salt---------".as_bytes();
        let mut seeker_kdf = kdf::Extract::new(initial_salt);
        seeker_kdf.input_item(p_self_seeker_next);
        seeker_kdf.input_item(p_peer_seeker_next);
        let seeker_kdf = seeker_kdf.finalize();
        seeker_kdf.expand("session.seeker_kem.mk_next".as_bytes(), &mut seeker);
        Self { seeker }
    }
}

struct MessageRootKdf {
    cipher_key: cipher::Key,
    cipher_nonce: cipher::Nonce,
    integrity_seed: [u8; 32],
}

impl MessageRootKdf {
    fn new(
        p_self_mk_next: &[u8],
        p_peer_mk_next: &[u8],
        ss: &kem::SharedSecret,
        ct: &kem::Ciphertext,
        role: Role,
    ) -> Self {
        let mut cipher_key = [0u8; cipher::KEY_SIZE];
        let mut cipher_nonce = [0u8; cipher::NONCE_SIZE];
        let mut integrity_seed = [0u8; 32];

        let mut root_kdf = kdf::Extract::new("session.message_root_kdf.salt---".as_bytes());
        root_kdf.input_item(p_self_mk_next);
        root_kdf.input_item(p_peer_mk_next);
        root_kdf.input_item(ss.as_bytes());
        root_kdf.input_item(ct.as_bytes());
        root_kdf.input_item(&role.to_bytes());
        let root_kdf = root_kdf.finalize();
        root_kdf.expand(
            "session.message_root_kdf.cipher_key".as_bytes(),
            &mut cipher_key,
        );
        root_kdf.expand(
            "session.message_root_kdf.cipher_nonce".as_bytes(),
            &mut cipher_nonce,
        );
        root_kdf.expand(
            "session.message_root_kdf.integrity_seed".as_bytes(),
            &mut integrity_seed,
        );

        Self {
            cipher_key: cipher_key.into(),
            cipher_nonce: cipher_nonce.into(),
            integrity_seed,
        }
    }
}
