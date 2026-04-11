import { 
  loadSession,
  saveSession, 
  saveDecryptedMessage,
  getDecryptedMessage
} from './ratchetStore';
import { loadTheirSenderKey, saveTheirSenderKey } from './senderKeyStore'; // Corrected import
import { decryptGroupMessage } from './senderKeyLogic';
import { getKey } from './keyStore';
import {
  x3dhResponderHandshake,
  importX25519Public,
  ratchetChain,
  ratchetRoot,
  decryptMessageGCM,
  generateX25519KeyPair,
  getAssociatedData,
  getFingerprint,
  importKeyFromJWK
} from './crypto';

/**
 * processIncomingMessage
 * The central brain for E2EE decryption.
 * Uses Web Locks API to ensure sequential processing and prevent session corruption.
 */
export async function processIncomingMessage(msg, masterKey, currentUser, peerInfo) {
  if (msg.isDeleted) return { content: '[Message revoked]', success: true };
  
  const senderId = msg.senderId;
  const lockName = `ratchet_session_${senderId}`;

  return await navigator.locks.request(lockName, async () => {
    try {
      // 0. Idempotency Check: Don't re-process if already decrypted
      console.log(`[E2EE-Logic] Processing message for ${senderId}. Index n: ${msg.n}`);
      const cachedContent = await getDecryptedMessage(msg.id, masterKey);
      if (cachedContent && !cachedContent.startsWith('[Chờ chìa khóa') && !cachedContent.startsWith('[Lỗi giải mã')) {
        console.log(`[E2EE-Logic] Found cached plaintext for ${msg.id}. Skipping ratchet.`);
        return { content: cachedContent, success: true };
      }

      let session = await loadSession(senderId, masterKey);
      const localId = currentUser.id;
      const remoteId = senderId;
      const isRemoteHigher = remoteId.localeCompare(localId) > 0;
      const isSameUser = remoteId === localId;
      
      const sessionAD = getAssociatedData(localId, remoteId);

      // -- Stale Packet Filter --
      const isStaleHandshake = msg.senderEk && session && session.status === 'ESTABLISHED' && msg.senderEk === session.recvRatchetPublicKey;
      
      // -- Handshake Adoption Logic --
      const hasLocalInitiatedOnly = !session || (session && session.nextRecvIndex === 0 && session.status === 'INITIALIZING');
      const isConflict = session && session.status === 'INITIALIZING' && !isSameUser;
      
      const shouldAdoptHandshake = msg.senderEk && !isSameUser && !isStaleHandshake && 
        (hasLocalInitiatedOnly || isConflict) && 
        (isRemoteHigher || !session);
      
      if (shouldAdoptHandshake) {
        // [Safety Check] If we already have a session in ESTABLISHED state, we don't adopt unless it's a newer ratchet 
        // (handled by rotation logic below). This avoids "Missing Peer IK" when background sync aligns sessions.
        if (session && session.status === 'ESTABLISHED') {
          console.log('[E2EE-Logic] Session already ESTABLISHED. Skipping redundant adoption.');
        } else {
          if (!peerInfo) {
            console.warn(`[E2EE-Handshake] Deferred: Peer info required for adoption from ${senderId}.`);
            return { content: '[Handshake Pending Bundle]', success: false };
          }

          const bobSPK_priv = await getKey(`spk_priv_${localId}`, masterKey);
          const bobIKdh_priv = await getKey(`ik_dh_priv_${localId}`, masterKey);
          const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${localId}_${msg.usedOpk}`, masterKey) : null;
          
          if (!bobSPK_priv || !bobIKdh_priv) {
            throw new Error("Critical identity keys missing. Cannot adopt.");
          }

          // Defensive key extraction with multiple fallbacks & validation
          let aliceIKdh_pub = null;
          if (peerInfo.dhPublicKey) {
            aliceIKdh_pub = (typeof peerInfo.dhPublicKey === 'object') ? (peerInfo.dhPublicKey.dh || peerInfo.dhPublicKey.publicKey) : peerInfo.dhPublicKey;
          } else if (peerInfo.identityKey) {
            aliceIKdh_pub = (typeof peerInfo.identityKey === 'object') ? (peerInfo.identityKey.dh || peerInfo.identityKey.publicKey) : peerInfo.identityKey;
          } else {
            aliceIKdh_pub = peerInfo.publicKey;
          }

          if (!aliceIKdh_pub || (typeof aliceIKdh_pub === 'string' && aliceIKdh_pub.length < 32)) {
            console.warn(`[E2EE-Handshake] Deferred: Remote Identity Key missing or invalid for ${senderId}.`, peerInfo);
            return { content: '[Handshake Error: Missing Peer IK]', success: false };
          }

          const { rootKey, sendChainKey, recvChainKey } = await x3dhResponderHandshake(
            bobSPK_priv, bobIKdh_priv, bobOPK_priv,
            aliceIKdh_pub, msg.senderEk
          );

          session = {
            rootKey, sendChainKey, recvChainKey,
            nextSendIndex: 0, nextRecvIndex: 0, skippedMessageKeys: {},
            sendRatchetKeyPair: { privateKey: bobSPK_priv, publicKeyBase64: currentUser.signedPreKey || "" },
            recvRatchetPublicKey: msg.ratchetKey || msg.senderEk, 
            pendingSenderEk: null, status: 'ESTABLISHED'
          };

          await saveSession(senderId, session, masterKey);
          console.log('[E2EE-Logic] Handshake Adopted.');
          window.dispatchEvent(new CustomEvent('session_updated', { detail: { userId: senderId } }));
        }
      } else if ((msg.senderEk || msg.type === 'handshake_ack') && session && (session.status === 'INITIALIZING' || session.status === 'ESTABLISHED')) {
        // [Optimization] Session Alignment: We are the Initiator or already established, just capturing the reply.
        if (session.status === 'INITIALIZING') {
           session.status = 'ESTABLISHED';
           if (msg.senderEk) session.recvRatchetPublicKey = msg.senderEk;
           if ((session.nextRecvIndex || 0) === 0) session.nextRecvIndex = 0;
           if ((session.nextSendIndex || 0) === 0) session.nextSendIndex = 0;
           await saveSession(senderId, session, masterKey);
           console.log('[E2EE-Logic] Initiator Session ALIGNED to ESTABLISHED.');
           window.dispatchEvent(new CustomEvent('session_updated', { detail: { userId: senderId } }));
        }
      }

      if (!session) return { content: '[Secure Session Not Established]', success: false };

      // -- Atomic Decryption --
      const tempSession = { ...session };
      const isInitialMessage = !!msg.senderEk;
      const isRotationRequested = msg.ratchetKey && msg.ratchetKey !== tempSession.recvRatchetPublicKey;
      
      if (!isInitialMessage && isRotationRequested) {
        const remotePublicKey = await importX25519Public(msg.ratchetKey);
        const dhSecret = await window.crypto.subtle.deriveBits({ name: 'X25519', public: remotePublicKey }, tempSession.sendRatchetKeyPair.privateKey, 256);
        const { newRootKey, newChainKey } = await ratchetRoot(tempSession.rootKey, dhSecret);
        tempSession.rootKey = newRootKey; 
        tempSession.recvChainKey = newChainKey;
        tempSession.recvRatchetPublicKey = msg.ratchetKey; 
        tempSession.nextRecvIndex = 0;
        tempSession.sendRatchetKeyPair = await generateX25519KeyPair();
      }

      let messageKey = null;
      const targetIndex = msg.n || 0;
      
      // [Traceability] Restore critical pipeline logging
      console.log(`[E2EE-Ratchet] Processing Pipeline: Target Index (n): ${targetIndex}, Current Recv Counter: ${tempSession.nextRecvIndex || 0}`);
      
      let safetyCount = 0;
      
      if (typeof tempSession.nextRecvIndex !== 'number') {
        tempSession.nextRecvIndex = 0;
      }
      
      // [Self-Healing] Pre-flight check for CryptoKeys
      const aesAlg = { name: 'AES-GCM', length: 256 };
      const aesUsages = ['encrypt', 'decrypt'];
      
      if (tempSession.recvChainKey && !(tempSession.recvChainKey instanceof CryptoKey)) {
        if (tempSession.recvChainKey._isJWK) {
          console.log(`[E2EE-Healing] Re-importing recvChainKey for ${senderId}...`);
          tempSession.recvChainKey = await importKeyFromJWK(tempSession.recvChainKey.jwk, aesAlg, aesUsages);
        }
      }
      if (tempSession.sendChainKey && !(tempSession.sendChainKey instanceof CryptoKey)) {
        if (tempSession.sendChainKey._isJWK) {
          console.log(`[E2EE-Healing] Re-importing sendChainKey for ${senderId}...`);
          tempSession.sendChainKey = await importKeyFromJWK(tempSession.sendChainKey.jwk, aesAlg, aesUsages);
        }
      }
      
      while (tempSession.nextRecvIndex <= targetIndex && safetyCount < 100) {
        const { nextChainKey, messageKey: derivedKey } = await ratchetChain(tempSession.recvChainKey);
        
        // [CRYPTO-Audit] Trace chain advancement
        const ckFingerprint = await window.crypto.subtle.exportKey('raw', tempSession.recvChainKey).then(k => getFingerprint(k));
        const mkFingerprint = await window.crypto.subtle.exportKey('raw', derivedKey).then(k => getFingerprint(k));
        console.log(`[CRYPTO-Audit] Ratchet Step ${tempSession.nextRecvIndex}: CK_FP=${ckFingerprint}, MK_FP=${mkFingerprint}`);

        tempSession.recvChainKey = nextChainKey; 
        messageKey = derivedKey;
        if (tempSession.nextRecvIndex < targetIndex) {
          const k = `${tempSession.recvRatchetPublicKey}_${tempSession.nextRecvIndex}`;
          tempSession.skippedMessageKeys[k] = derivedKey; 
        }
        tempSession.nextRecvIndex++; 
        safetyCount++;
      }

      if (!messageKey) {
        const k = `${tempSession.recvRatchetPublicKey}_${targetIndex}`;
        const recoveredKey = tempSession.skippedMessageKeys[k];
        if (recoveredKey) {
          messageKey = recoveredKey;
          delete tempSession.skippedMessageKeys[k];
        } else {
          if (targetIndex < session.nextRecvIndex) return { content: null, success: true }; // Duplicate
          throw new Error(`Message key recovery failed for index ${targetIndex}`);
        }
      }

      if (msg.type === 'handshake_ack') {
        await saveSession(senderId, tempSession, masterKey);
        return { content: null, success: true };
      }
      
      if (!msg.encryptedContent) {
        await saveSession(senderId, tempSession, masterKey);
        return { content: null, success: true }; 
      }

      try {
        const mkFingerprint = await window.crypto.subtle.exportKey('raw', messageKey).then(k => getFingerprint(k));
        console.log(`[CRYPTO-Audit] Decrypting (n=${targetIndex}) with MK_FP: ${mkFingerprint}, AD: "${sessionAD}"`);
        
        const decrypted = await decryptMessageGCM(msg.encryptedContent, msg.iv, messageKey, sessionAD);
        await saveSession(senderId, tempSession, masterKey);
        
        // Save to local plaintext store
        await saveDecryptedMessage(msg.id, decrypted, masterKey);

        // PHÁT TÍN HIỆU TOÀN CẦU CHO REACT
        window.dispatchEvent(new CustomEvent('e2ee_message_synced', { 
            detail: { ...msg, decryptedContent: decrypted } 
        }));

        return { content: decrypted, success: true };
      } catch (err) {
        const errorMsg = err.name === 'OperationError' 
          ? 'Ciphertext/Key Mismatch (Bad AD or wrong ratchet index)' 
          : err.message;

        console.error(`[CRYPTO-Audit] Standard Decryption FAILED (n=${targetIndex}). Error: ${errorMsg}`);
        
        // [E2EE-Logic] Standard decryption failed, trying Late Adoption...
        if (msg.senderEk || msg.type === 'SENDER_KEY_DISTRIBUTION' || msg.n === 0) {
          console.log('[E2EE-Logic] Standard decryption failed, trying Late Adoption/Correction...');
        } else {
          // [Fix] Signal desync if we have no technical recovery path
          console.warn(`[E2EE-Desync] OperationError for ${senderId} at index ${targetIndex}. Signaling for reset.`);
          window.dispatchEvent(new CustomEvent('e2ee_desync_detected', { 
            detail: { senderId, originalMessageId: msg.id } 
          }));
        }

        const isNotAligned = tempSession.status !== 'ESTABLISHED';
        const isX3DHMessage = !!msg.senderEk;
        
        if (isX3DHMessage && (!isSameUser || isNotAligned)) {
          if (!peerInfo) throw new Error("Peer info required for late adoption");
          
          const bobSPK_priv = await getKey(`spk_priv_${localId}`, masterKey);
          const bobIKdh_priv = await getKey(`ik_dh_priv_${localId}`, masterKey);
          const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${localId}_${msg.usedOpk}`, masterKey) : null;
          
          if (bobSPK_priv && bobIKdh_priv) {
            const aliceIKdh_pub = (peerInfo.dhPublicKey && typeof peerInfo.dhPublicKey === 'object')
              ? peerInfo.dhPublicKey.dh
              : (peerInfo.dhPublicKey || peerInfo.publicKey);
            
            const { rootKey, sendChainKey, recvChainKey } = await x3dhResponderHandshake(
              bobSPK_priv, bobIKdh_priv, bobOPK_priv,
              aliceIKdh_pub, msg.senderEk
            );
            
            const lateSession = {
              rootKey, sendChainKey, recvChainKey,
              nextSendIndex: 0, nextRecvIndex: 0, skippedMessageKeys: {},
              sendRatchetKeyPair: { privateKey: bobSPK_priv, publicKeyBase64: currentUser.signedPreKey || "" },
              recvRatchetPublicKey: msg.ratchetKey || msg.senderEk, 
              status: 'ESTABLISHED'
            };
            
            let catchupKey = null;
            let catchupChain = recvChainKey;
            for (let i = 0; i <= (msg.n || 0); i++) {
              const { nextChainKey, messageKey: mk } = await ratchetChain(catchupChain);
              catchupChain = nextChainKey;
              catchupKey = mk;
            }
            
            try {
              const finalDecrypted = await decryptMessageGCM(msg.encryptedContent, msg.iv, catchupKey, sessionAD);
              lateSession.recvChainKey = catchupChain;
              lateSession.nextRecvIndex = (msg.n || 0) + 1;
              await saveSession(senderId, lateSession, masterKey);
              
              await saveDecryptedMessage(msg.id, finalDecrypted, masterKey);
              window.dispatchEvent(new CustomEvent('e2ee_message_synced', { 
                  detail: { ...msg, decryptedContent: finalDecrypted } 
              }));

              return { content: finalDecrypted, success: true };
            } catch (err) {
              const errorMsg = err.name === 'OperationError' 
                ? 'Ciphertext/Key Mismatch (Bad AD or wrong ratchet index)' 
                : err.message;
              
              console.error(`[CRYPTO-Audit] Decryption FAILED for n=${targetIndex}. Error: ${errorMsg}`);
              
              // Return null content but success: false to signal a soft failure for retry/adoption
              return { content: null, success: false, error: errorMsg };
            }
          }
        }
        return { content: "[Phiên bản khóa cũ]", success: false };
      }
    } catch (err) {
      console.error('[ratchetLogic] Final fallback:', err);
      return { content: '[Error]', success: false };
    }
  });
}

