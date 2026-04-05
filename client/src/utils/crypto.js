/**
 * crypto.js — Advanced End-to-End Encryption (E2EE) Primitives
 * VERSION 1.9.2 (Stable + AD Sync)
 * 
 * Implements: X3DH Key Agreement, Double Ratchet (KDF & DH), HKDF (SHA-256), AES-256-GCM (AEAD).
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

// Helper for deterministic Associated Data (AD) strings based on participant IDs
export function getAssociatedData(id01, id02) {
  // Ensure we have strings and sort them to guarantee order-independence
  const id1 = String(id01 || '');
  const id2 = String(id02 || '');
  const ids = [id1, id2].sort();
  const ad = ids.join(':'); // Use colon as a distinct separator to avoid UUID hyphen confusion
  
  if (id1 !== id2) {
    console.log(`[E2EE-AD] Generating AD for ${id1.slice(0,8)}... and ${id2.slice(0,8)}... -> "${ad}"`);
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
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  if (!base64 || typeof base64 !== 'string') return new ArrayBuffer(0);
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    masterSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt || new Uint8Array(32),
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
  console.log(`[X3DH-Audit] Combined Secret (Raw) FP: ${await getFingerprint(combinedSecret.buffer)}`);
  
  const rootKey = await hkdfDerive(combinedSecret, null, 'ROOT_KEY_V5');
  const rawRoot = await window.crypto.subtle.exportKey('raw', rootKey);
  
  const sendChainKey = await hkdfDerive(rawRoot, null, 'SENDER_CHAIN_V1');
  const recvChainKey = await hkdfDerive(rawRoot, null, 'RECEIVER_CHAIN_V1');

  console.log(`[X3DH-Init] FINAL ROOT FP: ${await getFingerprint(rawRoot)}`);
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
  console.log(`[X3DH-Audit] Combined Secret (Raw) FP: ${await getFingerprint(combinedSecret.buffer)}`);
  
  const rootKey = await hkdfDerive(combinedSecret, null, 'ROOT_KEY_V5');
  const rawRoot = await window.crypto.subtle.exportKey('raw', rootKey);
  
  const sendChainKey = await hkdfDerive(rawRoot, null, 'RECEIVER_CHAIN_V1');
  const recvChainKey = await hkdfDerive(rawRoot, null, 'SENDER_CHAIN_V1');

  console.log(`[X3DH-Resp] FINAL ROOT FP: ${await getFingerprint(rawRoot)}`);
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

export async function wrapIdentityBundleWithPIN(ikSignPriv, ikDhPriv, pin) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await pbkdf2Derive(pin, salt);

  const bundle = {
    sign: arrayBufferToBase64(await window.crypto.subtle.exportKey('pkcs8', ikSignPriv)),
    dh: arrayBufferToBase64(await window.crypto.subtle.exportKey('pkcs8', ikDhPriv))
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
    pkcs8Dh: base64ToArrayBuffer(bundle.dh) 
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
