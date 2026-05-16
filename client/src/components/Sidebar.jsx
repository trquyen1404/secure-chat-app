import React, { useEffect, useState } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Search, Settings, Edit, Users as UsersIcon, ShieldCheck, Moon, Sun, LogOut, UserPlus, Link, Calendar } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import ProfileModal from './ProfileModal';
import CreateGroupModal from './CreateGroupModal';
import FriendModal from './FriendModal';
import { processIncomingMessage, processGroupMessage } from '../utils/ratchetLogic';
import FolderManager from './FolderManager';
import Timetable from './Timetable';
import { Folder } from 'lucide-react';

const Sidebar = ({ selectedUser, onSelectUser, className }) => {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const auth = useAuth() || {};
  const { token, logout, user = {}, masterKey } = auth;
  const socketContext = useSocket() || {};
  const { socket, onlineUsers = new Map() } = socketContext;
  const themeContext = useTheme() || {};
  const { theme = 'light', toggleTheme = () => {} } = themeContext;
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
  const [tab, setTab] = useState('all'); // 'all', 'unread', 'groups', or 'folder_ID'
  const [lastMessages, setLastMessages] = useState({});
  const [folders, setFolders] = useState([]);
  const [typingStates, setTypingStates] = useState({}); // chatPartnerId -> boolean

  const handleJoinGroup = async () => {
    const code = window.prompt('Nhập mã mời tham gia Nhóm/Lớp học:');
    if (!code) return;
    try {
      const res = await api.post('/api/groups/join', { inviteCode: code.trim().toUpperCase() });
      alert(res.data.message);
      window.location.reload();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi tham gia nhóm');
    }
  };

  const formatPreview = (content, type) => {
    if (!content) return '[Tin nhắn mã hóa]';
    if (content.startsWith('[IMG]')) return '📷 Ảnh';
    if (content.startsWith('[AUDIO]')) return '🎵 Tin nhắn thoại';
    if (content.startsWith('[FILE|')) return '📁 Tệp';
    return content;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [friendsRes, groupsRes] = await Promise.all([
          api.get('/api/friends'),
          api.get('/api/groups')
        ]);
        setUsers(friendsRes.data);
        setGroups(groupsRes.data);
        
        try {
          const foldersRes = await api.get('/api/users/folders');
          setFolders(foldersRes.data || []);
        } catch (e) {}

        const msgMap = {};
        friendsRes.data.forEach(u => { 
          const uid = u.id || u._id;
          if (u.latestMessage && uid) msgMap[uid] = u.latestMessage; 
        });
        groupsRes.data.forEach(g => { 
          const gid = g.id || g._id;
          if (g.latestMessage && gid) msgMap[gid] = g.latestMessage; 
        });
        setLastMessages(msgMap);
      } catch (error) {
        console.error('Failed to fetch sidebar data:', error);
      }
    };
    if (token) fetchData();
  }, [token]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMsg = async (msg) => {
      if (!masterKey || !user) return;
      if (msg.senderId === user.id) return;
      const chatPartnerId = msg.senderId === user.id ? msg.recipientId : msg.senderId;
      const { content } = await processIncomingMessage(msg, masterKey, user);
      if (content) msg.decryptedContent = content;
      setLastMessages(prev => ({ ...prev, [chatPartnerId]: msg }));
    };

    const handleNewGrpMsg = async (msg) => {
      if (!masterKey || !user) return;
      if (msg.senderId === user.id) return;
      const { content } = await processGroupMessage(msg, masterKey, user);
      if (content) msg.decryptedContent = content;
      setLastMessages(prev => ({ ...prev, [msg.groupId]: msg }));
    };

    const handleRead = ({ byUserId }) => {
      setLastMessages(prev => {
        const msg = prev[byUserId];
        if (msg && msg.senderId === user?.id) {
          return { ...prev, [byUserId]: { ...msg, readAt: new Date() } };
        }
        return prev;
      });
    };

    const handleDelete = ({ messageId }) => {
      setLastMessages(prev => {
        const next = { ...prev };
        for (const [id, msg] of Object.entries(next)) {
          if (msg.id === messageId) {
            next[id] = { ...msg, isDeleted: true, decryptedContent: '[Tin nhắn đã thu hồi]' };
            break;
          }
        }
        return next;
      });
    };

    const onTyping = ({ senderId }) => setTypingStates(p => ({ ...p, [senderId]: true }));
    const onGrpTyping = ({ groupId, senderId }) => senderId !== user?.id && setTypingStates(p => ({ ...p, [groupId]: true }));
    const onStop = ({ senderId }) => setTypingStates(p => ({ ...p, [senderId]: false }));
    const onGrpStop = ({ groupId }) => setTypingStates(p => ({ ...p, [groupId]: false }));

    socket.on('newMessage', handleNewMsg);
    socket.on('newGroupMessage', handleNewGrpMsg);
    socket.on('messagesRead', handleRead);
    socket.on('groupMessageRead', ({ groupId, byUserId }) => handleRead({ byUserId: groupId }));
    socket.on('messageDeleted', handleDelete);
    socket.on('typing', onTyping);
    socket.on('groupTyping', onGrpTyping);
    socket.on('stopTyping', onStop);
    socket.on('groupStopTyping', onGrpStop);

    const handleForcedLogout = () => logout();
    const handleGroupDeleted = (e) => {
      setGroups(prev => prev.filter(g => g.id !== e.detail.groupId));
    };

    window.addEventListener('auth-logout', handleForcedLogout);
    window.addEventListener('group_deleted', handleGroupDeleted);

    return () => {
      socket.off('newMessage', handleNewMsg);
      socket.off('newGroupMessage', handleNewGrpMsg);
      socket.off('messagesRead', handleRead);
      socket.off('groupMessageRead');
      socket.off('messageDeleted', handleDelete);
      socket.off('typing', onTyping);
      socket.off('groupTyping', onGrpTyping);
      socket.off('stopTyping', onStop);
      socket.off('groupStopTyping');
      window.removeEventListener('auth-logout', handleForcedLogout);
      window.removeEventListener('group_deleted', handleGroupDeleted);
    };
  }, [socket, user?.id, masterKey]);

  const filteredItems = [
    ...users.map(u => ({ ...u, type: 'user', isGroup: false })),
    ...groups.map(g => ({ ...g, type: 'group', isGroup: true }))
  ].filter(item => {
    const name = item.username || item.name || '';
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
    if (tab === 'groups') return item.type === 'group' && matchesSearch;
    if (tab === 'unread') {
        const lastMsg = lastMessages[item.id];
        return lastMsg && !lastMsg.readAt && lastMsg.senderId !== user?.id && matchesSearch;
    }
    if (tab.startsWith('folder_')) {
      const folderId = tab.replace('folder_', '');
      const folder = folders.find(f => f.id === folderId);
      return folder && folder.chatIds.includes(item.id) && matchesSearch;
    }
    return matchesSearch;
  }).sort((a, b) => {
      const timeA = lastMessages[a.id]?.createdAt || '0';
      const timeB = lastMessages[b.id]?.createdAt || '0';
      return new Date(timeB) - new Date(timeA);
  });

  return (
    <div className={`w-[380px] h-full flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border)] relative z-10 transition-all ${className}`}>
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">ĐOẠN CHAT</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsCreateGroupOpen(true)}
            className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all duration-300"
            title="Tạo Lớp/Nhóm mới">
            <Edit className="w-5 h-5" />
          </button>
          <button 
            onClick={handleJoinGroup}
            className="w-10 h-10 rounded-xl premium-gradient flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all duration-300"
            title="Tham gia Lớp/Nhóm bằng Mã">
            <Link className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 mb-4">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] group-focus-within:text-[var(--primary)] transition-colors" />
          <input 
            type="text" 
            placeholder="Tìm kiếm hội thoại..."
            className="w-full bg-[var(--input-bg)] text-[var(--text-primary)] pl-11 pr-4 py-3 rounded-2xl outline-none text-[14px] border border-transparent focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] transition-all duration-300"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-6 py-2 flex gap-2 overflow-x-auto no-scrollbar mb-2">
        <CategoryTab label="Tất cả" active={tab === 'all'} onClick={() => setTab('all')} />
        <CategoryTab label="Chưa đọc" active={tab === 'unread'} onClick={() => setTab('unread')} />
        <CategoryTab label="Nhóm" active={tab === 'groups'} onClick={() => setTab('groups')} />
        <button 
          onClick={() => setIsFriendModalOpen(true)}
          className="px-3 py-1.5 rounded-full text-[13px] font-semibold text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all whitespace-nowrap flex items-center gap-1"
        >
          <UserPlus className="w-3.5 h-3.5" /> Bạn bè
        </button>
        <CategoryTab label="Lịch học" active={tab === 'calendar'} onClick={() => setTab('calendar')} />
        {folders.map(f => (
          <CategoryTab 
            key={f.id} 
            label={f.name} 
            active={tab === `folder_${f.id}`} 
            onClick={() => setTab(`folder_${f.id}`)} 
          />
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 py-2">
        {tab === 'calendar' ? (
          <Timetable />
        ) : (
          <>
            {filteredItems.map((item, idx) => {
              const itemId = item.id || item._id;
              const isSelected = (selectedUser?.id || selectedUser?._id) === itemId;
              const lastMsg = lastMessages[itemId];
              const presence = onlineUsers.get(itemId);
              const isOnline = presence ? presence.online : item.online;
              const unread = lastMsg && !lastMsg.readAt && lastMsg.senderId !== user?.id;
              
              return (
                <div
                  key={item.id || item._id}
                  onClick={() => {
                    const standardizedItem = { ...item, id: item.id || item._id };
                    onSelectUser(standardizedItem);
                  }}
                  style={{ animationDelay: `${idx * 50}ms` }}
                  className={`group px-4 py-3.5 rounded-2xl cursor-pointer flex items-center gap-4 transition-all duration-300 animate-fade-in ${
                    isSelected 
                      ? 'bg-[var(--primary)] text-white shadow-lg shadow-indigo-500/20' 
                      : 'hover:bg-[var(--hover)]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-14 h-14 rounded-2xl bg-[var(--bg-accent)] flex items-center justify-center overflow-hidden border-2 transition-transform duration-300 group-hover:scale-105 ${
                      isSelected ? 'border-white/20' : 'border-transparent'
                    }`}>
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className={`text-xl font-bold ${isSelected ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                          {(item.username || item.name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {isOnline && (
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 bg-[#10b981] rounded-full border-[3px] ${
                        isSelected ? 'border-[var(--primary)]' : 'border-[var(--bg-primary)]'
                      }`}></div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className={`text-[15px] font-semibold truncate ${isSelected ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                        {item.username || item.name}
                      </h3>
                      {lastMsg && (
                        <span className={`text-[11px] shrink-0 font-medium ${isSelected ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>
                          {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[13px] truncate flex-1 ${
                        unread ? 'font-bold' : ''
                      } ${isSelected ? 'text-white/80' : 'text-[var(--text-secondary)]'}`}>
                        {typingStates[itemId] ? (
                          <span className={`${isSelected ? 'text-white' : 'text-indigo-500'} font-medium animate-pulse`}>Đang soạn tin nhắn...</span>
                        ) : lastMsg ? (
                          formatPreview(lastMsg.decryptedContent, lastMsg.type)
                        ) : (
                          'Bắt đầu cuộc trò chuyện'
                        )}
                      </p>
                      {unread && (
                        <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shrink-0 animate-pulse"></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)] opacity-50">
                <Search className="w-12 h-12 mb-3" />
                <p className="text-sm">Không tìm thấy hội thoại nào</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* User Profile Footer */}
      <div className="p-4 bg-white/5 border-t border-[var(--border)]">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--hover)] group transition-all">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-indigo-500/20">
                <img 
                  src={user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
             </div>
             <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">{user?.displayName || user?.username}</p>
                <p className="text-[10px] text-[var(--text-secondary)] truncate">Sẵn sàng học tập</p>
             </div>
          </div>
          <div className="flex gap-1">
             <button 
               onClick={() => setIsProfileOpen(true)}
               className="p-2 hover:bg-white/10 rounded-lg text-indigo-500 transition-all"
               title="Sửa hồ sơ"
             >
               <Settings className="w-4 h-4" />
             </button>
             <button 
               onClick={logout}
               className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition-all"
               title="Đăng xuất"
             >
               <LogOut className="w-4 h-4" />
             </button>
          </div>
        </div>
      </div>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <FriendModal isOpen={isFriendModalOpen} onClose={() => setIsFriendModalOpen(false)} />
      <CreateGroupModal 
        isOpen={isCreateGroupOpen} 
        onClose={() => setIsCreateGroupOpen(false)} 
        onGroupCreated={(group) => {
          setGroups(prev => [group, ...prev]);
          onSelectUser({ ...group, type: 'group' });
        }} 
      />
      <FolderManager 
        isOpen={isFolderManagerOpen}
        onClose={() => setIsFolderManagerOpen(false)}
        folders={folders}
        onFoldersUpdate={setFolders}
        allChats={[...users.map(u => ({ ...u, id: u.id })), ...groups.map(g => ({ ...g, id: g.id, isGroup: true }))]}
      />
    </div>
  );
};

const CategoryTab = ({ label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap ${
      active 
        ? 'bg-blue-500/10 text-blue-500' 
        : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
    }`}
  >
    {label}
  </button>
);

export default Sidebar;
