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
  deleteSession,
  searchMessages,
  deleteDecryptedMessage
} from '../utils/ratchetStore';
import { getKey } from '../utils/keyStore';
import { saveMySenderKey, loadMySenderKey, saveTheirSenderKey, loadTheirSenderKey } from '../utils/senderKeyStore';
import MessageBubble from './MessageBubble';
import {
  Phone, Video, CornerUpLeft, X, Info, ChevronRight, ChevronDown, User, Bell, Search, PlusCircle, Smile, ThumbsUp, Pin, Settings, Type, Image, FileText, BellOff, MessageCircle, Clock, Eye, Shield, Ban, UserMinus, AlertCircle, Trash2, Lock, ClipboardCheck, BookOpen, BarChart3, Folder, Megaphone, FileEdit, GraduationCap, Brain, Palette, Timer, Trophy, Users as UsersIcon, Ghost, ShoppingBag, Coffee, Package, Briefcase, Contact, LayoutGrid
} from 'lucide-react';
import AttendanceModal from './AttendanceModal';
import AssignmentModal from './AssignmentModal';
import CreatePollModal from './CreatePollModal';
import ResourceLibraryModal from './ResourceLibraryModal';
import AnnouncementModal from './AnnouncementModal';
import CollaborativeNotes from './CollaborativeNotes';
import StudyPartnerFinder from './StudyPartnerFinder';
import Gradebook from './Gradebook';
import FlashcardModal from './FlashcardModal';
import WhiteboardModal from './WhiteboardModal';
import ExamSimulatorModal from './ExamSimulatorModal';
import LeaderboardModal from './LeaderboardModal';
import PomodoroModal from './PomodoroModal';
import MarketplaceModal from './MarketplaceModal';
import ConfessionModal from './ConfessionModal';
import LostFoundModal from './LostFoundModal';
import JobPortalModal from './JobPortalModal';
import ClubHubModal from './ClubHubModal';
import StudentCardModal from './StudentCardModal';
import SuperHubModal from './SuperHubModal';

import { StickerPicker, GifPicker } from './MediaPickers';

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

