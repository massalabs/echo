// A low level Echo session

use crypto_cipher as cipher;
use crypto_kdf as kdf;
use crypto_kem as kem;
use crypto_rng as rng;
use std::collections::{HashMap, VecDeque};

const MASTER_KEY_SIZE: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct MessageId([u8; 32]);

impl MessageId {
    pub fn new() -> Self {
        let mut id = [0u8; 32];
        rng::fill_buffer(&mut id);
        Self(id)
    }
}


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
        let initial_salt = "session.static_kem.salt---------".as_bytes();
        let mut static_kdf = kdf::Extract::new(initial_salt);
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
    pk_next: KeySource<kem::PublicKey>,
    sk_next: KeySource<kem::SecretKey>,
    mk_next: [u8; MASTER_KEY_SIZE],
    seeker_next: [u8; 32],
}

impl HistoryItemSelf {
    pub fn initial(static_pk_self: &kem::PublicKey) -> Self {
        let static_kem = StaticKdf::new(static_pk_self);
        Self {
            pk_next: KeySource::Static,
            sk_next: KeySource::Static,
            mk_next: static_kem.mk_next,
            seeker_next: static_kem.seeker_next,
        }
    }
}

struct HistoryItemPeer {
    pk_next: kem::PublicKey,
    mk_next: [u8; MASTER_KEY_SIZE],
    seeker_next: [u8; 32],
}

impl HistoryItemPeer {
    pub fn initial(static_pk_other: kem::PublicKey) -> Self {
        let static_kem = StaticKdf::new(&static_pk_other);
        Self {
            pk_next: static_pk_other,
            mk_next: static_kem.mk_next,
            seeker_next: static_kem.seeker_next,
        }
    }
}

struct AnnouncementRootKdf {
    cipher_key: cipher::Key,
    cipher_nonce: cipher::Nonce,
    auth_key: [u8; 32],
    integrity_salt: [u8; 32],
    integrity_seed: [u8; 32],
}

