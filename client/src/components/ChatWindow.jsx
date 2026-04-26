import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import {
  processIncomingMessage,
  processGroupMessage,
  decryptHistoricalMessage
} from '../utils/ratchetLogic';
import { createSenderKeyChain, encryptGroupMessage } from '../utils/senderKeyLogic';
import {
  getDecryptedMessage,
  saveDecryptedMessage,
  updateDecryptedMessageId,
  loadSession,
  saveSession,
  deleteSession
} from '../utils/ratchetStore';
import { getKey } from '../utils/keyStore';
import { saveMySenderKey, loadMySenderKey, saveTheirSenderKey, loadTheirSenderKey } from '../utils/senderKeyStore';
import MessageBubble from './MessageBubble';
import {
  Phone, Video, CornerUpLeft, X, Info, ChevronRight, ChevronDown, User, Bell, Search, PlusCircle, Sticker, Gift as GifIcon, Smile, ThumbsUp, Pin, Settings, Type, Image, FileText, BellOff, MessageCircle, Clock, Eye, Shield, Ban, UserMinus, AlertCircle, Loader2, ImagePlus, Send
} from 'lucide-react';

const globalAutoInitRegistry = new Set();

const DetailSection = ({ title, isOpen, onToggle, children }) => (
  <div className="w-full">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[var(--hover)] transition-colors group"
    >
      <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
      {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />}
    </button>
    {isOpen && <div className="mt-1 space-y-1">{children}</div>}
  </div>
);

const DetailAction = ({ icon, label, subLabel }) => (
  <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--hover)] transition-colors text-left group">
    <div className="w-8 h-8 shrink-0 flex items-center justify-center text-[var(--text-primary)]">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{label}</p>
      {subLabel && <p className="text-[11px] text-[var(--text-secondary)] truncate">{subLabel}</p>}
    </div>
  </button>
);

