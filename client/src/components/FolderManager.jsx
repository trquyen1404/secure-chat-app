import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Folder as FolderIcon, Check, Users, User } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const FolderManager = ({ isOpen, onClose, folders, onFoldersUpdate, allChats }) => {
  const [editingFolder, setEditingFolder] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const { user } = useAuth();

  if (!isOpen) return null;

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const newFolder = {
      id: Date.now().toString(),
      name: newFolderName,
      chatIds: selectedChatIds
    };
    const updatedFolders = [...folders, newFolder];
    try {
      await api.post('/api/users/folders', { folders: updatedFolders });
      onFoldersUpdate(updatedFolders);
      setNewFolderName('');
      setSelectedChatIds([]);
    } catch (err) {
      alert('Không thể tạo thư mục');
    }
  };

  const handleDeleteFolder = async (id) => {
    const updatedFolders = folders.filter(f => f.id !== id);
    try {
      await api.post('/api/users/folders', { folders: updatedFolders });
      onFoldersUpdate(updatedFolders);
    } catch (err) {
      alert('Không thể xóa thư mục');
    }
  };

  const toggleChatSelection = (chatId) => {
    setSelectedChatIds(prev => 
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <FolderIcon className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Quản lý thư mục chat</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
          {/* Create Folder Section */}
          <div className="bg-blue-50/50 dark:bg-blue-500/5 p-6 rounded-2xl border border-blue-100 dark:border-blue-500/10">
            <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
              <Plus className="w-4 h-4" /> Tạo thư mục mới
            </h3>
            <div className="flex gap-2 mb-6">
              <input 
                type="text" 
                placeholder="Tên thư mục (ví dụ: Công việc, Gia đình...)"
                className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-all shadow-sm"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
              />
              <button 
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                Thêm
              </button>
            </div>

            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-3">CHỌN CUỘC TRÒ CHUYỆN ĐỂ THÊM VÀO THƯ MỤC:</p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {allChats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => toggleChatSelection(chat.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    selectedChatIds.includes(chat.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500'
                      : 'border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                    {chat.avatarUrl ? (
                      <img src={chat.avatarUrl} className="w-full h-full object-cover" />
                    ) : (
                      chat.isGroup ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />
                    )}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate dark:text-white">{chat.username || chat.name}</span>
                  {selectedChatIds.includes(chat.id) && <Check className="w-4 h-4 text-blue-500" />}
                </button>
              ))}
            </div>
          </div>

          {/* Existing Folders List */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 dark:text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
              <FolderIcon className="w-4 h-4" /> Thư mục của bạn
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {folders.map(folder => (
                <div key={folder.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800 group hover:border-blue-500/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm text-blue-500">
                      <FolderIcon className="w-5 h-5 fill-current opacity-20" />
                      <FolderIcon className="w-5 h-5 absolute" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 dark:text-white">{folder.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-slate-500">{folder.chatIds.length} cuộc trò chuyện</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {folders.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-2xl">
                  <p className="text-sm text-gray-400 dark:text-slate-500 italic">Bạn chưa tạo thư mục nào</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50/50 dark:bg-slate-800/30 border-t border-gray-100 dark:border-slate-800">
          <button 
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:opacity-90 transition-opacity"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolderManager;
