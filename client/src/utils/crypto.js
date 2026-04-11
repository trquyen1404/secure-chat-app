/**
 * crypto.js — Advanced End-to-End Encryption (E2EE) Primitives
 * VERSION 1.9.2 (Stable + AD Sync)
 * 
 * Implements: X3DH Key Agreement, Double Ratchet (KDF & DH), HKDF (SHA-256), AES-256-GCM (AEAD).
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

// Helper for deterministic Associated Data (AD) strings based on participant IDs
export function getAssociatedData(id01, id02) {
  const id1 = String(id01 || '').trim();
  const id2 = String(id02 || '').trim();
  if (!id1 || !id2) return 'STATIC_AD_FALLBACK';
  
  const ids = [id1, id2].sort();
  const ad = ids.join(':');
  
  // Trace only if IDs are valid to avoid log spam during loading
  if (id1 && id2 && id1 !== id2) {
    console.debug(`[CRYPTO-Audit] AD generated: "${ad}"`);
  }
  return ad;
}

// Helper for diagnostic logging (fingerprints, not the keys themselves)
export async function getFingerprint(buffer) {
  const hash = await window.crypto.subtle.digest('SHA-256', buffer);
  return arrayBufferToBase64(hash).slice(0, 8);
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // [Fix] Avoid spread operator (...) for large buffers to prevent Stack Overflow
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  // [Fix] Normalize unpadded Base64 (e.g., from Signal-style encoding) before decoding.
  // atob() requires the string length to be a multiple of 4.
  let padded = (base64 || '').replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) padded += '=';
  const binaryString = window.atob(padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function concatUint8Arrays(...arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + (arr ? arr.byteLength : 0), 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    if (arr) {
      result.set(new Uint8Array(arr), offset);
      offset += arr.byteLength;
    }
  }
  return result;
}

// ── Signature Verification (ECDSA) ───────────────────────────────────────────

export async function generateECDSAKeyPair() {
  if (!window?.crypto?.subtle) {
    throw new Error('Web Crypto API (subtle) is not available. Please ensure you are using a Secure Context (HTTPS or localhost).');
  }
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicKeyRaw = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKeyRaw);
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicKeyBase64 };
}

export async function signDataECDSA(privateKey, dataBuffer) {
  const signature = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    dataBuffer
  );
  return arrayBufferToBase64(signature);
}

export async function verifySignatureECDSA(publicKeyBase64, signatureBase64, dataBuffer) {
  const publicKeyRaw = base64ToArrayBuffer(publicKeyBase64);
  const sigBytes = base64ToArrayBuffer(signatureBase64);
  
  const publicKey = await window.crypto.subtle.importKey(
    'raw',
    publicKeyRaw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );

  return window.crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    publicKey,
    sigBytes,
    dataBuffer
  );
}

// ── X25519 Key Generation ───────────────────────────────────────────────────

export async function generateX25519KeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKeyRaw = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKeyRaw);
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicKeyBase64 };
}

// Helper to export X25519 public key to Base64
export async function exportX25519Base64(publicKey) {
  const raw = await window.crypto.subtle.exportKey('raw', publicKey);
  return arrayBufferToBase64(raw);
}

// ── HKDF (HMAC-based Key Derivation Function) ────────────────────────────────

export async function hkdfDerive(masterSecret, salt, info, length = 256) {
  // [Fix] Handle both ArrayBuffer/Uint8Array AND pre-imported CryptoKey as input
  let keyMaterial;
  if (masterSecret instanceof CryptoKey) {
    // Already a CryptoKey — use directly as keyMaterial, but HKDF needs it re-imported
    const rawBytes = await window.crypto.subtle.exportKey('raw', masterSecret);
    keyMaterial = await window.crypto.subtle.importKey('raw', rawBytes, { name: 'HKDF' }, false, ['deriveKey']);
  } else {
    // ArrayBuffer, Uint8Array, or similar — wrap in Uint8Array
    const rawMaster = new Uint8Array(masterSecret);
    keyMaterial = await window.crypto.subtle.importKey('raw', rawMaster, { name: 'HKDF' }, false, ['deriveKey']);
  }

  const rawSalt = salt ? new Uint8Array(salt) : new Uint8Array(32);

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: rawSalt,
      info: new TextEncoder().encode(info || ''),
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const rawKey = await window.crypto.subtle.exportKey('raw', key);
  const fp = await getFingerprint(rawKey);
  console.log(`[CRYPTO] Derived Key (Info: ${info}) Fingerprint: ${fp}`);
  
  return key;
}

// ── X3DH Handshake ───────────────────────────────────────────────────────────

export async function x3dhInitiatorHandshake(
  aliceIKdh_priv,
  aliceEK_priv,
  bobIKsign_pub_b64,
  bobIKdh_pub_b64,
  bobSPK_pub_b64,
  bobSPK_signature_b64,
  bobOPK_pub_b64 = null
) {
  const spkBytes = base64ToArrayBuffer(bobSPK_pub_b64);
  const isValid = await verifySignatureECDSA(bobIKsign_pub_b64, bobSPK_signature_b64, spkBytes);
  if (!isValid) throw new Error("Bob's Signed PreKey signature verification failed!");

  const bobIKdh_pub = await importX25519Public(bobIKdh_pub_b64);
  const bobSPK_pub = await importX25519Public(bobSPK_pub_b64);

  console.log(`[X3DH-Audit] Peer Identity Key (IK): ${await getFingerprint(base64ToArrayBuffer(bobIKdh_pub_b64))}`);
  console.log(`[X3DH-Audit] Peer Signed Prekey (SPK): ${await getFingerprint(base64ToArrayBuffer(bobSPK_pub_b64))}`);

  const dh1 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: bobSPK_pub }, aliceIKdh_priv, 256);
  const dh2 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: bobIKdh_pub }, aliceEK_priv, 256);
  const dh3 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: bobSPK_pub }, aliceEK_priv, 256);

  const secrets = [dh1, dh2, dh3];
  if (bobOPK_pub_b64) {
    const bobOPK_pub = await importX25519Public(bobOPK_pub_b64);
    const dh4 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: bobOPK_pub }, aliceEK_priv, 256);
    secrets.push(dh4);
  }

  const combinedSecret = concatUint8Arrays(...secrets);
  const secretFP = await getFingerprint(combinedSecret.buffer);
  
  const rootKey = await hkdfDerive(combinedSecret, null, 'ROOT_KEY_V5');
  const rawRoot = await window.crypto.subtle.exportKey('raw', rootKey);
  const rootFP = await getFingerprint(rawRoot);
  
  const sendChainKey = await hkdfDerive(rawRoot, null, 'SENDER_CHAIN_V1');
  const recvChainKey = await hkdfDerive(rawRoot, null, 'RECEIVER_CHAIN_V1');

  console.log(`[X3DH-Init] Handshake Derived: Secret_FP=${secretFP}, Root_FP=${rootFP}`);
  return { rootKey, sendChainKey, recvChainKey };
}

export async function x3dhResponderHandshake(
  bobSPK_priv,
  bobIKdh_priv,
  bobOPK_priv,
  aliceIKdh_pub_b64,
  aliceEK_pub_b64
) {
  const aliceIKdh_pub = await importX25519Public(aliceIKdh_pub_b64);
  const aliceEK_pub = await importX25519Public(aliceEK_pub_b64);

  console.log(`[X3DH-Audit] Peer Identity Key (IK): ${await getFingerprint(base64ToArrayBuffer(aliceIKdh_pub_b64))}`);
  console.log(`[X3DH-Audit] Peer Ephemeral Key (EK): ${await getFingerprint(base64ToArrayBuffer(aliceEK_pub_b64))}`);

  const dh1 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: aliceIKdh_pub }, bobSPK_priv, 256);
  const dh2 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: aliceEK_pub }, bobIKdh_priv, 256);
  const dh3 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: aliceEK_pub }, bobSPK_priv, 256);

  const secrets = [dh1, dh2, dh3];
  if (bobOPK_priv) {
    const dh4 = await window.crypto.subtle.deriveBits({ name: 'X25519', public: aliceEK_pub }, bobOPK_priv, 256);
    secrets.push(dh4);
  }

  const combinedSecret = concatUint8Arrays(...secrets);
  const secretFP = await getFingerprint(combinedSecret.buffer);
  
  const rootKey = await hkdfDerive(combinedSecret, null, 'ROOT_KEY_V5');
  const rawRoot = await window.crypto.subtle.exportKey('raw', rootKey);
  const rootFP = await getFingerprint(rawRoot);
  
  const sendChainKey = await hkdfDerive(rawRoot, null, 'RECEIVER_CHAIN_V1');
  const recvChainKey = await hkdfDerive(rawRoot, null, 'SENDER_CHAIN_V1');

  console.log(`[X3DH-Resp] Handshake Derived: Secret_FP=${secretFP}, Root_FP=${rootFP}`);
  return { rootKey, sendChainKey, recvChainKey };
}

// ── Double Ratchet Logic ─────────────────────────────────────────────────────

export async function ratchetChain(chainKey) {
  const rawKey = await window.crypto.subtle.exportKey('raw', chainKey);
  const nextChainKey = await hkdfDerive(rawKey, null, 'NEXT_CHAIN_KEY');
  const messageKey = await hkdfDerive(rawKey, null, 'MESSAGE_KEY');
  return { nextChainKey, messageKey };
}

export async function ratchetRoot(rootKey, dhSecret) {
  const rawRoot = await window.crypto.subtle.exportKey('raw', rootKey);
  const newRootKey = await hkdfDerive(dhSecret, rawRoot, 'ROOT_KEY_UPDATE');
  const newChainKey = await hkdfDerive(dhSecret, rawRoot, 'CHAIN_KEY_START');
  return { newRootKey, newChainKey };
}

// ── Multi-Step Message Encryption ────────────────────────────────────────────

export async function encryptMessageGCM(plaintext, key, associatedData = null) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const algorithm = { name: 'AES-GCM', iv };
  if (associatedData) {
    algorithm.additionalData = new TextEncoder().encode(associatedData);
  }

  const ciphertext = await window.crypto.subtle.encrypt(
    algorithm,
    key,
    encoded
  );

  const iv_fp = await getFingerprint(iv);
  if (associatedData) {
    console.log(`[CRYPTO-Audit] Encrypting (n=${plaintext?.n ?? '?'}) with AD: "${associatedData}" (IV FP: ${iv_fp})`);
  } else {
    console.log(`[CRYPTO-Audit] Encrypting (n=${plaintext?.n ?? '?'}) with IV FP: ${iv_fp}`);
  }

  return {
    ciphertextB64: arrayBufferToBase64(ciphertext),
    ivB64: arrayBufferToBase64(iv)
  };
}

export async function decryptMessageGCM(ciphertextB64, ivB64, key, associatedData = null) {
  try {
    const iv = base64ToArrayBuffer(ivB64);
    const data = base64ToArrayBuffer(ciphertextB64);

    const iv_fp = await getFingerprint(iv);
    
    const algorithm = { name: 'AES-GCM', iv };
    if (associatedData) {
      algorithm.additionalData = new TextEncoder().encode(associatedData);
      console.log(`[CRYPTO-Audit] Decrypting (n=?) with AD: "${associatedData}" (IV FP: ${iv_fp})`);
    } else {
      console.log(`[CRYPTO-Audit] Decrypting (n=?) with IV FP: ${iv_fp}`);
    }

    const decrypted = await window.crypto.subtle.decrypt(
      algorithm,
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error(`[CRYPTO] Decryption failed! (AD: "${associatedData}", IV FP: ${await getFingerprint(base64ToArrayBuffer(ivB64))})`, err);
    throw new Error('E2EE Decryption Failed (Possible Key Desync or AD Mismatch)');
  }
}

// ── PIN-based Identity Protection ─────────────────────

export async function pbkdf2Derive(pin, salt, iterations = 100000) {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts arbitrary data using a Master Key (AES-GCM).
 * Returns { ciphertextB64, ivB64 }
 */
