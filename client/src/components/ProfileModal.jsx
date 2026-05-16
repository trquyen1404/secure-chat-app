import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, User as UserIcon, FileText, Loader2, Smartphone, ShieldAlert } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [studentId, setStudentId] = useState(user?.studentId || '');
  const [teacherId, setTeacherId] = useState(user?.teacherId || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Sync state when user context changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setDisplayName(user?.displayName || '');
      setBio(user?.bio || '');
      setStudentId(user?.studentId || '');
      setTeacherId(user?.teacherId || '');
      setPhone(user?.phone || '');
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
      await api.put('/api/users/profile', { displayName, bio, studentId, teacherId, phone });
      const updatedUser = { ...user, displayName, bio, studentId, teacherId, phone };
      updateUser(updatedUser);
      onClose();
    } catch (err) {
      console.error('Update failed', err);
      alert('Không thể cập nhật hồ sơ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeDevices = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn ĐĂNG XUẤT khỏi TẤT CẢ các thiết bị khác không? (Bạn vẫn sẽ duy trì đăng nhập trên thiết bị này)')) {
      return;
    }
    
    try {
      const res = await api.post('/api/auth/revoke-all');
      alert(res.data.message || 'Đã đăng xuất thành công khỏi tất cả các thiết bị khác.');
    } catch (err) {
      console.error('Revoke failed', err);
      alert('Không thể thực hiện yêu cầu: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-md glass rounded-[40px] premium-shadow border-[var(--glass-border)] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-white/5">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight">Hồ sơ cá nhân</h2>
            <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Cá nhân hóa tài khoản</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all duration-300 text-[var(--text-secondary)] hover:text-red-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="w-24 h-24 rounded-[32px] p-1 premium-gradient shadow-xl shadow-indigo-500/20 transition-transform duration-500">
                <div className="w-full h-full rounded-[28px] overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center border-4 border-[var(--bg-primary)]">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-indigo-500">{user?.username?.[0]?.toUpperCase()}</span>
                  )}
                </div>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-10 h-10 premium-gradient text-white rounded-xl shadow-lg transition-all transform hover:scale-110 flex items-center justify-center border-2 border-[var(--bg-primary)]"
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
            <p className="mt-3 text-[9px] font-black text-[var(--text-secondary)]/50 uppercase tracking-widest text-center">JPG, PNG hoặc WEBP (Max 5MB)</p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-secondary)] ml-1 uppercase tracking-widest flex items-center gap-2">
                <UserIcon className="w-3 h-3 text-indigo-500" /> Tên hiển thị
              </label>
              <input 
                type="text"
                placeholder="Nhập tên mới..."
                className="w-full px-4 py-3 bg-[var(--input-bg)] border border-transparent rounded-xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-sm font-bold placeholder-[var(--text-secondary)]/30"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-secondary)] ml-1 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-3 h-3 text-indigo-500" /> Tiểu sử cá nhân
              </label>
              <textarea 
                rows="2"
                placeholder="Một chút về bản thân bạn..."
                className="w-full px-4 py-3 bg-[var(--input-bg)] border border-transparent rounded-xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-sm font-bold placeholder-[var(--text-secondary)]/30 resize-none"
                value={bio}
                onChange={e => setBio(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Mã Sinh Viên</label>
                <input 
                  type="text" 
                  value={studentId} 
                  onChange={e => setStudentId(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--input-bg)] rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                  placeholder="VD: 71DCTT..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-widest">Mã Giáo Viên</label>
                <input 
                  type="text" 
                  value={teacherId} 
                  onChange={e => setTeacherId(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--input-bg)] rounded-xl text-xs font-bold focus:ring-2 ring-orange-500/20 outline-none"
                  placeholder="Dành cho GV..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-secondary)] ml-1 uppercase tracking-widest flex items-center gap-2">
                <Smartphone className="w-3 h-3 text-green-500" /> Số điện thoại
              </label>
              <input 
                type="text"
                placeholder="Nhập số điện thoại..."
                className="w-full px-4 py-3 bg-[var(--input-bg)] border border-transparent rounded-xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-sm font-bold"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Security Section */}
          <div className="pt-6 border-t border-[var(--border)]">
            <h3 className="text-[11px] font-black text-red-500 ml-1 mb-4 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" /> Quản lý thiết bị
            </h3>
            <button 
              onClick={handleRevokeDevices}
              className="w-full flex items-center justify-between p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl transition-all duration-300 group"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 group-hover:animate-shake" />
                <div className="text-left">
                  <p className="font-bold text-sm">Đăng xuất tất cả thiết bị khác</p>
                  <p className="text-[10px] font-medium opacity-70">Bảo vệ tài khoản nếu bạn quên đăng xuất</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-white/5 border-t border-[var(--border)] flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-3 glass text-[var(--text-primary)] font-black rounded-xl hover:bg-white/10 transition-all uppercase tracking-widest text-[10px]"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-[1.5] px-4 py-3 premium-gradient text-white font-black rounded-xl shadow-xl shadow-indigo-500/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest text-[10px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
