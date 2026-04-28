import React, { useState } from 'react';
import { Lock, Code2, Trash2, CornerUpLeft, Smile, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const MessageBubble = ({ message, isMe, showAvatar, avatarUrl, onDelete, onReact, onReply, repliedMessage }) => {
  const [showEncrypted, setShowEncrypted] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const { user: currentUser } = useAuth();
  const time = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isImage = message.decryptedContent?.startsWith('[IMG]');
  const isAudio = message.decryptedContent?.startsWith('[AUDIO]');
  const isFile = message.decryptedContent?.startsWith('[FILE|');
  const emojis = ['❤️', '😂', '👍', '😢', '😮', '😡'];

  const reactionCounts = message.reactions || {};
  const hasReactions = Object.keys(reactionCounts).length > 0;

  return (
    <div className={`flex w-full items-end gap-2 group relative mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar for incoming messages */}
      {!isMe && (
        <div className="w-8 h-8 shrink-0 mb-1">
          {showAvatar && (
            <div className="w-full h-full rounded-full bg-[var(--hover)] flex items-center justify-center overflow-hidden border border-[var(--border)]">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                  {(message.senderName || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
        {repliedMessage && repliedMessage.decryptedContent && (
          <div className="mb-1 opacity-50 flex items-center gap-1 text-[11px] max-w-full text-[var(--text-secondary)]">
            <CornerUpLeft className="w-3 h-3" />
            <div className="px-3 py-1 rounded-2xl bg-[var(--hover)] truncate italic">
              {repliedMessage.decryptedContent}
            </div>
          </div>
        )}

        <div className="relative group">
          <div 
            className={`px-4 py-2 rounded-[20px] text-[15px] leading-snug break-words shadow-sm ${
              isMe 
                ? 'bg-[var(--bubble-me)] text-white rounded-tr-[4px]' 
                : 'bg-[var(--bubble-them)] text-[var(--text-on-them)] rounded-tl-[4px]'
            } ${message.isDeleted ? 'bg-transparent border border-[var(--border)] text-[var(--text-secondary)] italic shadow-none' : ''}`}
          >
            {message.isDeleted ? 'Tin nhắn đã bị thu hồi' : (
              showEncrypted ? (
                <div className="font-mono text-[10px] break-all opacity-70">
                  {message.encryptedContent}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {isImage ? (
                    <div className="rounded-lg overflow-hidden cursor-pointer hover:brightness-95 transition-all">
                      <img 
                        src={message.decryptedContent.replace('[IMG]', '')} 
                        alt="Sent image" 
                        className="max-w-full max-h-[300px] object-cover rounded-lg"
                        onClick={() => window.open(message.decryptedContent.replace('[IMG]', ''), '_blank')}
                      />
                    </div>
                  ) : isAudio ? (
                    <audio 
                      controls 
                      className="max-w-[240px] h-10 accent-blue-500"
                      src={message.decryptedContent.replace('[AUDIO]', '')}
                    />
                  ) : isFile ? (() => {
                    const parts = message.decryptedContent.match(/\[FILE\|(.*?)\](.*)/);
                    if (!parts) return message.decryptedContent;
                    const fileName = parts[1];
                    const fileData = parts[2];
                    return (
                      <a 
                        href={fileData} 
                        download={fileName}
                        className="flex items-center gap-2 p-2 bg-black/10 rounded-lg hover:bg-black/20 transition-colors no-underline text-inherit"
                      >
                        <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white">
                          <Code2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{fileName}</p>
                          <p className="text-[10px] opacity-60">Nhấn để tải về</p>
                        </div>
                      </a>
                    );
                  })() : (
                    <span className="whitespace-pre-wrap">{message.decryptedContent}</span>
                  )}
                </div>
              )
            )}
          </div>

          {/* Action Menu (Hover) */}
          <div className={`absolute top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'right-full mr-2' : 'left-full ml-2'}`}>
            <button 
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--hover)] transition-colors"
            >
              <Smile className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onReply(message)}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--hover)] transition-colors"
            >
              <CornerUpLeft className="w-4 h-4" />
            </button>
            {isMe && (
               <button 
               onClick={() => onDelete(message.id)}
               className="p-1.5 text-[var(--text-secondary)] hover:text-red-500 rounded-full hover:bg-[var(--hover)] transition-colors"
             >
               <Trash2 className="w-4 h-4" />
             </button>
            )}
            <button 
              onClick={() => setShowEncrypted(!showEncrypted)}
              className="p-1.5 text-[var(--text-secondary)] hover:text-blue-500 rounded-full hover:bg-[var(--hover)] transition-colors"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>

          {/* Reactions */}
          {hasReactions && (
            <div className={`absolute -bottom-2 ${isMe ? 'right-2' : 'left-2'} flex gap-0.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-1.5 py-0.5 shadow-lg`}>
              {Object.entries(reactionCounts).slice(0, 3).map(([uid, emoji]) => (
                <span key={uid} className="text-xs">{emoji}</span>
              ))}
              {Object.keys(reactionCounts).length > 3 && (
                <span className="text-[10px] text-[var(--text-secondary)] ml-0.5">{Object.keys(reactionCounts).length}</span>
              )}
            </div>
          )}
        </div>

        {/* Status & Time (Visible on hover or if last message) */}
        <div className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
           <span className="text-[10px] text-[var(--text-secondary)]">{time}</span>
           {isMe && (
             message.readAt 
               ? <CheckCheck className="w-3 h-3 text-blue-500" /> 
               : <Check className="w-3 h-3 text-[var(--text-secondary)]" />
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
