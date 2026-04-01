import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useCall } from '../context/CallContext';
import { generateAESKey, encryptMessageAES, encryptKeyRSA, decryptKeyRSA, decryptMessageAES } from '../utils/crypto';
import MessageBubble from './MessageBubble';
import { Send, Lock, Loader2, ArrowLeft, ShieldCheck, ImagePlus, Paperclip, Mic, MicOff, Disc2, Trash2, Phone, Video, CornerUpLeft, X } from 'lucide-react';

const ChatWindow = ({ user: chatUser, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  // Pagination States
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Voice & STT States
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Phase 4 States
  const [replyMessage, setReplyMessage] = useState(null);

  const { token, user: currentUser, privateKey } = useAuth();
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
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'vi-VN';

      recognition.onresult = (event) => {
        let finalTrans = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTrans += event.results[i][0].transcript;
          }
        }
        if (finalTrans) {
          setNewMessage((prev) => prev + (prev ? " " : "") + finalTrans);
        }
      };

      recognition.onerror = (e) => {
        console.error('Speech recognition error', e.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
         setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  // Only scroll to bottom on initial load or new message, not on infinite scroll
  useEffect(() => {
    if (!isLoadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isLoadingMore]);

  const loadMessages = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else setLoadingHistory(true);
    
    try {
      const cursor = isLoadMore && messages.length > 0 ? messages[0].createdAt : null;
      const res = await api.get(`/api/messages/${chatUser.id}${cursor ? `?cursor=${cursor}` : ''}`);
      
      const newBatch = res.data;
      if (newBatch.length < 50) setHasMore(false);

      const decryptedMessages = await Promise.all(newBatch.map(async (msg) => {
        if (msg.isDeleted) return { ...msg, decryptedContent: '[Tin nhắn đã bị thu hồi]' };
        try {
          if (!privateKey) return { ...msg, decryptedContent: '[Chưa mở khóa thiết bị]' };
          const encryptedAesKey = msg.senderId === currentUser.id
            ? msg.encryptedAesKeyForSender
            : msg.encryptedAesKeyForRecipient;
          const aesKey = await decryptKeyRSA(encryptedAesKey, privateKey);
          const content = await decryptMessageAES(msg.encryptedContent, aesKey, msg.iv);
          return { ...msg, decryptedContent: content };
        } catch (err) {
          console.error('[decryptMessages] Error decrypting historical message:', msg.id, err);
          return { ...msg, decryptedContent: '[Lỗi giải mã: Khóa không đúng]' };
        }
      }));
      
      if (isLoadMore) {
        // Save scroll height before prepending
        const container = scrollContainerRef.current;
        const previousScrollHeight = container ? container.scrollHeight : 0;
        
        setMessages(prev => [...decryptedMessages, ...prev]);
        
        // Restore scroll position after React renders
        setTimeout(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - previousScrollHeight;
          }
        }, 0);
      } else {
        setMessages(decryptedMessages);
        setHasMore(newBatch.length === 50);
      }
      
      // Mark as Read
      if (!isLoadMore && socket && decryptedMessages.some(m => m.senderId === chatUser.id && !m.readAt)) {
         socket.emit('markAsRead', { senderId: chatUser.id });
      }
    } catch (error) {
      console.error('Failed to fetch messages', error);
    } finally {
      if (isLoadMore) setIsLoadingMore(false);
      else setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (chatUser && token) {
      setHasMore(true);
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatUser, token, privateKey, currentUser.id, socket]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollTop === 0 && hasMore && !isLoadingMore && !loadingHistory) {
      loadMessages(true);
    }
  };

  useEffect(() => {
    if (!socket) return;
    
    const handleNewMessage = async (msg) => {
      if (
        (msg.senderId === currentUser.id && msg.recipientId === chatUser.id) ||
        (msg.senderId === chatUser.id && msg.recipientId === currentUser.id)
      ) {
        let decryptedContent = '[Chưa mở khóa thiết bị gốc]';
        try {
          if (privateKey) {
            const encryptedAesKey = msg.senderId === currentUser.id
              ? msg.encryptedAesKeyForSender
              : msg.encryptedAesKeyForRecipient;
            const aesKey = await decryptKeyRSA(encryptedAesKey, privateKey);
            decryptedContent = await decryptMessageAES(msg.encryptedContent, aesKey, msg.iv);
          }
        } catch (err) {
          console.error('[decryptMessage] Error decrypting new socket message:', msg.id, err);
          decryptedContent = '[Lỗi giải mã]';
        }
        
        setMessages(prev => [...prev, { ...msg, decryptedContent }]);
        // Stop typing indicator when message arrives
        if (msg.senderId === chatUser.id) setIsTyping(false);

        // Mark as read if receiving message while chat is open
        if (msg.senderId === chatUser.id) {
           socket.emit('markAsRead', { senderId: chatUser.id });
        }
      }
    };

    const handleRemoteTyping = ({ senderId }) => {
      if (senderId === chatUser.id) setIsTyping(true);
    };
    const handleRemoteStopTyping = ({ senderId }) => {
      if (senderId === chatUser.id) setIsTyping(false);
    };

    const handleMessageDeleted = ({ messageId }) => {
       setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, decryptedContent: '[Tin nhắn đã bị thu hồi]' } : m));
    };

    const handleMessageReacted = ({ messageId, reactions }) => {
       setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    const handleMessagesRead = ({ byUserId }) => {
       if (byUserId === chatUser.id) {
          setMessages(prev => prev.map(m => (!m.readAt && m.senderId === currentUser.id) ? { ...m, readAt: new Date().toISOString() } : m));
       }
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('typing', handleRemoteTyping);
    socket.on('stopTyping', handleRemoteStopTyping);
    socket.on('messageDeleted', handleMessageDeleted);
    socket.on('messageReacted', handleMessageReacted);
    socket.on('messagesRead', handleMessagesRead);
    
    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('typing', handleRemoteTyping);
      socket.off('stopTyping', handleRemoteStopTyping);
      socket.off('messageDeleted', handleMessageDeleted);
      socket.off('messageReacted', handleMessageReacted);
      socket.off('messagesRead', handleMessagesRead);
    };
  }, [socket, chatUser, currentUser.id, privateKey]);

  // --- ACTIONS ---
  
  const sendEncryptedPayload = async (messageText) => {
    try {
      // Generate a fresh AES-256-GCM key for each message
      const aesKey = await generateAESKey();
      // Encrypt returns { ciphertextB64, ivB64 } — IV is 96-bit, embedded in result
      const { ciphertextB64, ivB64 } = await encryptMessageAES(messageText, aesKey);
      // Wrap the AES key for both sender and recipient using their RSA public keys
      const encryptedAesKeyForSender = await encryptKeyRSA(aesKey, currentUser.publicKey);
      const encryptedAesKeyForRecipient = await encryptKeyRSA(aesKey, chatUser.publicKey);

      socket.emit('sendMessage', {
        recipientId: chatUser.id,
        encryptedContent: ciphertextB64,
        encryptedAesKeyForSender,
        encryptedAesKeyForRecipient,
        iv: ivB64,
        replyToId: replyMessage ? replyMessage.id : null,
      });
      setReplyMessage(null);
    } catch (error) {
      console.error('Encryption error', error);
      alert('Không thể gửi tin mã hóa: ' + error.message);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (isRecording) { stopRecordingAndSend(); return; }
    if (!newMessage.trim() && !isListening) return;
    if (!newMessage.trim()) return;
    const text = newMessage;
    setNewMessage('');
    if (socket) socket.emit('stopTyping', { recipientId: chatUser.id });
    await sendEncryptedPayload(text);
  };

  const handleInputTyping = (e) => {
    setNewMessage(e.target.value);
    if (!socket) return;
    
    socket.emit('typing', { recipientId: chatUser.id });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    
    typingTimeout.current = setTimeout(() => {
      socket.emit('stopTyping', { recipientId: chatUser.id });
    }, 2000);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Vui lòng chọn file hình ảnh hợp lệ!');
    if (file.size > 2 * 1024 * 1024) return alert('Kích thước ảnh quá lớn (>2MB)!');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      sendEncryptedPayload(`[IMG]${event.target.result}`);
    };
    reader.readAsDataURL(file);
    e.target.value = null; 
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('Kích thước File quá lớn (>5MB)! Vui lòng gửi file nhẹ hơn.');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      sendEncryptedPayload(`[FILE|${file.name}]${event.target.result}`);
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        alert('Trình duyệt của bạn không hỗ trợ Nhận diện Giọng nói (Speech-to-Text). Vui lòng dùng Chrome/Edge/Safari.');
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        if (!audioChunksRef.current.length) return; // cancelled
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        if (audioBlob.size > 3 * 1024 * 1024) return alert('Audio quá lớn (>3MB). Băng thông không hỗ trợ.');
        
        const reader = new FileReader();
        reader.onloadend = () => {
           sendEncryptedPayload(`[AUDIO]${reader.result}`);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access error', err);
      alert('Không thể dùng Microphone. Vui lòng cấp quyền Ghi Âm trình duyệt!');
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); // Triggers onstop -> send
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Prevent sending
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      audioChunksRef.current = [];
      setIsRecording(false);
    }
  };

  // Phase 4 Tools
  const handleDeleteMessage = (msgId) => {
     if(window.confirm('Bạn có chắc muốn THU HỒI tin nhắn này không?')) {
        socket.emit('deleteMessage', { messageId: msgId, recipientId: chatUser.id });
     }
  };

  const handleReactMessage = (msgId, reaction) => {
     socket.emit('reactMessage', { messageId: msgId, recipientId: chatUser.id, reaction });
  };

  const handleReplyMessage = (msg) => {
     setReplyMessage(msg);
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 relative z-10 w-full transition-colors duration-300">
      <div className="absolute inset-0 dark:bg-gradient-to-b dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 pointer-events-none transition-colors duration-300"></div>

      {/* Header */}
      <div className="h-[72px] px-6 flex items-center justify-between border-b border-gray-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shrink-0 sticky top-0 z-20 shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex justify-center items-center text-white font-bold text-lg shadow-lg shadow-purple-500/20">
              {chatUser.username.charAt(0).toUpperCase()}
            </div>
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-[2.5px] border-white dark:border-slate-900 rounded-full"></div>
            )}
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-slate-100 text-[15px] transition-colors">{chatUser.username}</h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
               <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
               Mã hoá đầu cuối (E2EE)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
             onClick={() => callUser(chatUser.id, false)} 
             className="w-10 h-10 rounded-full flex items-center justify-center text-indigo-500 dark:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
             title="Gọi điện âm thanh P2P"
          >
             <Phone className="w-5 h-5" />
          </button>
          <button 
             onClick={() => callUser(chatUser.id, true)} 
             className="w-10 h-10 rounded-full flex items-center justify-center text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 transition-colors"
             title="Gọi Video P2P"
          >
             <Video className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 z-10 relative custom-scrollbar scroll-smooth"
      >
        {isLoadingMore && (
          <div className="flex justify-center items-center py-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        )}
         <div className="text-center mb-8 mt-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300 shadow-sm">
               <Lock className="w-3.5 h-3.5" />
               Mọi nội dung (Text, Hình, File, Thu Âm, Cuộc Gọi) đều mã hóa AES-256
            </div>
         </div>

        {loadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          messages.map((msg, idx) => {
             const repliedMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
             return (
               <MessageBubble 
                 key={msg.id || idx} 
                 message={msg} 
                 isMe={msg.senderId === currentUser.id} 
                 onDelete={handleDeleteMessage}
                 onReact={handleReactMessage}
                 onReply={handleReplyMessage}
                 repliedMessage={repliedMsg}
               />
             )
          })
        )}
        
        {isTyping && (
          <div className="flex items-center gap-3 text-slate-400 mt-2 ml-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex justify-center items-center text-xs text-slate-300 font-bold overflow-hidden shadow">
               {chatUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="px-3 py-2.5 bg-slate-800 rounded-2xl rounded-bl-sm flex gap-1 items-center">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-gray-200 dark:border-slate-800/80 z-20 shrink-0 relative transition-colors duration-300">
        {/* Reply Indicator */}
        {replyMessage && (
           <div className="absolute bottom-full left-0 w-full bg-slate-800/90 border-t border-slate-700 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 border-l-4 border-indigo-500 pl-3">
                 <CornerUpLeft className="w-4 h-4 text-indigo-400" />
                 <div>
                    <span className="text-xs font-semibold text-indigo-300 block mb-0.5">
                       Đang trả lời {replyMessage.senderId === currentUser.id ? 'chính bạn' : chatUser.username}
                    </span>
                    <span className="text-xs text-slate-300 truncate w-64 block opacity-80">
                       {replyMessage.decryptedContent?.substring(0, 50) || '[Multimedia]'}...
                    </span>
                 </div>
              </div>
              <button type="button" onClick={() => setReplyMessage(null)} className="p-1 text-slate-400 hover:text-white rounded-full transition">
                 <X className="w-4 h-4" />
              </button>
           </div>
        )}

        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-2 p-4">
          
          {/* Left Controls */}
          {!isRecording && (
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 bg-transparent hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-full transition-colors shrink-0"
                title="Đính kèm Hình ảnh"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
              
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="p-2.5 bg-transparent hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 rounded-full transition-colors shrink-0"
                title="Đính kèm Tài liệu"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={startRecording}
                className="p-2.5 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-full transition-colors shrink-0"
                title="Bắt đầu Ghi Âm Tệp E2EE"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>
          )}
          
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
          <input type="file" ref={docInputRef} onChange={handleFileSelect} className="hidden" />

          {/* Main Input / Recording UI */}
          <div className="relative flex-1 flex">
            {isRecording ? (
               <div className="w-full border border-red-500/50 flex-1 py-1.5 pl-6 pr-4 rounded-full bg-red-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-red-500">
                     <Disc2 className="w-5 h-5 animate-spin" />
                     <span className="text-sm font-medium animate-pulse">Đang thu âm... (Bấm GỬI để hoàn tất)</span>
                  </div>
                  <button type="button" onClick={cancelRecording} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-400 transition" title="Huỷ Thu Âm">
                     <Trash2 className="w-4 h-4" />
                  </button>
               </div>
            ) : (
              <div className="relative w-full">
                <input
                  type="text"
                  value={newMessage}
                  onChange={handleInputTyping}
                  placeholder="Nhập tin nhắn bảo mật của bạn..."
                  className="w-full border text-[15px] rounded-full py-3 pl-5 pr-12 outline-none transition-all shadow-inner bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/50 border-gray-200 dark:border-slate-700"
                />
                {/* STT Mic Toggle Button */}
                <button
                  type="button"
                  onClick={toggleListen}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 transition z-30 ${isListening ? 'text-emerald-500 animate-pulse' : 'text-gray-400 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400'}`}
                  title="Nhận diện giọng nói thành Văn Bản"
                >
                   {isListening ? <Disc2 className="w-4 h-4 animate-spin" /> : <MicOff className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          
          {/* Action Button: ALWAYS THE SEND BUTTON */}
          <button
             type="submit"
             disabled={!isRecording && !newMessage.trim() && !isListening}
             className="w-12 h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20 shrink-0"
             title={isRecording ? "Hoàn tất Ghi âm & Gửi" : "Gửi tin nhắn"}
          >
             <Send className="w-5 h-5 -ml-0.5 mt-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;
