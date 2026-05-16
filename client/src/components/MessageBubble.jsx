import React, { useState } from 'react';
import { Lock, Code2, Trash2, CornerUpLeft, Smile, Check, CheckCheck, Pin, AlertCircle, Ghost } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PollBubble from './PollBubble';

const MessageBubble = ({ message, isMe, showAvatar, avatarUrl, onDelete, onReact, onReply, onPin, onReport, repliedMessage, readStatus, themeColor }) => {
  const [showEncrypted, setShowEncrypted] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const { user: currentUser } = useAuth();
  
  const seenBy = Array.isArray(readStatus) 
    ? readStatus.filter(m => m.userId !== currentUser?.id && m.lastReadMessageId === message.id)
    : [];

  const time = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isImage = message.decryptedContent?.startsWith('[IMG]');
  const isAudio = message.decryptedContent?.startsWith('[AUDIO]');
  const isFile = message.decryptedContent?.startsWith('[FILE|');
  const isSticker = message.decryptedContent?.startsWith('[STICKER]');
  const isGif = message.decryptedContent?.startsWith('[GIF]');
  const isPoll = message.decryptedContent?.startsWith('[POLL|');
  const emojis = ['❤️', '😂', '👍', '😢', '😮', '😡'];

  const reactionCounts = message.reactions || {};
  const hasReactions = Object.keys(reactionCounts).length > 0;

  return (
    <div className={`flex w-full items-end gap-3 group relative mb-3 animate-fade-in ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar for incoming messages */}
      {!isMe && (
        <div className="w-10 h-10 shrink-0 mb-1">
          {showAvatar && (
            <div className="w-full h-full rounded-2xl bg-[var(--bg-accent)] flex items-center justify-center overflow-hidden border border-[var(--border)] transition-transform group-hover:scale-110">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-[var(--text-secondary)]">
                  {(message.senderName || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && message.senderName && (
          <span className="text-[12px] font-bold text-[var(--text-secondary)] mb-1.5 ml-1 opacity-80">
            {message.senderName}
          </span>
        )}
        
        {repliedMessage && repliedMessage.decryptedContent && (
          <div className={`mb-1.5 opacity-60 flex items-center gap-2 text-[11px] max-w-full ${isMe ? 'flex-row-reverse' : ''}`}>
            <CornerUpLeft className="w-3.5 h-3.5" />
            <div className="px-4 py-2 rounded-2xl glass italic truncate border-[var(--border)]">
              {repliedMessage.decryptedContent}
            </div>
          </div>
        )}
        
        {message.isPinned && (
          <div className={`flex items-center gap-1.5 text-[10px] text-indigo-500 mb-1.5 font-bold uppercase tracking-wider ${isMe ? 'flex-row-reverse' : ''}`}>
            <Pin className="w-3 h-3 fill-current" />
            <span>Đã ghim</span>
          </div>
        )}

        {message.burnOnRead && !message.isDeleted && (
          <div className={`flex items-center gap-1.5 text-[10px] text-orange-500 mb-1.5 font-bold uppercase tracking-wider ${isMe ? 'flex-row-reverse' : ''} animate-pulse`}>
            <Ghost className="w-3 h-3" />
            <span>Tin nhắn tự hủy</span>
          </div>
        )}

        <div className="relative group/content">
          <div 
            className={`px-5 py-3 rounded-[24px] text-[15px] leading-relaxed break-words premium-shadow border ${
              (isSticker || isGif) 
                ? 'bg-transparent shadow-none !p-0 border-transparent' 
                : isMe 
                  ? `${themeColor ? '' : 'premium-gradient'} text-white border-transparent rounded-br-[4px]` 
                  : 'glass text-[var(--text-primary)] rounded-bl-[4px] border-[var(--glass-border)]'
            } ${message.isDeleted ? 'bg-transparent border border-[var(--border)] text-[var(--text-secondary)] italic shadow-none' : ''}`}
            style={isMe && !isSticker && !isGif && themeColor ? { backgroundColor: themeColor, backgroundImage: 'none' } : {}}
          >
            {message.isDeleted ? 'Tin nhắn đã bị thu hồi' : (
              showEncrypted ? (
                <div className="font-mono text-[10px] break-all opacity-60 leading-tight">
                  {message.encryptedContent}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {isImage ? (
                    <div className="rounded-2xl overflow-hidden cursor-pointer hover:brightness-105 transition-all shadow-xl">
                      <img 
                        src={message.decryptedContent.replace('[IMG]', '')} 
                        alt="Sent image" 
                        className="max-w-full max-h-[400px] object-cover"
                        onClick={() => window.open(message.decryptedContent.replace('[IMG]', ''), '_blank')}
                      />
                    </div>
                  ) : isAudio ? (
                    <div className={`p-1 rounded-2xl ${isMe ? 'bg-white/10' : 'bg-indigo-500/5'}`}>
                      <audio 
                        controls 
                        className="max-w-[260px] h-10 accent-indigo-500"
                        src={message.decryptedContent.replace('[AUDIO]', '')}
                      />
                    </div>
                  ) : isFile ? (() => {
                    const parts = message.decryptedContent.match(/\[FILE\|(.*?)\](.*)/);
                    if (!parts) return message.decryptedContent;
                    const fileName = parts[1];
                    const fileData = parts[2];
                    return (
                      <a 
                        href={fileData} 
                        download={fileName}
                        className={`flex items-center gap-4 p-4 rounded-2xl transition-all no-underline text-inherit ${
                          isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-indigo-500/5 hover:bg-indigo-500/10'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-xl premium-gradient flex items-center justify-center text-white shadow-lg">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{fileName}</p>
                          <p className="text-[11px] opacity-60 font-medium">Nhấn để tải về • Secure File</p>
                        </div>
                      </a>
                    );
                  })() : isSticker ? (
                    <img 
                      src={message.decryptedContent.replace('[STICKER]', '')} 
                      alt="Sticker" 
                      className="w-40 h-40 object-contain drop-shadow-xl"
                    />
                  ) : isGif ? (
                    <img 
                      src={message.decryptedContent.replace('[GIF]', '')} 
                      alt="GIF" 
                      className="max-w-[300px] rounded-2xl shadow-xl border-4 border-white/10"
                    />
                  ) : isPoll ? (() => {
                    const pollId = message.decryptedContent.match(/\[POLL\|(.*?)\]/)?.[1];
                    return <PollBubble pollId={pollId} groupId={message.groupId} />;
                  })() : (
                    <span className="whitespace-pre-wrap">{message.decryptedContent}</span>
                  )}
                </div>
              )
            )}
          </div>

          {/* Action Menu (Hover) */}
          <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/content:opacity-100 transition-all duration-300 ${isMe ? 'right-full mr-3' : 'left-full ml-3'}`}>
            <button 
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-indigo-500 rounded-xl hover:bg-indigo-500/10 transition-all"
            >
              <Smile className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => onReply(message)}
              className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-indigo-500 rounded-xl hover:bg-indigo-500/10 transition-all"
            >
              <CornerUpLeft className="w-4.5 h-4.5" />
            </button>
            {isMe && (
               <button 
               onClick={() => onDelete(message.id)}
               className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-red-500 rounded-xl hover:bg-red-500/10 transition-all"
             >
               <Trash2 className="w-4.5 h-4.5" />
             </button>
            )}
            <button 
              onClick={() => onPin(message.id)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${message.isPinned ? 'text-indigo-500 bg-indigo-500/10' : 'text-[var(--text-secondary)] hover:text-indigo-500 hover:bg-indigo-500/10'}`}
              title={message.isPinned ? "Bỏ ghim" : "Ghim tin nhắn"}
            >
              <Pin className={`w-4.5 h-4.5 ${message.isPinned ? 'fill-current' : ''}`} />
            </button>
            <button 
              onClick={() => setShowEncrypted(!showEncrypted)}
              className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-indigo-500 rounded-xl hover:bg-indigo-500/10 transition-all"
              title="Xem bản mã"
            >
              <Lock className="w-4.5 h-4.5" />
            </button>
            {!isMe && (
              <button 
                onClick={() => onReport && onReport(message)}
                className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-red-500 rounded-xl hover:bg-red-500/10 transition-all"
                title="Báo cáo tin nhắn rác/xấu"
              >
                <AlertCircle className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* Reactions */}
          {hasReactions && (
            <div className={`absolute -bottom-2.5 ${isMe ? 'right-3' : 'left-3'} flex gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-2 py-1 shadow-xl z-10 scale-100 group-hover:scale-110 transition-transform`}>
              {Object.entries(reactionCounts).slice(0, 3).map(([uid, emoji]) => (
                <span key={uid} className="text-sm">{emoji}</span>
              ))}
              {Object.keys(reactionCounts).length > 3 && (
                <span className="text-[11px] font-bold text-[var(--text-secondary)] ml-1">+{Object.keys(reactionCounts).length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Status, Time & Seen By */}
        <div className={`flex items-center gap-2 mt-1.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
           <span className="text-[11px] font-medium text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity duration-300">{time}</span>
           {isMe && !readStatus && (
             <div className="transition-transform duration-300 hover:scale-125">
               {message.readAt 
                 ? <CheckCheck className="w-3.5 h-3.5 text-indigo-500" /> 
                 : <Check className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
               }
             </div>
           )}
           {seenBy.length > 0 && (
             <div className="flex -space-x-1.5 items-center">
               {seenBy.slice(0, 5).map(member => (
                 <div key={member.userId} className="w-4 h-4 rounded-full border-2 border-[var(--bg-primary)] overflow-hidden bg-[var(--bg-accent)] ring-1 ring-[var(--border)] transition-transform hover:scale-125 hover:z-20" title={`Đã xem bởi ${member.User?.displayName || member.User?.username}`}>
                   {member.User?.avatarUrl ? (
                     <img src={member.User.avatarUrl} className="w-full h-full object-cover" alt="" />
                   ) : (
                     <div className="w-full h-full premium-gradient flex items-center justify-center text-[7px] text-white font-bold">
                       {(member.User?.displayName || member.User?.username || '?').charAt(0).toUpperCase()}
                     </div>
                   )}
                 </div>
               ))}
               {seenBy.length > 5 && (
                 <div className="w-4 h-4 rounded-full bg-[var(--bg-accent)] border-2 border-[var(--bg-primary)] flex items-center justify-center text-[7px] text-[var(--text-secondary)] font-bold ring-1 ring-[var(--border)]">
                   +{seenBy.length - 5}
                 </div>
               )}
             </div>
           )}
        </div>
      </div>
      
      {showReactionsMenu && (
        <div className={`absolute bottom-full mb-2 z-30 flex gap-1 p-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full shadow-2xl ${isMe ? 'right-0' : 'left-0'}`}>
          {emojis.map(emoji => (
            <button 
              key={emoji} 
              onClick={() => {
                onReact(message.id, emoji);
                setShowReactionsMenu(false);
              }}
              className="text-xl hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
