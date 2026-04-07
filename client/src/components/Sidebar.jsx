import React, { useEffect, useState } from 'react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { LogOut, Search, ShieldCheck, Moon, Sun, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { clearRatchetDB } from '../utils/ratchetStore';
import { clearKeyStore } from '../utils/keyStore';

const Sidebar = ({ selectedUser, onSelectUser }) => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const { token, logout, user } = useAuth();
  const { onlineUsers } = useSocket();
  const { theme, toggleTheme } = useTheme();

  const handleWipeData = async () => {
    if (window.confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ khóa và lịch sử chat trên máy này. Tiếp tục?')) {
      console.log('[WIPE] Clearing all local security data...');
      await clearRatchetDB();
      await clearKeyStore();
      logout();
      window.location.reload();
    }
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/api/users');
        setUsers(res.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };
    if (token) fetchUsers();
  }, [token]);

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-80 flex flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl border-r border-gray-200 dark:border-slate-800/80 transition-colors duration-300">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center relative shadow-lg shadow-indigo-500/20">
             <ShieldCheck className="w-5 h-5 text-white" />
             <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 translate-x-1 -translate-y-1"></div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[100px]">{user?.username}</h2>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium tracking-wide">E2E Secured</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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

      {/* Search */}
      <div className="p-4 px-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Tìm người dùng..." 
            className="w-full bg-gray-100 dark:bg-slate-800/50 text-gray-900 dark:text-slate-300 text-sm rounded-xl py-2.5 pl-9 pr-4 outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow border border-gray-200 dark:border-slate-700/50"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Liên hệ</p>
        <div className="space-y-1">
          {filteredUsers.map((u) => {
            // Determine real-time online status
            const isOnline = onlineUsers.has(u.id) || u.online;
            
            return (
              <button
                key={u.id}
                onClick={() => onSelectUser(u)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                  selectedUser?.id === u.id 
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 shadow-sm' 
                    : 'hover:bg-gray-100 dark:hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                    selectedUser?.id === u.id 
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg'
                      : 'bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                  }`}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  {isOnline && (
                     <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full translate-x-0.5 translate-y-0.5"></div>
                  )}
                </div>
                
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className={`font-medium truncate transition-colors ${
                      selectedUser?.id === u.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-slate-200'
                    }`}>
                      {u.username}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-500 truncate flex items-center gap-1 transition-colors">
                     <ShieldCheck className="w-3 h-3" />
                     Bảo mật khả dụng
                  </p>
                </div>
              </button>
            )
          })}
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-slate-500 text-sm">
              Không tìm thấy ai.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
