import React, { useState, useEffect } from 'react';
import { X, FileEdit, Save, History, Plus } from 'lucide-react';
import api from '../utils/axiosConfig';

const CollaborativeNotes = ({ group, onClose }) => {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchNotes(); }, []);
  const fetchNotes = async () => {
    const res = await api.get(`/api/academic/notes/${group.id}`);
    setNotes(res.data);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/api/academic/notes', { id: activeNote?.id, groupId: group.id, title, content });
      fetchNotes();
      setActiveNote(null);
    } finally { setSaving(false); }
  };

  const startEdit = (note) => {
    setActiveNote(note);
    setTitle(note ? note.title : '');
    setContent(note ? note.content : '');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[32px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[80vh]">
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileEdit className="w-6 h-6 text-indigo-500" />
            <h2 className="text-xl font-black">Ghi chép lớp học</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <div className="w-64 border-r border-[var(--border)] overflow-y-auto p-4 space-y-2 bg-[var(--bg-secondary)]/30">
            <button onClick={() => startEdit(null)} className="w-full py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold mb-4">+ Ghi chú mới</button>
            {notes.map(note => (
              <button 
                key={note.id} 
                onClick={() => startEdit(note)}
                className={`w-full text-left p-3 rounded-xl transition-all ${activeNote?.id === note.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-[var(--hover)]'}`}
              >
                <p className="text-xs font-bold truncate">{note.title}</p>
                <p className="text-[10px] opacity-60 truncate">{new Date(note.updatedAt).toLocaleDateString()}</p>
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col p-6 space-y-4">
            {(activeNote || title || content) ? (
              <>
                <input 
                  type="text" placeholder="Tiêu đề ghi chú..." 
                  className="text-lg font-black bg-transparent outline-none border-b border-[var(--border)] pb-2 focus:border-indigo-500 transition-all"
                  value={title} onChange={e => setTitle(e.target.value)}
                />
                <textarea 
                  placeholder="Bắt đầu ghi chép nội dung bài giảng tại đây..." 
                  className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
                  value={content} onChange={e => setContent(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg">
                    <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                <FileEdit className="w-16 h-16 mb-4" />
                <p className="text-sm font-bold uppercase tracking-widest">Chọn một ghi chú để bắt đầu</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborativeNotes;