const DetailAction = ({ icon, label, subLabel, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--hover)] transition-colors text-left group ${danger ? 'text-red-500' : ''}`}
  >
    <div className={`w-8 h-8 shrink-0 flex items-center justify-center ${danger ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className={`text-[14px] font-medium truncate ${danger ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{label}</p>
      {subLabel && <p className="text-[11px] text-[var(--text-secondary)] truncate">{subLabel}</p>}
    </div>
  </button>
);

const formatLastSeen = (date) => {
  if (!date) return 'Ngoại tuyến';
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa mới hoạt động';
  if (mins < 60) return `Hoạt động ${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hoạt động ${hours} giờ trước`;
  return `Hoạt động ngày ${d.toLocaleDateString()}`;
};

const ChatWindow = ({ user: chatUser, onClose, showDetail, onToggleDetail }) => {
  const [messages, setMessages] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [readStatus, setReadStatus] = useState([]);
  const [groupMetadata, setGroupMetadata] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { token, user: currentUser, masterKey, identityKeys, loading } = useAuth() || {};
  const socketContext = useSocket() || {};
  const { socket, onlineUsers = new Map() } = socketContext;
  const callContext = useCall() || {};
  const { callUser = () => { } } = callContext;

  const [typingUsers, setTypingUsers] = useState(new Set());
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [isAnnOpen, setIsAnnOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isStudyOpen, setIsStudyOpen] = useState(false);
  const [isGradesOpen, setIsGradesOpen] = useState(false);
  const [isFlashOpen, setIsFlashOpen] = useState(false);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [isExamOpen, setIsExamOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [isConfessionOpen, setIsConfessionOpen] = useState(false);
  const [isLostOpen, setIsLostOpen] = useState(false);
  const [isJobsOpen, setIsJobsOpen] = useState(false);
  const [isClubsOpen, setIsClubsOpen] = useState(false);
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showQuickEmojiPicker, setShowQuickEmojiPicker] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [openSections, setOpenSections] = useState({
    info: true,
    custom: true,
    media: true,
    admin: true,
    pins: true,
    privacy: true
  });

  const [themeColor, setThemeColor] = useState('#f47920');
  const [quickEmoji, setQuickEmoji] = useState('👍');
  const [selfDestructTime, setSelfDestructTime] = useState(0);
  const [nicknames, setNicknames] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [burnOnRead, setBurnOnRead] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastTypingEmitRef = useRef(0);

  const presence = (chatUser?.id || chatUser?._id) ? onlineUsers.get(chatUser.id || chatUser._id) : null;
  const isOnline = presence ? presence.online : chatUser?.online;
  const lastSeenAt = presence ? presence.lastSeenAt : chatUser?.lastSeenAt;
  const isSocketConnected = socket?.connected;

  const isTeacher = !!(chatUser?.isGroup && currentUser?.id && (
    groupMetadata?.members?.find(m => String(m.userId || m.id) === String(currentUser?.id))?.role === 'admin' ||
    String(chatUser?.createdBy || '') === String(currentUser?.id)
  ));

  const isMutedForMe = chatUser?.isGroup && groupMetadata?.isMuted && !isTeacher;

  useEffect(() => {
    if (groupMetadata?.themeColor) setThemeColor(groupMetadata.themeColor);
    if (groupMetadata?.quickEmoji) setQuickEmoji(groupMetadata.quickEmoji);
    if (groupMetadata?.selfDestructTimer !== undefined) setSelfDestructTime(groupMetadata.selfDestructTimer);
    if (groupMetadata?.isMuted !== undefined) setIsMuted(groupMetadata.isMuted);
  }, [groupMetadata]);

  const toggleSection = (section) => setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));

  const handleTyping = () => {
    if (!socket) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 3000) {
      if (chatUser.isGroup) socket.emit('groupTyping', { groupId: chatUser.id });
      else socket.emit('typing', { recipientId: chatUser.id });
      lastTypingEmitRef.current = now;
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (chatUser.isGroup) socket.emit('groupStopTyping', { groupId: chatUser.id });
      else socket.emit('stopTyping', { recipientId: chatUser.id });
      lastTypingEmitRef.current = 0;
    }, 3000);
  };

  useEffect(() => {
    if (!isLoadingMore) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers.size, isLoadingMore]);

  const fetchGroupMetadata = async () => {
    const res = await api.get(`/api/groups/${chatUser.id}`);
    setGroupMetadata(res.data);
    socket?.emit('joinGroup', { groupId: chatUser.id });
  };

  const loadMessages = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true); else setLoadingHistory(true);
    try {
      const cursor = isLoadMore && messages.length > 0 ? messages[0].createdAt : null;
      const url = chatUser.isGroup
        ? `/api/groups/${chatUser.id}/messages${cursor ? `?cursor=${cursor}` : ''}`
        : `/api/messages/${chatUser.id}${cursor ? `?cursor=${cursor}` : ''}`;
      const res = await api.get(url);
      const batch = res.data;
      if (batch.length < 50) setHasMore(false);

      const decrypted = [];
      for (const msg of batch) {
        let content = await getDecryptedMessage(msg.id, masterKey) || (msg.localId ? await getDecryptedMessage(msg.localId, masterKey) : null);
        if (!content || content.startsWith('[Chờ')) {
          try {
            if (chatUser.isGroup) {
              content = (await processGroupMessage(msg, masterKey, currentUser, chatUser.id)).content;
            } else {
              const sess = await loadSession(chatUser.id, masterKey);
              let decrypted = sess ? await decryptHistoricalMessage(msg, masterKey, sess) : null;
              if (!decrypted && msg.senderId !== currentUser.id) {
                const result = await processIncomingMessage(msg, masterKey, currentUser, chatUser);
                decrypted = result.content;
                
                if (result.success && result.content && msg.type === 'SENDER_KEY_DISTRIBUTION') {
                  try {
                    const dist = JSON.parse(result.content);
                    await saveTheirSenderKey(dist.groupId, msg.senderId, {
                      chainKeyB64: dist.chainKeyB64,
                      signaturePublicKeyB64: dist.signaturePublicKeyB64,
                      index: 0
                    }, masterKey);
                    console.log(`[E2EE-History] ✅ Restored Sender Key from ${msg.senderId} for group ${dist.groupId}.`);
                  } catch (e) {
                    console.error('[E2EE-History] Malformed SENDER_KEY_DISTRIBUTION in history', e);
                  }
                }
              }
              content = decrypted || '[Mã hóa]';
            }
          } catch { content = '[Lỗi giải mã]'; }
        }
        const member = groupMetadata?.members?.find(m => m.userId === msg.senderId);
        const isBurn = msg.type === 'burn' || msg.burnOnRead;
        
        if (isBurn && msg.senderId !== currentUser.id) {
          // Xóa khỏi local IndexedDB của người nhận
          deleteDecryptedMessage(msg.id).catch(e => console.error('[ChatWindow] Failed to delete burn message:', e));
          
          // Báo server xóa vĩnh viễn tin nhắn tự hủy
          if (chatUser?.isGroup) {
            socket?.emit('deleteGroupMessage', { messageId: msg.id, groupId: chatUser.id });
          } else {
            socket?.emit('deleteMessage', { messageId: msg.id, recipientId: msg.senderId });
          }
        }

        decrypted.push({
          ...msg,
          decryptedContent: content || '[Mã hóa]',
          burnOnRead: isBurn || msg.burnOnRead,
          senderName: member?.User?.username || 'Người dùng',
          status: msg.senderId === currentUser?.id ? 'sent' : 'received'
        });
      }
      if (isLoadMore) setMessages(p => [...decrypted, ...p].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
      else setMessages(decrypted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    } finally { setIsLoadingMore(false); setLoadingHistory(false); }
  };

  useEffect(() => {
    if (chatUser?.id && token && !loading && masterKey) {
      if (chatUser.isGroup) fetchGroupMetadata().then(() => loadMessages());
      else loadMessages();
    }
  }, [chatUser?.id, token, loading, masterKey]);

  useEffect(() => {
    if (!chatUser?.id || !masterKey) return;
    const handleKeyReceived = (e) => {
      if (chatUser.isGroup && e.detail.groupId === chatUser.id) {
        console.log(`[ChatWindow] Sender key received for group ${chatUser.id}. Reloading messages...`);
        loadMessages();
      }
    };
    const handleSessionUpdated = (e) => {
      if (!chatUser.isGroup && e.detail.userId === chatUser.id) {
        console.log(`[ChatWindow] Session updated for ${chatUser.id}. Reloading messages...`);
        loadMessages();
      }
    };
    const handleMessageSynced = (e) => {
      const msg = e.detail;
      const targetId = msg.groupId || (msg.senderId === currentUser?.id ? msg.recipientId : msg.senderId);
      if (targetId === chatUser.id) {
        console.log(`[ChatWindow] Message synced for active chat. Updating state...`);
        setMessages(prev => {
          const exists = prev.some(m => m.id === msg.id || (m.localId && m.localId === msg.localId));
          if (exists) {
            return prev.map(m => {
              if (m.id === msg.id || (m.localId && m.localId === msg.localId)) {
                return { ...m, decryptedContent: msg.decryptedContent };
              }
              return m;
            });
          } else {
            const member = groupMetadata?.members?.find(m => m.userId === msg.senderId);
            const isBurn = msg.type === 'burn' || msg.burnOnRead;
            const newMsg = {
              ...msg,
              decryptedContent: msg.decryptedContent,
              burnOnRead: isBurn,
              senderName: member?.User?.username || 'Người dùng',
              status: msg.senderId === currentUser?.id ? 'sent' : 'received'
            };
            return [...prev, newMsg].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          }
        });
      }
    };


    window.addEventListener('senderkey_received', handleKeyReceived);
    window.addEventListener('session_updated', handleSessionUpdated);
    window.addEventListener('e2ee_message_synced', handleMessageSynced);
    return () => {
      window.removeEventListener('senderkey_received', handleKeyReceived);
      window.removeEventListener('session_updated', handleSessionUpdated);
      window.removeEventListener('e2ee_message_synced', handleMessageSynced);
    };
  }, [chatUser?.id, masterKey, currentUser?.id]);

  const encryptAndSendOneToOne = async (recipientId, text, type = 'text', extra = {}) => {
    let sess = await loadSession(recipientId, masterKey);
    let firstEkB64 = null;
    let firstOpkB64 = null;
    if (!sess) {
      const bundle = (await api.get(`/api/users/${recipientId}/prekey-bundle`)).data;
      const ikDh = identityKeys?.dh || await getKey(`ik_dh_priv_${currentUser.id}`, masterKey);
      const ek = await generateX25519KeyPair();
      const { rootKey, sendChainKey, recvChainKey } = await x3dhInitiatorHandshake(
        ikDh, 
        ek.privateKey, 
        bundle.identityKey.sign, 
        bundle.identityKey.dh, 
        bundle.signedPreKey.publicKey, 
        bundle.signedPreKey.signature, 
        bundle.oneTimePreKey?.publicKey
      );
      sess = { rootKey, sendChainKey, recvChainKey, nextSendIndex: 0, nextRecvIndex: 0, sendRatchetKeyPair: await generateX25519KeyPair(), status: 'ACTIVE' };
      await saveSession(recipientId, sess, masterKey);
      firstEkB64 = ek.publicKeyBase64;
      firstOpkB64 = bundle.oneTimePreKey?.publicKey || null;
    }
    const { nextChainKey, messageKey } = await ratchetChain(sess.sendChainKey);
    sess.sendChainKey = nextChainKey;
    const enc = await encryptMessageGCM(text, messageKey, getAssociatedData(currentUser.id, recipientId));
    const messageIndex = sess.nextSendIndex;
    sess.nextSendIndex += 1;
    await saveSession(recipientId, sess, masterKey);
    socket.emit('sendMessage', { 
      recipientId, 
      encryptedContent: enc.ciphertextB64, 
      iv: enc.ivB64, 
      ratchetKey: sess.sendRatchetKeyPair.publicKeyBase64, 
      n: messageIndex, 
      type,
      senderEk: firstEkB64,
      usedOpk: firstOpkB64,
      ...extra
    });
  };

  const handleSendMessage = async (e, forcedText = null) => {
    if (e) e.preventDefault();
    const t = forcedText || newMessage;
    if (!t.trim()) return;
    const localId = `local-${Date.now()}`;
    const tempMsg = { id: localId, localId, decryptedContent: t, senderId: currentUser.id, createdAt: new Date().toISOString(), status: 'sending' };
    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');

    try {
      if (chatUser.isGroup) {
        let sk = await loadMySenderKey(chatUser.id, masterKey);
        if (!sk) {
          const newChain = await createSenderKeyChain(); sk = { ...newChain, index: 0 };
          await saveMySenderKey(chatUser.id, sk, masterKey);
          const payload = JSON.stringify({ groupId: chatUser.id, chainKeyB64: sk.chainKeyB64, signaturePublicKeyB64: sk.signaturePublicKeyB64 });
          
          let currentMetadata = groupMetadata;
          if (!currentMetadata) {
            try {
              const res = await api.get(`/api/groups/${chatUser.id}`);
              currentMetadata = res.data;
              setGroupMetadata(currentMetadata);
            } catch (err) {
              console.error('Failed to fetch group metadata during send:', err);
            }
          }
          
          if (currentMetadata && currentMetadata.members) {
            for (const m of currentMetadata.members.filter(m => m.userId !== currentUser.id)) {
               await encryptAndSendOneToOne(m.userId, payload, 'SENDER_KEY_DISTRIBUTION');
            }
          }
        }
        const enc = await encryptGroupMessage(t, sk.chainKeyB64, sk.signaturePrivateKey, sk.index, chatUser.id);
        await saveMySenderKey(chatUser.id, { ...sk, chainKeyB64: enc.nextChainKeyB64, index: sk.index + 1 }, masterKey);
        socket.emit('sendGroupMessage', { 
          groupId: chatUser.id, 
          encryptedContent: enc.ciphertextB64, 
          iv: enc.ivB64, 
          index: enc.index, 
          signature: enc.signature, 
          localId, 
          type: burnOnRead ? 'burn' : 'text',
          burnOnRead
        });
      } else {
        await encryptAndSendOneToOne(chatUser.id, t, burnOnRead ? 'burn' : 'text', { localId, burnOnRead });
      }
      if (!burnOnRead) {
        await saveDecryptedMessage(localId, { text: t, senderId: currentUser.id, timestamp: new Date().toISOString() }, masterKey);
      }
    } catch (err) {
      console.error('Send Error:', err);
      if (err.response?.status === 404) {
        alert('Không thể gửi tin nhắn: Người dùng này không tồn tại hoặc đã bị xóa khỏi hệ thống. Vui lòng làm mới danh sách bạn bè.');
        try {
          await deleteSession(chatUser.id);
        } catch (e) {}
      }
    }
  };

  if (!chatUser || !currentUser) return <div className="flex-1 flex items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-row h-full w-full overflow-hidden bg-[var(--bg-primary)]">
      {/* 1. MAIN CHAT CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative border-r border-[var(--border)]">

        {/* Header */}
        <div className="h-[72px] glass flex items-center justify-between px-6 border-b border-[var(--border)] shrink-0 z-20">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[var(--bg-accent)] flex items-center justify-center overflow-hidden border border-[var(--border)]">
              {chatUser.avatarUrl ? <img src={chatUser.avatarUrl} className="w-full h-full object-cover" /> : <span className="text-lg font-bold">{(chatUser.displayName || chatUser.username || '?').charAt(0).toUpperCase()}</span>}
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold truncate">{chatUser.displayName || chatUser.username}</h2>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">{chatUser.isGroup ? `${groupMetadata?.members?.length || 0} thành viên` : (isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsHubOpen(true)} className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20"><LayoutGrid className="w-5 h-5" /></button>
            <button onClick={() => setIsSearching(!isSearching)} className="w-10 h-10 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center"><Search className="w-5 h-5" /></button>
            <button onClick={onToggleDetail} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${showDetail ? 'bg-indigo-500 text-white' : 'hover:bg-[var(--hover)] text-[var(--text-secondary)]'}`}><Info className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Messages List */}
        <div ref={scrollContainerRef} onScroll={(e) => e.target.scrollTop === 0 && hasMore && loadMessages(true)} className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar">
          {messages.map((msg) => (
            <MessageBubble key={msg.id || msg.localId} message={msg} isMe={msg.senderId === currentUser.id} themeColor={themeColor} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 shrink-0 z-10">
          <div className="glass rounded-[28px] p-2 premium-shadow border border-[var(--border)]">
            <form onSubmit={handleSendMessage} className="flex items-end gap-2 px-2 py-1">
              <div className="flex items-center gap-1 mb-1">
                <button type="button" className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-indigo-500 rounded-xl"><Image className="w-5 h-5" /></button>
                <button type="button" className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-indigo-500 rounded-xl"><FileText className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 min-w-0 bg-[var(--input-bg)] rounded-2xl flex items-end border border-transparent focus-within:border-indigo-500/30 relative">
                {burnOnRead && (
                  <div className="absolute -top-10 left-0 right-0 flex justify-center animate-bounce">
                    <div className="bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg flex items-center gap-1 uppercase tracking-widest">
                      <Clock className="w-3 h-3" /> Chế độ tự hủy đang bật
                    </div>
                  </div>
                )}
                <textarea
                  className="w-full bg-transparent p-3 outline-none text-[15px] resize-none max-h-32 min-h-[44px] no-scrollbar"
                  placeholder={burnOnRead ? "Tin nhắn sẽ tự hủy sau khi xem..." : "Nhập tin nhắn..."}
                  rows={1}
                  value={newMessage}
                  onChange={(e) => { setNewMessage(e.target.value); handleTyping(); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                />
                <div className="flex items-center">
                  <button 
                    type="button" 
                    onClick={() => setBurnOnRead(!burnOnRead)} 
                    className={`w-10 h-10 flex items-center justify-center transition-all ${burnOnRead ? 'text-orange-500 scale-125' : 'text-[var(--text-secondary)] hover:text-orange-500'}`}
                    title="Bật/Tắt tin nhắn tự hủy"
                  >
                    <Ghost className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)]"><Smile className="w-5 h-5" /></button>
                </div>
              </div>
              <button type="submit" className="w-11 h-11 premium-gradient rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all"><ChevronRight className="w-6 h-6" /></button>
            </form>
          </div>
        </div>
      </div>

      {/* 2. DETAIL SIDEBAR */}
      {showDetail && (
        <div className="w-[340px] h-full bg-[var(--bg-secondary)] border-l border-[var(--border)] shrink-0 z-30 animate-fade-in overflow-y-auto no-scrollbar">
          <div className="p-8 flex flex-col items-center border-b border-[var(--border)] relative bg-gradient-to-b from-indigo-500/5 to-transparent">
            <button onClick={onToggleDetail} className="absolute top-4 right-4 p-2 hover:bg-[var(--hover)] rounded-xl"><X className="w-5 h-5" /></button>
            <div className="w-20 h-20 rounded-[32px] bg-[var(--bg-accent)] flex items-center justify-center overflow-hidden mb-4 shadow-xl border-4 border-white dark:border-zinc-800">
              {chatUser.avatarUrl ? <img src={chatUser.avatarUrl} className="w-full h-full object-cover" /> : <span className="text-2xl font-bold">{(chatUser.displayName || chatUser.username || '?').charAt(0).toUpperCase()}</span>}
            </div>
            <h3 className="text-lg font-black text-[var(--text-primary)]">{chatUser.displayName || chatUser.username}</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{chatUser.isGroup ? 'Nhóm lớp học' : (isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}</p>
          </div>

          <div className="p-4 space-y-4">
            <DetailSection title="Thông tin về đoạn chat" isOpen={openSections.info} onToggle={() => toggleSection('info')}>
              <DetailAction icon={<Pin className="w-4 h-4" />} label="Xem tin nhắn đã ghim" subLabel="0 tin nhắn" />
            </DetailSection>
            <DetailSection title="Tùy chỉnh đoạn chat" isOpen={openSections.custom} onToggle={() => toggleSection('custom')}>
              <div className="px-3 py-2">
                <p className="text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase">Màu chủ đề</p>
                <div className="flex gap-2">
                  {['#f47920', '#0054a6', '#4caf50', '#e91e63', '#9c27b0'].map(c => <button key={c} className="w-6 h-6 rounded-full" style={{ backgroundColor: c }} onClick={() => setThemeColor(c)} />)}
                </div>
              </div>
            </DetailSection>
            {chatUser.isGroup && (
              <div className="mx-3 p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                <p className="text-[10px] font-black text-indigo-500 uppercase mb-2">Mã mời tham gia</p>
                <code className="text-xl font-black text-indigo-500 block text-center mb-3 tracking-tighter">{groupMetadata?.inviteCode || 'N/A'}</code>
                <button className="w-full py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20">Sao chép mã</button>
              </div>
            )}
          </div>
        </div>
      )}

      {isHubOpen && <SuperHubModal onClose={() => setIsHubOpen(false)} />}
    </div>
  );
};

export default ChatWindow;