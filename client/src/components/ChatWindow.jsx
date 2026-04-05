import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useCall } from '../context/CallContext';
import {
  exportX25519Base64,
  x3dhInitiatorHandshake,
  x3dhResponderHandshake,
  generateX25519KeyPair,
  ratchetChain,
  ratchetRoot,
  encryptMessageGCM,
  decryptMessageGCM,
  importX25519Public,
  getFingerprint,
  getAssociatedData,
  arrayBufferToBase64,
  base64ToArrayBuffer
} from '../utils/crypto';
import { loadSession, saveSession, saveDecryptedMessage, getDecryptedMessage, updateDecryptedMessageId } from '../utils/ratchetStore';
import { getKey } from '../utils/keyStore';
import MessageBubble from './MessageBubble';
import {
  Send, Lock, Loader2, ArrowLeft, ShieldCheck,
  ImagePlus, Paperclip, Mic, MicOff, Disc2, Trash2,
  Phone, Video, CornerUpLeft, X
} from 'lucide-react';

const ChatWindow = ({ user: chatUser, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const { token, user: currentUser } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const { callUser } = useCall();
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isOnline = onlineUsers.has(chatUser.id) || chatUser.online;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'vi-VN';
      r.onresult = (e) => {
        let t = '';
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
        if (t) setNewMessage((p) => p + (p ? ' ' : '') + t);
      };
      r.onerror = () => setIsListening(false); r.onend = () => setIsListening(false); recognitionRef.current = r;
    }
  }, []);

  useEffect(() => {
    if (!isLoadingMore) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isLoadingMore]);

  // -- Handshake & Session Management --
  // These logic blocks are carefully positioned to match the v19.1 forensic trace.
  // DO NOT COMPACT. 



  // Guard to prevent double auto-init in React StrictMode
  const autoInitRef = useRef(new Set());
  const isHandshakingRef = useRef(false);
  const initPromiseRef = useRef(null);
  const messageQueueRef = useRef([]); // To hold incoming messages during handshakes
  const sequentialProcessRef = useRef(Promise.resolve()); // Sequential decryption lock

  const sessionAD = React.useMemo(() => {
    const id1 = currentUser?.id || 'LOCAL';
    const id2 = chatUser?.id || 'REMOTE';
    return getAssociatedData(id1, id2);
  }, [currentUser?.id, chatUser?.id]);

  const outgoingQueueRef = useRef([]); // To buffer outgoing messages during handshakes

  const onMsg = async (msg) => {
    if (msg.senderId === currentUser.id) {
      // Reflection Guard: Don't try to decrypt our own message echoed from server.
      if (msg.localId) {
        // [Bug A Fix] Reconcile Identity: Swap localId for real server Id in persistent store
        console.log(`[E2EE-TX-Ack] Reconciling ID: ${msg.localId} -> ${msg.id}`);
        updateDecryptedMessageId(msg.localId, msg.id);
        
        setMessages((p) => p.map(m => m.id === msg.localId ? { ...m, id: msg.id, status: 'sent' } : m));
      }
      return;
    }

    if (
      (msg.senderId === chatUser.id && msg.recipientId === currentUser.id)
    ) {
      console.log(`[RX-Step] Received Raw. Type: ${msg.type || 'text'}, n: ${msg.n}, senderEk: ${!!msg.senderEk}, localId: ${msg.localId}`);
      
      const isHandshakePacket = !!msg.senderEk || msg.type === 'handshake_ack';
      const isActivelyInitializing = initPromiseRef.current || isHandshakingRef.current;
      
      if (isActivelyInitializing && !isHandshakePacket) {
        console.log(`[E2EE-Queue] Buffering regular message. localId: ${msg.localId}`);
        messageQueueRef.current.push(msg);
        return;
      }

      if (isActivelyInitializing && isHandshakePacket) {
        console.log(`[E2EE-Handshake] Handshake bypass: Processing incoming handshake during local init.`);
      }

      sequentialProcessRef.current = sequentialProcessRef.current.then(async () => {
        try {
          if (!currentUser?.id) {
             console.warn('[E2EE-Wait] Deferring decryption until currentUser info is available...');
             return;
          }
          const content = await decryptRatchet(msg);
          if (content !== null) {
            // [Fix] ONLY add to UI and save to persistent plaintext cache if content is non-empty.
            // This prevents "Ghost Handshake" bubbles while allowing the Ratchet to sync.
            const hasText = content && typeof content === 'string' && content.trim() !== '';
            
            if (hasText) {
              await saveDecryptedMessage(msg.id, content);
              setMessages((p) => {
                if (p.some(m => m.id === msg.id)) return p;
                return [...p, { ...msg, decryptedContent: content, status: 'received' }];
              });
            }
            
            setIsTyping(false);
            socket?.emit('markAsRead', { senderId: chatUser.id });
          }
        } catch (err) {
          console.error(`[E2EE-Error] Type: ${err.name} Msg: ${err.message}`);
        }
      });
    }
  };

  const drainMessageQueue = async () => {
    if (messageQueueRef.current.length === 0) return;
    console.log(`[E2EE-Queue] Draining ${messageQueueRef.current.length} buffered messages...`);
    const buffer = [...messageQueueRef.current];
    messageQueueRef.current = [];
    
    // Sort buffered messages by 'n' to ensure correct sequence
    buffer.sort((a, b) => (a.n || 0) - (b.n || 0));

    for (const msg of buffer) {
      await onMsg(msg);
    }
  };

  const drainOutgoingQueue = async () => {
    if (outgoingQueueRef.current.length === 0) return;
    const msgCount = outgoingQueueRef.current.length;
    console.log(`[E2EE-Queue] Draining ${msgCount} outgoing messages...`);
    const buffer = [...outgoingQueueRef.current];
    outgoingQueueRef.current = [];
    for (const { text, localId } of buffer) {
      console.log(`[E2EE-Queue] Retrying buffered message: ${localId}`);
      // isRetry = true to force bypass of handshake locks and break the re-buffering deadlock
      await sendEncryptedPayload(text, localId, 'text', true);
    }
    console.log(`[E2EE-Queue] Drain complete for ${msgCount} messages.`);
  };

  const getOrInitSession = async (targetUserId) => {
    if (initPromiseRef.current) {
      console.log('[Gating] Waiting for ongoing handshake promise...');
      return await initPromiseRef.current;
    }

    const init = async () => {
      try {
        if (!currentUser?.id) {
          console.warn('[E2EE-Init] Waiting for currentUser identity...');
          return null;
        }
        isHandshakingRef.current = true;
        let session = await loadSession(targetUserId);
        if (session) return session;

        console.log(`[X3DH-Audit] Initiator (Alice) Start with ${targetUserId}`);
        
        let bundle = null;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`[E2EE-Trace] Fetching peer bundle (Attempt ${attempt}/3)...`);
            const res = await api.get(`/api/users/${targetUserId}/prekey-bundle`);
            bundle = res.data;
            if (bundle && bundle.signedPreKey && bundle.signedPreKey.publicKey) break;
            throw new Error('Incomplete bundle from server');
          } catch (err) {
            lastErr = err;
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          }
        }
        if (!bundle || !bundle.signedPreKey) throw new Error(`Failed to fetch peer bundle: ${lastErr?.message}`);
        
        const username = currentUser.username;
        const ikDh_priv = await getKey(`ik_dh_priv_${username}`);
        if (!ikDh_priv) throw new Error('Identity Key not found. Please re-login.');

        const ek = await generateX25519KeyPair();
        
        // [Defensive Audit] Consistent robust extraction for Initiator Handshake (Bug Fix)
        // Handles both legacy (String) and modern (Object) metadata formats.
        const peerIK_sign = (bundle.identityKey && typeof bundle.identityKey === 'object') 
          ? bundle.identityKey.sign 
          : (bundle.identityKey || chatUser.publicKey);
          
        const peerIK_dh = (bundle.identityKey && typeof bundle.identityKey === 'object')
          ? bundle.identityKey.dh
          : (bundle.identityKey || chatUser.dhPublicKey);

        const peerSPK_pub = bundle.signedPreKey.publicKey;
        
        console.log(`[X3DH-Audit] Initiator Handshake. Peer IK_sign: ${peerIK_sign}, Peer IK_dh: ${peerIK_dh}`);
        
        const { rootKey, sendChainKey, recvChainKey } = await x3dhInitiatorHandshake(
          ikDh_priv, ek.privateKey,
          peerIK_sign, 
          peerIK_dh,
          peerSPK_pub,
          bundle.signedPreKey.signature,
          bundle.oneTimePreKey?.publicKey
        );

        const newSession = {
          rootKey, sendChainKey, recvChainKey,
          nextSendIndex: 0, nextRecvIndex: 0, skippedMessageKeys: {},
          sendRatchetKeyPair: await generateX25519KeyPair(),
          recvRatchetPublicKey: bundle.signedPreKey.publicKey, 
          pendingSenderEk: ek.publicKeyBase64,
          pendingUsedOpk: bundle.oneTimePreKey?.publicKey || null,
          status: 'INITIALIZING'
        };

        console.log(`[E2EE-Handshake] Session initialized. Status: ${newSession.status}`);
        await saveSession(targetUserId, newSession);
        
        const myId = currentUser?.id || 'LOCAL';
        const peerId = targetUserId || 'REMOTE';

        // [Fix] Initiator Hierarchy: ONLY the person with the Higher ID should proactively initiate 
        // the silent handshake. The person with the Lower ID yields as the Responder.
        if (myId.localeCompare(peerId) > 0) {
           console.log('[E2EE-Handshake] Higher ID peer (Initiator) proactively initiating silent handshake carrier...');
           sendEncryptedPayload(null, `init-proactive-${Date.now()}`, 'text', true);
        } else {
           console.log('[E2EE-Handshake] Lower ID peer (Responder) waiting for peer to initiate...');
        }

        setTimeout(() => {
          drainMessageQueue();
          drainOutgoingQueue();
        }, 100);
        
        return newSession;
      } catch (err) {
        console.error('[E2EE] Handshake init failed', err);
        throw err;
      } finally {
        initPromiseRef.current = null;
        isHandshakingRef.current = false;
      }
    };

    initPromiseRef.current = init();
    return await initPromiseRef.current;
  };

  const handleWipeE2EE = async () => {
    if (window.confirm("Cảnh báo: Thao tác này sẽ xóa toàn bộ móng nhà E2EE và làm mới trình duyệt. Tiếp tục?")) {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name !== 'SecureChatDB') continue;
        window.indexedDB.deleteDatabase(db.name);
      }
      window.location.reload();
    }
  };

  const decryptRatchet = async (msg) => {
    if (msg.isDeleted) return '[Message revoked]';
    try {
      console.log(`[E2EE-Receive] New message arrival. Sender: ${msg.senderId}, Index n: ${msg.n}, Handshake present: ${!!msg.senderEk}`);
      
      // 0. Wait for ongoing handshake if any
      if (initPromiseRef.current) {
        console.log('[E2EE-Receive] Decryption paused, waiting for handshake promise...');
        await initPromiseRef.current;
      }

      let session = await loadSession(chatUser.id);
      const remoteId = chatUser.id || '';
      const localId = currentUser.id || '';
      const isRemoteHigher = remoteId.localeCompare(localId) > 0;
      const isSameUser = remoteId === localId;
      
      console.log(`[AD-Sync] ID_Self: ${localId} ID_Remote: ${remoteId}`);
      console.log(`[E2EE-Forensic] My ID: ${localId}, Remote ID: ${remoteId}, Decision: ${isRemoteHigher ? "I yield (Responder)" : "I win (Initiator)"}`);
      
      // -- Stale Packet Filter --
      const isStaleHandshake = msg.senderEk && session && session.status === 'ESTABLISHED' && msg.senderEk === session.recvRatchetPublicKey;
      
      // -- Handshake Adoption Logic (Standard) --
      const hasLocalInitiatedOnly = !session || (session && session.nextRecvIndex === 0);
      const isConflict = session && session.status === 'INITIALIZING' && !isSameUser;
      
      // [Audit Fix] If both are INITIALIZING, the one with the Higher ID is the "Leader" (Initiator).
      // The lower ID MUST yield and adopt the higher ID's handshake.
      const shouldAdoptHandshake = msg.senderEk && !isSameUser && !isStaleHandshake && 
        (hasLocalInitiatedOnly || isConflict) && 
        (isRemoteHigher || !session);
      
      console.log(`[E2EE-Audit] Adoption Logic. isConflict=${isConflict}, isRemoteHigher=${isRemoteHigher}, shouldAdopt=${shouldAdoptHandshake}`);
      
      if (shouldAdoptHandshake) {
        console.log(`[E2EE-Orphan] Tie-breaker: ${isRemoteHigher ? 'Remote higher' : 'Initializing'} responder session...`);
        const username = currentUser.username;
        const bobSPK_priv = await getKey(`spk_priv_${username}`);
        const bobIKdh_priv = await getKey(`ik_dh_priv_${username}`);
        const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${username}_${msg.usedOpk}`) : null;
        if (!bobSPK_priv || !bobIKdh_priv) {
             console.error("[E2EE-Orphan] Critical identity keys missing. Cannot adopt.");
             return null;
        }

        // [Defensive Audit] Ensure we extract the DH sub-key even if metadata format varies.
        const aliceIKdh_pub = (chatUser.dhPublicKey && typeof chatUser.dhPublicKey === 'object') 
          ? chatUser.dhPublicKey.dh 
          : (chatUser.dhPublicKey || chatUser.publicKey);

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
        console.log('[E2EE-Orphan] Orphan Handshake Adoped. Session Re-aligned.');
        await saveSession(chatUser.id, session);
        sendEncryptedPayload(null, null, 'handshake_ack');
        
        // Drain buffered messages after adoption
        setTimeout(() => drainMessageQueue(), 50);
      } else if ((msg.senderEk || msg.type === 'handshake_ack') && session && (session.status === 'INITIALIZING' || session.status === 'ESTABLISHED')) {
        // Winner Alignment/ACK: We receive a handshake or ACK from the peer.
        if (session.status === 'INITIALIZING') {
           console.log(`[E2EE-Orphan] ALIGNMENT: Received ${msg.type || 'handshake'} from peer. Transitioning to ESTABLISHED.`);
           session.status = 'ESTABLISHED';
           if ((session.nextRecvIndex || 0) === 0) session.nextRecvIndex = 0;
           if ((session.nextSendIndex || 0) === 0) session.nextSendIndex = 0;
           await saveSession(chatUser.id, session);
           console.log('[E2EE-Orphan] State saved as ESTABLISHED. Triggering queue drain.');
           drainOutgoingQueue();
        } else if (msg.type === 'handshake_ack') {
           console.log(`[E2EE-Orphan] Manual ACK received. Draining remaining outgoing messages.`);
           drainOutgoingQueue();
        }
      }

      if (!session) return '[Secure Session Not Established]';

      // -- Atomic Decryption Logic --
      // [Fix] Avoid structuredClone on CryptoKeys if it causes neutering. Use spread-based clone.
      const tempSession = { ...session };
      
      // Restore complex objects not handled by JSON.stringify if necessary (Keys are stored as B64 or managed by crypto.js helpers)
      
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
      let safetyCount = 0;
      const MAX_SKIPPED_KEYS = 100;
      
      console.log(`[E2EE-Ratchet] Processing Pipeline: Target Index (n): ${targetIndex}, Current Recv Counter: ${session.nextRecvIndex}`);
      console.log(`[E2EE-Ratchet] Rotation Required: ${isRotationRequested ? "YES" : "NO"}`);
      while (tempSession.nextRecvIndex <= targetIndex && safetyCount < 100) {
        const { nextChainKey, messageKey: derivedKey } = await ratchetChain(tempSession.recvChainKey);
        tempSession.recvChainKey = nextChainKey; 
        messageKey = derivedKey;
        if (tempSession.nextRecvIndex < targetIndex) {
          const k = `${tempSession.recvRatchetPublicKey}_${tempSession.nextRecvIndex}`;
          tempSession.skippedMessageKeys[k] = derivedKey; 
          console.log(`[E2EE-Ratchet] Derived key for future message: ${k}`);
          
          // Forward Secrecy: Limit storage of skipped keys
          const storedKeys = Object.keys(tempSession.skippedMessageKeys);
          if (storedKeys.length > MAX_SKIPPED_KEYS) {
            const oldest = storedKeys[0];
            delete tempSession.skippedMessageKeys[oldest];
            console.warn(`[ForwardSecrecy] Pruned oldest skipped key to maintain limit: ${oldest}`);
          }
        }
        tempSession.nextRecvIndex++; 
        safetyCount++;
      }

      if (!messageKey) {
        const k = `${tempSession.recvRatchetPublicKey}_${targetIndex}`;
        console.log(`[E2EE-Ratchet] Attempting recovery from skippedMessageKeys: ${k}`);
        messageKey = tempSession.skippedMessageKeys[k];
        if (messageKey) {
          console.log(`[E2EE-Ratchet] Recovery SUCCESS for key: ${k}`);
          delete tempSession.skippedMessageKeys[k];
        } else {
          // [Harden] If it's a handshake carrier at index 0 and recovery fails, it likely means 
          // we've already bridged it. Don't crash; return null so history loader can skip it.
          if (targetIndex === 0 && (msg.senderEk || msg.type === 'handshake_ack')) {
             console.warn('[E2EE-Ratchet] Index 0 key already burnt or bridged. Skipping historical handshake.');
             return null;
          }
          throw new Error(`Message key recovery failed for index ${targetIndex}`);
        }
      }

      if (msg.type === 'handshake_ack') {
        await saveSession(chatUser.id, tempSession);
        return null;
      }
      
      // CRITICAL FIX: To prevent Key Desync, we MUST save the session (incremented nextRecvIndex) 
      // even if the message itself has no text content (silent handshake/sync).
      if (!msg.encryptedContent) {
        await saveSession(chatUser.id, tempSession);
        return null; 
      }

      try {
        const ad = sessionAD;
        const decrypted = await decryptMessageGCM(msg.encryptedContent, msg.iv, messageKey, ad);
        
        // SUCCESS: Persist the advanced ratchet state
        await saveSession(chatUser.id, tempSession);
        return decrypted;
      } catch (err) {
        // [Stabilize] Only trigger Late Adoption if Standard Decryption failed 
        // AND we are NOT already established, or the message is an X3DH init.
        const isNotAligned = tempSession.status !== 'ESTABLISHED';
        const isX3DHMessage = !!msg.senderEk;
        
        if (isX3DHMessage && (!isSameUser || isNotAligned)) {
             console.warn('[E2EE] Standard decryption failed, attempting Late Adoption sync...', err.message);
             console.log(`[E2EE-LateAdoption] Forced Adoption triggered at index: ${msg.n || 0}`);
             const username = currentUser.username;
             const bobSPK_priv = await getKey(`spk_priv_${username}`);
             const bobIKdh_priv = await getKey(`ik_dh_priv_${username}`);
             const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${username}_${msg.usedOpk}`) : null;
             
             if (bobSPK_priv && bobIKdh_priv) {
               // [Defensive Audit] Safe extraction for Late Adoption path.
               const aliceIKdh_pub = (chatUser.dhPublicKey && typeof chatUser.dhPublicKey === 'object')
                 ? chatUser.dhPublicKey.dh
                 : (chatUser.dhPublicKey || chatUser.publicKey);
               
               const { rootKey, sendChainKey, recvChainKey } = await x3dhResponderHandshake(
                 bobSPK_priv, bobIKdh_priv, bobOPK_priv,
                 aliceIKdh_pub, msg.senderEk
               );
               
               // Build fresh late session from scratch
               const lateSession = {
                 rootKey, sendChainKey, recvChainKey,
                 nextSendIndex: 0, nextRecvIndex: 0, skippedMessageKeys: {},
                 sendRatchetKeyPair: { privateKey: bobSPK_priv, publicKeyBase64: currentUser.signedPreKey || "" },
                 recvRatchetPublicKey: msg.ratchetKey || msg.senderEk, 
                 pendingSenderEk: null, status: 'ESTABLISHED',
                 previousCounter: 0
               };
               
               // CATCH-UP Logic: Loop from 0 to N to recover the correct MessageKey
               console.log(`[E2EE-LateAdoption] Catching up to index ${msg.n || 0}...`);
               let catchupKey = null;
               let catchupChain = recvChainKey;
               const targetN = msg.n || 0;
               for (let i = 0; i <= targetN; i++) {
                 const { nextChainKey, messageKey: mk } = await ratchetChain(catchupChain);
                 catchupChain = nextChainKey;
                 catchupKey = mk;
               }
               
               // Try decrypting with recovered key
               try {
                 const finalDecrypted = await decryptMessageGCM(msg.encryptedContent, msg.iv, catchupKey, sessionAD);
                 lateSession.recvChainKey = catchupChain;
                 lateSession.nextRecvIndex = targetN + 1;
                 await saveSession(chatUser.id, lateSession);
                 console.log(`[E2EE-LateAdoption] SUCCESS: Caught up to index ${targetN + 1}`);
                 return finalDecrypted;
               } catch (e2) {
                 console.error("[E2EE-LateAdoption] Even Catch-up Late Adoption failed to decrypt.");
                 return "[Lỗi phiên bản khóa - Không thể giải mã]";
               }
             }
        }
        return "[Phiên bản khóa cũ]";
      }
    } catch (err) {
      if (err.name !== 'OperationError') console.error('[decryptRatchet]', err);
      // Return null for handshake noise or background markers
      if (msg.senderEk || msg.type === 'handshake_ack') return null; 
      return '[Decryption error]';
    }
  };

  const loadMessages = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else setLoadingHistory(true);
    try {
      if (!currentUser?.id) {
        console.warn('[E2EE-History] Deferring history load until currentUser is ready.');
        return;
      }
      const cursor = isLoadMore && messages.length > 0 ? messages[0].createdAt : null;
      const res = await api.get(`/api/messages/${chatUser.id}${cursor ? `?cursor=${cursor}` : ''}`);
      const batch = res.data;
      if (batch.length < 50) setHasMore(false);

      const decrypted = [];
      for (const msg of batch) {
        // Source of Truth: Check if we have the plaintext cached locally (Forward Secrecy compliant history)
        let content = await getDecryptedMessage(msg.id);
        
        if (content === null || content === undefined) {
          // Standard decryption flow
          content = await decryptRatchet(msg);
          if (content !== null && typeof content === 'string' && content.trim() !== '') {
            await saveDecryptedMessage(msg.id, content);
          }
        }

        // [Final Fix] Suppress Ghost Messages in UI
        const hasText = content && typeof content === 'string' && content.trim() !== '';
        if (hasText) {
          decrypted.push({
            ...msg,
            decryptedContent: content,
            status: 'received',
          });
        }
      }

      if (isLoadMore) {
        const c = scrollContainerRef.current;
        const prev = c ? c.scrollHeight : 0;
        setMessages((p) => [...decrypted, ...p]);
        setTimeout(() => { if (c) c.scrollTop = c.scrollHeight - prev; }, 0);
      } else {
        setMessages(decrypted);
        setHasMore(batch.length === 50);
      }
      if (!isLoadMore && socket && decrypted.some((m) => m.senderId === chatUser.id && !m.readAt)) {
        socket.emit('markAsRead', { senderId: chatUser.id });
      }
    } catch (err) {
      console.error('[loadMessages]', err);
    } finally {
      if (isLoadMore) setIsLoadingMore(false);
      else setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (chatUser && token) {
      setHasMore(true);
      getOrInitSession(chatUser.id).then(() => loadMessages()).catch(console.error);
    }
  }, [chatUser, token, currentUser.id]);

  const handleScroll = () => {
    const c = scrollContainerRef.current;
    if (!c) return;
    if (c.scrollTop === 0 && hasMore && !isLoadingMore && !loadingHistory) loadMessages(true);
  };

  useEffect(() => {
    if (!socket) return;
    const onTyping = ({ senderId }) => { if (senderId === chatUser.id) setIsTyping(true); };
    const onStop = ({ senderId }) => { if (senderId === chatUser.id) setIsTyping(false); };
    const onDel = ({ messageId }) => setMessages((p) => p.map((m) => m.id === messageId ? { ...m, isDeleted: true, decryptedContent: '[Message revoked]' } : m));
    const onReact = ({ messageId, reactions }) => setMessages((p) => p.map((m) => m.id === messageId ? { ...m, reactions } : m));
    const onRead = ({ byUserId }) => { if (byUserId === chatUser.id) setMessages((p) => p.map((m) => (!m.readAt && m.senderId === currentUser.id) ? { ...m, readAt: new Date().toISOString() } : m)); };
    socket.on('newMessage', onMsg);
    socket.on('handshake_ack', onMsg);
    socket.on('typing', onTyping);
    socket.on('stopTyping', onStop);
    socket.on('messageDeleted', onDel);
    socket.on('messageReacted', onReact);
    socket.on('messagesRead', onRead);
    return () => {
      socket.off('newMessage', onMsg);
      socket.off('handshake_ack', onMsg);
      socket.off('typing', onTyping);
      socket.off('stopTyping', onStop);
      socket.off('messageDeleted', onDel);
      socket.off('messageReacted', onReact);
      socket.off('messagesRead', onRead);
    };
  }, [socket, chatUser, currentUser.id, onMsg]);

  const sendEncryptedPayload = async (text, localId, type = 'text', isRetry = false) => {
    try {
      // 1. Initial State
      let session = await loadSession(chatUser.id);
      
      // -- Buffering Logic --
      console.log(`[TX-Step] Attempting n=${session?.nextSendIndex || 0} isRetry=${isRetry} status=${session?.status || 'NONE'}`);
      
      if (!isRetry) {
        const isInitializing = session && session.status === 'INITIALIZING';
        const isAck = type === 'handshake_ack';
        
        if (isHandshakingRef.current || (isInitializing && !isAck) || !session) {
          console.log(`[E2EE-Queue] Buffering message. localId: ${localId}`);
          outgoingQueueRef.current.push({ text, localId });
          
          if (!session && !isHandshakingRef.current) {
            console.log('[E2EE] Initializing session via first message trigger...');
            getOrInitSession(chatUser.id);
          }
          return;
        }
      }

      // -- Sending Logic (Only reached if isRetry=true or session is ESTABLISHED) --
      if (!session) {
        console.error('[E2EE] Fatal: Attempted to send without session, and logic bypass failed.');
        return;
      }

      if (!session || !session.sendRatchetKeyPair) {
        console.error('[E2EE] Fatal: Session or Ratchet Key missing. Cannot send.');
        return '[Encryption Failed]';
      }
      
      let currentRatchetPub = session.sendRatchetKeyPair.publicKeyBase64;

      // 1. Double Ratchet Rotation: If Bob is replying for the first time (sendChainKey is null)
      // or if Bob has received a new DH key from Alice, he rotates.
      if (!session.sendChainKey) {
        console.log('[DoubleRatchet] Initializing Responder sending chain via DH rotation...');
        const remotePublicKey = await importX25519Public(session.recvRatchetPublicKey);
        const dhSecret = await window.crypto.subtle.deriveBits(
          { name: 'X25519', public: remotePublicKey },
          session.sendRatchetKeyPair.privateKey, 256
        );
        const { newRootKey, newChainKey } = await ratchetRoot(session.rootKey, dhSecret);
        session.rootKey = newRootKey;
        session.sendChainKey = newChainKey;
        session.nextSendIndex = 0;
        
        // Use this key for the first ciphertext, then rotate sendRatchetKeyPair later as per protocol
        currentRatchetPub = session.sendRatchetKeyPair.publicKeyBase64;
      }

      // 1b. Proactive DH Ratchet (Forward Secrecy & Key Refresh)
      const MAX_SYMMETRIC_STEPS = 16;
      const shouldProactivelyRotate = (session.nextSendIndex || 0) >= MAX_SYMMETRIC_STEPS;
      
      if (shouldProactivelyRotate) {
        console.log(`[DoubleRatchet] MAX SYMMETRIC STEPS (${MAX_SYMMETRIC_STEPS}) reached. Forcing DH Rotation...`);
        const remotePublicKey = await importX25519Public(session.recvRatchetPublicKey);
        const dhSecret = await window.crypto.subtle.deriveBits(
          { name: 'X25519', public: remotePublicKey },
          session.sendRatchetKeyPair.privateKey, 256
        );
        const { newRootKey, newChainKey } = await ratchetRoot(session.rootKey, dhSecret);
        
        session.rootKey = newRootKey;
        session.sendChainKey = newChainKey;
        session.previousCounter = session.nextSendIndex;
        session.nextSendIndex = 0;
        session.sendRatchetKeyPair = await generateX25519KeyPair();
        currentRatchetPub = session.sendRatchetKeyPair.publicKeyBase64;
      }

      const baseChainKey = session.sendChainKey;
      if (!baseChainKey) {
        console.error('[E2EE] Fatal: sendChainKey is null. Sync failure.');
        return '[Encryption Failed]';
      }
      const { nextChainKey, messageKey } = await ratchetChain(baseChainKey);
      session.sendChainKey = nextChainKey;
      
      // Update send index and track previous counter for DH rotation safety
      const currentIndex = session.nextSendIndex || 0;
      session.nextSendIndex = currentIndex + 1;
      
      // -- OPTIMISTIC UI --
      // Update state and persistent store immediately so the sender sees the message.
      // [Bug Fix] ONLY render and save if there is actual text content.
      // This prevents "Silent Handshake" bubbles (empty packets) from cluttering the UI.
      if (text && typeof text === 'string' && text.trim() !== '') {
        const optimisticMsg = {
          id: localId,
          senderId: currentUser.id,
          recipientId: chatUser.id,
          decryptedContent: text,
          status: 'sending',
          createdAt: new Date().toISOString()
        };
        setMessages((p) => [...p, optimisticMsg]);
        await saveDecryptedMessage(localId, text);
      }

      console.log(`[E2EE] Encrypting message with sender index: ${currentIndex}`);
      
      let ciphertextB64 = null, ivB64 = null;
      if (text !== null && text !== undefined) {
        const encrypted = await encryptMessageGCM(text, messageKey, sessionAD);
        ciphertextB64 = encrypted.ciphertextB64; ivB64 = encrypted.ivB64;
      }

      // Restore handshake metadata for self-healing
      // IMPORTANT: If we are INITIALIZING, we MUST include our senderEk (Handshake Carrier)
      const needsHandshake = session.status === 'INITIALIZING' || session.nextSendIndex <= 1;
      const senderEk = needsHandshake ? (session.pendingSenderEk || null) : null;
      const usedOpk = needsHandshake ? (session.pendingUsedOpk || null) : null;
      
      if (needsHandshake) {
        console.log(`[E2EE-Send] Attaching handshake carrier (senderEk present: ${!!senderEk}) to message n=${currentIndex}`);
      }

      // 2. Transmit
      console.log(`[E2EE-Send] Emitting payload to socket. LocalId: ${localId}, Index n: ${currentIndex}, Handshake: ${needsHandshake}`);
      socket.emit((type === 'handshake_ack' ? 'handshake_ack' : 'sendMessage'), {
        recipientId: chatUser.id,
        encryptedContent: ciphertextB64,
        ratchetKey: currentRatchetPub,
        n: currentIndex,
        pn: session.previousCounter || 0,
        iv: ivB64,
        senderId: currentUser.id,
        senderEk,
        usedOpk,
        localId: localId,
      });

      await saveSession(chatUser.id, session);
    } catch (err) {
      console.error('[E2EE-Send] Failed to send payload:', err);
      alert('Cannot send: ' + err.message);
    }
  };

  const handleSendMessage = async (e, forcedText = null) => {
    if (e) e.preventDefault();
    if (isRecording) { stopRecordingAndSend(); return; }
    
    const t = forcedText || newMessage;
    if (!t.trim()) return;
    
    if (!forcedText) {
       setNewMessage('');
       if (socket) socket.emit('stopTyping', { recipientId: chatUser.id });
    }
    
    const localId = `loc-${Date.now()}`;
    const optimisticMsg = {
      id: localId, senderId: currentUser.id, recipientId: chatUser.id,
      decryptedContent: t, createdAt: new Date().toISOString(), status: 'sending',
    };
    await sendEncryptedPayload(t, localId);
  };

  const handleInputTyping = (e) => {
    setNewMessage(e.target.value);
    if (!socket) return;
    socket.emit('typing', { recipientId: chatUser.id });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit('stopTyping', { recipientId: chatUser.id }), 2000);
  };

  const handleImageSelect = (e) => {
    const f = e.target.files[0]; if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 2 * 1024 * 1024) return alert('Image too large!');
    const r = new FileReader(); r.onload = (ev) => sendEncryptedPayload(`[IMG]${ev.target.result}`);
    r.readAsDataURL(f); e.target.value = null;
  };
  const handleFileSelect = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return alert('File too large!');
    const r = new FileReader(); r.onload = (ev) => sendEncryptedPayload(`[FILE|${f.name}]${ev.target.result}`);
    r.readAsDataURL(f); e.target.value = null;
  };

  const toggleListen = () => {
    if (isListening) { recognitionRef.current?.stop(); }
    else if (recognitionRef.current) { recognitionRef.current.start(); setIsListening(true); }
    else alert('Browser does not support Speech Recognition.');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream); audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      mediaRecorderRef.current.onstop = () => {
        if (!audioChunksRef.current.length) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        const r = new FileReader(); r.onloadend = () => sendEncryptedPayload(`[AUDIO]${r.result}`);
        r.readAsDataURL(blob);
      };
      mediaRecorderRef.current.start(); setIsRecording(true);
    } catch { alert('Cannot access microphone.'); }
  };
  const stopRecordingAndSend = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      audioChunksRef.current = []; setIsRecording(false);
    }
  };

  const handleDeleteMessage = (id) => { if (window.confirm('Revoke this message?')) socket.emit('deleteMessage', { messageId: id, recipientId: chatUser.id }); };
  const handleReactMessage = (id, reaction) => socket.emit('reactMessage', { messageId: id, recipientId: chatUser.id, reaction });


  

  useEffect(() => {
    // Proactive Silent Handshake: 
    // Negotiate X3DH session immediately on mount if none exists.
    const autoInit = async () => {
      if (autoInitRef.current.has(chatUser.id) || isHandshakingRef.current) return;
      
      try {
        const existing = await loadSession(chatUser.id);
        if (existing && existing.status === 'ESTABLISHED') {
          console.log("[E2EE] Phiên đã ESTABLISHED, chặn đứng auto-handshake.");
          autoInitRef.current.add(chatUser.id);
          return;
        }

        if (!existing || existing.status !== 'INITIALIZING') {
          isHandshakingRef.current = true;
          autoInitRef.current.add(chatUser.id);
          console.log(`[E2EE] Proactively negotiating silent session with ${chatUser.id}...`);
          await sendEncryptedPayload(null, `init-${Date.now()}`);
        }
      } catch (e) { 
        console.error("[E2EE] Auto-init failed", e);
      } finally {
        isHandshakingRef.current = false;
      }
    };
    autoInit();
  }, [chatUser.id]);

  return (
    <div key={chatUser.id} className="flex-1 flex flex-col bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 relative z-10 w-full transition-colors duration-300">
      <div className="absolute inset-0 dark:bg-gradient-to-b dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 pointer-events-none"></div>

      {/* Header */}
      <div className="h-[72px] px-6 flex items-center justify-between border-b border-gray-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shrink-0 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex justify-center items-center text-white font-bold text-lg shadow-lg shadow-purple-500/20">
              {chatUser.username.charAt(0).toUpperCase()}
            </div>
            {isOnline && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-[2.5px] border-white dark:border-slate-900 rounded-full" />}
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-slate-100 text-[15px]">{chatUser.username}</h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              X3DH + Double Ratchet E2EE
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleWipeE2EE} title="Wipe E2EE State" className="w-9 h-9 rounded-full flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={() => callUser(chatUser.id, false)} className="w-10 h-10 rounded-full flex items-center justify-center text-indigo-500 dark:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <Phone className="w-5 h-5" />
          </button>
          <button onClick={() => callUser(chatUser.id, true)} className="w-10 h-10 rounded-full flex items-center justify-center text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 transition-colors">
            <Video className="w-6 h-6" />
          </button>
        </div>
      </div>



      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 z-10 relative custom-scrollbar scroll-smooth">
        {isLoadingMore && <div className="flex justify-center py-2"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>}
        <div className="text-center mb-8 mt-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300 shadow-sm">
            <Lock className="w-3.5 h-3.5" />
            X3DH Handshake + Double Ratchet (AES-256-GCM)
          </div>
        </div>
        {loadingHistory ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : (
          messages.map((msg, idx) => {
            const replied = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) : null;
            return (
              <MessageBubble
                key={msg.id || idx}
                message={msg}
                isMe={msg.senderId === currentUser.id}
                onDelete={handleDeleteMessage}
                onReact={handleReactMessage}
                onReply={() => {}}
                repliedMessage={replied}
              />
            );
          })
        )}
        {isTyping && (
          <div className="flex items-center gap-3 text-slate-400 mt-2 ml-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex justify-center items-center text-xs text-slate-300 font-bold">
              {chatUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="px-3 py-2.5 bg-slate-800 rounded-2xl rounded-bl-sm flex gap-1 items-center">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-gray-200 dark:border-slate-800/80 z-20 shrink-0 relative">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2 p-4">
          {!isRecording && (
            <div className="flex items-center">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-full transition-colors shrink-0">
                <ImagePlus className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => docInputRef.current?.click()} className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 rounded-full transition-colors shrink-0">
                <Paperclip className="w-5 h-5" />
              </button>
              <button type="button" onClick={startRecording} className="p-2.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-full transition-colors shrink-0">
                <Mic className="w-5 h-5" />
              </button>
            </div>
          )}
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
          <input type="file" ref={docInputRef} onChange={handleFileSelect} className="hidden" />
          <div className="relative flex-1 flex">
            {isRecording ? (
              <div className="w-full border border-red-500/50 flex-1 py-1.5 pl-6 pr-4 rounded-full bg-red-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3 text-red-500">
                  <Disc2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium animate-pulse">Recording... (Press SEND to finish)</span>
                </div>
                <button type="button" onClick={cancelRecording} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-400 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative w-full">
                <input
                  type="text"
                  value={newMessage}
                  onChange={handleInputTyping}
                  placeholder="Send secure message..."
                  className="w-full border text-[15px] rounded-full py-3 pl-5 pr-12 outline-none transition-all shadow-inner bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/50 border-gray-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={toggleListen}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 transition z-30 ${isListening ? 'text-emerald-500 animate-pulse' : 'text-gray-400 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400'}`}
                >
                  {isListening ? <Disc2 className="w-4 h-4 animate-spin" /> : <MicOff className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!isRecording && !newMessage.trim() && !isListening}
            className="w-12 h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20 shrink-0"
          >
            <Send className="w-5 h-5 -ml-0.5 mt-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;
