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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-md glass rounded-[40px] premium-shadow border-[var(--glass-border)] overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="p-8 border-b border-[var(--border)] flex justify-between items-center bg-white/5">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-500" /> Tạo Nhóm Mới
            </h2>
            <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] ml-11">Kết nối cộng đồng E2E</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all duration-300 text-[var(--text-secondary)] hover:text-red-500 hover:rotate-90">
             <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
          {/* Group Name */}
          <div className="space-y-3">
            <label className="text-[11px] font-black text-[var(--text-secondary)] ml-1 uppercase tracking-widest">Tên nhóm của bạn</label>
            <input 
              type="text"
              placeholder="Ví dụ: Đội ngũ Phát triển"
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-bold placeholder-[var(--text-secondary)]/30 shadow-sm"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Member Selection */}
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-end px-1">
              <label className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-widest">
                Chọn thành viên
              </label>
              <span className="text-[10px] font-black text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-full uppercase tracking-widest">
                Đã chọn: {selectedIds.length}
              </span>
            </div>
            
            <div className="relative group">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Tìm tên liên hệ..." 
                className="w-full bg-[var(--input-bg)] text-[var(--text-primary)] text-sm font-medium rounded-2xl py-4 pl-12 pr-4 outline-none border border-transparent focus:border-[var(--primary)]/30 focus:ring-4 focus:ring-[var(--primary)]/10 transition-all"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px] border border-[var(--border)] rounded-[24px] p-3 bg-[var(--bg-secondary)]/30 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Đang tải...</p>
                </div>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleToggleUser(u.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 ${
                      selectedIds.includes(u.id) 
                        ? 'bg-indigo-500/10 border-2 border-indigo-500/40 shadow-lg shadow-indigo-500/5 scale-[0.98]' 
                        : 'hover:bg-white/5 border-2 border-transparent'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center overflow-hidden border-2 border-[var(--border)] shadow-inner">
                      {u.avatarUrl ? (
                         <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                         <span className="text-lg font-black text-indigo-500">
                           {u.displayName?.[0]?.toUpperCase() || u.username[0]?.toUpperCase()}
                         </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                       <p className="text-sm font-bold text-[var(--text-primary)] truncate">{u.displayName || u.username}</p>
                       <p className="text-[10px] font-bold text-[var(--text-secondary)]/60 tracking-wider">@{u.username}</p>
                    </div>
                    {selectedIds.includes(u.id) && (
                      <div className="w-6 h-6 premium-gradient rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-scale-in">
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />
                      </div>
                    )}
                  </button>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Không tìm thấy ai</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 bg-white/5 border-t border-[var(--border)] flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-4 glass text-[var(--text-primary)] font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleCreate}
            disabled={creating || !name.trim() || selectedIds.length === 0}
            className="flex-[2] px-6 py-4 premium-gradient text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 hover:brightness-110 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-widest text-xs active:scale-95"
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Xác nhận tạo nhóm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupModal;
