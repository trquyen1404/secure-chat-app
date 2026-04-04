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
import { loadSession, saveSession } from '../utils/ratchetStore';
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

  const getAD = () => getAssociatedData(currentUser.id, chatUser?.id);

  const getOrInitSession = async (targetUserId) => {
    let session = await loadSession(targetUserId);
    if (session) return session;

    if (initPromiseRef.current) {
      console.log('[Gating] Waiting for ongoing handshake promise...');
      return await initPromiseRef.current;
    }

    const init = async () => {
      try {
        console.log(`[X3DH-Audit] Initiator (Alice) Start`);
        
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
        
        console.log(`[X3DH-Audit] Bob IK_pub (Remote) raw: ${chatUser.publicKey}`);
        console.log(`[X3DH-Audit] Bob SPK_pub (Remote) raw: ${bundle.signedPreKey.publicKey}`);
        
        const username = currentUser.username;
        const ikDh_priv = await getKey(`ik_dh_priv_${username}`);
        if (!ikDh_priv) throw new Error('Identity Key not found. Please re-login.');

        const ek = await generateX25519KeyPair();
        console.log(`[X3DH-Audit] Alice EK_pub (Self) raw: ${await exportX25519Base64(ek.publicKey)}`);
        
        const { rootKey, sendChainKey, recvChainKey } = await x3dhInitiatorHandshake(
          ikDh_priv, ek.privateKey,
          chatUser.publicKey,
          chatUser.dhPublicKey,
          bundle.signedPreKey.publicKey,
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
        console.log('[E2EE] Initiator Session initialized with Peer-SPK expectation.');
        await saveSession(targetUserId, newSession);
        return newSession;
      } catch (err) {
        console.error('[E2EE] Handshake init failed', err);
        throw err;
      } finally {
        initPromiseRef.current = null;
      }
    };

    initPromiseRef.current = init();
    return await initPromiseRef.current;
  };

  const decryptRatchet = async (msg) => {
    if (msg.isDeleted) return '[Message revoked]';
    try {
      console.log('[E2EE] Processing incoming encrypted message...');

      // 0. Wait for ongoing handshake if any
      if (initPromiseRef.current) {
        console.log('[E2EE] Decryption paused, waiting for handshake promise...');
        await initPromiseRef.current;
      }

      let session = await loadSession(chatUser.id);
      const remoteId = chatUser.id || '';
      const localId = currentUser.id || '';
      const isRemoteHigher = remoteId.localeCompare(localId) > 0;
      const isSameUser = remoteId === localId;
      const hasLocalInitiatedOnly = !session || (session && session.nextRecvIndex === 0);
      const shouldAdoptHandshake = msg.senderEk && !isSameUser && hasLocalInitiatedOnly && (isRemoteHigher || !session);
      
      console.log(`[E2EE-Forensic] ID Comp: Remote=${remoteId.slice(0,8)}, Local=${localId.slice(0,8)}, Result: isRemoteHigher=${isRemoteHigher}`);
      console.log(`[E2EE-Trace] Adoption Matrix: msg.ek=${!!msg.senderEk}, localOnly=${hasLocalInitiatedOnly}, shouldAdopt=${shouldAdoptHandshake}`);

      if (shouldAdoptHandshake) {
        console.log(`[E2EE] Tie-breaker: ${isRemoteHigher ? 'Remote wins' : 'Initializing'} responder session...`);
        const username = currentUser.username;
        const bobSPK_priv = await getKey(`spk_priv_${username}`);
        const bobIKdh_priv = await getKey(`ik_dh_priv_${username}`);
        const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${username}_${msg.usedOpk}`) : null;
        if (!bobSPK_priv || !bobIKdh_priv) return null;

        const { rootKey, sendChainKey, recvChainKey } = await x3dhResponderHandshake(
          bobSPK_priv, bobIKdh_priv, bobOPK_priv,
          chatUser.dhPublicKey, msg.senderEk
        );
        session = {
          rootKey, sendChainKey, recvChainKey,
          nextSendIndex: 0, nextRecvIndex: msg.n || 0, skippedMessageKeys: {},
          sendRatchetKeyPair: { privateKey: bobSPK_priv, publicKeyBase64: currentUser.signedPreKey || "" },
          recvRatchetPublicKey: msg.ratchetKey || msg.senderEk, 
          pendingSenderEk: null, status: 'ESTABLISHED'
        };
        console.log('[E2EE] Responder Session initialized with Lockdown Alignment.');
        await saveSession(chatUser.id, session);
        sendEncryptedPayload(null, null, 'handshake_ack');
        // fall through to decryption logic instead of returning null
      } else if (msg.senderEk && session && session.status === 'INITIALIZING') {
        if (isRemoteHigher) {
             console.log("[E2EE] I lost the race (Lower ID). Adopting remote handshake...");
             const username = currentUser.username;
             const bobSPK_priv = await getKey(`spk_priv_${username}`);
             const bobIKdh_priv = await getKey(`ik_dh_priv_${username}`);
             const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${username}_${msg.usedOpk}`) : null;
             if (!bobSPK_priv || !bobIKdh_priv) return null;

             const { rootKey, sendChainKey, recvChainKey } = await x3dhResponderHandshake(
                bobSPK_priv, bobIKdh_priv, bobOPK_priv,
                chatUser.dhPublicKey, msg.senderEk
             );
             session = {
                rootKey, sendChainKey, recvChainKey,
                nextSendIndex: 0, nextRecvIndex: msg.n || 0, skippedMessageKeys: {},
                sendRatchetKeyPair: { privateKey: bobSPK_priv, publicKeyBase64: currentUser.signedPreKey || "" },
                recvRatchetPublicKey: msg.ratchetKey || msg.senderEk, 
                pendingSenderEk: null, status: 'ESTABLISHED'
             };
             console.log('[E2EE] Responder Session established via Adoption.');
             await saveSession(chatUser.id, session);
             // fall through to decryption
        } else {
             console.log(`[E2EE] Winner Alignment: Peer ${remoteId.slice(0,8)} is responding. Transitioning to ESTABLISHED.`);
             session.status = 'ESTABLISHED';
             session.nextRecvIndex = msg.n || 0;
             session.nextSendIndex = 0; 
             await saveSession(chatUser.id, session);
             // fall through to decryption
        }
      }
      if (!session) return '[Secure Session Not Established]';
      const isInitialMessage = !!msg.senderEk;
      const isRotationRequested = msg.ratchetKey && msg.ratchetKey !== session.recvRatchetPublicKey;
      if (!isInitialMessage && isRotationRequested) {
        const remotePublicKey = await importX25519Public(msg.ratchetKey);
        const dhSecret = await window.crypto.subtle.deriveBits({ name: 'X25519', public: remotePublicKey }, session.sendRatchetKeyPair.privateKey, 256);
        const { newRootKey, newChainKey } = await ratchetRoot(session.rootKey, dhSecret);
        session.rootKey = newRootKey; session.recvChainKey = newChainKey;
        session.recvRatchetPublicKey = msg.ratchetKey; session.nextRecvIndex = 0;
        session.sendRatchetKeyPair = await generateX25519KeyPair();
        await saveSession(chatUser.id, session);
      }
      let messageKey = null;
      const targetIndex = msg.n || 0;
      let safetyCount = 0;
      while (session.nextRecvIndex <= targetIndex && safetyCount < 100) {
        const { nextChainKey, messageKey: derivedKey } = await ratchetChain(session.recvChainKey);
        session.recvChainKey = nextChainKey; messageKey = derivedKey;
        if (session.nextRecvIndex < targetIndex) {
          session.skippedMessageKeys[`${session.recvRatchetPublicKey}_${session.nextRecvIndex}`] = derivedKey; 
          console.log(`[E2EE] Skipping & Storing Key for index: ${session.nextRecvIndex}`);
        }
        session.nextRecvIndex++; safetyCount++;
      }
      if (!messageKey) {
        const k = `${session.recvRatchetPublicKey}_${targetIndex}`;
        messageKey = session.skippedMessageKeys[k];
        if (messageKey) delete session.skippedMessageKeys[k];
        else throw new Error(`Message key recovery failed for index ${targetIndex}`);
      }
      await saveSession(chatUser.id, session);
      if (msg.type === 'handshake_ack') {
        return null;
      }
      if (!msg.encryptedContent) return null;
      try {
        const ad = getAD();
        const decrypted = await decryptMessageGCM(msg.encryptedContent, msg.iv, messageKey, ad);
        return decrypted;
      } catch (err) {
        if (msg.senderId === chatUser.id && msg.senderEk) {
          console.warn('[E2EE] Discarded orphan handshake from conflict. Syncing...');
          return '[Syncing Session...]'; 
        }
        throw err;
      }
    } catch (err) {
      if (err.name !== 'OperationError') console.error('[decryptRatchet]', err);
      if (msg.senderEk) return null; 
      return '[Decryption error]';
    } finally {
    }
  };

  const loadMessages = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else setLoadingHistory(true);
    try {
      const cursor = isLoadMore && messages.length > 0 ? messages[0].createdAt : null;
      const res = await api.get(`/api/messages/${chatUser.id}${cursor ? `?cursor=${cursor}` : ''}`);
      const batch = res.data;
      if (batch.length < 50) setHasMore(false);

      const decrypted = [];
      for (const msg of batch) {
        decrypted.push({
          ...msg, 
          decryptedContent: await decryptRatchet(msg)
        });
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
    const onMsg = async (msg) => {
      if (msg.senderId === currentUser.id) {
        if (msg.localId) {
          setMessages((p) => p.map(m => m.id === msg.localId ? { ...m, id: msg.id, status: 'sent' } : m));
        }
        return;
      }

      if (
        (msg.senderId === chatUser.id && msg.recipientId === currentUser.id)
      ) {
        const content = await decryptRatchet(msg);
        if (content !== null) {
          setMessages((p) => [...p, { ...msg, decryptedContent: content, status: 'received' }]);
          setIsTyping(false);
          socket.emit('markAsRead', { senderId: chatUser.id });
        }
      }
    };
    const onTyping = ({ senderId }) => { if (senderId === chatUser.id) setIsTyping(true); };
    const onStop = ({ senderId }) => { if (senderId === chatUser.id) setIsTyping(false); };
    const onDel = ({ messageId }) => setMessages((p) => p.map((m) => m.id === messageId ? { ...m, isDeleted: true, decryptedContent: '[Message revoked]' } : m));
    const onReact = ({ messageId, reactions }) => setMessages((p) => p.map((m) => m.id === messageId ? { ...m, reactions } : m));
    const onRead = ({ byUserId }) => { if (byUserId === chatUser.id) setMessages((p) => p.map((m) => (!m.readAt && m.senderId === currentUser.id) ? { ...m, readAt: new Date().toISOString() } : m)); };
    socket.on('newMessage', onMsg);
    socket.on('typing', onTyping);
    socket.on('stopTyping', onStop);
    socket.on('messageDeleted', onDel);
    socket.on('messageReacted', onReact);
    socket.on('messagesRead', onRead);
    return () => {
      socket.off('newMessage', onMsg);
      socket.off('typing', onTyping);
      socket.off('stopTyping', onStop);
      socket.off('messageDeleted', onDel);
      socket.off('messageReacted', onReact);
      socket.off('messagesRead', onRead);
    };
  }, [socket, chatUser, currentUser.id]);

  const sendEncryptedPayload = async (text, localId, type = 'text') => {
    try {
      let session = await getOrInitSession(chatUser.id);
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
      
      console.log(`[E2EE] Encrypting message with sender index: ${currentIndex}`);
      
      let ciphertextB64 = null, ivB64 = null;
      if (text !== null && text !== undefined) {
        const ad = getAD();
        const encrypted = await encryptMessageGCM(text, messageKey, ad);
        ciphertextB64 = encrypted.ciphertextB64; ivB64 = encrypted.ivB64;
      }

      // Restore handshake metadata for self-healing
      const senderEk = session.pendingSenderEk || null;
      const usedOpk = session.pendingUsedOpk || null;

      // 2. Transmit
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
      console.error('[sendEncryptedPayload]', err);
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
    setMessages((p) => [...p, optimisticMsg]);
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
      isHandshakingRef.current = true;
      autoInitRef.current.add(chatUser.id);

      try {
        const existing = await loadSession(chatUser.id);
        if (!existing) {
          console.log(`[E2EE] Proactively negotiating silent session with ${chatUser.id}...`);
          await sendEncryptedPayload(null, `init-${Date.now()}`);
        }
      } catch (e) { 
        console.warn('[E2EE] Auto-init failed', e); 
        autoInitRef.current.delete(chatUser.id);
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
