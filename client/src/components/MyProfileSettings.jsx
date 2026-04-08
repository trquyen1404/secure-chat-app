import React, { useState, useEffect } from 'react';
import { X, Save, Shield, User, Info, Phone } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const MyProfileSettings = ({ onClose }) => {
  const { user, token } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    bio: '',
    phoneNumber: '',
    profilePrivacy: 'public'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get(`/api/users/${user.id}/profile`);
        setFormData({
          fullName: res.data.fullName || '',
          bio: res.data.bio || '',
          phoneNumber: res.data.phoneNumber || '',
          profilePrivacy: res.data.profilePrivacy || 'public'
        });
      } catch (error) {
        console.error('Failed to fetch profile', error);
      } finally {
        setLoading(false);
      }
    };
    if (token && user) {
      fetchProfile();
    }
  }, [token, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.put('/api/users/profile', formData);
      setMessage('Lưu hồ sơ thành công!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Có lỗi xảy ra khi lưu.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 h-full">
      <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-200">Hồ sơ Của Tôi</h2>
        <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Thông tin cá nhân</h3>
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <User className="w-4 h-4" /> Họ và tên
            </label>
            <input 
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 dark:text-slate-200"
              placeholder="Nhập họ tên của bạn..."
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <Phone className="w-4 h-4" /> Số điện thoại
            </label>
            <input 
              type="text"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 dark:text-slate-200"
              placeholder="Nhập số điện thoại..."
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <Info className="w-4 h-4" /> Tiểu sử (Bio)
            </label>
            <textarea 
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 dark:text-slate-200 resize-none"
              placeholder="Vài dòng giới thiệu..."
            />
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Quyền riêng tư</h3>
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <Shield className="w-4 h-4" /> Ai có thể xem hồ sơ?
            </label>
            <select 
              name="profilePrivacy"
              value={formData.profilePrivacy}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 dark:text-slate-200"
            >
              <option value="public">Công khai (Tất cả mọi người)</option>
              <option value="friends">Chỉ bạn bè</option>
              <option value="private">Chỉ mình tôi (Bảo mật tuyệt đối)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1 pl-1">
              {formData.profilePrivacy === 'public' && "Bất kỳ ai trong hệ thống đều xem được thông tin của bạn."}
              {formData.profilePrivacy === 'friends' && "Chỉ những người đã được bạn chấp nhận kết bạn mới xem được thông tin chi tiết."}
              {formData.profilePrivacy === 'private' && "Chỉ hiển thị tên người dùng và avatar."}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-800">
        {message && (
          <div className={`mb-3 text-sm text-center ${message.includes('lỗi') ? 'text-red-500' : 'text-emerald-500'}`}>
            {message}
          </div>
        )}
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          {saving ? 'Đang lưu...' : <><Save className="w-5 h-5" /> Lưu Thay Đổi</>}
        </button>
      </div>
    </div>
  );
};

export default MyProfileSettings;
