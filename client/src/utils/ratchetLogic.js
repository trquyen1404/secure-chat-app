import { 
  loadSession, 
  saveSession, 
  saveDecryptedMessage 
} from './ratchetStore';
import { getKey } from './keyStore';
import {
  x3dhResponderHandshake,
  importX25519Public,
  ratchetChain,
  ratchetRoot,
  decryptMessageGCM,
  generateX25519KeyPair,
  getAssociatedData
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
      console.log(`[E2EE-Logic] Processing message for ${senderId}. Index n: ${msg.n}`);

      let session = await loadSession(senderId, masterKey);
      const localId = currentUser.id;
      const remoteId = senderId;
      const isRemoteHigher = remoteId.localeCompare(localId) > 0;
      const isSameUser = remoteId === localId;
      
      const sessionAD = getAssociatedData(localId, remoteId);

      // -- Stale Packet Filter --
      const isStaleHandshake = msg.senderEk && session && session.status === 'ESTABLISHED' && msg.senderEk === session.recvRatchetPublicKey;
      
      // -- Handshake Adoption Logic --
      const hasLocalInitiatedOnly = !session || (session && session.nextRecvIndex === 0);
      const isConflict = session && session.status === 'INITIALIZING' && !isSameUser;
      
      const shouldAdoptHandshake = msg.senderEk && !isSameUser && !isStaleHandshake && 
        (hasLocalInitiatedOnly || isConflict) && 
        (isRemoteHigher || !session);
      
      if (shouldAdoptHandshake) {
        if (!peerInfo) throw new Error("Peer info required for handshake adoption");

        const bobSPK_priv = await getKey(`spk_priv_${localId}`, masterKey);
        const bobIKdh_priv = await getKey(`ik_dh_priv_${localId}`, masterKey);
        const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${localId}_${msg.usedOpk}`, masterKey) : null;
        
        if (!bobSPK_priv || !bobIKdh_priv) {
          throw new Error("Critical identity keys missing. Cannot adopt.");
        }

        const aliceIKdh_pub = (peerInfo.dhPublicKey && typeof peerInfo.dhPublicKey === 'object') 
          ? peerInfo.dhPublicKey.dh 
          : (peerInfo.dhPublicKey || peerInfo.publicKey);

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
      } else if ((msg.senderEk || msg.type === 'handshake_ack') && session && (session.status === 'INITIALIZING' || session.status === 'ESTABLISHED')) {
        if (session.status === 'INITIALIZING') {
           session.status = 'ESTABLISHED';
           if ((session.nextRecvIndex || 0) === 0) session.nextRecvIndex = 0;
           if ((session.nextSendIndex || 0) === 0) session.nextSendIndex = 0;
           await saveSession(senderId, session, masterKey);
           console.log('[E2EE-Logic] Session ALIGNED to ESTABLISHED.');
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
      
      while (tempSession.nextRecvIndex <= targetIndex && safetyCount < 100) {
        const { nextChainKey, messageKey: derivedKey } = await ratchetChain(tempSession.recvChainKey);
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
        // Late Adoption logic...
        console.warn('[E2EE-Logic] Standard decryption failed, trying Late Adoption...');
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
            } catch (e2) {
              return { content: "[Lỗi giải mã muộn]", success: false };
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
