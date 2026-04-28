import React, { useEffect, useState } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Search, Settings, Edit, Users as UsersIcon, ShieldCheck, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import ProfileModal from './ProfileModal';
import CreateGroupModal from './CreateGroupModal';
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
        const [usersRes, groupsRes] = await Promise.all([
          api.get('/api/users'),
          api.get('/api/groups')
        ]);
        setUsers(usersRes.data);
        setGroups(groupsRes.data);
        
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
    const handleTokenRefreshed = (e) => setToken(e.detail);
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
        return lastMsg && !lastMsg.readAt && lastMsg.senderId !== user.id && matchesSearch;
    }
    return matchesSearch;
  }).sort((a, b) => {
      const timeA = lastMessages[a.id]?.createdAt || '0';
      const timeB = lastMessages[b.id]?.createdAt || '0';
      return new Date(timeB) - new Date(timeA);
  });

  return (
    <div className="w-[360px] h-full flex flex-col bg-[var(--bg-primary)] border-r border-[var(--border)]">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Đoạn chat</h1>
        <div className="flex gap-2">
          <button 
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full bg-[var(--hover)] flex items-center justify-center text-[var(--text-primary)] hover:brightness-90 transition-all"
            title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
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

      {/* Search */}
      <div className="px-4 mb-2">
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
                  <h3 className={`text-[15px] truncate ${!lastMsg?.readAt && lastMsg?.senderId !== user.id ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                    {item.username || item.name}
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
