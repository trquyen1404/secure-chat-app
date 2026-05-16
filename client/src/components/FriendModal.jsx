import React, { useState, useEffect } from 'react';
import api from '../utils/axiosConfig';
import { Search, UserPlus, Check, X, Clock } from 'lucide-react';

const FriendModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'requests'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
      fetchFriends();
    }
  }, [isOpen]);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/api/friends/requests');
      setRequests(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await api.get('/api/friends');
      setFriends(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/api/users/search?query=${encodeURIComponent(val)}`);
      setSearchResults(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async (userId) => {
    try {
      await api.post('/api/friends/request', { recipientId: userId });
      alert('Đã gửi lời mời kết bạn!');
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi khi gửi lời mời');
    }
  };

  const acceptRequest = async (requestId) => {
    try {
      await api.post('/api/friends/accept', { requestId });
      fetchRequests();
      fetchFriends();
    } catch (e) {
      alert('Lỗi khi chấp nhận');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--bg-primary)] w-full max-w-sm rounded-3xl premium-shadow overflow-hidden flex flex-col max-h-[75vh]">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Bạn bè</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-colors">
            <X className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="flex border-b border-[var(--border)]">
          <button 
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'search' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'}`}
            onClick={() => setActiveTab('search')}
          >
            Tìm kiếm
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'requests' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'}`}
            onClick={() => setActiveTab('requests')}
          >
            Lời mời {requests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{requests.length}</span>}
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {activeTab === 'search' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                <input 
                  type="text" 
                  placeholder="Tìm theo Tên, MSV, SĐT..."
                  className="w-full bg-[var(--input-bg)] text-[var(--text-primary)] pl-10 pr-4 py-2.5 rounded-xl outline-none text-sm focus:ring-2 focus:ring-[var(--primary)]/50 transition-all"
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>

              <div className="space-y-2 mt-4">
                {loading ? (
                  <p className="text-center text-[var(--text-secondary)] text-sm py-4">Đang tìm kiếm...</p>
                ) : searchResults.length > 0 ? (
                  searchResults.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-2.5 bg-[var(--bg-secondary)] rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[var(--primary)]/20 rounded-full flex items-center justify-center text-[var(--primary)] text-xs font-bold">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{user.displayName || user.username}</p>
                          <div className="flex flex-wrap gap-x-1.5 text-[9px] text-[var(--text-secondary)]">
                            <span>@{user.username}</span>
                            {user.studentId && <span className="text-indigo-500">MSV: {user.studentId}</span>}
                            {user.teacherId && <span className="text-orange-500">MGV: {user.teacherId}</span>}
                            {user.phone && <span className="text-green-500">SĐT: {user.phone}</span>}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => sendRequest(user.id)}
                        className="p-1.5 bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white rounded-lg transition-colors"
                        title="Thêm bạn"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                ) : searchQuery.length >= 2 ? (
                  <p className="text-center text-[var(--text-secondary)] text-sm py-4">Không tìm thấy ai</p>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-2">
              {requests.length === 0 ? (
                <p className="text-center text-[var(--text-secondary)] text-sm py-8">Không có lời mời nào</p>
              ) : (
                requests.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-500 font-bold">
                        {req.Requester?.username?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{req.Requester?.displayName || req.Requester?.username}</p>
                        <p className="text-xs text-[var(--text-secondary)]">Muốn kết bạn với bạn</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => acceptRequest(req.id)}
                        className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-xl transition-colors"
                        title="Chấp nhận"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendModal;