export async function encryptData(plaintext, masterKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
  
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    encoded
  );

  console.debug(`[CRYPTO] Data encrypted. size=${ciphertext.byteLength}`);
  return {
    ciphertextB64: arrayBufferToBase64(ciphertext),
    ivB64: arrayBufferToBase64(iv)
  };
}

/**
 * Decrypts data using a Master Key (AES-GCM).
 * Returns unparsed string (user should JSON.parse if needed).
 */
export async function decryptData(ciphertextB64, ivB64, masterKey) {
  try {
    const iv = base64ToArrayBuffer(ivB64);
    const data = base64ToArrayBuffer(ciphertextB64);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      data
    );
    
    const decoded = new TextDecoder().decode(decrypted);
    console.debug(`[CRYPTO] Data decrypted. length=${decoded.length}`);
    return decoded;
  } catch (err) {
    console.error(`[CRYPTO] Data decryption failed!`, err);
    throw new Error('Decryption Failed (Incorrect Key or Corrupted Data)');
  }
}

export async function wrapIdentityBundleWithPIN(ikSignPriv, ikDhPriv, spkPriv, pin) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await pbkdf2Derive(pin, salt);

  const bundle = {
    sign: arrayBufferToBase64(await window.crypto.subtle.exportKey('pkcs8', ikSignPriv)),
    dh: arrayBufferToBase64(await window.crypto.subtle.exportKey('pkcs8', ikDhPriv)),
    spk: arrayBufferToBase64(await window.crypto.subtle.exportKey('pkcs8', spkPriv))
  };

  const encodedBundle = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encodedBundle);

  return {
    wrappedKeyB64: arrayBufferToBase64(ciphertext),
    saltB64: arrayBufferToBase64(salt),
    ivB64: arrayBufferToBase64(iv)
  };
}

