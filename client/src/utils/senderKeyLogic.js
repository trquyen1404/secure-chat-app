import { 
  arrayBufferToBase64, 
  base64ToArrayBuffer, 
  hkdfDerive, 
  generateECDSAKeyPair,
  signDataECDSA,
  verifySignatureECDSA,
  encryptMessageGCM,
  decryptMessageGCM,
  getAssociatedData,
  getFingerprint
} from './crypto';

/**
 * Serializes a Sender Key state for storage.
 */
export async function serializeSenderKey(state) {
  if (!state) return null;
  const serialized = { ...state };
  if (state.signaturePrivateKey instanceof CryptoKey) {
    const jwk = await window.crypto.subtle.exportKey('jwk', state.signaturePrivateKey);
    serialized.signaturePrivateKey = { _isJWK: true, jwk };
  }
  // Handle skippedMessageKeys (Dictionary of indices to CryptoKeys)
  if (state.skippedMessageKeys) {
    const serializedSkipped = {};
    for (const [idx, key] of Object.entries(state.skippedMessageKeys)) {
      if (key instanceof CryptoKey) {
        const jwk = await window.crypto.subtle.exportKey('jwk', key);
        serializedSkipped[idx] = { _isJWK: true, jwk };
      }
    }
    serialized.skippedMessageKeys = serializedSkipped;
  }
  return serialized;
}

/**
 * Deserializes a Sender Key state from storage.
 */
export async function deserializeSenderKey(serialized) {
  if (!serialized) return null;
  const state = { ...serialized };
  const aesAlg = { name: 'AES-GCM', length: 256 };
  const aesUsages = ['encrypt', 'decrypt'];

  if (serialized.signaturePrivateKey?._isJWK) {
    state.signaturePrivateKey = await window.crypto.subtle.importKey(
      'jwk',
      serialized.signaturePrivateKey.jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );
  }

  // Handle skippedMessageKeys
  if (serialized.skippedMessageKeys) {
    const deserializedSkipped = {};
    for (const [idx, data] of Object.entries(serialized.skippedMessageKeys)) {
      if (data?._isJWK) {
        deserializedSkipped[idx] = await window.crypto.subtle.importKey('jwk', data.jwk, aesAlg, true, aesUsages);
      }
    }
    state.skippedMessageKeys = deserializedSkipped;
  } else {
    state.skippedMessageKeys = {};
  }
  
  // Ensure index is a number
  state.index = parseInt(state.index || 0, 10);
  
  return state;
}

/**
 * Creates a new Sender Key chain (for our own use in a group).
 */
export async function createSenderKeyChain() {
  const chainKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const signatureKeyPair = await generateECDSAKeyPair();

  return {
    chainKeyB64: arrayBufferToBase64(chainKeyBytes),
    signaturePrivateKey: signatureKeyPair.privateKey,
    signaturePublicKeyB64: signatureKeyPair.publicKeyBase64,
    index: 0
  };
}

/**
 * Ratchets a chain key to get the next one and a message key.
 */
export async function ratchetSenderKey(chainKeyB64) {
  const chainKeyBytes = base64ToArrayBuffer(chainKeyB64);
  
  // Use HKDF to derive next chain key and message key
  const nextChainKey = await hkdfDerive(chainKeyBytes, null, 'SENDER_KEY_NEXT_CHAIN');
  const messageKey = await hkdfDerive(chainKeyBytes, null, 'SENDER_KEY_MESSAGE');

  const nextChainKeyRaw = await window.crypto.subtle.exportKey('raw', nextChainKey);
  
  return {
    nextChainKeyB64: arrayBufferToBase64(nextChainKeyRaw),
    messageKey
  };
}

/**
 * Encrypts a group message using our current sender key state.
 */
export async function encryptGroupMessage(plaintext, chainKeyB64, signaturePrivateKey, index, groupId) {
  if (!plaintext || !chainKeyB64 || !signaturePrivateKey || index === undefined || !groupId) {
    console.error('[Group-E2EE] encryptGroupMessage missing arguments:', { 
      hasPlaintext: !!plaintext, hasChainKey: !!chainKeyB64, hasSignKey: !!signaturePrivateKey, index, groupId 
    });
    throw new Error('encryptGroupMessage: Missing required arguments');
  }
  const { nextChainKeyB64, messageKey } = await ratchetSenderKey(chainKeyB64);
  
  // Use groupId as Associated Data for extra security
  const ad = `GROUP_MSG:${groupId}:${index}`;
  const encrypted = await encryptMessageGCM(plaintext, messageKey, ad);

  // Sign the ciphertext + IV + AD
  const dataToSign = new TextEncoder().encode(encrypted.ciphertextB64 + encrypted.ivB64 + ad);
  const signature = await signDataECDSA(signaturePrivateKey, dataToSign);

  return {
    ciphertextB64: encrypted.ciphertextB64,
    ivB64: encrypted.ivB64,
    index: index, // Return the index used for THIS message
    signature,
    nextChainKeyB64
  };
}

