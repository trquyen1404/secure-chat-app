import React, { useState } from 'react';
import { Code2, Lock, FileText, Download, Headphones, Trash2, CornerUpLeft, Smile, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const MessageBubble = ({ message, isMe, onDelete, onReact, onReply, repliedMessage }) => {
  const [showEncrypted, setShowEncrypted] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);

  const { user: currentUser } = useAuth();

  const time = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isImage = message.decryptedContent?.startsWith('[IMG]');
  const isAudio = message.decryptedContent?.startsWith('[AUDIO]');
  const isFile = message.decryptedContent?.startsWith('[FILE|');

  const emojis = ['❤️', '😂', '👍', '😢', '😮', '😡'];

  const renderContent = () => {
    if (message.isDeleted) {
       return <p className="italic opacity-80 select-none">Tin nhắn đã bị thu hồi</p>;
    }

    if (isImage) {
      return (
        <img 
          src={message.decryptedContent.replace('[IMG]', '')} 
          alt="E2EE Image" 
          className="max-w-full h-auto max-h-64 rounded-md shadow border border-slate-700/50 object-contain mt-1" 
          loading="lazy" 
        />
      );
    }
    
    if (isAudio) {
      return (
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <div className="flex items-center gap-2 text-[11px] font-semibold opacity-70 mb-0.5 uppercase tracking-wide">
             <Headphones className="w-3.5 h-3.5" /> Ghi âm E2EE
          </div>
          <audio 
            src={message.decryptedContent.replace('[AUDIO]', '')} 
            controls 
            className="h-9 w-full rounded outline-none" 
          />
        </div>
      );
    }

    if (isFile) {
      const firstBracket = message.decryptedContent.indexOf(']');
      const fileName = message.decryptedContent.substring(6, firstBracket);
      const fileData = message.decryptedContent.substring(firstBracket + 1);
      
      return (
         <div className="flex items-center gap-3 bg-black/20 p-2.5 rounded-lg border border-white/10 min-w-[240px]">
            <div className={`p-2 rounded shadow-inner flex items-center justify-center ${isMe ? 'bg-indigo-400/20 text-indigo-100' : 'bg-slate-700 text-slate-300'}`}>
               <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 overflow-hidden pr-2">
               <p className="text-[13px] font-medium truncate w-full" title={fileName}>{fileName}</p>
               <span className="text-[10px] opacity-70 block">Tài liệu bảo mật E2EE</span>
            </div>
            <a 
               href={fileData} 
               download={fileName} 
               className={`p-2 rounded-full transition-colors shrink-0 flex items-center justify-center ${isMe ? 'hover:bg-indigo-400/30 bg-indigo-500/20' : 'hover:bg-slate-600 bg-slate-700'}`}
               title="Tải xuống tài liệu"
            >
               <Download className="w-4 h-4" />
            </a>
         </div>
      );
    }

    // Default text
    return (
      <p className={`whitespace-pre-wrap leading-relaxed text-[15px] ${
          message.decryptedContent?.startsWith('[') ? 'text-red-300 text-xs italic opacity-80' : ''
      }`}>
        {message.decryptedContent}
      </p>
    );
  };

  const reactionCounts = message.reactions || {};
  const hasReactions = Object.keys(reactionCounts).length > 0;

  return (
    <div className={`flex w-full mt-4 space-x-3 max-w-xl group relative animate-fade-in-up ${isMe ? 'ml-auto justify-end' : ''}`} onMouseLeave={() => setShowReactionsMenu(false)}>
      
      {/* HOVER TOOLBAR */}
      <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/80 backdrop-blur rounded-full px-2 py-1 shadow-lg border border-gray-200 dark:border-slate-700/50 ${isMe ? 'right-full mr-3' : 'left-full ml-3'} z-20`}>
         {!message.isDeleted && (
            <>
               <div className="relative">
                 <button onClick={() => setShowReactionsMenu(!showReactionsMenu)} className="p-1.5 text-gray-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700/80 transition-colors" title="Bày tỏ cảm xúc">
                    <Smile className="w-4 h-4" />
                 </button>
                 {/* Reaction Picker Popup */}
                 {showReactionsMenu && (
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-800 p-2 rounded-full border border-slate-700 shadow-xl flex gap-1 z-30">
                       {emojis.map(emoji => (
                          <span 
                            key={emoji} 
                            onClick={(e) => { e.stopPropagation(); onReact(message.id, emoji); setShowReactionsMenu(false); }} 
                            className="cursor-pointer hover:scale-125 hover:-translate-y-1 transition-transform text-xl px-1"
                          >
                             {emoji}
                          </span>
                       ))}
                    </div>
                 )}
               </div>
               
               <button onClick={() => { onReply(message); setShowReactionsMenu(false); }} className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-full hover:bg-slate-700/80 transition-colors" title="Trả lời tin nhắn">
                  <CornerUpLeft className="w-4 h-4" />
               </button>
            </>
         )}
         {isMe && !message.isDeleted && (
            <button onClick={() => onDelete(message.id)} className="p-1.5 text-slate-400 hover:text-red-400 rounded-full hover:bg-slate-700/80 transition-colors" title="Thu hồi với mọi người">
               <Trash2 className="w-4 h-4" />
            </button>
         )}
      </div>

      <div className="flex flex-col relative w-fit max-w-[85%]">
        {/* Reply Snippet */}
        {repliedMessage && (
           <div className={`mb-1.5 opacity-80 flex items-center gap-2 text-xs w-full ${isMe ? 'justify-end text-indigo-300' : 'justify-start text-slate-400'}`}>
              <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
              <div className={`px-3 py-1.5 rounded-lg truncate overflow-hidden cursor-pointer shadow-sm ${isMe ? 'bg-indigo-900/40 border border-indigo-500/20' : 'bg-slate-800/80 border border-slate-700/50'}`}>
                 <span className="font-semibold block mb-0.5 text-[10px] uppercase opacity-60">
                    Đã trả lời {repliedMessage.senderId === currentUser?.id ? 'chính bạn' : 'đối tác'}:
                 </span>
                 <span className="truncate w-full inline-block">
                    {repliedMessage.isDeleted ? 'Tin nhắn đã bị thu hồi' : (repliedMessage.decryptedContent?.startsWith('[') ? '[Phương tiện đính kèm]' : repliedMessage.decryptedContent)}
                 </span>
              </div>
           </div>
        )}

        <div className={`relative px-4 py-3 rounded-[20px] shadow-sm text-sm shadow-black/10 transition-all min-w-[120px] ${
          isMe
            ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-tr-sm self-end'
            : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700/50 rounded-tl-sm self-start shadow-sm'
        } ${message.isDeleted ? '!bg-transparent !bg-none border-2 border-dashed border-gray-300 dark:border-slate-600/50 text-gray-400 dark:text-slate-400 shadow-none' : ''}`}>
           
           {/* Header: Sender context */}
           {!message.isDeleted && (
             <div className="flex justify-between flex-wrap items-center gap-3 mb-1.5">
               <span className={`font-medium text-[11px] opacity-70 uppercase tracking-wide flex items-center gap-1 ${isMe ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {isMe ? 'Bạn' : 'Đối tác'}
               </span>
               <button 
                 type="button"
                 onClick={() => setShowEncrypted(!showEncrypted)}
                 className={`text-[9px] opacity-30 hover:opacity-100 uppercase tracking-wider flex items-center gap-1 transition-all ${isMe ? 'hover:text-amber-200' : 'hover:text-indigo-400'}`}
                 title="Xem dải mã hoá AES-256"
               >
                  {showEncrypted ? <Lock className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
                  E2EE Data
               </button>
             </div>
           )}
           
           {/* Payload */}
           <div className="max-w-full overflow-hidden">
             {showEncrypted && !message.isDeleted ? (
                <div className={`font-mono text-[9px] break-all leading-relaxed p-2.5 rounded-lg border max-h-48 overflow-y-auto custom-scrollbar ${
                    isMe ? 'bg-indigo-900/40 text-indigo-300 border-indigo-400/20' : 'bg-slate-900 text-slate-400 border-slate-700/50'
                }`}>
                  {message.encryptedContent}
                  <div className="block mt-1 opacity-50 border-t border-current pt-1">
                    IV: {message.iv}
                  </div>
                </div>
             ) : renderContent()}
           </div>

           {/* Reactions Display */}
           {hasReactions && !message.isDeleted && (
              <div className={`absolute -bottom-3 ${isMe ? 'right-2' : 'left-2'} bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded-full flex gap-0.5 shadow-md z-10 transition-transform hover:scale-110`}>
                 {Object.entries(reactionCounts).map(([uid, emoji]) => (
                    <span key={uid} className="text-[12px] " title={uid === currentUser?.id ? "Bạn đã thả" : "Bên kia thả"}>{emoji}</span>
                 ))}
              </div>
           )}
        </div>
        
        {/* Status Line: Time + Read Receipts */}
        <div className={`flex items-center gap-1 mt-1.5 w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
           <span className={`text-[10px] opacity-60 ${isMe ? 'text-indigo-100' : 'text-slate-500'}`}>
             {time}
           </span>
           {isMe && !message.isDeleted && (
              message.readAt 
                ? <CheckCheck className="w-[14px] h-[14px] text-emerald-400 transition-colors" title="Đã xem" />
                : <Check className="w-[14px] h-[14px] text-indigo-300/50 transition-colors" title="Đã gửi / Đã nhận" />
           )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
