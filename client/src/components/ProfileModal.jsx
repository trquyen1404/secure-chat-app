import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, User as UserIcon, FileText, Loader2 } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Sync state when user context changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setDisplayName(user?.displayName || '');
      setBio(user?.bio || '');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleAvatarSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Basic client-side validation
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh hợp lệ.');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    setUploading(true);
    try {
      const res = await api.post('/api/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Update local user state via Context
      const updatedUser = { ...user, avatarUrl: res.data.avatarUrl };
      updateUser(updatedUser);
    } catch (err) {
      console.error('Upload failed', err);
      alert('Không thể tải ảnh lên: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/api/users/profile', { displayName, bio });
      const updatedUser = { ...user, displayName, bio };
      updateUser(updatedUser);
      onClose();
    } catch (err) {
      console.error('Update failed', err);
      alert('Không thể cập nhật hồ sơ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/30">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Cập nhật Hồ sơ</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-28 h-28 rounded-full border-4 border-indigo-500/20 overflow-hidden bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-indigo-500">{user?.username?.[0]?.toUpperCase()}</span>
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-all transform hover:scale-110 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarSelect} 
                className="hidden" 
                accept="image/*"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-500">Tối đa 5MB. Định dạng: JPG, PNG, WEBP</p>
          </div>

          {/* Form Fields */}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-indigo-500" /> Tên hiển thị
              </label>
              <input 
                type="text"
                placeholder="Ví dụ: Anh Tú"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 dark:text-white transition-all shadow-sm"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" /> Bio (Giới thiệu ngắn)
              </label>
              <textarea 
                rows="3"
                placeholder="Một chút về bản thân bạn..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 dark:text-white transition-all shadow-sm resize-none"
                value={bio}
                onChange={e => setBio(e.target.value)}
              />
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
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