const ChatWindow = ({ user: chatUser, onClose, showDetail, onToggleDetail }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const { token, user: currentUser, masterKey, identityKeys } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const [groupMetadata, setGroupMetadata] = useState(null);
  const { callUser } = useCall();
  const [typingUsers, setTypingUsers] = useState(new Set()); // IDs of users currently typing
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const typingTimeout = useRef(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const lastTypingEmitRef = useRef(0);
  const isOnline = onlineUsers.has(chatUser.id) || chatUser.online;
  const [openSections, setOpenSections] = useState({
    info: true,
    custom: true,
    media: true,
    privacy: true
  });

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  const [hasMore, setHasMore] = useState(true);
  useEffect(() => {
    if (!isLoadingMore) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers.size, isLoadingMore]);

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
    // [Fix] Harder check for IDs. Fallback to chatUser.isGroup to allow group AD generation if id is missing but context exists.
    if (!currentUser?.id || !chatUser?.id) {
      console.warn(`[E2EE-AD] Delaying AD generation: currentUser=${currentUser?.id}, chatUser=${chatUser?.id}`);
      return 'PENDING_IDENTITY';
    }
    return getAssociatedData(currentUser.id, chatUser.id);
  }, [currentUser?.id, chatUser?.id]);

  const outgoingQueueRef = useRef([]); // To buffer outgoing messages during handshakes
  const outgoingProcessChainRef = useRef(Promise.resolve()); // Sequential worker chain for sending



  // [Self-Healing] Feedback Trigger: Send error signal to peer when decryption fails
  useEffect(() => {
    const handleDesync = (e) => {
      const { senderId } = e.detail;
      if (!socket || !senderId) return;
      console.warn(`[Self-Healing] Signaling desync error to ${senderId}...`);
      socket.emit('sendMessage', {
        recipientId: senderId,
        type: 'SESSION_DESYNC_ERROR',
        localId: `desync-signal-${Date.now()}`
      });
    };
    window.addEventListener('e2ee_desync_detected', handleDesync);
    return () => window.removeEventListener('e2ee_desync_detected', handleDesync);
  }, [socket]);




  const onMsg = useCallback(async (msg) => {
    console.log(`[onMsg-Entry] Received. ID: ${msg.id || 'N/A'}, Type: ${msg.type || 'text'}, GroupID: ${msg.groupId}, Sender: ${msg.senderId}`);

    if (msg.senderId === currentUser.id) {
      if (msg.localId) {
        // [Fix] For both 1-1 and Groups: Ensure self-sent messages update their ID AND content correctly 
        await updateDecryptedMessageId(msg.localId, msg.id);
        setMessages(prev => prev.map(m => (m.localId === msg.localId || m.id === msg.id) ? { 
          ...m, 
          status: 'sent', 
          id: msg.id,
          decryptedContent: msg.decryptedContent || m.decryptedContent // Ensure we sync content if server enriched it
        } : m));
      }
      // [Fix] Echo Prevention: Always return after processing our own echo to avoid duplicates in Group chats.
      return;
    }

    // [Universal Technical Processing] Handle Control Messages & Handshakes Globally
    // This allows sessions to stay synchronized regardless of which chat window is currently active.
    const isTechnical = msg.type === 'SENDER_KEY_DISTRIBUTION' || !!msg.senderEk || msg.type === 'handshake_ack' || msg.type === 'SESSION_DESYNC_ERROR';

    if (isTechnical && (msg.recipientId === currentUser?.id || msg.recipientId === 'ALL')) {
      sequentialProcessRef.current = sequentialProcessRef.current.then(async () => {
        try {
          // 1. Resolve Peer Info for adoption
          let peerInfo = { id: msg.senderId };
          try {
            const existing = await loadSession(msg.senderId, masterKey);

            // [Fix] In case of collisions or missing keys, prioritize fetching the bundle 
            // if we are about to process a handshake packet (senderEk).
            const isHandshake = !!msg.senderEk;
            const hasRecvKey = existing && existing.recvRatchetPublicKey;
            const needsBundle = isHandshake && (!hasRecvKey || (existing.status === 'INITIALIZING'));

            if (needsBundle) {
              console.log(`[E2EE-Global] Resolving Peer Bundle for ${msg.senderId} (Handshake detected)...`);
              const res = await api.get(`/api/users/${msg.senderId}/prekey-bundle`);
              const bundle = res.data;
              peerInfo.dhPublicKey = bundle.identityKey;
              peerInfo.identityKey = bundle.identityKey; // Redundant but safe
            }
          } catch (fetchErr) {
            console.warn(`[E2EE-Global] Background resolution failed for ${msg.senderId}:`, fetchErr.message);
          }

          // 2. Core Processing (Encryption/Decryption/Handshake)
          const { content, success } = await processIncomingMessage(msg, masterKey, currentUser, peerInfo);

          // 3. Post-Process specific types
          if (success && msg.type === 'SENDER_KEY_DISTRIBUTION' && content) {
            try {
              const distributionData = JSON.parse(content);
              const { groupId, chainKeyB64, signaturePublicKeyB64 } = distributionData;
              await saveTheirSenderKey(groupId, msg.senderId, {
                chainKeyB64, signaturePublicKeyB64, index: 0
              }, masterKey);
              window.dispatchEvent(new CustomEvent('senderkey_received', { detail: { groupId, senderId: msg.senderId } }));
            } catch (jsonErr) {
              console.error('[Group-Key-RX] Malformed distribution JSON', jsonErr);
            }
          }

          // 4. Update UI if we are in the correct window and it had text content
          if (success && content && (msg.type === 'text' || !msg.type)) {
            const targetMatch = chatUser.isGroup ? msg.groupId === chatUser.id : msg.senderId === chatUser.id;
            if (targetMatch) {
              const member = chatUser.isGroup 
                ? groupMetadata?.members?.find(m => m.userId === msg.senderId || m.id === msg.senderId)
                : null;
              const senderName = chatUser.isGroup 
                ? (member?.User?.username || member?.username || 'Người dùng')
                : chatUser.username;

              setMessages(prev => {
                if (prev.find(m => m.id === msg.id || (m.localId && m.localId === msg.localId))) return prev;
                return [...prev, { ...msg, decryptedContent: content, senderName, status: 'received' }].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              });
            }
          }
        } catch (err) {
          console.error(`[E2EE-Global] Error:`, err.message);
        }
      });

      // [CRITICAL] Consumed: Handshake packets and distributions are now fully handled.
      // We return here to prevent the main pipeline from attempting a duplicate adoption.
      return;
    }

    const isTargetMatch = chatUser.isGroup
      ? msg.groupId === chatUser.id
      : (msg.senderId === chatUser.id && msg.recipientId === currentUser.id);

    if (isTargetMatch) {
      console.log(`[RX-Step] Received Raw. Type: ${msg.type || 'text'}, n: ${msg.n}, senderEk: ${!!msg.senderEk}, localId: ${msg.localId}`);

      const isHandshakePacket = !!msg.senderEk || msg.type === 'handshake_ack';
      // Completely ignore technical/ack messages for UI rendering
      if (msg.type === 'handshake_ack' || !msg.encryptedContent && !msg.senderEk) {
        console.log(`[E2EE-TX-Ack] Dropping technical/ack message from UI queue.`);
        return;
      }

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
          if (!currentUser?.id) return;

          let content = null;
          let success = false;

          let result = { content: null, success: false };

          if (chatUser.isGroup) {
            result = await processGroupMessage(msg, masterKey, currentUser, chatUser.id);
          } else {
            result = await processIncomingMessage(msg, masterKey, currentUser, chatUser);
          }
          
          content = result.content;
          success = result.success;

          if (content !== null && success) {
            // Context Check: Only update state if this message belongs to the currently open chat
            const isForCurrentChat = chatUser.isGroup
              ? msg.groupId === chatUser.id
              : (msg.senderId === chatUser.id || msg.recipientId === chatUser.id);

            if (!isForCurrentChat) {
              console.log(`[onMsg-Guard] Ignoring UI update for background chat: ${msg.id}`);
              return;
            }

            const member = groupMetadata?.members?.find(m => m.userId === msg.senderId || m.id === msg.senderId);
            const senderName = member?.User?.username || member?.username || 'Người dùng';
            const isGhostContent = (!content && !msg.senderEk)
              || (msg.type === 'handshake_ack' || msg.type === 'SENDER_KEY_DISTRIBUTION');

            if (!isGhostContent) {
              setMessages((p) => {
                if (p.some(m => m.id === msg.id)) return p;
                return [...p, { ...msg, decryptedContent: content, senderName, status: 'received' }];
              });
            }

            setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(msg.senderId);
              return next;
            });
            if (!chatUser.isGroup) socket?.emit('markAsRead', { senderId: chatUser.id });

            // Vault Sync Trigger
            const { debouncedUploadVault } = await import('../utils/vaultSyncService');
            debouncedUploadVault(masterKey);
          }
        } catch (err) {
          console.error(`[E2EE-Error] Type: ${err.name} Msg: ${err.message}`);
        }
      });
    }
  }, [chatUser, currentUser, masterKey, identityKeys, groupMetadata, socket]);

  // Active Request Guard: To prevent background processes from updating the state of a chat that is no longer active
  const activeChatIdRef = useRef(null);
  useEffect(() => {
    activeChatIdRef.current = chatUser.id;
  }, [chatUser.id]);

  useEffect(() => {
    const handleHistoryTech = (e) => {
      if (e.detail.chatId && e.detail.chatId !== activeChatIdRef.current) return;
      onMsg(e.detail.msg);
    };
    window.addEventListener('process_historical_technical', handleHistoryTech);
    return () => window.removeEventListener('process_historical_technical', handleHistoryTech);
  }, [chatUser?.id, onMsg]);

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
    for (const { text, localId, type } of buffer) {
      console.log(`[E2EE-Queue] Retrying buffered message: ${localId} (Type: ${type || 'text'})`);
      // isRetry = true to force bypass of handshake locks and break the re-buffering deadlock
      await sendEncryptedPayload(text, localId, type || 'text', true);
    }
    console.log(`[E2EE-Queue] Drain complete for ${msgCount} messages.`);
  };

  const getOrInitSession = async (targetUserId) => {
    if (initPromiseRef.current) {
      console.log('[Gating] Waiting for ongoing handshake promise...');
      return await initPromiseRef.current;
    }

    const init = async () => {
      const lockName = `ratchet_session_${targetUserId}`;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('E2EE Handshake Timeout')), 15000)
      );

      const initWork = async () => {
        return await navigator.locks.request(lockName, async () => {
          let session = null;
          try {
            if (!currentUser?.id) {
              console.warn('[E2EE-Init] Waiting for currentUser identity...');
              return null;
            }
            isHandshakingRef.current = true;
            session = await loadSession(targetUserId, masterKey);
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
            let ikDh_priv = identityKeys?.dh;
            if (!ikDh_priv) {
              console.error('[E2EE-Init] Identity Key (DH) missing in context. Loading from Store as fallback...');
              ikDh_priv = await getKey(`ik_dh_priv_${currentUser.id}`, masterKey);
              if (!ikDh_priv) throw new Error('Identity Key not found. Please re-login.');
            }

            const ek = await generateX25519KeyPair();

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
              pendingUsedOpk: bundle.oneTimePreKey ? bundle.oneTimePreKey.publicKey : null,
              status: 'INITIALIZING'
            };

            await saveSession(targetUserId, newSession, masterKey);

            // [Fix] Initiator Hierarchy: Proactively initiate handshake carrier if higher ID
            const myId = currentUser?.id || 'LOCAL';
            const peerId = targetUserId || 'REMOTE';
            if (myId.localeCompare(peerId) > 0) {
              console.log('[E2EE-Handshake] Proactively initiating silent handshake carrier...');
              sendEncryptedPayload(null, `init-proactive-${Date.now()}`, 'handshake_ack', true);
            }

            setTimeout(() => {
              drainMessageQueue();
              drainOutgoingQueue();
            }, 100);

            return newSession;
          } catch (err) {
            console.error('[E2EE] Handshake init failed', err);
            return session; // return what we have (even if null)
          } finally {
            isHandshakingRef.current = false;
          }
        });
      };

      try {
        return await Promise.race([initWork(), timeoutPromise]);
      } catch (e) {
        console.error(`[E2EE-Init] Failure for ${targetUserId}:`, e.message);
        isHandshakingRef.current = false;
        drainMessageQueue();
        return null;
      } finally {
        initPromiseRef.current = null;
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


  const loadMessages = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else setLoadingHistory(true);
    try {
      if (!currentUser?.id || !chatUser?.id) {
        console.warn('[E2EE-History] Deferring history load until currentUser and chatUser are ready.');
        return;
      }
      const cursor = isLoadMore && messages.length > 0 ? messages[0].createdAt : null;
      const url = chatUser.isGroup
        ? `/api/groups/${chatUser.id}/messages${cursor ? `?cursor=${cursor}` : ''}`
        : `/api/messages/${chatUser.id}${cursor ? `?cursor=${cursor}` : ''}`;

      const res = await api.get(url);
      const batch = res.data;
      if (batch.length < 50) setHasMore(false);

      console.log(`[E2EE-History] Batch received from API: count=${batch.length}. IDs:`, batch.map(m => m.id || m.localId));

      const decrypted = [];
      for (const msg of batch) {
        console.log(`[E2EE-Loop] Processing msg=${msg.id || msg.localId} type=${msg.type || 'text'}`);
        // --- BỔ SUNG LOGIC UI POLISH ---
        // Historical Technical Packets: Adopt Sender Keys & Handshakes from History
        const isHistoricalTech = msg.type === 'SENDER_KEY_DISTRIBUTION' || !!msg.senderEk || msg.type === 'handshake_ack';
        if (isHistoricalTech) {
          console.log(`[E2EE-Loop] Detected historical technical packet for msg=${msg.id || msg.localId}`);
          // Reuse global technical processor logic for historical packets
          window.dispatchEvent(new CustomEvent('process_historical_technical', { detail: { msg } }));

          // If it's purely a distribution or ACK (no text), skip showing as a bubble
          if (!msg.encryptedContent || msg.type === 'SENDER_KEY_DISTRIBUTION') {
            console.log(`[E2EE-Loop] Skipping technical placeholder msg=${msg.id || msg.localId}`);
            continue;
          }
        }
        // ---------------------------------

        // Source of Truth: Check local cache first (try both server ID and localId)
        let content = await getDecryptedMessage(msg.id, masterKey) || (msg.localId ? await getDecryptedMessage(msg.localId, masterKey) : null);

        // [Fix] If the cache contains a placeholder ("Waiting for key") or decryption error,
        // we must disregard it and re-attempt decryption now that we might have the key.
        const isPlaceholder = content && (
          content.startsWith('[Chờ chìa khóa') ||
          content.startsWith('[Lỗi giải mã')
        );

        console.log(`[E2EE-Loop] Cache check for msg=${msg.id || msg.localId}: hasContent=${!!content}, isPlaceholder=${isPlaceholder}`);

        if (content === null || content === undefined || isPlaceholder) {
          try {
            if (chatUser.isGroup) {
              if (msg.senderId === currentUser.id) {
                // [Fix] Self-sent group messages should be in cache. Peer keys won't decrypt them.
                content = '[Bản rõ không khả dụng trên thiết bị này]';
              } else {
                const activeGroupId = chatUser.id || chatUser.groupId;
                // Use centralized locked helper for safety even in history
                const result = await processGroupMessage(msg, masterKey, currentUser, activeGroupId);
                content = result.content;
              }
            } else {
              if (msg.senderId === currentUser.id) {
                // [Fix] Self-sent 1-1 messages cannot be decrypted using the 'recv' chain of a session.
                // They should be in local cache. If missing, we show an 'encrypted' placeholder instead of erroring.
                content = '[Bản rõ không khả dụng trên thiết bị này]';
              } else {
                // High-Stability History Decryption (Read-Only)
                const session = await loadSession(chatUser.id, masterKey);
                if (session) {
                  content = await decryptHistoricalMessage(msg, masterKey, session);
                  if (!content) {
                    // Fallback to live if it might be a very recent one we haven't advanced over
                    const result = await processIncomingMessage(msg, masterKey, currentUser, chatUser);
                    content = result.content;
                  }
                } else {
                  content = '[Secure Session Not Initialized]';
                }
              }
            }
          } catch (e) {
            console.error(`[History-Audit] Decryption error:`, e.message);
            content = `[Lỗi giải mã: ${e.message}]`;
          }
        }

        const member = groupMetadata?.members?.find(m => m.userId === msg.senderId || m.id === msg.senderId);
        const senderName = member?.User?.username || member?.username || 'Người dùng';

        const isErrorContent = (!content || typeof content !== 'string' || content.trim() === '') && msg.senderId !== currentUser.id;
        const isGhostContent = (msg.type === 'handshake_ack' || msg.type === 'SENDER_KEY_DISTRIBUTION') && msg.senderId !== currentUser.id;

        if (!isErrorContent && !isGhostContent) {
          decrypted.push({
            ...msg,
            decryptedContent: content || '[Tin nhắn mã hóa]',
            senderName,
            status: msg.senderId === currentUser.id ? 'sent' : 'received',
          });
        }
      }

      // Guard: Only update state if the user hasn't switched chats during the async load
      if (activeChatIdRef.current !== chatUser.id) {
        console.warn(`[History-Guard] Discarding results for ${chatUser.id} - switch detected.`);
        return;
      }

      if (isLoadMore) {
        const c = scrollContainerRef.current;
        const prevScroll = c ? c.scrollHeight : 0;
        setMessages((p) => {
          const newIds = new Set(decrypted.map(m => m.id));
          const existingFiltered = p.filter(m => !newIds.has(m.id) && (!m.localId || !newIds.has(m.localId)));
          return [...decrypted, ...existingFiltered].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });
        setTimeout(() => { if (c) c.scrollTop = c.scrollHeight - prevScroll; }, 0);
      } else {
        setMessages((prev) => {
          const fetchedIds = new Set();
          decrypted.forEach(m => {
            if (m.id) fetchedIds.add(m.id);
            if (m.localId) fetchedIds.add(m.localId);
          });
          const optimisticMessages = prev.filter(m =>
            (!m.id || !fetchedIds.has(m.id)) &&
            (!m.localId || !fetchedIds.has(m.localId))
          );
          
          // Before merging, try to 'heal' any optimistic messages that were placeholders
          // because a key might have just arrived and been processed by one of the 'decrypted' entries
          return [...decrypted, ...optimisticMessages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });
        setHasMore(batch.length === 50);
      }
      if (!isLoadMore && socket) {
        if (chatUser.isGroup) {
          socket.emit('markAsRead', { groupId: chatUser.id });
        } else if (decrypted.some((m) => m.senderId === chatUser.id && !m.readAt)) {
          socket.emit('markAsRead', { senderId: chatUser.id });
        }
      }
    } catch (err) {
      console.error('[loadMessages]', err);
    } finally {
      if (isLoadMore) setIsLoadingMore(false);
      else setLoadingHistory(false);
    }
  };

  /**
   * [Proactive Healing]
   * Re-scans the visible messages list and attempts to decrypt any placeholders.
   * Triggered when a new Sender Key or Handshake completes.
   */
  const reDecryptVisibleMessages = async () => {
    if (!masterKey || !currentUser) return;
    
    console.log(`[E2EE-Healing] Scanning ${messages.length} messages for placeholders. Current IDs:`, messages.map(m => m.id || m.localId));
    
    const nextMessages = await Promise.all(messages.map(async (msg) => {
      const isPlaceholder = msg.decryptedContent && (
        msg.decryptedContent.startsWith('[Chờ chìa khóa') ||
        msg.decryptedContent.startsWith('[Lỗi giải mã')
      );

      if (isPlaceholder || !msg.decryptedContent) {
        try {
          let result;
          console.log(`[E2EE-Healing] Attempting re-decryption for msg=${msg.id || msg.localId} (n=${msg.n || msg.index}) from=${msg.senderId}`);
          if (chatUser.isGroup) {
            result = await processGroupMessage(msg, masterKey, currentUser, chatUser.id);
          } else {
            result = await processIncomingMessage(msg, masterKey, currentUser, chatUser);
          }

          if (result.success && result.content && result.content !== msg.decryptedContent) {
            console.log(`[E2EE-Healing] Successfully healed message: ${msg.id || msg.localId}`);
            return { ...msg, decryptedContent: result.content };
          }
        } catch (e) {
          // Soft fail for background healing
        }
      }
      return msg;
    }));

    setMessages(prev => {
      // Identity check: avoid updating state if nothing actually changed
      const changed = nextMessages.some((msg, idx) => msg !== prev[idx]);
      return changed ? nextMessages : prev;
    });
  };




  useEffect(() => {
    if (chatUser?.id && token) {
      setHasMore(true);
      if (chatUser.isGroup) {
        fetchGroupMetadata().then(() => loadMessages()).catch(console.error);
      } else {
        getOrInitSession(chatUser.id).then(() => loadMessages()).catch(console.error);
      }
    }
  }, [chatUser?.id, token, currentUser?.id]);

  const fetchGroupMetadata = async () => {
    if (!chatUser?.id) return;
    try {
      const res = await api.get(`/api/groups/${chatUser.id}`);
      setGroupMetadata(res.data);
      if (socket) socket.emit('joinGroup', { groupId: chatUser.id });
    } catch (err) {
      console.error('Failed to fetch group metadata', err);
    }
  };

  const handleScroll = () => {
    const c = scrollContainerRef.current;
    if (!c) return;
    if (c.scrollTop === 0 && hasMore && !isLoadingMore && !loadingHistory) loadMessages(true);
  };

  useEffect(() => {
    if (!socket) return;
    const onTyping = ({ senderId }) => {
      if (!chatUser.isGroup && senderId === chatUser.id) {
        setTypingUsers(prev => new Set(prev).add(senderId));
      }
    };
    const onStop = ({ senderId }) => {
      setTypingUsers(prev => {
        const next = new Set(prev);
        next.delete(senderId);
        return next;
      });
    };
    const onGrpTyping = ({ groupId, senderId }) => {
      if (chatUser.isGroup && groupId === chatUser.id) {
        setTypingUsers(prev => new Set(prev).add(senderId));
      }
    };
    const onGrpStop = ({ groupId, senderId }) => {
      if (chatUser.isGroup && groupId === chatUser.id) {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(senderId);
          return next;
        });
      }
    };
    const onDel = ({ messageId }) => setMessages((p) => p.map((m) => m.id === messageId ? { ...m, isDeleted: true, decryptedContent: '[Message revoked]' } : m));
    const onReact = ({ messageId, reactions }) => setMessages((p) => p.map((m) => m.id === messageId ? { ...m, reactions } : m));
    const onRead = ({ byUserId, groupId }) => {
      if (groupId && chatUser.isGroup && groupId === chatUser.id) {
        // [Opt] Could show 'Read by User' in UI here
      } else if (byUserId === chatUser.id) {
        setMessages((p) => p.map((m) => (!m.readAt && m.senderId === currentUser.id) ? { ...m, readAt: new Date().toISOString() } : m));
      }
    };
    const handleConnect = () => {
      if (chatUser?.isGroup) {
        console.log(`[SOCKET] Re-joining room group:${chatUser.id} after connection/reconnect...`);
        socket.emit('joinGroup', { groupId: chatUser.id });
      }
    };

    socket.on('connect', handleConnect);
    // [Fix] Immediate Join: Join room immediately on mount/switch, don't wait for reconnect event.
    if (chatUser?.isGroup) {
      console.log(`[SOCKET] Joining room group:${chatUser.id} (Initial/Switch)...`);
      socket.emit('joinGroup', { groupId: chatUser.id });
    }

    socket.on('newMessage', onMsg);
    socket.on('newGroupMessage', onMsg);
    socket.on('handshake_ack', onMsg);
    socket.on('typing', onTyping);
    socket.on('stopTyping', onStop);
    socket.on('groupTyping', onGrpTyping);
    socket.on('groupStopTyping', onGrpStop);
    socket.on('messageDeleted', onDel);
    socket.on('messageReacted', onReact);
    socket.on('messagesRead', onRead);
    socket.on('groupMessageRead', onRead);
    socket.on('error', (err) => console.error('[SOCKET-Error]', err));
    return () => {
      socket.off('connect', handleConnect);
      socket.off('newMessage', onMsg);
      socket.off('newGroupMessage', onMsg);
      socket.off('handshake_ack', onMsg);
      socket.off('typing', onTyping);
      socket.off('stopTyping', onStop);
      socket.off('groupTyping', onGrpTyping);
      socket.off('groupStopTyping', onGrpStop);
      socket.off('messageDeleted', onDel);
      socket.off('messageReacted', onReact);
      socket.off('messagesRead', onRead);
      socket.off('groupMessageRead', onRead);
      socket.off('error');
      if (chatUser.isGroup) socket.emit('leaveGroup', { groupId: chatUser.id });
    };
  }, [socket, chatUser, currentUser.id, onMsg]);

  // Listener for background-synced messages (Offline Sync)
  useEffect(() => {
    const handleSyncEvent = (e) => {
      const syncedMsg = e.detail;

      // [Fix] Ignore empty/init-proactive messages mapped with null content
      if (!syncedMsg.decryptedContent || syncedMsg.decryptedContent.trim() === '') return;

      // --- BỔ SUNG LOGIC BẢO HIỂM ---
      // Chặn bong bóng kỳ lạ từ tiến trình nền (Web Worker / Offline Sync)
      if (syncedMsg.type === 'SENDER_KEY_DISTRIBUTION') return;

      // If tin nhắn thuộc về người đang mở chat -> Đưa lên UI
      if (syncedMsg.senderId === chatUser.id || syncedMsg.recipientId === chatUser.id) {
        setMessages(prev => {
          // Tránh trùng lặp
          if (prev.some(m => m.id === syncedMsg.id)) return prev;

          // Determine status
          const status = syncedMsg.senderId === currentUser.id ? 'sent' : 'received';

          // Re-sort to ensure correct order after background insertion
          const newList = [...prev, { ...syncedMsg, status }];
          return newList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });
      }
    };

    window.addEventListener('e2ee_message_synced', handleSyncEvent);
    return () => window.removeEventListener('e2ee_message_synced', handleSyncEvent);
  }, [chatUser.id, currentUser.id]);

  // [CRITICAL FIX] Re-load history when offline sync saves a new Sender Key for a group we have open
  useEffect(() => {
    if (!chatUser?.isGroup) return;

    const handleKeyReceived = async (e) => {
      if (e.detail?.groupId !== chatUser.id) return;
      console.log(`[Group-Audit] Sender Key received for current group. Triggering healing and history reload...`);
      // 1. Proactively heal what we have in UI state
      await reDecryptVisibleMessages();
      // 2. Refresh from server to pick up any others we missed
      await loadMessages(false);
    };

    window.addEventListener('senderkey_received', handleKeyReceived);
    return () => window.removeEventListener('senderkey_received', handleKeyReceived);
  }, [chatUser?.id, chatUser?.isGroup]);

  // [Fix] Reload history for 1-1 chats when a handshake completes (fixes [Secure Session Not Established])

  useEffect(() => {
    if (chatUser?.isGroup) return;
    let debounceTimer = null;

    const handleSessionUpdate = async (e) => {
      if (e.detail?.userId !== chatUser?.id) return;
      // Debounce: only reload once if multiple session_updated events fire quickly
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log(`[E2EE-Session] Session with ${chatUser.id} is now ready. Healing history...`);
        await reDecryptVisibleMessages();
        await loadMessages(false);
      }, 500);
    };

    window.addEventListener('session_updated', handleSessionUpdate);
    return () => {
      window.removeEventListener('session_updated', handleSessionUpdate);
      clearTimeout(debounceTimer);
    };
  }, [chatUser?.id, chatUser?.isGroup]);

  const distributeSenderKey = async (recipientId, distributionPayload) => {
    try {
      // [Fix] Ensure session exists by initializing proactively; retry up to 2 times
      let initialSession = await loadSession(recipientId, masterKey);
      if (!initialSession || initialSession.status !== 'ESTABLISHED') {
        console.log(`[Group-Key-TX] Session with ${recipientId} not established. Proactively negotiating silent handshake...`);
        try {
          await getOrInitSession(recipientId);
        } catch (initErr) {
          console.warn(`[Group-Key-TX] Handshake attempt 1 failed for ${recipientId}, retrying in 1s...`, initErr.message);
          await new Promise(res => setTimeout(res, 1000));
          try { await getOrInitSession(recipientId); } catch (_) { }
        }
      }

      const lockName = `ratchet_session_${recipientId}`;
      return await navigator.locks.request(lockName, async () => {
        try {
          // Load latest session after handshake
          let session = await loadSession(recipientId, masterKey);

          // [Fix] Allow session in INITIALIZING state — we can still send using sendChainKey
          if (!session) {
            console.error(`[Group-Key-TX] Session with ${recipientId} is completely missing after handshake. Skipping.`);
            return;
          }

          if (session.status === 'ESTABLISHED' || session.status === 'INITIALIZING') {
            // OK — proceed
          } else {
            console.error(`[Group-Key-TX] Session with ${recipientId} has unexpected status: ${session.status}. Skipping.`);
            return;
          }

          if (!session.sendChainKey) {
            console.error(`[Group-Key-TX] Session with ${recipientId} has no sendChainKey. Skipping.`);
            return;
          }

          const { nextChainKey, messageKey } = await ratchetChain(session.sendChainKey);

          // [CRYPTO-Audit] Trace chain advancement
          const ckFingerprint = await window.crypto.subtle.exportKey('raw', session.sendChainKey).then(k => getFingerprint(k));
          const mkFingerprint = await window.crypto.subtle.exportKey('raw', messageKey).then(k => getFingerprint(k));
          console.log(`[CRYPTO-Audit] Group Key Ratchet: CK_FP=${ckFingerprint}, MK_FP=${mkFingerprint}`);

          session.sendChainKey = nextChainKey;
          const currentIndex = session.nextSendIndex || 0;
          session.nextSendIndex = currentIndex + 1;

          const ad = getAssociatedData(currentUser.id, recipientId);
          const mkAudit = await window.crypto.subtle.exportKey('raw', messageKey).then(k => getFingerprint(k));
          console.log(`[CRYPTO-Audit] Encrypting Key Distribution for ${recipientId} with MK_FP: ${mkAudit}, AD: "${ad}"`);

          const encrypted = await encryptMessageGCM(distributionPayload, messageKey, ad);

          await saveSession(recipientId, session, masterKey);

          // [Fix] Bao gồm các tham số handshake nếu phiên mới hoặc đang khởi tạo
          const needsHandshake = session.status === 'INITIALIZING' || session.nextSendIndex <= 1;
          const senderEk = needsHandshake ? (session.pendingSenderEk || null) : null;
          const usedOpk = needsHandshake ? (session.pendingUsedOpk || null) : null;

          socket.emit('sendMessage', {
            recipientId,
            encryptedContent: encrypted.ciphertextB64,
            ratchetKey: session.sendRatchetKeyPair.publicKeyBase64,
            n: currentIndex,
            pn: session.previousCounter || 0,
            iv: encrypted.ivB64,
            senderId: currentUser.id,
            senderEk,
            usedOpk,
            type: 'SENDER_KEY_DISTRIBUTION',
            localId: `ctrl-dist-${Date.now()}-${recipientId}`
          });
          console.log(`[Group-Key-TX] SUCCESS: Distributed key to ${recipientId} (Session: ${session.status}, n: ${currentIndex}, Handshake: ${!!senderEk})`);
        } catch (err) {
          console.error(`[Group-Key-TX] ERROR inside lock for ${recipientId}:`, err);
          throw err; // Re-throw to let allSettled catch it
        }
      });
    } catch (err) {
      console.error(`[Group-Key-TX] FATAL error preparing distribution for ${recipientId}:`, err);
      throw err;
    }
  };

  const sendEncryptedPayload = async (text, localId, type = 'text', isRetry = false, targetUserId = null, isGroupOverride = null) => {
    const isGroup = isGroupOverride !== null ? isGroupOverride : chatUser.isGroup;
    const effectiveTargetId = targetUserId || chatUser?.id || chatUser?.groupId;

    if (!effectiveTargetId && !isGroup) {
      console.warn('[E2EE-TX] Aborting send: Target ID is completely missing.', { chatUser, targetUserId });
      return;
    }

    const activeId = effectiveTargetId;
    if (!activeId) {
      console.error('[E2EE-TX] Aborting send: activeId is null. State sync issue.', chatUser);
      return;
    }

    const msgLocalId = localId || `loc-${Date.now()}`;

    // [Deadlock-Fix] Move session initialization OUTSIDE and BEFORE the lock.
    // navigator.locks.request is NOT re-entrant. Calling it nested (here and in getOrInit)
    // for the same lock name was causing the UI to hang on first message or after switch.
    if (!isGroup) {
      let session = await loadSession(activeId, masterKey);
      if (!session) {
        if (!isRetry) {
          console.log(`[E2EE-TX] Session missing for ${activeId}. Initializing before taking lock...`);
          await getOrInitSession(activeId);
          session = await loadSession(activeId, masterKey);
        }
        if (!session) {
          console.error('[E2EE-TX] Fatal: Could not establish session for encryption.');
          return;
        }
      }
    }

    // [Reliability] Wrap in Web Lock to prevent session double-mutation
    const lockName = isGroup ? `group_session_${activeId}` : `ratchet_session_${activeId}`;
    return await navigator.locks.request(lockName, async () => {
      try {
        if (isGroup) {
          // GROUP SEND LOGIC
          let senderKey = await loadMySenderKey(chatUser.id, masterKey);

          if (!senderKey) {
            console.log(`[Group-E2EE] Initializing our Sender Key for group ${activeId}...`);

            // [Fix] Ensure groupMetadata is available before distribution
            let metadata = groupMetadata;
            if (!metadata || (metadata.id !== activeId && metadata.groupId !== activeId) || !metadata.members) {
              console.log('[Group-E2EE] Group metadata missing or stale. Fetching now...');
              try {
                const res = await api.get(`/api/groups/${activeId}`);
                metadata = res.data;
                setGroupMetadata(metadata);
              } catch (err) {
                console.error('[Group-E2EE] Failed to fetch group metadata:', err);
              }
            }

            if (!metadata || !metadata.members) {
              console.error('[Group-E2EE] No members found for group. Aborting distribution.');
              return;
            }

            const newChain = await createSenderKeyChain();
            senderKey = {
              chainKeyB64: newChain.chainKeyB64,
              signaturePrivateKey: newChain.signaturePrivateKey,
              signaturePublicKeyB64: newChain.signaturePublicKeyB64,
              index: 0
            };
            await saveMySenderKey(activeId, senderKey, masterKey);

            // [Fix] Sequential distribution to prevent IndexedDB transaction collisions (Race Condition)
            console.log(`[Group-Key-TX] Distributing key to ${metadata.members.length} members (SEQUENTIAL)...`);
            const distributionPayload = JSON.stringify({
              groupId: activeId,
              chainKeyB64: senderKey.chainKeyB64,
              signaturePublicKeyB64: senderKey.signaturePublicKeyB64
            });

            let succeeded = 0; let failed = 0;
            const targets = metadata.members.filter(m => m.userId !== currentUser.id);
            for (const member of targets) {
              try {
                await distributeSenderKey(member.userId, distributionPayload);
                succeeded++;
              } catch (distErr) {
                failed++;
                console.warn(`[Group-Key-TX] Member ${member.userId} distribution FAILED:`, distErr.message);
              }
            }

            console.log(`[Group-Key-TX] Distribution Phase Complete. Members processed: ${targets.length}. Success: ${succeeded}, Failed: ${failed}`);
          }

          // [Fix] Handle null text (proactive handshake carriers). 
          // Group protocol doesn't use silent carriers; return early after key distribution.
          if (!text || text.trim() === '') {
            console.warn(`[Group-E2EE] Skipping encryption for empty/null message. Current state:`, { 
              hasText: !!text, 
              trimmedLength: text?.trim()?.length,
              isGroup: chatUser.isGroup 
            });
            return;
          }

          // [Fix] Verify that we have the group's dedicated signing key
          if (!senderKey || !senderKey.signaturePrivateKey) {
            console.error('[E2EE-TX] Cannot sign group message: senderKey.signaturePrivateKey is missing.');
            return;
          }

          const { ciphertextB64, ivB64, index, signature, nextChainKeyB64 } = await encryptGroupMessage(
            text,
            senderKey.chainKeyB64,
            senderKey.signaturePrivateKey, // [Fix] Use the dedicated sender signing key, NOT the identity key
            senderKey.index,
            activeId
          );

          // Update our local state to the NEXT chain key
          await saveMySenderKey(activeId, { ...senderKey, chainKeyB64: nextChainKeyB64, index: index + 1 }, masterKey);

          // 1. Save plaintext to local cache so we see it immediately (and after refresh)
          await saveDecryptedMessage(msgLocalId, {
            text,
            groupId: activeId,
            senderId: currentUser.id,
            timestamp: new Date().toISOString()
          }, masterKey);


          // 2. Transmit via socket
          socket.emit('sendGroupMessage', {
            groupId: activeId,
            encryptedContent: ciphertextB64,
            iv: ivB64,
            index: index,
            signature,
            localId: msgLocalId,
            type: type || 'text'
          });

          console.log(`[Group-TX] Message sent. Index: ${index}`);
          return;
        }


        const session = isGroup ? null : await loadSession(activeId, masterKey);


        // -- Sending Logic --
        if (!session) {
          console.error('[E2EE] Fatal: Attempted to send without session.');
          return;
        }

        if (!session.sendRatchetKeyPair) {
          console.error('[E2EE] Fatal: Ratchet Key missing. Cannot send.');
          return '[Encryption Failed]';
        }

        let currentRatchetPub = session.sendRatchetKeyPair.publicKeyBase64;

        // 1. Double Ratchet Rotation
        if (!session.sendChainKey) {
          console.log('[DoubleRatchet] Initializing Responder sending chain...');
          const remotePublicKey = await importX25519Public(session.recvRatchetPublicKey);
          const dhSecret = await window.crypto.subtle.deriveBits(
            { name: 'X25519', public: remotePublicKey },
            session.sendRatchetKeyPair.privateKey, 256
          );
          const { newRootKey, newChainKey } = await ratchetRoot(session.rootKey, dhSecret);
          session.rootKey = newRootKey;
          session.sendChainKey = newChainKey;
          session.nextSendIndex = 0;
          currentRatchetPub = session.sendRatchetKeyPair.publicKeyBase64;
        }

        // 1b. Proactive DH Ratchet
        const MAX_SYMMETRIC_STEPS = 16;
        if ((session.nextSendIndex || 0) >= MAX_SYMMETRIC_STEPS) {
          console.log(`[DoubleRatchet] MAX SYMMETRIC STEPS reached. Rotating DH...`);
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
        if (!baseChainKey) throw new Error('sendChainKey is null');

        const { nextChainKey, messageKey } = await ratchetChain(baseChainKey);
        session.sendChainKey = nextChainKey;

        const currentIndex = session.nextSendIndex || 0;
        session.nextSendIndex = currentIndex + 1;

        // 1-1 Encryption 
        let ciphertextB64 = null, ivB64 = null;
        if (text !== null && text !== undefined) {
          const encrypted = await encryptMessageGCM(text, messageKey, sessionAD);
          ciphertextB64 = encrypted.ciphertextB64; ivB64 = encrypted.ivB64;

          // [Fix] Save plaintext to local cache so sender can see it after refresh
          await saveDecryptedMessage(localId, {
            text,
            senderId: currentUser.id,
            recipientId: activeId,
            timestamp: new Date().toISOString()
          }, masterKey);
        }

        const needsHandshake = session.status === 'INITIALIZING' || session.nextSendIndex <= 1;
        const senderEk = needsHandshake ? (session.pendingSenderEk || null) : null;
        const usedOpk = needsHandshake ? (session.pendingUsedOpk || null) : null;

        await saveSession(activeId, session, masterKey);

        socket.emit((type === 'handshake_ack' ? 'handshake_ack' : 'sendMessage'), {
          recipientId: activeId,
          encryptedContent: ciphertextB64,
          ratchetKey: currentRatchetPub,
          n: currentIndex,
          pn: session.previousCounter || 0,
          iv: ivB64,
          senderId: currentUser.id,
          senderEk, usedOpk, localId,
          type: type || 'text'
        });

        setNewMessage('');

        // Vault Sync Trigger
        const { debouncedUploadVault } = await import('../utils/vaultSyncService');
        debouncedUploadVault(masterKey);
      } catch (err) {
        console.error('[E2EE-TX] Error:', err);
      }
    });
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

    // Immediate UI Feedback (Optimistic)
    const optimisticMsg = {
      id: localId,
      localId: localId,
      senderId: currentUser.id,
      recipientId: chatUser.id,
      decryptedContent: t,
      createdAt: new Date().toISOString(),
      status: 'sending'
    };

    setMessages(prev => {
      if (prev.some(m => m.id === localId)) return prev;
      return [...prev, optimisticMsg].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });

    // Queue for sequential processing with Context Binding
    outgoingQueueRef.current.push({
      text: t,
      localId,
      type: 'text',
      isGroup: chatUser.isGroup,
      targetId: chatUser.id
    });
    triggerOutgoingWorker();
  };

  const triggerOutgoingWorker = () => {
    outgoingProcessChainRef.current = outgoingProcessChainRef.current.then(async () => {
      if (outgoingQueueRef.current.length === 0) return;
      const buffer = [...outgoingQueueRef.current];
      outgoingQueueRef.current = [];

      for (const item of buffer) {
        try {
          // Use stored context (item.targetId, item.isGroup) instead of global chatUser state
          await sendEncryptedPayload(item.text, item.localId, item.type, false, item.targetId, item.isGroup);
        } catch (err) {
          console.error('[E2EE-TX-Worker] Failed to send:', item.localId, err);
          setMessages(prev => prev.map(m => (m.localId === item.localId || m.id === item.localId) ? { ...m, status: 'error' } : m));
        }
      }
    });
  };

  const handleInputTyping = (e) => {
    setNewMessage(e.target.value);
    if (!socket) return;

    // [Throttling] Only emit typing status once every 2 seconds
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      if (chatUser.isGroup) {
        socket.emit('groupTyping', { groupId: chatUser.id });
      } else {
        socket.emit('typing', { recipientId: chatUser.id });
      }
      lastTypingEmitRef.current = now;
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (chatUser.isGroup) {
        socket.emit('groupStopTyping', { groupId: chatUser.id });
      } else {
        socket.emit('stopTyping', { recipientId: chatUser.id });
      }
    }, 2000);
  };

  const handleImageSelect = (e) => {
    const f = e.target.files[0]; if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 2 * 1024 * 1024) return alert('Image too large!');
    const r = new FileReader(); r.onload = (ev) => {
      const localId = `loc-${Date.now()}`;
      const content = `[IMG]${ev.target.result}`;
      
      // [Fix] Optimistic UI for Image
      setMessages(prev => [...prev, {
        id: localId, localId, senderId: currentUser.id, recipientId: chatUser.id,
        decryptedContent: content, status: 'sending', createdAt: new Date().toISOString(), type: 'image'
      }].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

      sendEncryptedPayload(content, localId, 'image');
    };
    r.readAsDataURL(f); e.target.value = null;
  };
  const handleFileSelect = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return alert('File too large!');
    const r = new FileReader(); r.onload = (ev) => {
      const localId = `loc-${Date.now()}`;
      const content = `[FILE|${f.name}]${ev.target.result}`;

      // [Fix] Optimistic UI for File
      setMessages(prev => [...prev, {
        id: localId, localId, senderId: currentUser.id, recipientId: chatUser.id,
        decryptedContent: content, status: 'sending', createdAt: new Date().toISOString(), type: 'file'
      }].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

      sendEncryptedPayload(content, localId, 'file');
    };
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
        const r = new FileReader(); r.onloadend = () => {
          const localId = `loc-${Date.now()}`;
          const b64 = r.result;

          // [Fix] Optimistic UI for Audio: Use actual content instead of hardcoded string
          setMessages(prev => [...prev, {
            id: localId, localId: localId, senderId: currentUser.id, recipientId: chatUser.id,
            decryptedContent: `[AUDIO]${b64}`, status: 'sending', createdAt: new Date().toISOString(), type: 'audio'
          }].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

          outgoingQueueRef.current.push({
            text: `[AUDIO]${b64}`,
            localId,
            type: 'audio',
            isGroup: chatUser.isGroup,
            targetId: chatUser.id
          });
          triggerOutgoingWorker();
        };
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




  // [Sync] Live Message Listeners
  useEffect(() => {
    if (!socket) return;
    const msgHandler = (msg) => {
      onMsg(msg);
    };
    socket.on('newMessage', msgHandler);
    socket.on('newGroupMessage', msgHandler);
    return () => {
      socket.off('newMessage', msgHandler);
      socket.off('newGroupMessage', msgHandler);
    };
  }, [socket, onMsg]);

  useEffect(() => {
    // Proactive Silent Handshake: 
    // Negotiate X3DH session immediately on mount if none exists.
    const autoInit = async () => {
      if (!chatUser?.id || chatUser?.isGroup) return; // Skip groups
      if (globalAutoInitRegistry.has(chatUser.id) || autoInitRef.current.has(chatUser.id) || isHandshakingRef.current) return;

      try {
        const existing = await loadSession(chatUser.id);
        if (existing && existing.status === 'ESTABLISHED') {
          console.log("[E2EE] Phiên đã ESTABLISHED, chặn đứng auto-handshake.");
          globalAutoInitRegistry.add(chatUser.id);
          autoInitRef.current.add(chatUser.id);
          return;
        }

        if (!existing || existing.status !== 'INITIALIZING') {
          isHandshakingRef.current = true;
          globalAutoInitRegistry.add(chatUser.id);
          autoInitRef.current.add(chatUser.id);
          console.log(`[E2EE] Proactively negotiating silent session with ${chatUser.id}...`);
          await getOrInitSession(chatUser.id);
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
    <div className="flex-1 flex overflow-hidden bg-[var(--bg-primary)] h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--border)]">
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border)] z-20">
          <div className="flex items-center gap-3">
            <div className="relative">
               <div className="w-10 h-10 rounded-full bg-[var(--hover)] flex items-center justify-center overflow-hidden border border-[var(--border)]">
                  {chatUser.avatarUrl ? (
                    <img src={chatUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-[var(--text-secondary)]">
                      {(chatUser.displayName || chatUser.username || chatUser.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
               </div>
               {isOnline && (
                 <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#31a24c] rounded-full border-2 border-[var(--bg-primary)]"></div>
               )}
            </div>
            <div>
              <h2 className="font-bold text-[var(--text-primary)] leading-tight">
                {chatUser.displayName || chatUser.username || chatUser.name}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => callUser(chatUser.id, false)}
              className="p-2 text-blue-500 hover:bg-[var(--hover)] rounded-full transition-colors"
            >
              <Phone className="w-5 h-5" />
            </button>
            <button 
              onClick={() => callUser(chatUser.id, true)}
              className="p-2 text-blue-500 hover:bg-[var(--hover)] rounded-full transition-colors"
            >
              <Video className="w-5 h-5" />
            </button>
            <button 
              onClick={onToggleDetail}
              className={`p-2 rounded-full transition-colors ${showDetail ? 'bg-blue-500/10 text-blue-500' : 'text-blue-500 hover:bg-[var(--hover)]'}`}
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message Area */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-[var(--bg-primary)] scroll-smooth"
        >
          {loadingHistory && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}
          
          {messages
            .filter(msg => msg.type !== 'SENDER_KEY_DISTRIBUTION')
            .map((msg, i) => {
              const isMe = msg.senderId === currentUser?.id;
              const prevMsg = messages[i - 1];
              const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);
              
              return (
                <MessageBubble 
                  key={msg.id || msg.localId}
                  message={msg}
                  isMe={isMe}
                  showAvatar={showAvatar}
                  avatarUrl={chatUser.avatarUrl}
                  onDelete={handleDeleteMessage}
                  onReact={handleReactMessage}
                  onReply={setReplyingTo}
                  repliedMessage={msg.repliedToMessage}
                />
              );
            })}
          
          {typingUsers.size > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] animate-pulse ml-10">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-[var(--text-secondary)] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-1 bg-[var(--text-secondary)] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-1 bg-[var(--text-secondary)] rounded-full animate-bounce"></span>
              </div>
              Đang soạn tin nhắn...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-4 py-3 bg-[var(--bg-primary)] border-t border-[var(--border)]">
          {replyingTo && (
            <div className="mb-2 px-3 py-2 bg-[var(--hover)] rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <CornerUpLeft className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  Đang trả lời <span className="font-semibold text-[var(--text-primary)]">
                    {replyingTo.senderId === currentUser?.id ? 'chính mình' : (chatUser.displayName || chatUser.username)}
                  </span>: {replyingTo.decryptedContent}
                </p>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <button className="p-2 text-blue-500 hover:bg-[var(--hover)] rounded-full transition-colors">
                <PlusCircle className="w-5 h-5" />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-blue-500 hover:bg-[var(--hover)] rounded-full transition-colors"
              >
                <ImagePlus className="w-5 h-5" />
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
              </button>
              <button className="p-2 text-blue-500 hover:bg-[var(--hover)] rounded-full transition-colors">
                <Sticker className="w-5 h-5" />
              </button>
              <button className="p-2 text-blue-500 hover:bg-[var(--hover)] rounded-full transition-colors">
                <GifIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 relative flex items-center">
              <input 
                type="text"
                placeholder="Aa"
                className="w-full bg-[var(--input-bg)] text-[var(--text-primary)] rounded-full py-2 px-4 outline-none transition-colors border border-[var(--border)]"
                value={newMessage}
                onChange={handleInputTyping}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              />
              <button className="absolute right-2 p-1 text-blue-500 hover:scale-110 transition-transform">
                <Smile className="w-5 h-5" />
              </button>
            </div>

            <button 
              onClick={handleSendMessage}
              className="p-2 text-blue-500 hover:scale-110 transition-transform shrink-0"
            >
              {newMessage.trim() ? <Send className="w-6 h-6" /> : <ThumbsUp className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Right Detail Panel */}
      {showDetail && (
        <div className="w-[320px] bg-[var(--bg-primary)] h-full overflow-y-auto flex flex-col items-center p-6 animate-slide-in-right border-l border-[var(--border)]">
          <div className="w-24 h-24 rounded-full bg-[var(--hover)] flex items-center justify-center overflow-hidden mb-4 border border-[var(--border)]">
             {chatUser.avatarUrl ? (
                <img src={chatUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-[var(--text-secondary)]">
                  {(chatUser.displayName || chatUser.username || chatUser.name || '?').charAt(0).toUpperCase()}
                </span>
              )}
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
            {chatUser.displayName || chatUser.username || chatUser.name}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mb-6 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-[#31a24c] rounded-full"></span>
            Đang hoạt động
          </p>

          <div className="flex gap-4 w-full justify-center mb-8">
            <div className="flex flex-col items-center gap-1">
              <button className="w-10 h-10 rounded-full bg-[var(--hover)] flex items-center justify-center hover:brightness-90 transition-all">
                <User className="w-5 h-5 text-[var(--text-primary)]" />
              </button>
              <span className="text-[11px] text-[var(--text-secondary)]">Trang cá nhân</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <button className="w-10 h-10 rounded-full bg-[var(--hover)] flex items-center justify-center hover:brightness-90 transition-all">
                <Bell className="w-5 h-5 text-[var(--text-primary)]" />
              </button>
              <span className="text-[11px] text-[var(--text-secondary)]">Tắt thông báo</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <button className="w-10 h-10 rounded-full bg-[var(--hover)] flex items-center justify-center hover:brightness-90 transition-all">
                <Search className="w-5 h-5 text-[var(--text-primary)]" />
              </button>
              <span className="text-[11px] text-[var(--text-secondary)]">Tìm kiếm</span>
            </div>
          </div>

          <div className="w-full space-y-1">
            {/* Section: Thông tin về đoạn chat */}
            <DetailSection 
              title="Thông tin về đoạn chat" 
              isOpen={openSections.info} 
              onToggle={() => toggleSection('info')}
            >
              <DetailAction icon={<Pin className="w-4 h-4" />} label="Xem tin nhắn đã ghim" />
            </DetailSection>

            {/* Section: Tùy chỉnh đoạn chat */}
            <DetailSection 
              title="Tùy chỉnh đoạn chat" 
              isOpen={openSections.custom} 
              onToggle={() => toggleSection('custom')}
            >
              <DetailAction icon={<div className="w-4 h-4 rounded-full bg-indigo-500" />} label="Đổi chủ đề" />
              <DetailAction icon={<Smile className="w-4 h-4 text-yellow-500" />} label="Thay đổi biểu tượng cảm xúc" />
              <DetailAction icon={<Type className="w-4 h-4" />} label="Chỉnh sửa biệt danh" />
            </DetailSection>

            {/* Section: File phương tiện & file */}
            <DetailSection 
              title="File phương tiện & file" 
              isOpen={openSections.media} 
              onToggle={() => toggleSection('media')}
            >
              <DetailAction icon={<Image className="w-4 h-4" />} label="File phương tiện" />
              <DetailAction icon={<FileText className="w-4 h-4" />} label="File" />
            </DetailSection>

            {/* Section: Quyền riêng tư và hỗ trợ */}
            <DetailSection 
              title="Quyền riêng tư và hỗ trợ" 
              isOpen={openSections.privacy} 
              onToggle={() => toggleSection('privacy')}
            >
              <DetailAction icon={<Bell className="w-4 h-4" />} label="Tắt thông báo" />
              <DetailAction icon={<MessageCircle className="w-4 h-4" />} label="Quyền nhắn tin" />
              <DetailAction icon={<Clock className="w-4 h-4" />} label="Tin nhắn tự hủy" />
              <DetailAction icon={<Eye className="w-4 h-4" />} label="Thông báo đã đọc" subLabel="Tắt" />
              <DetailAction icon={<Shield className="w-4 h-4" />} label="Xác minh mã hóa đầu cuối" />
              <DetailAction icon={<Ban className="w-4 h-4" />} label="Hạn chế" />
              <DetailAction icon={<UserMinus className="w-4 h-4" />} label="Chặn" />
              <DetailAction icon={<AlertCircle className="w-4 h-4" />} label="Báo cáo" subLabel="Đóng góp ý kiến và báo cáo cuộc trò chuyện" />
            </DetailSection>
          </div>
        </div>
      )}
    </div>
  );
};


export default ChatWindow;
