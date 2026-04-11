import React, { useState, useEffect } from 'react';
import { X, Users, Search, Loader2, Check } from 'lucide-react';
import api from '../utils/axiosConfig';

const CreateGroupModal = ({ isOpen, onClose, onGroupCreated }) => {
  const [name, setName] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) return alert('Vui lòng nhập tên nhóm');
    if (selectedIds.length === 0) return alert('Vui lòng chọn ít nhất 1 thành viên');

    setCreating(true);
    try {
      const res = await api.post('/api/groups', {
        name,
        memberIds: selectedIds
      });
      if (onGroupCreated) onGroupCreated(res.data);
      onClose();
      // Reset state
      setName('');
      setSelectedIds([]);
    } catch (err) {
      console.error('Group creation failed', err);
      alert('Không thể tạo nhóm.');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/30">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-500" /> Tạo Nhóm Mới
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-500">
             <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Group Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">Tên nhóm</label>
            <input 
              type="text"
              placeholder="Ví dụ: Hội Nghiên Cứu E2EE"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 dark:text-white transition-all shadow-sm"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Member Selection */}
          <div className="space-y-2 flex-1 flex flex-col min-h-0">
            <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Thành viên ({selectedIds.length})
            </label>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Tìm liên hệ..." 
                className="w-full bg-gray-100 dark:bg-slate-800/50 text-gray-900 dark:text-slate-300 text-sm rounded-xl py-2.5 pl-9 pr-4 outline-none border border-gray-200 dark:border-slate-700/50"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px] border border-gray-100 dark:border-slate-800 rounded-xl p-2">
              {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleToggleUser(u.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                      selectedIds.includes(u.id) 
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20' 
                        : 'hover:bg-gray-100 dark:hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                      {u.avatarUrl ? (
                         <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                         <span className="text-sm font-bold text-gray-600 dark:text-slate-400">
                           {u.displayName?.[0]?.toUpperCase() || u.username[0]?.toUpperCase()}
                         </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                       <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{u.displayName || u.username}</p>
                       <p className="text-[10px] text-gray-500 truncate">@{u.username}</p>
                    </div>
                    {selectedIds.includes(u.id) && (
                      <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center shadow-md">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                ))
              ) : (
                <p className="text-center py-8 text-gray-500 text-sm">Không tìm thấy người dùng nào.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50/50 dark:bg-slate-800/30 border-t border-gray-100 dark:border-slate-800 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-gray-100 dark:hover:bg-slate-300/5 transition-colors"
          >
            Hủy
          </button>
          <button 
            onClick={handleCreate}
            disabled={creating || !name.trim() || selectedIds.length === 0}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Tạo Nhóm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupModal;