export async function unwrapIdentityBundleWithPIN(wrappedKeyB64, saltB64, ivB64, pin) {
  const ciphertext = base64ToArrayBuffer(wrappedKeyB64);
  const salt = base64ToArrayBuffer(saltB64);
  const iv = base64ToArrayBuffer(ivB64);
  
  const aesKey = await pbkdf2Derive(pin, new Uint8Array(salt));
  const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, ciphertext);
  
  const bundle = JSON.parse(new TextDecoder().decode(decrypted));

  return { 
    pkcs8Sign: base64ToArrayBuffer(bundle.sign), 
    pkcs8Dh: base64ToArrayBuffer(bundle.dh),
    pkcs8Spk: base64ToArrayBuffer(bundle.spk)
  };
}

// ── Shared Helpers ───────────────────────────────────────────────────────────

export async function importX25519Public(b64) {
  const buffer = base64ToArrayBuffer(b64);
  return window.crypto.subtle.importKey(
    'raw',
    buffer,
    { name: 'X25519' },
    true,
    []
  );
}
// ── Session Serialization (Refactored Non-Destructive Flow) ────────────────

/**
 * Re-imports a CryptoKey from a JWK object.
 */
export async function importKeyFromJWK(jwk, alg, usages) {
  try {
    return await window.crypto.subtle.importKey('jwk', jwk, alg, true, usages);
  } catch (err) {
    console.error(`[CRYPTO-DESERIALIZE] Failed to import key for ${JSON.stringify(alg)}`, err);
    throw err;
  }
}