/**
 * processGroupMessage
 * Central brain for Group E2EE decryption.
 * Uses Web Locks to ensure sequential processing per (group, sender) pair.
 */
export async function processGroupMessage(msg, masterKey, currentUser, activeGroupId) {
  if (msg.isDeleted) return { content: '[Message revoked]', success: true };
  if (!msg.id || !activeGroupId || !msg.senderId) {
    return { content: '[Invalid message metadata]', success: false };
  }

  const lockName = `group_ratchet_${activeGroupId}_${msg.senderId}`;
  console.log(`[Group-Lock] WAITING FOR: ${lockName} (msg=${msg.id || msg.localId})`);
  return await navigator.locks.request(lockName, async () => {
    console.log(`[Group-Lock] ACQUIRED: ${lockName} (msg=${msg.id || msg.localId})`);
    try {
      // 1. Idempotency check (Check central plaintext cache)
      const cached = await getDecryptedMessage(msg.id, masterKey) || (msg.localId ? await getDecryptedMessage(msg.localId, masterKey) : null);
      if (cached && !cached.startsWith('[Chờ chìa khóa') && !cached.startsWith('[Lỗi giải mã')) {
        return { content: cached, success: true };
      }

      // 2. Fetch sender key state
      // [Audit] Use both msg.groupId from payload and activeGroupId from context
      const targetGroupId = activeGroupId || msg.groupId;
      const senderKey = await loadTheirSenderKey(targetGroupId, msg.senderId, masterKey);
      
      console.log(`[Group-Trace] Processing msg=${msg.id || msg.localId} index=${msg.n ?? msg.index} from=${msg.senderId}. Current SenderKey index=${senderKey?.index ?? 'NULL'}`);

      if (!senderKey) {
        console.warn(`[Group-Logic] Missing SenderKey for user ${msg.senderId} in group ${targetGroupId}`);
        const placeholder = `[Chờ chìa khóa nhóm từ ${msg.senderId}...]`;
        // We don't save placeholder to cache here because we want to retry decryption once key arrives
        return { content: placeholder, success: true };
      }

      // 3. Decrypt & Advantce Ratchet
      const res = await decryptGroupMessage(msg, senderKey, targetGroupId);
      const content = res.plaintext;

      // 4. Persist results
      if (content) {
        await saveDecryptedMessage(msg.id, content, masterKey);
        await saveTheirSenderKey(targetGroupId, msg.senderId, res.updatedState, masterKey);
      }

      // 5. Global signal
      window.dispatchEvent(new CustomEvent('e2ee_message_synced', { 
        detail: { ...msg, decryptedContent: content } 
      }));

      return { content, success: true };
    } catch (err) {
      console.error(`[Group-Logic] Decryption failed (n=${msg.n || msg.index}) for msg=${msg.id || msg.localId}:`, err.message);
      return { content: `[Lỗi giải mã nhóm: ${err.message}]`, success: false };
    } finally {
      console.log(`[Group-Lock] RELEASED: ${lockName} (msg=${msg.id || msg.localId})`);
    }
  });
}
/**
 * decryptHistoricalMessage
 * A read-only path for historical messages.
 * Does NOT advance the ratchet. Only uses existing skippedMessageKeys or established state.
 */
