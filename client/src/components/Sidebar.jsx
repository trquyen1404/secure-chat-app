import React, { useEffect, useState } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { LogOut, Search, ShieldCheck, Moon, Sun, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { clearRatchetDB } from '../utils/ratchetStore';
import { clearKeyStore } from '../utils/keyStore';
import ProfileModal from './ProfileModal';
import CreateGroupModal from './CreateGroupModal';
import { Settings, Plus, Users as UsersIcon } from 'lucide-react';
import { processIncomingMessage, processGroupMessage } from '../utils/ratchetLogic';

const Sidebar = ({ selectedUser, onSelectUser }) => {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const { token, logout, user, masterKey } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [tab, setTab] = useState('chats'); // 'chats' or 'groups'
  const [lastMessages, setLastMessages] = useState({}); // chatUserId/groupId -> messageObject
  
  const formatPreview = (content, type) => {
    if (!content) return (type === 'text' || !type) ? '[Tin nhắn mã hóa]' : `[${type}]`;
    if (content.startsWith('[IMG]')) return '📷 Ảnh';
    if (content.startsWith('[AUDIO]')) return '🎵 Tin nhắn thoại';
    if (content.startsWith('[FILE|')) {
      const match = content.match(/\[FILE\|([^\]]+)\]/);
      return match ? `📁 Tệp: ${match[1]}` : '📁 Tệp';
    }
    return content;
  };

  const handleWipeData = async () => {
    if (window.confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ khóa và lịch sử chat trên máy này. Tiếp tục (Chúng tôi sẽ cố gắng sao lưu Két sắt trước)?')) {
      try {
        console.log('[WIPE] Attempting final safety sync...');
        const { uploadVault } = await import('../utils/vaultSyncService');
        if (masterKey) await uploadVault(masterKey);
      } catch (err) {
        console.warn('[WIPE] Safety sync failed, but proceeding with wipe as requested.', err.message);
      }

      console.log('[WIPE] Clearing all local security data...');
      await clearRatchetDB();
      await clearKeyStore();
      logout();
      window.location.reload();
    }
  };
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, groupsRes] = await Promise.all([
          api.get('/api/users'),
          api.get('/api/groups')
        ]);
        setUsers(usersRes.data);
        setGroups(groupsRes.data);
        
        // Initialize last messages map
        const msgMap = {};
        usersRes.data.forEach(u => { if (u.latestMessage) msgMap[u.id] = u.latestMessage; });
        groupsRes.data.forEach(g => { if (g.latestMessage) msgMap[g.id] = g.latestMessage; });
        setLastMessages(msgMap);
      } catch (error) {
        console.error('Failed to fetch sidebar data:', error);
      }
    };
    if (token) fetchData();
  }, [token]);

  useEffect(() => {
    if (socket && groups.length > 0) {
      console.log(`[E2EE-Global] Joining ${groups.length} group rooms...`);
      groups.forEach(g => {
        socket.emit('joinGroup', { groupId: g.id });
      });
    }
  }, [socket, groups]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMsg = async (msg) => {
      const isTechnical = (msg.type === 'SENDER_KEY_DISTRIBUTION' || !!msg.senderEk || msg.type === 'handshake_ack' || msg.type === 'SESSION_DESYNC_ERROR') && !msg.encryptedContent;
      if (isTechnical) return;

      const chatPartnerId = msg.senderId === user.id ? msg.recipientId : msg.senderId;
      
      // Attempt background decryption for preview
      if (msg.senderId !== user.id) {
          const { content } = await processIncomingMessage(msg, masterKey, user);
          if (content) msg.decryptedContent = content;
      }

      setLastMessages(prev => ({ ...prev, [chatPartnerId]: msg }));
    };

    const handleNewGrpMsg = async (msg) => {
      const isTechnical = (msg.type === 'SENDER_KEY_DISTRIBUTION' || !!msg.senderEk || msg.type === 'handshake_ack') && !msg.encryptedContent;
      if (isTechnical) return;

      // Attempt background decryption for preview
      if (msg.senderId !== user.id) {
          const { content } = await processGroupMessage(msg, masterKey, user);
          if (content) msg.decryptedContent = content;
      }
      setLastMessages(prev => ({ ...prev, [msg.groupId]: msg }));
    };

    const handleRead = ({ byUserId }) => {
      // Clear unread dot if relevant
      setLastMessages(prev => {
        const msg = prev[byUserId];
        if (msg && msg.senderId === byUserId) {
          return { ...prev, [byUserId]: { ...msg, readAt: new Date().toISOString() } };
        }
        return prev;
      });
    };

    socket.on('newMessage', handleNewMsg);
    socket.on('newGroupMessage', handleNewGrpMsg);
    socket.on('messagesRead', handleRead);
    return () => {
      socket.off('newMessage', handleNewMsg);
      socket.off('newGroupMessage', handleNewGrpMsg);
      socket.off('messagesRead', handleRead);
    };
  }, [socket, user?.id, masterKey]);

  // [Proactive Healing] Sidebar Previews
  useEffect(() => {
    const healPreviews = async (id, isGroup = false) => {
      setLastMessages(prev => {
        const msg = prev[id];
        if (!msg) return prev;

        const isPlaceholder = msg.decryptedContent && (
          msg.decryptedContent.startsWith('[Chờ chìa khóa') ||
          msg.decryptedContent.startsWith('[Lỗi giải mã')
        );

        if (!isPlaceholder && msg.decryptedContent) return prev;

        // Trigger background re-decryption
        (async () => {
          try {
            let result;
            if (isGroup) {
              result = await processGroupMessage(msg, masterKey, user, id);
            } else {
              result = await processIncomingMessage(msg, masterKey, user);
            }
            if (result.success && result.content && result.content !== msg.decryptedContent) {
              setLastMessages(current => ({
                ...current,
                [id]: { ...msg, decryptedContent: result.content }
              }));
            }
          } catch (e) { /* background fail silent */ }
        })();

        return prev;
      });
    };

    const handleKeyReceived = (e) => healPreviews(e.detail.groupId, true);
    const handleSessionUpdated = (e) => healPreviews(e.detail.userId, false);
    const handleMessageSynced = (e) => {
      const msg = e.detail;
      const partnerId = msg.groupId || (msg.senderId === user.id ? msg.recipientId : msg.senderId);
      if (partnerId) {
        setLastMessages(prev => {
          const existing = prev[partnerId];
          // Update if it's the current latest message, OR if we don't have a message for this partner yet, OR if synced message is newer
          const isNewer = !existing || (new Date(msg.createdAt) >= new Date(existing.createdAt));
          
          if (isNewer || (existing && (existing.id === msg.id || existing.localId === msg.localId))) {
            return {
              ...prev,
              [partnerId]: { ...(existing || {}), ...msg }
            };
          }
          return prev;
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
  }, [user, masterKey]);

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-80 flex flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl border-r border-gray-200 dark:border-slate-800/80 transition-colors duration-300">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center relative shadow-lg shadow-indigo-500/20 overflow-hidden group"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-white" />
            )}
            <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 translate-x-1 -translate-y-1"></div>
          </button>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setIsProfileOpen(true)}>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[100px]">
              {user?.displayName || user?.username}
            </h2>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium tracking-wide uppercase">Active Now</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="p-2 text-gray-500 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-all"
            title="Cài đặt Hồ sơ"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={toggleTheme}
            className="p-2 text-gray-500 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-all"
            title="Đổi Giao diện"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={handleWipeData}
            className="p-2 text-gray-500 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-all"
            title="Xóa Dữ liệu & Reset"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button 
            onClick={logout}
            className="p-2 text-gray-500 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-all"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-5 gap-4 border-b border-gray-200 dark:border-slate-800/80">
        <button 
          onClick={() => setTab('chats')}
          className={`pb-3 text-sm font-semibold transition-all relative ${
            tab === 'chats' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700'
          }`}
        >
          Trò chuyện
          {tab === 'chats' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></div>}
        </button>
        <button 
          onClick={() => setTab('groups')}
          className={`pb-3 text-sm font-semibold transition-all relative ${
            tab === 'groups' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700'
          }`}
        >
          Nhóm
          {tab === 'groups' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></div>}
        </button>
      </div>

      {/* Search & Action */}
      <div className="p-4 px-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder={tab === 'chats' ? "Tìm người dùng..." : "Tìm nhóm..."} 
            className="w-full bg-gray-100 dark:bg-slate-800/50 text-gray-900 dark:text-slate-300 text-sm rounded-xl py-2.5 pl-9 pr-4 outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow border border-gray-200 dark:border-slate-700/50"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {tab === 'groups' && (
          <button 
            onClick={() => setIsCreateGroupOpen(true)}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
            title="Tạo Nhóm Mới"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {tab === 'chats' ? (
          <>
            <p className="px-3 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Liên hệ</p>
            <div className="space-y-1">
              {filteredUsers.map((u, idx) => {
                const isOnline = onlineUsers.has(u.id) || u.online;
                return (
                  <button
                    key={u.id || `user-${idx}`}
                    onClick={() => onSelectUser(u)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                      selectedUser?.id === u.id 
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 shadow-sm' 
                        : 'hover:bg-gray-100 dark:hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-colors overflow-hidden ${
                        selectedUser?.id === u.id 
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg'
                          : 'bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                      }`}>
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (u.displayName || u.username || '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full translate-x-0.5 translate-y-0.5"></div>
                      )}
                    </div>
                    
                    <div className="flex-1 text-left min-w-0">
                      <h3 className={`font-medium truncate transition-colors ${
                        selectedUser?.id === u.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'
                      }`}>
                        {u.displayName || u.username}
                      </h3>
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <p className="text-xs text-gray-500 dark:text-slate-500 truncate flex items-center gap-1 transition-colors flex-1">
                          {lastMessages[u.id] && lastMessages[u.id].senderId !== user.id ? (
                            <span className="truncate">
                              {formatPreview(lastMessages[u.id].decryptedContent, lastMessages[u.id].type)}
                            </span>
                          ) : (
                            <>
                              <ShieldCheck className="w-3 h-3 text-emerald-500" />
                              Bảo mật khả dụng
                            </>
                          )}
                        </p>
                        {lastMessages[u.id] && !lastMessages[u.id].readAt && lastMessages[u.id].senderId !== user.id && (
                          <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-sm shadow-indigo-500/40 shrink-0"></div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-slate-500 text-sm">Không tìm thấy ai.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="px-3 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Nhóm của bạn</p>
            <div className="space-y-1">
              {groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase())).map((g, idx) => (
                <button
                  key={g.id || `group-${idx}`}
                  onClick={() => onSelectUser({ ...g, isGroup: true })}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    selectedUser?.id === g.id 
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 shadow-sm' 
                      : 'hover:bg-gray-100 dark:hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden shadow-sm">
                    {g.avatarUrl ? (
                      <img src={g.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UsersIcon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <h3 className={`font-medium truncate transition-colors ${
                      selectedUser?.id === g.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'
                    }`}>
                      {g.name}
                    </h3>
                    <div className="flex items-center justify-between gap-2 overflow-hidden">
                      <p className="text-xs text-gray-500 dark:text-slate-500 truncate flex items-center gap-1 flex-1">
                        {lastMessages[g.id] && lastMessages[g.id].senderId !== user.id ? (
                          <span className="truncate">
                            {formatPreview(lastMessages[g.id].decryptedContent, lastMessages[g.id].type)}
                          </span>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                            Mã hóa Sender Keys
                          </>
                        )}
                      </p>
                      {lastMessages[g.id] && lastMessages[g.id].id !== g.lastReadMessageId && lastMessages[g.id].senderId !== user.id && (
                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/40 shrink-0"></div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {groups.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-slate-500 text-sm">Bạn chưa tham gia nhóm nào.</div>
              )}
            </div>
          </>
        )}
      </div>
      
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <CreateGroupModal 
        isOpen={isCreateGroupOpen} 
        onClose={() => setIsCreateGroupOpen(false)} 
        onGroupCreated={(group) => {
          setGroups(prev => [group, ...prev]);
          setTab('groups');
        }} 
      />
    </div>
  );
};

export default Sidebar;
