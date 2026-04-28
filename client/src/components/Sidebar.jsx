import React, { useEffect, useState } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { LogOut, Search, ShieldCheck, Moon, Sun, Settings, Pin, Plus, Zap, Edit, Users as UsersIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import MyProfileSettings from './MyProfileSettings';
import ProfileModal from './ProfileModal';
import CreateGroupModal from './CreateGroupModal';
import { processIncomingMessage, processGroupMessage } from '../utils/ratchetLogic';

const Sidebar = ({ selectedUser, onSelectUser }) => {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [pinnedUserIds, setPinnedUserIds] = useState([]);
  const [stories, setStories] = useState([]);
  const { token, logout, user, masterKey } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [tab, setTab] = useState('all'); // 'all', 'unread', 'groups'
  const [lastMessages, setLastMessages] = useState({});

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
        const [usersRes, groupsRes, pinsRes, storiesRes] = await Promise.all([
          api.get('/api/users'),
          api.get('/api/groups'),
          api.get('/api/users/pins'),
          api.get('/api/stories')
        ]);
        setUsers(usersRes.data);
        setGroups(groupsRes.data);
        setPinnedUserIds(pinsRes.data.map(p => p.targetUserId));
        setStories(storiesRes.data);
        
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
    if (!socket) return;
    const handleNewMsg = async (msg) => {
      if (msg.senderId === user.id) return;
      const chatPartnerId = msg.senderId === user.id ? msg.recipientId : msg.senderId;
      const { content } = await processIncomingMessage(msg, masterKey, user);
      if (content) msg.decryptedContent = content;
      setLastMessages(prev => ({ ...prev, [chatPartnerId]: msg }));
    };

    const handleNewGrpMsg = async (msg) => {
      if (msg.senderId === user.id) return;
      const { content } = await processGroupMessage(msg, masterKey, user);
      if (content) msg.decryptedContent = content;
      setLastMessages(prev => ({ ...prev, [msg.groupId]: msg }));
    };

    socket.on('newMessage', handleNewMsg);
    socket.on('newGroupMessage', handleNewGrpMsg);

    const handleForcedLogout = () => logout();
    const handleTokenRefreshed = (e) => { /* logic if needed */ };
    const handleGroupDeleted = (e) => {
      setGroups(prev => prev.filter(g => g.id !== e.detail.groupId));
    };

    window.addEventListener('auth-logout', handleForcedLogout);
    window.addEventListener('auth-refreshed', handleTokenRefreshed);
    window.addEventListener('group_deleted', handleGroupDeleted);

    return () => {
      socket.off('newMessage', handleNewMsg);
      socket.off('newGroupMessage', handleNewGrpMsg);
      window.removeEventListener('auth-logout', handleForcedLogout);
      window.removeEventListener('auth-refreshed', handleTokenRefreshed);
      window.removeEventListener('group_deleted', handleGroupDeleted);
    };
  }, [socket, user?.id, masterKey, logout]);

  const filteredItems = [
    ...users.map(u => ({ ...u, type: 'user', isGroup: false })),
    ...groups.map(g => ({ ...g, type: 'group', isGroup: true }))
  ].filter(item => {
    const name = item.username || item.name || '';
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
    if (tab === 'groups') return item.type === 'group' && matchesSearch;
    if (tab === 'unread') {
        const lastMsg = lastMessages[item.id];
        return lastMsg && !lastMsg.readAt && lastMsg.senderId !== user.id && matchesSearch;
    }
    return matchesSearch;
  }).sort((a, b) => {
      // Pin logic
      const aPinned = pinnedUserIds.includes(a.id);
      const bPinned = pinnedUserIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const timeA = lastMessages[a.id]?.createdAt || '0';
      const timeB = lastMessages[b.id]?.createdAt || '0';
      return new Date(timeB) - new Date(timeA);
  });

  return (
    <div className="w-[360px] h-full flex flex-col bg-[var(--bg-primary)] border-r border-[var(--border)] relative">
      
      {/* Settings Panel Sliding In */}
      <div className={`absolute inset-0 z-20 bg-white dark:bg-slate-900 transition-transform duration-300 ${showSettings ? 'translate-x-0' : '-translate-x-full'}`}>
        {showSettings && <MyProfileSettings onClose={() => setShowSettings(false)} />}
      </div>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-slate-800/50 p-1.5 rounded-xl transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center relative shadow-lg shadow-indigo-500/20">
                 <span className="text-white font-bold">{user?.username?.charAt(0).toUpperCase()}</span>
                 <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 translate-x-1 -translate-y-1"></div>
              </div>
            </button>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Đoạn chat</h1>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => navigate('/benchmark')}
            className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all animate-pulse"
            title="Đánh giá So sánh Thuật toán Đồ án"
          >
            <Zap className="w-5 h-5" />
          </button>
          <button 
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full bg-[var(--hover)] flex items-center justify-center text-[var(--text-primary)] hover:brightness-90 transition-all"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="w-9 h-9 rounded-full bg-[var(--hover)] flex items-center justify-center text-[var(--text-primary)] hover:brightness-90 transition-all"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsCreateGroupOpen(true)}
            className="w-9 h-9 rounded-full bg-[var(--hover)] flex items-center justify-center text-[var(--text-primary)] hover:brightness-90 transition-all">
            <Edit className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stories */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800/80 bg-gray-50/50 dark:bg-slate-900/50 flex gap-4 overflow-x-auto no-scrollbar shrink-0">
         <div className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group" onClick={() => {
             const content = prompt("Nhập nội dung Story của bạn (Sẽ tự biến mất sau 24h):");
             if (content) {
                api.post('/api/stories', { content }).then((res) => {
                   setStories([{ ...res.data, Author: user }, ...stories]);
                });
             }
         }}>
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-indigo-300 dark:border-indigo-500/50 flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/30 transition-colors">
               <Plus className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Tin của bạn</span>
         </div>

         {Object.values(stories.reduce((acc, story) => {
            if (!acc[story.userId]) acc[story.userId] = { ...story.Author, stories: [] };
            acc[story.userId].stories.push(story);
            return acc;
         }, {})).map((author) => (
             <div key={`story-user-${author.id}`} className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group" onClick={() => {
                 alert(`Story của ${author.username}:\n${author.stories.map(s => `- ${s.content}`).join('\n')}`);
             }}>
                <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-rose-500 to-fuchsia-600">
                   <div className="w-full h-full rounded-full border-2 border-white dark:border-slate-900 bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-slate-300">
                      {(author.username || '?').charAt(0).toUpperCase()}
                   </div>
                </div>
                <span className="text-[10px] text-gray-700 dark:text-slate-300 font-medium truncate w-14 text-center">{author.id === user?.id ? 'Bạn' : author.username}</span>
             </div>
         ))}
      </div>

      {/* Search */}
      <div className="px-4 mb-2 mt-3">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Tìm kiếm"
            className="w-full bg-[var(--input-bg)] text-[var(--text-primary)] pl-10 pr-4 py-2 rounded-full outline-none text-[15px] placeholder-[var(--text-secondary)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 py-2 flex gap-1 overflow-x-auto no-scrollbar">
        <CategoryTab label="Tất cả" active={tab === 'all'} onClick={() => setTab('all')} />
        <CategoryTab label="Chưa đọc" active={tab === 'unread'} onClick={() => setTab('unread')} />
        <CategoryTab label="Nhóm" active={tab === 'groups'} onClick={() => setTab('groups')} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const isSelected = selectedUser?.id === item.id;
          const lastMsg = lastMessages[item.id];
          const isOnline = onlineUsers.has(item.id) || item.online;
          const isPinned = pinnedUserIds.includes(item.id);
          
          return (
            <div
              key={item.id}
              onClick={() => onSelectUser(item)}
              className={`px-3 py-2 mx-2 rounded-lg cursor-pointer flex items-center gap-3 transition-colors ${isSelected ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'}`}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-[var(--border)]">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-[var(--text-secondary)]">
                      {(item.username || item.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {isOnline && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#31a24c] rounded-full border-2 border-[var(--bg-primary)]"></div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className={`text-[15px] truncate flex items-center gap-1 ${!lastMsg?.readAt && lastMsg?.senderId !== user.id ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                    {item.username || item.name}
                    {isPinned && <Pin className="w-3 h-3 text-indigo-500 fill-indigo-500/20 rotate-45" />}
                  </h3>
                  {lastMsg && (
                    <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                      {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className={`text-xs truncate ${!lastMsg?.readAt && lastMsg?.senderId !== user.id ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                  {lastMsg ? formatPreview(lastMsg.decryptedContent, lastMsg.type) : 'Bắt đầu cuộc trò chuyện'}
                </p>
              </div>
            </div>
          );
        })}
        {filteredItems.length === 0 && (
          <div className="text-center py-10 text-[var(--text-secondary)]">
            Không tìm thấy hội thoại nào
          </div>
        )}
      </div>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <CreateGroupModal 
        isOpen={isCreateGroupOpen} 
        onClose={() => setIsCreateGroupOpen(false)} 
        onGroupCreated={(group) => {
          setGroups(prev => [group, ...prev]);
          onSelectUser({ ...group, type: 'group' });
        }} 
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