/**
 * Serializes a Double Ratchet session object for JSON storage. 
 * NON-DESTRUCTIVE: Builds a fresh object for export instead of mutating the RAM session.
 */
export async function serializeSession(session) {
  if (!session) return null;

  // 1. Start with a shallow copy for all primitives (Indices, Status, Flags)
  const serialized = { 
    ...session,
    // [Hardening] Explicitly enforce counters stay as numbers, fallback to 0
    nextRecvIndex: Number(session.nextRecvIndex || 0),
    nextSendIndex: Number(session.nextSendIndex || 0),
    previousCounter: Number(session.previousCounter || 0)
  };
  const keyPromises = [];

  // Helper to export and place in serialized object safely
  const exportAndStore = async (key, targetObj, keyName) => {
    if (key instanceof CryptoKey) {
      const jwk = await window.crypto.subtle.exportKey('jwk', key);
      targetObj[keyName] = { _isJWK: true, jwk };
    } else if (key && key._isJWK) {
      // [Defensive] If it's already a JWK wrapper, preserve it
      targetObj[keyName] = key;
    }
  };

  // Export Root and Chain Keys
  if (session.rootKey) keyPromises.push(exportAndStore(session.rootKey, serialized, 'rootKey'));
  if (session.sendChainKey) keyPromises.push(exportAndStore(session.sendChainKey, serialized, 'sendChainKey'));
  if (session.recvChainKey) keyPromises.push(exportAndStore(session.recvChainKey, serialized, 'recvChainKey'));

  // Export KeyPairs (Identity, Ephemeral, or Sender Ratchet)
  const exportKeyPair = async (pair, name) => {
    if (!pair) return;
    serialized[name] = { ...pair }; // Shallow copy of the pair object (contains metadata/b64)
    if (pair.publicKey instanceof CryptoKey) {
      await exportAndStore(pair.publicKey, serialized[name], 'publicKey');
    }
    if (pair.privateKey instanceof CryptoKey) {
      await exportAndStore(pair.privateKey, serialized[name], 'privateKey');
    }
  };

  keyPromises.push(exportKeyPair(session.identityKeyPair, 'identityKeyPair'));
  keyPromises.push(exportKeyPair(session.ephemeralKeyPair, 'ephemeralKeyPair'));
  keyPromises.push(exportKeyPair(session.sendRatchetKeyPair, 'sendRatchetKeyPair'));

  // Handle skippedMessageKeys (Dictionary) - DEEP COPY and PRUNING
  if (session.skippedMessageKeys) {
    const serializedSkipped = {};
    const currentRecvIdx = session.nextRecvIndex || 0;
    const MAX_GAP = 100; // Forward Secrecy: Prune skipped keys that are too far behind

    for (const [keyLabel, key] of Object.entries(session.skippedMessageKeys)) {
      // Label format: ${publicKeyBase64}_${index}
      const parts = keyLabel.split('_');
      const msgIdx = parseInt(parts[parts.length - 1]);

      if (key instanceof CryptoKey) {
        // Only bundle keys that are within the safety window
        if (isNaN(msgIdx) || (currentRecvIdx - msgIdx) < MAX_GAP) {
          const jwk = await window.crypto.subtle.exportKey('jwk', key);
          serializedSkipped[keyLabel] = { _isJWK: true, jwk };
        } else {
          console.debug(`[CRYPTO-Prune] Skipping stale key: ${keyLabel}`);
        }
      }
    }
    serialized.skippedMessageKeys = serializedSkipped;
  }
  
  serialized.vaultTimestamp = Date.now();

  await Promise.all(keyPromises);
  console.debug(`[CRYPTO-Serialize] Session for ${session.userId || 'unknown'} serialized. Index: ${session.nextRecvIndex}`);
  return serialized;
}

