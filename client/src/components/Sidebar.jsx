import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { LogOut, Search, ShieldCheck } from 'lucide-react';

const Sidebar = ({ selectedUser, onSelectUser }) => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const { token, logout, user } = useAuth();
  const { onlineUsers } = useSocket();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get('/api/users', {
          headers: { Authorization: `Bearer ${token}` }
        });
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
    <div className="w-80 flex flex-col bg-slate-900/90 backdrop-blur-3xl border-r border-slate-800/80">
      {/* Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center relative shadow-lg shadow-indigo-500/20">
             <ShieldCheck className="w-5 h-5 text-white" />
             <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 translate-x-1 -translate-y-1"></div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200 truncate max-w-[120px]">{user?.username}</h2>
            <p className="text-xs text-indigo-400 font-medium tracking-wide">E2E Secured</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-all"
        >
          <LogOut className="w-5 h-5.5" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4 px-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Tìm người dùng..." 
            className="w-full bg-slate-800/50 text-slate-300 text-sm rounded-xl py-2.5 pl-9 pr-4 outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow border border-slate-700/50"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Liên hệ</p>
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
                    ? 'bg-indigo-500/10 border border-indigo-500/20 shadow-sm' 
                    : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                    selectedUser?.id === u.id 
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  {isOnline && (
                     <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full translate-x-0.5 translate-y-0.5"></div>
                  )}
                </div>
                
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className={`font-medium truncate ${
                      selectedUser?.id === u.id ? 'text-indigo-400' : 'text-slate-200'
                    }`}>
                      {u.username}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                     <ShieldCheck className="w-3 h-3" />
                     Bảo mật khả dụng
                  </p>
                </div>
              </button>
            )
          })}
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Không tìm thấy ai.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
