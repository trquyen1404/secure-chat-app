import React, { useState, useEffect } from 'react';
import { X, Users, Search, Plus, MessageCircle, BookOpen } from 'lucide-react';
import api from '../utils/axiosConfig';

const StudyPartnerFinder = ({ onClose }) => {
  const [posts, setPosts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '' });

  useEffect(() => { fetchPosts(); }, []);
  const fetchPosts = async () => {
    const res = await api.get('/api/academic/study-posts');
    setPosts(res.data);
  };

  const handleCreate = async () => {
    await api.post('/api/academic/study-posts', form);
    setShowAdd(false);
    fetchPosts();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[32px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[85vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black">Ghép đôi học tập</h2>
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Tìm kiếm bạn đồng hành tại UTT</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <h3 className="text-lg font-black">Tin tuyển bạn học mới nhất</h3>
            <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-indigo-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-transform active:scale-95">
              <Plus className="w-4 h-4" /> Đăng tin tìm bạn
            </button>
          </div>

          {showAdd && (
            <div className="p-8 bg-indigo-500/5 rounded-[32px] border border-indigo-500/20 space-y-4 animate-in slide-in-from-top-4 duration-300">
               <input 
                type="text" placeholder="Môn học bạn muốn học cùng (VD: Giải tích 1)" 
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl px-6 py-3 text-sm outline-none focus:border-indigo-500 transition-all"
                value={form.subject} onChange={e => setForm({...form, subject: e.target.value})}
               />
               <textarea 
                placeholder="Mô tả mục tiêu (VD: Muốn ôn thi cuối kỳ đạt điểm A, rảnh tối t3, t5...)" 
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl px-6 py-3 text-sm outline-none focus:border-indigo-500 transition-all h-24 resize-none"
                value={form.description} onChange={e => setForm({...form, description: e.target.value})}
               />
               <div className="flex justify-end gap-3">
                 <button onClick={() => setShowAdd(false)} className="px-6 py-2 text-sm font-bold text-[var(--text-secondary)]">Hủy</button>
                 <button onClick={handleCreate} className="px-8 py-2 bg-indigo-500 text-white rounded-xl text-sm font-black shadow-lg">Xác nhận đăng</button>
               </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {posts.map(post => (
              <div key={post.id} className="p-6 bg-[var(--hover)]/40 rounded-[32px] border border-[var(--border)] hover:border-indigo-500/50 transition-all hover:shadow-xl group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-indigo-500/10">
                    {post.Author?.avatarUrl ? <img src={post.Author.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-indigo-500">{post.Author?.username[0].toUpperCase()}</div>}
                  </div>
                  <div>
                    <p className="text-sm font-black">{post.Author?.displayName || post.Author?.username}</p>
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">{new Date(post.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <h4 className="text-base font-black text-indigo-500">{post.subject}</h4>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6 line-clamp-3">{post.description}</p>
                <button className="w-full py-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl text-xs font-black group-hover:bg-indigo-500 group-hover:text-white transition-all flex items-center justify-center gap-2">
                  <MessageCircle className="w-4 h-4" /> Liên hệ học chung
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyPartnerFinder;
