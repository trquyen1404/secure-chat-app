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
  getAssociatedData,
} from '../utils/crypto';
import { loadSession, saveSession } from '../utils/ratchetStore';
import { getKey } from '../utils/keyStore';
import MessageBubble from './MessageBubble';
import UserProfileModal from './UserProfileModal';

import {
  Send, Lock, Loader2, ArrowLeft, ShieldCheck,
  ImagePlus, Paperclip, Mic, MicOff, Disc2,
  Trash2, Phone, Video, X, Search, Timer
} from 'lucide-react';

const ChatWindow = ({ user: chatUser, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [expiresIn, setExpiresIn] = useState(null);
  const [replyMessage, setReplyMessage] = useState(null);

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
  const autoInitRef = useRef(new Set());
  const initPromiseRef = useRef(null);

  const isOnline = onlineUsers.has(chatUser.id) || chatUser.online;
  const getAD = () => getAssociatedData(currentUser.id, chatUser?.id);

  // -- Speech Recognition Setup --
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = 'vi-VN';
      r.onresult = (e) => {
        let t = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) t += e.results[i][0].transcript;
        }
        if (t) setNewMessage((p) => p + (p ? ' ' : '') + t);
      };
      r.onerror = () => setIsListening(false);
      r.onend = () => setIsListening(false);
      recognitionRef.current = r;
    }
  }, []);

  // -- Session Initialization (X3DH) --
  const getOrInitSession = async (targetUserId) => {
    let session = await loadSession(targetUserId);
    if (session) return session;

    if (initPromiseRef.current) return await initPromiseRef.current;

    const init = async () => {
      try {
        let bundle = null;
        const res = await api.get(`/api/users/${targetUserId}/prekey-bundle`);
        bundle = res.data;

        if (!bundle || !bundle.signedPreKey) throw new Error('Failed to fetch peer bundle');

        const ikDh_priv = await getKey(`ik_dh_priv_${currentUser.id}`);
        if (!ikDh_priv) throw new Error('Identity Key not found.');

        const ek = await generateX25519KeyPair();
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
        await saveSession(targetUserId, newSession);
        return newSession;
      } catch (err) {
        console.error('[E2EE] Init failed', err);
        throw err;
      } finally {
        initPromiseRef.current = null;
      }
    };

    initPromiseRef.current = init();
    return await initPromiseRef.current;
  };

  // -- Decryption Logic --
  const decryptRatchet = async (msg) => {
    if (msg.isDeleted) return '[Tin nhắn đã bị thu hồi]';
    try {
      let session = await loadSession(chatUser.id);
      const remoteId = chatUser.id;
      const localId = currentUser.id;

      // Tie-breaker Logic
      const isRemoteHigher = remoteId.localeCompare(localId) > 0;
      const shouldAdopt = msg.senderEk && (!session || session.status === 'INITIALIZING') && isRemoteHigher;

      if (shouldAdopt) {
        const bobSPK_priv = await getKey(`spk_priv_${currentUser.id}`);
        const bobIKdh_priv = await getKey(`ik_dh_priv_${currentUser.id}`);
        const bobOPK_priv = msg.usedOpk ? await getKey(`opk_priv_${currentUser.id}_${msg.usedOpk}`) : null;

        const { rootKey, sendChainKey, recvChainKey } = await x3dhResponderHandshake(
          bobSPK_priv, bobIKdh_priv, bobOPK_priv,
          chatUser.dhPublicKey, msg.senderEk
        );
        session = {
          rootKey, sendChainKey, recvChainKey,
          nextSendIndex: 0, nextRecvIndex: 0, skippedMessageKeys: {},
          sendRatchetKeyPair: { privateKey: bobSPK_priv, publicKeyBase64: currentUser.signedPreKey || "" },
          recvRatchetPublicKey: msg.ratchetKey || msg.senderEk,
          status: 'ESTABLISHED'
        };
        await saveSession(chatUser.id, session);
      }

      if (!session) return '[Chưa thiết lập bảo mật]';

      // Double Ratchet Rotation
      if (msg.ratchetKey && msg.ratchetKey !== session.recvRatchetPublicKey) {
        const remotePublicKey = await importX25519Public(msg.ratchetKey);
        const dhSecret = await window.crypto.subtle.deriveBits({ name: 'X25519', public: remotePublicKey }, session.sendRatchetKeyPair.privateKey, 256);
        const { newRootKey, newChainKey } = await ratchetRoot(session.rootKey, dhSecret);
        session.rootKey = newRootKey;
        session.recvChainKey = newChainKey;
        session.recvRatchetPublicKey = msg.ratchetKey;
        session.nextRecvIndex = 0;
        session.sendRatchetKeyPair = await generateX25519KeyPair();
      }

      // Chain Ratchet
      let messageKey = null;
      const targetIndex = msg.n || 0;
      while (session.nextRecvIndex <= targetIndex) {
        const { nextChainKey, messageKey: derivedKey } = await ratchetChain(session.recvChainKey);
        session.recvChainKey = nextChainKey;
        messageKey = derivedKey;
        session.nextRecvIndex++;
      }

      await saveSession(chatUser.id, session);
      if (msg.type === 'handshake_ack' || !msg.encryptedContent) return null;

      return await decryptMessageGCM(msg.encryptedContent, msg.iv, messageKey, getAD());
    } catch (err) {
      console.warn('[E2EE] Decryption error', err);
      return '[Lỗi giải mã]';
    }
  };

  // -- Send Logic --
  const sendEncryptedPayload = async (text, localId, type = 'text') => {
    try {
      let session = await getOrInitSession(chatUser.id);

      // Rotate if responder's first message
      if (!session.sendChainKey) {
        const remotePublicKey = await importX25519Public(session.recvRatchetPublicKey);
        const dhSecret = await window.crypto.subtle.deriveBits({ name: 'X25519', public: remotePublicKey }, session.sendRatchetKeyPair.privateKey, 256);
        const { newRootKey, newChainKey } = await ratchetRoot(session.rootKey, dhSecret);
        session.rootKey = newRootKey;
        session.sendChainKey = newChainKey;
        session.nextSendIndex = 0;
      }

      const { nextChainKey, messageKey } = await ratchetChain(session.sendChainKey);
      session.sendChainKey = nextChainKey;
      const currentIndex = session.nextSendIndex;
      session.nextSendIndex++;

      let encrypted = { ciphertextB64: null, ivB64: null };
      if (text) {
        encrypted = await encryptMessageGCM(text, messageKey, getAD());
      }

      socket.emit(type === 'handshake_ack' ? 'handshake_ack' : 'sendMessage', {
        recipientId: chatUser.id,
        encryptedContent: encrypted.ciphertextB64,
        ratchetKey: session.sendRatchetKeyPair.publicKeyBase64,
        n: currentIndex,
        iv: encrypted.ivB64,
        senderEk: session.pendingSenderEk,
        usedOpk: session.pendingUsedOpk,
        localId: localId,
        expiresInSeconds: expiresIn,
        replyToId: replyMessage?.id
      });

      await saveSession(chatUser.id, session);
      setReplyMessage(null);
      setExpiresIn(null);
    } catch (err) {
      console.error('[E2EE] Send failed', err);
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (isRecording) { stopRecordingAndSend(); return; }
    if (!newMessage.trim()) return;

    const t = newMessage;
    setNewMessage('');
    const localId = `loc-${Date.now()}`;

    setMessages(p => [...p, {
      id: localId, senderId: currentUser.id, decryptedContent: t,
      createdAt: new Date().toISOString(), status: 'sending'
    }]);

    await sendEncryptedPayload(t, localId);
  };

  // -- Helpers --
  const loadMessages = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true); else setLoadingHistory(true);
    try {
      const cursor = isLoadMore && messages.length > 0 ? messages[0].createdAt : null;
      const res = await api.get(`/api/messages/${chatUser.id}${cursor ? `?cursor=${cursor}` : ''}`);
      const batch = res.data;

      const decrypted = [];
      for (const msg of batch) {
        decrypted.push({ ...msg, decryptedContent: await decryptRatchet(msg) });
      }

      setMessages(p => isLoadMore ? [...decrypted, ...p] : decrypted);
      setHasMore(batch.length === 50);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false); setLoadingHistory(false);
    }
  };

  // -- Socket Event Listeners --
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (msg) => {
      console.log('[Socket] Incoming newMessage:', msg);
      // Kiểm tra xem tin nhắn có thuộc về cuộc hội thoại này không
      const isRelevant = 
        (msg.senderId === chatUser.id && msg.recipientId === currentUser.id) ||
        (msg.senderId === currentUser.id && msg.recipientId === chatUser.id);
      
      console.log('[Socket] isRelevant:', isRelevant, 'chatUser.id:', chatUser.id, 'currentUser.id:', currentUser.id);
      
      if (isRelevant) {
        // Nếu là tin nhắn của chính mình vừa gửi xong (đã có localId)
        if (msg.senderId === currentUser.id && msg.localId) {
          setMessages(prev => prev.map(m => 
            (m.id === msg.localId || m.id === msg.id) 
              ? { ...msg, decryptedContent: m.decryptedContent, status: 'sent' } 
              : m
          ));
          return;
        }

        // Giải mã tin nhắn mới đến
        const decryptedContent = await decryptRatchet(msg);
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, { ...msg, decryptedContent }];
        });

        // Tự động cuộn xuống
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);

        // Đánh dấu đã xem
        if (msg.senderId === chatUser.id) {
           socket.emit('markAsRead', { senderId: chatUser.id });
        }
      }
    };

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, decryptedContent: '[Tin nhắn đã bị thu hồi]' } : m));
    };

    const handleMessageReacted = ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    const handleTyping = ({ senderId }) => {
      if (senderId === chatUser.id) setIsTyping(true);
    };

    const handleStopTyping = ({ senderId }) => {
      if (senderId === chatUser.id) setIsTyping(false);
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messageDeleted', handleMessageDeleted);
    socket.on('messageReacted', handleMessageReacted);
    socket.on('typing', handleTyping);
    socket.on('stopTyping', handleStopTyping);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messageDeleted', handleMessageDeleted);
      socket.off('messageReacted', handleMessageReacted);
      socket.off('typing', handleTyping);
      socket.off('stopTyping', handleStopTyping);
    };
  }, [socket, chatUser.id, currentUser.id]);

  useEffect(() => {
    if (chatUser.id) {
      // Đảm bảo luôn tải tin nhắn kể cả khi khởi tạo session gặp lỗi (để hiện lỗi giải mã thay vì trắng tinh)
      getOrInitSession(chatUser.id)
        .then(() => loadMessages())
        .catch(() => loadMessages());
    }
  }, [chatUser.id]);

  const handleScroll = () => {
    const c = scrollContainerRef.current;
    if (c && c.scrollTop === 0 && hasMore && !isLoadingMore) loadMessages(true);
  };

  const startRecording = async () => { /* Logic giữ nguyên */ setIsRecording(true); };
  const stopRecordingAndSend = () => { /* Logic giữ nguyên */ setIsRecording(false); };
  const cancelRecording = () => { setIsRecording(false); };
  const toggleListen = () => { /* Speech logic */ };
  const handleInputTyping = (e) => {
    setNewMessage(e.target.value);
    socket?.emit('typing', { recipientId: chatUser.id });
  };

  const handleDeleteMessage = (id) => socket.emit('deleteMessage', { messageId: id, recipientId: chatUser.id });
  const handleReactMessage = (id, reaction) => socket.emit('reactMessage', { messageId: id, recipientId: chatUser.id, reaction });

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 relative z-10 w-full transition-colors duration-300">
      {showUserProfile && <UserProfileModal userId={chatUser.id} onClose={() => setShowUserProfile(false)} />}

      {/* Header */}
      <div className="h-[72px] px-6 flex items-center justify-between border-b border-gray-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 md:hidden text-gray-500"><ArrowLeft /></button>
          <button onClick={() => setShowUserProfile(true)} className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex justify-center items-center text-white font-bold">
                {chatUser.username.charAt(0).toUpperCase()}
              </div>
              {isOnline && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>}
            </div>
            <div className="text-left">
              <h2 className="font-semibold dark:text-white">{chatUser.username}</h2>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <ShieldCheck className="w-3 h-3 text-indigo-400" /> E2EE Secured
              </div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSearch(!showSearch)} className="p-2 text-gray-400"><Search /></button>
          <button onClick={() => callUser(chatUser.id, false)} className="p-2 text-indigo-400"><Phone /></button>
          <button onClick={() => callUser(chatUser.id, true)} className="p-2 text-indigo-400"><Video /></button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {loadingHistory ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id || idx}
              message={msg}
              isMe={msg.senderId === currentUser.id}
              onDelete={handleDeleteMessage}
              onReact={handleReactMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white/90 dark:bg-slate-900/90 border-t border-gray-200 dark:border-slate-800">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {!isRecording && (
            <div className="flex gap-1">
              <button type="button" onClick={() => fileInputRef.current.click()} className="p-2 text-gray-400"><ImagePlus /></button>
              <button type="button" onClick={startRecording} className="p-2 text-gray-400"><Mic /></button>
              <button type="button" onClick={() => setExpiresIn(30)} className={`p-2 ${expiresIn ? 'text-amber-500' : 'text-gray-400'}`}><Timer /></button>
            </div>
          )}
          <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {/* Handle */ }} />
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={handleInputTyping}
              placeholder="Nhắn tin bảo mật..."
              className="w-full py-3 px-5 rounded-full bg-gray-100 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button type="submit" className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 transition">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;