export async function decryptHistoricalMessage(msg, masterKey, session) {
  if (!session || !msg.encryptedContent) return null;
  
  const targetIndex = msg.n || 0;
  const ratchetPub = msg.ratchetKey || session.recvRatchetPublicKey;
  const k = `${ratchetPub}_${targetIndex}`;
  
  // 1. Check if we already have this key in skipped keys
  let messageKey = (session.skippedMessageKeys || {})[k];
  
  // 2. If it's the current "standing" key and hasn't been advanced over yet
  // (Note: This is risky if indices aren't perfectly aligned, but useful for recent history)
  if (!messageKey && targetIndex === (session.nextRecvIndex - 1) && ratchetPub === session.recvRatchetPublicKey) {
    // We don't have the MK because it was consumed, but for history we usually rely on the plaintext cache.
    // If it's missing from cache AND consumed from MK store, we can't recover it (Forward Secrecy).
    return null; 
  }

  if (!messageKey) return null;

  try {
    const localId = session.userId; // This is usually stored in the session object
    const remoteId = session.remoteId || 'unknown'; // Ensure these are in your session schema
    // Note: getAssociatedData must be consistent!
    const ids = [String(msg.senderId), String(msg.recipientId)].sort();
    const sessionAD = ids.join(':');

    return await decryptMessageGCM(msg.encryptedContent, msg.iv, messageKey, sessionAD);
  } catch (err) {
    console.warn(`[History-Decryption] Failed for index ${targetIndex}:`, err.message);
    return null;
  }
}