/**
 * Decrypts a group message using a sender's key state, handling multi-step ratchets.
 */
export async function decryptGroupMessage(data, senderKeyState, groupId) {
  if (!data || !senderKeyState || !groupId) {
    console.error('[Group-E2EE] decryptGroupMessage missing arguments:', { 
      hasData: !!data, hasState: !!senderKeyState, groupId 
    });
    throw new Error('decryptGroupMessage: Missing required arguments');
  }
  // [Fix] Handle attribute names consistently (Socket/DB uses encryptedContent/iv, Ratchet uses ciphertextB64/ivB64)
  const ciphertextB64 = data.ciphertextB64 || data.encryptedContent;
  const ivB64 = data.ivB64 || data.iv;
  const signature = data.signature;
  // [Fix] GroupMessage DB uses 'n', socket payload may use 'index' — support both
  const rawIndex = data.index !== undefined ? data.index : data.n;
  const targetIndex = parseInt(rawIndex, 10);
  if (isNaN(targetIndex)) {
    throw new Error(`Invalid message index: got ${JSON.stringify(rawIndex)}. Message may be malformed.`);
  }
  const currentState = { ...senderKeyState };
  if (!currentState.skippedMessageKeys) currentState.skippedMessageKeys = {};

  let messageKey = null;

  // 1. Check if we've already skipped this key and have it cached
  if (currentState.skippedMessageKeys[targetIndex]) {
    messageKey = currentState.skippedMessageKeys[targetIndex];
    delete currentState.skippedMessageKeys[targetIndex];
  } else {
    // 2. Ratchet forward if needed to reach target index
    if (targetIndex < currentState.index) {
      // [Audit] This case is now largely handled by getDecryptedMessage cache in UI, 
      // but we maintain the error to enforce the forward-secrecy protocol.
      console.warn(`[Group-Audit] Ratchet mismatch: requested n=${targetIndex}, current n=${currentState.index}. Re-decryption blocked.`);
      throw new Error(`Cannot decrypt old message: requested n=${targetIndex}, current counter n=${currentState.index}. History decryption for Sender Keys requires local plaintext cache.`);
    }

    let currentChainKeyB64 = currentState.chainKeyB64;
    const initialIndex = currentState.index;
    
    console.log(`[Group-Ratchet] Decrypting msg index=${targetIndex}. Current store index=${initialIndex}. Diff=${targetIndex - initialIndex}`);

    while (currentState.index < targetIndex) {
      console.log(`[Group-Ratchet] Skipping index ${currentState.index} to reach target ${targetIndex}...`);
      const { nextChainKeyB64, messageKey: skippedKey } = await ratchetSenderKey(currentChainKeyB64);
      currentState.skippedMessageKeys[currentState.index] = skippedKey;
      currentChainKeyB64 = nextChainKeyB64;
      currentState.index++;
    }

    // Now currentState.index === targetIndex
    const { nextChainKeyB64, messageKey: targetKey } = await ratchetSenderKey(currentChainKeyB64);
    messageKey = targetKey;
    currentState.chainKeyB64 = nextChainKeyB64;
    currentState.index++;
  }

  const ad = `GROUP_MSG:${groupId}:${targetIndex}`;
  
  // [CRYPTO-Audit] Trace Key Mismatch
  const mkRaw = await window.crypto.subtle.exportKey('raw', messageKey);
  const mkFingerprint = await getFingerprint(mkRaw);
  console.log(`[CRYPTO-Audit] Group Decrypting (n=${targetIndex}) with MK_FP: ${mkFingerprint}, AD: "${ad}"`);

  // 3. Verify signature
  const dataToVerify = new TextEncoder().encode(ciphertextB64 + ivB64 + ad);
  
  // [CRYPTO-Audit] Detailed Signature Debugging
  if (!signature) {
    console.error(`[CRYPTO-Audit] Signature is MISSING for group message n=${targetIndex}. Verification will fail.`);
  }
  
  const isValid = await verifySignatureECDSA(currentState.signaturePublicKeyB64, signature, dataToVerify);
  
  if (!isValid) {
    console.warn(`[CRYPTO-Audit] Signature verification failed! 
      - Public Key FP: ${await getFingerprint(base64ToArrayBuffer(currentState.signaturePublicKeyB64))}
      - Signature Present: ${!!signature}
      - AD: "${ad}"`);
    throw new Error('Group message signature verification failed!');
  }

  // 4. Decrypt
  const plaintext = await decryptMessageGCM(ciphertextB64, ivB64, messageKey, ad);
  
  return {
    plaintext,
    updatedState: currentState
  };
}
