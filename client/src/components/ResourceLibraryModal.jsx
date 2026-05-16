import React, { useState, useEffect } from 'react';
import { X, Folder, FileText, Image, Film, Link as LinkIcon, Download, Pin, Trash2, Plus, Search, MoreVertical, FileCode, FileSpreadsheet, FileBox } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const ResourceLibraryModal = ({ group, isTeacher, messages, onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('official'); // 'official' | 'chat'
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newResource, setNewResource] = useState({ title: '', fileUrl: '', fileType: 'pdf', category: 'Slides' });

  useEffect(() => {
    if (activeTab === 'official') fetchResources();
  }, [activeTab, group.id]);

  const fetchResources = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/resources/groups/${group.id}`);
      setResources(res.data || []);
    } catch (err) {
      console.error('Failed to load resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddResource = async () => {
    if (!newResource.title || !newResource.fileUrl) return alert('Vui lòng nhập đủ thông tin');
    try {
      await api.post('/api/resources', { groupId: group.id, ...newResource });
      setShowAddForm(false);
      setNewResource({ title: '', fileUrl: '', fileType: 'pdf', category: 'Slides' });
      fetchResources();
    } catch (err) {
      alert('Lỗi khi thêm tài liệu');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xác nhận xóa tài liệu này?')) return;
    try {
      await api.delete(`/api/resources/${id}`);
      fetchResources();
    } catch (err) {
      alert('Lỗi khi xóa');
    }
  };

  const togglePin = async (id) => {
    try {
      await api.patch(`/api/resources/${id}/pin`);
      fetchResources();
    } catch (err) {
      console.error(err);
    }
  };

  // Extract media from chat messages
  const chatMedia = messages.filter(m => 
    m.decryptedContent?.startsWith('[IMG]') || 
    m.decryptedContent?.startsWith('[FILE|') ||
    m.decryptedContent?.startsWith('[GIF]')
  ).map(m => {
    if (m.decryptedContent.startsWith('[FILE|')) {
      const parts = m.decryptedContent.match(/\[FILE\|(.*?)\](.*)/);
      return { id: m.id, title: parts?.[1] || 'File', fileUrl: parts?.[2], fileType: 'file', createdAt: m.createdAt };
    }
    if (m.decryptedContent.startsWith('[IMG]')) {
      return { id: m.id, title: 'Ảnh từ chat', fileUrl: m.decryptedContent.replace('[IMG]', ''), fileType: 'img', createdAt: m.createdAt };
    }
    return { id: m.id, title: 'GIF từ chat', fileUrl: m.decryptedContent.replace('[GIF]', ''), fileType: 'img', createdAt: m.createdAt };
  });

  const getFileIcon = (type) => {
    const t = type.toLowerCase();
    if (t.includes('pdf')) return <FileText className="text-red-500" />;
    if (t.includes('doc')) return <FileText className="text-blue-500" />;
    if (t.includes('xls') || t.includes('spreadsheet')) return <FileSpreadsheet className="text-green-500" />;
    if (t.includes('ppt')) return <FileBox className="text-orange-500" />;
    if (t.includes('img') || t === 'image') return <Image className="text-purple-500" />;
    if (t.includes('video') || t === 'film') return <Film className="text-indigo-500" />;
    return <FileCode className="text-gray-500" />;
  };

  const displayList = activeTab === 'official' ? resources : chatMedia;
  const filteredList = displayList.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[32px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)] bg-gradient-to-r from-indigo-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Folder className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[var(--text-primary)]">Kho lưu trữ lớp học</h2>
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">{group.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all">
            <X className="w-6 h-6 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Tabs & Search */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex flex-col md:flex-row gap-4 justify-between items-center bg-[var(--bg-secondary)]/30">
          <div className="flex bg-[var(--hover)] p-1 rounded-2xl w-full md:w-auto">
            <button
              onClick={() => setActiveTab('official')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'official' ? 'bg-[var(--bg-primary)] text-indigo-500 shadow-sm' : 'text-[var(--text-secondary)]'}`}
            >
              📚 Tài liệu bài giảng
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'chat' ? 'bg-[var(--bg-primary)] text-indigo-500 shadow-sm' : 'text-[var(--text-secondary)]'}`}
            >
              💬 File từ đoạn chat
            </button>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Tìm tên tài liệu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {activeTab === 'official' && isTeacher && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-6 p-4 border-2 border-dashed border-indigo-500/30 rounded-2xl flex items-center justify-center gap-2 text-indigo-500 font-bold hover:bg-indigo-500/5 transition-all group"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              Thêm tài liệu mới vào thư viện lớp
            </button>
          )}

          {showAddForm && (
            <div className="mb-8 p-6 bg-indigo-500/5 rounded-[24px] border border-indigo-500/20 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-indigo-500">Tải tài liệu mới</h3>
                <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Tiêu đề tài liệu (VD: Slide chương 1)"
                  value={newResource.title}
                  onChange={e => setNewResource({...newResource, title: e.target.value})}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none"
                />
                <input
                  type="text"
                  placeholder="Link file tài liệu"
                  value={newResource.fileUrl}
                  onChange={e => setNewResource({...newResource, fileUrl: e.target.value})}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none"
                />
                <select
                  value={newResource.fileType}
                  onChange={e => setNewResource({...newResource, fileType: e.target.value})}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none"
                >
                  <option value="pdf">Adobe PDF (.pdf)</option>
                  <option value="doc">Word (.doc, .docx)</option>
                  <option value="ppt">PowerPoint (.ppt, .pptx)</option>
                  <option value="xls">Excel (.xls, .xlsx)</option>
                  <option value="img">Hình ảnh (.jpg, .png)</option>
                </select>
                <button
                  onClick={handleAddResource}
                  className="bg-indigo-500 text-white rounded-xl font-black text-sm hover:brightness-110 shadow-lg shadow-indigo-500/20"
                >
                  Xác nhận tải lên
                </button>
              </div>
            </div>
          )}

          {loading && activeTab === 'official' ? (
            <div className="text-center py-20 text-[var(--text-secondary)]">Đang tải tài liệu...</div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-20 opacity-30">
              <Folder className="w-16 h-16 mx-auto mb-4" />
              <p className="font-bold uppercase tracking-widest text-xs">Thư mục trống</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredList.map(item => (
                <div key={item.id} className={`group p-4 bg-[var(--hover)]/40 rounded-3xl border border-[var(--border)] hover:border-indigo-500/50 transition-all hover:shadow-xl hover:-translate-y-1 relative ${item.isPinned ? 'ring-2 ring-indigo-500/30' : ''}`}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--bg-primary)] flex items-center justify-center shadow-sm">
                      {getFileIcon(item.fileType || 'file')}
                    </div>
                    <div className="flex gap-1">
                      {activeTab === 'official' && (
                        <button onClick={() => togglePin(item.id)} className={`p-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors ${item.isPinned ? 'text-indigo-500' : 'text-gray-400'}`}>
                          <Pin className={`w-4 h-4 ${item.isPinned ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      {(isTeacher || item.userId === user?.id) && activeTab === 'official' && (
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--text-primary)] mb-1 line-clamp-2 min-h-[40px]">{item.title}</h4>
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">
                      {item.fileSize || 'Secure File'} • {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-indigo-500/30"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourceLibraryModal;
