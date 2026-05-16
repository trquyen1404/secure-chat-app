import React, { useState, useEffect } from 'react';
import { X, Ghost, Send, MessageSquare } from 'lucide-react';
import api from '../utils/axiosConfig';

const ConfessionModal = ({ group, onClose }) => {
  const [confessions, setConfessions] = useState([]);
  const [content, setContent] = useState('');

  useEffect(() => { fetchConfessions(); }, []);
  const fetchConfessions = async () => {
    const res = await api.get(`/api/academic/confessions/${group.id}`);
    setConfessions(res.data);
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await api.post('/api/academic/confessions', { groupId: group.id, content });
    setContent('');
    fetchConfessions();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[75vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between bg-zinc-500/5">
          <div className="flex items-center gap-4">
            <Ghost className="w-8 h-8 text-zinc-500" />
            <h2 className="text-2xl font-black">Góc ẩn danh</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="bg-zinc-500/5 p-6 rounded-[32px] border border-dashed border-zinc-500/20 space-y-4">
            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest text-center">Gửi lời nhắn ẩn danh cho lớp</p>
            <textarea 
              placeholder="Bạn muốn nói gì mà chưa dám nói?..." 
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl px-6 py-4 text-sm outline-none h-32 resize-none focus:border-zinc-500 transition-all"
              value={content} onChange={e => setContent(e.target.value)}
            />
            <button onClick={handleSubmit} className="w-full py-4 bg-zinc-800 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-zinc-900/20 active:scale-95 transition-all">
              <Send className="w-4 h-4" /> Gửi ẩn danh
            </button>
          </div>

          <div className="space-y-4">
            {confessions.map((c, idx) => (
              <div key={c.id} className="p-6 bg-[var(--bg-secondary)]/50 rounded-[32px] border border-[var(--border)] relative">
                <div className="absolute -top-3 -left-3 w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-xs font-black border border-[var(--border)] shadow-sm">#{confessions.length - idx}</div>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{c.content}</p>
                <div className="mt-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase flex items-center gap-2">
                   <MessageSquare className="w-3 h-3" /> {new Date(c.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfessionModal;