impl AnnouncementRootKdf {
    fn new(
        randomnes: &[u8; 32],
        ss: &kem::SharedSecret,
        ct: &kem::Ciphertext,
        pk: &kem::PublicKey,
    ) -> Self {
        let mut cipher_key = [0u8; cipher::KEY_SIZE];
        let mut cipher_nonce = [0u8; cipher::NONCE_SIZE];
        let mut auth_key = [0u8; 32];
        let mut integrity_salt = [0u8; 32];
        let mut integrity_seed = [0u8; 32];

        let mut root_kdf = kdf::Extract::new(randomnes.as_slice());
        root_kdf.input_item(ss.as_bytes());
        root_kdf.input_item(ct.as_bytes());
        root_kdf.input_item(pk.as_bytes());
        root_kdf.input_item(&Role::Initiator.to_bytes());
        let root_kdf = root_kdf.finalize();
        root_kdf.expand("session.root_kdf.cipher_key".as_bytes(), &mut cipher_key);
        root_kdf.expand(
            "session.root_kdf.cipher_nonce".as_bytes(),
            &mut cipher_nonce,
        );
        root_kdf.expand("session.root_kdf.auth_key".as_bytes(), &mut auth_key);
        root_kdf.expand(
            "session.root_kdf.integrity_salt".as_bytes(),
            &mut integrity_salt,
        );
        root_kdf.expand(
            "session.root_kdf.integrity_seed".as_bytes(),
            &mut integrity_seed,
        );

        Self {
            cipher_key: cipher_key.into(),
            cipher_nonce: cipher_nonce.into(),
            auth_key,
            integrity_salt,
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
    fn new(
        integrity_salt: &[u8; 32],
        integrity_seed: &[u8; 32],
        pk_next: &kem::PublicKey,
        payload: &[u8],
    ) -> Self {
        let mut mk_next = [0u8; 32];
        let mut integrity_key = [0u8; 32];
        let mut seeker_next = [0u8; 32];
        let mut integrity_kdf = kdf::Extract::new(integrity_salt);
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
    integrity_salt: [u8; 32],
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
            integrity_salt: root_kdf.integrity_salt,
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

    pub fn finalize(self, pk_other: kem::PublicKey) -> Option<IncomingAnnouncement> {
        // integrity KDF
        let integrity_kdf = MessageIntegrityKdf::new(
            &self.integrity_salt,
            &self.integrity_seed,
            &pk_other,
            &self.auth_payload,
        );

        // check message integrity
        if self.integrity_key != integrity_kdf.integrity_key {
            return None;
        }

        Some(IncomingAnnouncement {
            pk_other,
            mk_next: integrity_kdf.mk_next,
            seeker_next: integrity_kdf.seeker_next,
        })
    }
}

pub struct IncomingAnnouncement {
    pk_other: kem::PublicKey,
    mk_next: [u8; 32],
    seeker_next: [u8; 32],
}

pub struct OutgoingAnnouncementPrecursor {
    randomness: [u8; 32],
    kem_ct: kem::Ciphertext,
    root_kdf: AnnouncementRootKdf,
}

impl OutgoingAnnouncementPrecursor {
    pub fn new(pk_other: &kem::PublicKey) -> Self {
        // KEM encapsulation with fresh randomness
        let mut kem_randomness = [0u8; kem::ENCAPSULATION_RANDOMNESS_SIZE];
        rng::fill_buffer(&mut kem_randomness);
        let (kem_ct, kem_ss) = kem::encapsulate(pk_other, kem_randomness);

        // fresh randomness for root kDF
        let mut root_kdf_randomness = [0u8; 32];
        rng::fill_buffer(&mut root_kdf_randomness);

        // root KDF
        let root_kdf = AnnouncementRootKdf::new(&root_kdf_randomness, &kem_ss, &kem_ct, pk_other);

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
        let integrity_kdf = MessageIntegrityKdf::new(
            &self.root_kdf.integrity_salt,
            &self.root_kdf.integrity_seed,
            pk_self,
            auth_payload,
        );

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
    self_msg_history: VecDeque<MessageId>,

    // history of our latest messages in the session, indexed by internal unique ID
    self_msg_items: HashMap<MessageId, HistoryItemSelf>,

    // the latest session message we have seen from the peer
    latest_peer_msg: HistoryItemPeer,
}

impl Session {
    pub fn try_from_incoming_announcement(
        incoming_announcement: IncomingAnnouncement,
        pk_self: &kem::PublicKey,
    ) -> Option<Self> {
        // initialize latest peer message
        let latest_peer_msg = HistoryItemPeer {
            pk_next: incoming_announcement.pk_other,
            mk_next: incoming_announcement.mk_next,
            seeker_next: incoming_announcement.seeker_next,
        };

        // init session
        let mut res = Self {
            role: Role::Responder,
            self_msg_history: VecDeque::new(),
            self_msg_items: HashMap::new(),
            latest_peer_msg,
        };

        // initialize self message history
        res.push_new_self_message(HistoryItemSelf::initial(pk_self));

        Some(res)
    }

    pub fn from_outgoing_announcement(
        outgoing_announcement: OutgoingAnnouncement,
        pk_other: kem::PublicKey,
    ) -> Self {
        // initialize latest peer message
        let latest_peer_msg = HistoryItemPeer::initial(pk_other);

        // init session
        let mut res = Self {
            role: Role::Initiator,
            self_msg_history: VecDeque::new(),
            self_msg_items: HashMap::new(),
            latest_peer_msg,
        };

        // initialize self message history
        res.push_new_self_message(HistoryItemSelf {
            sk_next: KeySource::Static,
            pk_next: KeySource::Static,
            mk_next: outgoing_announcement.mk_next,
            seeker_next: outgoing_announcement.seeker_next,
        });

        res
    }

    fn push_new_self_message(&mut self, item: HistoryItemSelf) {
        let id = MessageId::new();
        self.self_msg_history.push_back(id);
        self.self_msg_items.insert(id, item);
    }

    fn pop_oldest_self_message(&mut self) -> Option<(MessageId, HistoryItemSelf)> {
        let Some(id) = self.self_msg_history.pop_front() else {
            return None;
        };
        let msg = self.self_msg_items.remove(&id).expect("Message unexpectedly absent");
        Some((id, msg))
    }

    /// get possible seekers where to find incoming messages
    pub fn possible_incoming_message_seekers(&self) -> HashMap<MessageId, [u8; 32]> {
        let mut seekers = HashMap::new();
        for msg_id in self.self_msg_history.iter() {
            let item = self.self_msg_items.get(msg_id).expect("Message unexpectedly absent");
            let seeker_kdf = SeekerKdf::new(&item.seeker_next, &self.latest_peer_msg.seeker_next);
            seekers.insert(*msg_id, seeker_kdf.seeker);
        }
        seekers
    }

    /// 
    pub fn try_feed_incoming_message(self_msg_id: MessageId, message: &[u8]) -> Option<Vec<u8>> {
        // TODO

    }

    /// send an ougoing message
    /// Warning: leaks plaintext length so make sure it is padded
    pub fn send_outgoing_message(payload: &[u8]) {
        // TODO
    }
}


pub struct SeekerKdf {
    seeker: [u8; 32],
}

impl SeekerKdf {
    pub fn new(p_self_seeker_next: &[u8], p_other_seeker_next: &[u8]) -> Self {
        let mut seeker = [0u8; 32];
        let initial_salt = "session.seeker_kdf.salt---------".as_bytes();
        let mut seeker_kdf = kdf::Extract::new(initial_salt);
        seeker_kdf.input_item(p_self_seeker_next);
        seeker_kdf.input_item(p_other_seeker_next);
        let seeker_kdf = seeker_kdf.finalize();
        seeker_kdf.expand("session.seeker_kem.mk_next".as_bytes(), &mut seeker);
        Self {
            seeker
        }
    }
}
