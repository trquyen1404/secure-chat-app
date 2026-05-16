import React, { useState, useEffect } from 'react';
import { X, Bell, Megaphone, Plus, Clock } from 'lucide-react';
import api from '../utils/axiosConfig';

const AnnouncementModal = ({ group, isTeacher, onClose }) => {
  const [anns, setAnns] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', isUrgent: false });

  useEffect(() => { fetchAnns(); }, []);
  const fetchAnns = async () => {
    const res = await api.get(`/api/academic/announcements/${group.id}`);
    setAnns(res.data);
  };

  const handleCreate = async () => {
    await api.post('/api/academic/announcements', { ...form, groupId: group.id });
    setShowAdd(false);
    fetchAnns();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[var(--bg-primary)] rounded-[32px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[70vh]">
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-indigo-500/5">
          <div className="flex items-center gap-3">
            <Megaphone className="w-6 h-6 text-indigo-500" />
            <h2 className="text-xl font-black">Bảng tin lớp học</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isTeacher && !showAdd && (
            <button onClick={() => setShowAdd(true)} className="w-full py-3 border-2 border-dashed border-indigo-500/30 rounded-2xl text-indigo-500 font-bold hover:bg-indigo-500/5 transition-all">
              + Đăng thông báo mới
            </button>
          )}

          {showAdd && (
            <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/20 space-y-4">
               <input 
                type="text" placeholder="Tiêu đề thông báo" 
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none"
                value={form.title} onChange={e => setForm({...form, title: e.target.value})}
               />
               <textarea 
                placeholder="Nội dung chi tiết..." 
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none h-24"
                value={form.content} onChange={e => setForm({...form, content: e.target.value})}
               />
               <div className="flex items-center justify-between">
                 <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                   <input type="checkbox" checked={form.isUrgent} onChange={e => setForm({...form, isUrgent: e.target.checked})} /> Khẩn cấp
                 </label>
                 <div className="flex gap-2">
                   <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs font-bold text-[var(--text-secondary)]">Hủy</button>
                   <button onClick={handleCreate} className="px-6 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg">Đăng tin</button>
                 </div>
               </div>
            </div>
          )}

          {anns.map(ann => (
            <div key={ann.id} className={`p-5 rounded-3xl border ${ann.isUrgent ? 'bg-red-500/5 border-red-500/20' : 'bg-[var(--hover)]/30 border-[var(--border)]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${ann.isUrgent ? 'bg-red-500 text-white' : 'bg-indigo-500/10 text-indigo-500'}`}>
                  {ann.isUrgent ? 'Khẩn cấp' : 'Thông báo'}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-bold">
                  <Clock className="w-3 h-3" /> {new Date(ann.createdAt).toLocaleDateString()}
                </div>
              </div>
              <h4 className="font-black text-sm mb-2">{ann.title}</h4>
              <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{ann.content}</p>
              <div className="mt-4 pt-4 border-t border-[var(--border)] text-[10px] text-[var(--text-secondary)] font-bold">
                Đăng bởi: {ann.Author?.displayName || ann.Author?.username}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnnouncementModal;