/**
 * Deserializes a session object, restoring primitives and importing JWK blobs to CryptoKeys.
 */
export async function deserializeSession(serialized) {
  if (!serialized) return null;

  // 1. Initial Spread: Recovers all primitive values
  const session = { 
    ...serialized,
    // [Hardening] Ensure indices are integers
    nextRecvIndex: parseInt(serialized.nextRecvIndex || 0, 10),
    nextSendIndex: parseInt(serialized.nextSendIndex || 0, 10),
    previousCounter: parseInt(serialized.previousCounter || 0, 10)
  };
  const importPromises = [];

  const aesAlg = { name: 'AES-GCM', length: 256 };
  const aesUsages = ['encrypt', 'decrypt'];
  const ratchetAlg = { name: 'X25519' };
  const ratchetUsages = ['deriveKey', 'deriveBits'];

  // Root/Chain Recovery
  if (serialized.rootKey?._isJWK) {
    importPromises.push((async () => {
       session.rootKey = await importKeyFromJWK(serialized.rootKey.jwk, aesAlg, aesUsages);
    })());
  }
  if (serialized.sendChainKey?._isJWK) {
    importPromises.push((async () => {
       session.sendChainKey = await importKeyFromJWK(serialized.sendChainKey.jwk, aesAlg, aesUsages);
    })());
  }
  if (serialized.recvChainKey?._isJWK) {
    importPromises.push((async () => {
       session.recvChainKey = await importKeyFromJWK(serialized.recvChainKey.jwk, aesAlg, aesUsages);
    })());
  }

  // KeyPair Reconstitution (Critical fix for "privateKey is undefined" and "key_ops" DataError)
  const restoreKeyPair = async (name, alg, privUsages) => {
    const data = serialized[name];
    if (!data) return;
    
    session[name] = { ...data }; // Preserve metadata like publicKeyBase64
    
    // Public keys for X25519 MUST use empty usages [ ] in importKey
    if (data.publicKey?._isJWK) {
      session[name].publicKey = await importKeyFromJWK(data.publicKey.jwk, alg, []);
    }
    
    // Private keys use the provided derivation usages
    if (data.privateKey?._isJWK) {
      session[name].privateKey = await importKeyFromJWK(data.privateKey.jwk, alg, privUsages);
    }
  };

  importPromises.push(restoreKeyPair('identityKeyPair', ratchetAlg, ratchetUsages));
  importPromises.push(restoreKeyPair('ephemeralKeyPair', ratchetAlg, ratchetUsages));
  importPromises.push(restoreKeyPair('sendRatchetKeyPair', ratchetAlg, ratchetUsages));

  // Dictionary Recovery for skippedMessageKeys
  if (serialized.skippedMessageKeys) {
    const deserializedSkipped = {};
    for (const [idx, data] of Object.entries(serialized.skippedMessageKeys)) {
      if (data instanceof CryptoKey) {
        deserializedSkipped[idx] = data;
      } else if (data?._isJWK) {
        importPromises.push((async () => {
          try {
            deserializedSkipped[idx] = await importKeyFromJWK(data.jwk, aesAlg, aesUsages);
          } catch (e) {
            console.warn(`[E2EE-Deserialization] Failed to import skipped key at ${idx}`, e);
          }
        })());
      }
    }
    session.skippedMessageKeys = deserializedSkipped;
  }

  await Promise.all(importPromises);
  
  // Validation Audit
  const missingKeys = [];
  if (!(session.rootKey instanceof CryptoKey)) missingKeys.push('rootKey');
  if (!(session.sendChainKey instanceof CryptoKey)) missingKeys.push('sendChainKey');
  if (!(session.recvChainKey instanceof CryptoKey)) missingKeys.push('recvChainKey');

  if (missingKeys.length > 0) {
    console.warn(`[E2EE-Deserialization] Session restored with MISSING/INVALID CryptoKeys: ${missingKeys.join(', ')}`);
  }

  if (session.nextRecvIndex === undefined) {
    console.error('[E2EE-Deserialization] CRITICAL ERROR: nextRecvIndex is UNDEFINED after recovery.');
    console.debug('[E2EE-Deserialization] Serialized object keys:', Object.keys(serialized));
  } else {
    console.log(`[E2EE-Deserialization] session restored. nextRecvIndex: ${session.nextRecvIndex}, keys: ${missingKeys.length === 0 ? 'OK' : 'PARTIAL'}`);
  }

  return session;
}/**
 * Generates a non-extractable 256-bit AES-GCM Device Master Key.
 * This key is intended to stay on the device for passwordless E2EE.
 */
export async function generateDeviceMasterKey() {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false (CRITICAL FOR UX/SECURITY)
    ['encrypt', 'decrypt']
  );
}

/**
 * Wraps (encrypts) the extractable Vault Key using a non-extractable Device Key.
 */
export async function wrapVaultKey(vaultKey, deviceKey) {
  const rawVaultKey = await window.crypto.subtle.exportKey('raw', vaultKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    deviceKey,
    rawVaultKey
  );
  return {
    wrappedKeyB64: arrayBufferToBase64(encrypted),
    ivB64: arrayBufferToBase64(iv)
  };
}

/**
 * Unwraps (decrypts) the Vault Key using the Device Key.
 */
export async function unwrapVaultKey(wrappedB64, ivB64, deviceKey) {
  const encrypted = base64ToArrayBuffer(wrappedB64);
  const iv = base64ToArrayBuffer(ivB64);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    deviceKey,
    encrypted
  );
  return window.crypto.subtle.importKey(
    'raw',
    decrypted,
    { name: 'AES-GCM', length: 256 },
    true, // extractable: true (so it can be used for vault sync and further wrapping)
    ['encrypt', 'decrypt']
  );
}
