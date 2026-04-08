import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, User, Info, Phone, Shield, Pin, PinOff } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const UserProfileModal = ({ userId, onClose }) => {
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState(null); // 'none', 'pending', 'accepted'
  const [friendReqId, setFriendReqId] = useState(null);
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [profileRes, friendsRes, pinsRes] = await Promise.all([
          api.get(`/api/users/${userId}/profile`),
          api.get(`/api/friends`),
          api.get('/api/users/pins')
        ]);

        setProfile(profileRes.data);
        setIsPinned(pinsRes.data.some(p => p.targetUserId === userId));

        // Check friend status
        const isSelf = userId === currentUser.id;
        if (!isSelf) {
          const { friends, requests } = friendsRes.data;
          
          if (friends.some(f => f.id === userId)) {
            setFriendStatus('accepted');
          } else {
            const req = requests.find(r => r.user.id === userId);
            if (req) {
              setFriendStatus(req.direction === 'sent' ? 'pending' : 'received_pending');
              setFriendReqId(req.id);
            } else {
              setFriendStatus('none');
            }
          }
        }

      } catch (error) {
        console.error('Failed to fetch user profile', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (userId) fetchProfileData();
  }, [userId, currentUser.id]);

  const handleSendFriendRequest = async () => {
    try {
      const res = await api.post('/api/friends/request', { receiverId: userId });
      setFriendStatus('pending');
    } catch (error) {
      console.error('Failed to send request', error);
      alert('Không thể gửi yêu cầu kết bạn.');
    }
  };

  const handleAcceptRequest = async () => {
    try {
      if (!friendReqId) return;
      await api.post('/api/friends/accept', { requestId: friendReqId });
      setFriendStatus('accepted');
      // Refetch profile to get full details if privacy was 'friends'
      const res = await api.get(`/api/users/${userId}/profile`);
      setProfile(res.data);
    } catch (error) {
      console.error('Failed to accept request', error);
      alert('Không thể chấp nhận yêu cầu.');
    }
  };

  const handleTogglePin = async () => {
    try {
      if (isPinned) {
        await api.delete(`/api/users/pins/${userId}`);
        setIsPinned(false);
      } else {
        await api.post('/api/users/pins', { targetUserId: userId });
        setIsPinned(true);
      }
    } catch (error) {
      console.error('Failed to toggle pin', error);
    }
  };

  if (loading || !profile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isSelf = userId === currentUser.id;
  
  // If the server didn't return fullName/bio/phoneNumber, it means it's restricted.
  // Except if they simply didn't fill it out. We can check if those keys exist in the object.
  const isRestricted = !('fullName' in profile) && !isSelf;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800 animate-fade-in-up">
        {/* Header / Avatar background */}
        <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600 relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Info */}
        <div className="px-6 pb-8 relative -mt-16">
          <div className="flex justify-between items-end mb-4">
            <div className="w-32 h-32 rounded-2xl border-4 border-white dark:border-slate-900 bg-gray-200 dark:bg-slate-800 flex items-center justify-center shadow-lg text-4xl font-bold text-gray-600 dark:text-slate-300">
              {profile.username?.charAt(0).toUpperCase()}
            </div>

            {!isSelf && (
              <div className="mb-2">
                {friendStatus === 'none' && (
                  <button onClick={handleSendFriendRequest} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/30">
                    <UserPlus className="w-4 h-4" /> Kết bạn
                  </button>
                )}
                {friendStatus === 'pending' && (
                  <button disabled className="px-4 py-2 bg-gray-200 dark:bg-slate-800 text-gray-500 dark:text-slate-400 rounded-xl text-sm font-medium flex items-center gap-2">
                    Đã gửi yêu cầu
                  </button>
                )}
                {friendStatus === 'received_pending' && (
                  <button onClick={handleAcceptRequest} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/30">
                    <Check className="w-4 h-4" /> Chấp nhận
                  </button>
                )}
                {friendStatus === 'accepted' && (
                  <button disabled className="px-4 py-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-xl text-sm font-medium flex items-center gap-2 border border-indigo-200 dark:border-indigo-500/30">
                    <Check className="w-4 h-4" /> Bạn bè
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{profile.fullName || profile.username}</h2>
              <p className="text-gray-500 dark:text-slate-400 font-medium">@{profile.username}</p>
            </div>
            {!isSelf && (
              <button 
                onClick={handleTogglePin}
                className={`p-2 rounded-full transition-colors ${isPinned ? 'text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 dark:hover:text-gray-300'}`}
                title={isPinned ? "Bỏ ghim" : "Ghim Chat này"}
              >
                {isPinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
              </button>
            )}
          </div>

          <div className="mt-6 space-y-4">
            {isRestricted ? (
              <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl flex items-center gap-3 border border-gray-200 dark:border-slate-800">
                <div className="p-2 bg-gray-200 dark:bg-slate-700 rounded-full text-gray-500 dark:text-slate-400">
                   <Shield className="w-5 h-5" />
                </div>
                <div className="text-sm text-gray-600 dark:text-slate-300">
                  <span className="font-semibold block text-gray-800 dark:text-slate-200">Hồ sơ bảo mật</span>
                  Người này chỉ chia sẻ thông tin chi tiết với bạn bè.
                </div>
              </div>
            ) : (
              <>
                {profile.bio && (
                  <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 mb-1">
                      <Info className="w-4 h-4" /> Tiểu sử
                    </div>
                    <p className="text-gray-800 dark:text-slate-200">{profile.bio}</p>
                  </div>
                )}
                
                {profile.phoneNumber && (
                   <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
                   <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 mb-1">
                     <Phone className="w-4 h-4" /> Số điện thoại
                   </div>
                   <p className="text-gray-800 dark:text-slate-200 font-medium">{profile.phoneNumber}</p>
                 </div>
                )}

                {!profile.bio && !profile.phoneNumber && !profile.fullName && (
                  <div className="text-center py-6 text-sm text-gray-500 dark:text-slate-500">
                    Người dùng này chưa cập nhật thông tin giới thiệu.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
