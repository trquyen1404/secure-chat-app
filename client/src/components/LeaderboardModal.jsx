import React, { useState, useEffect } from 'react';
import { X, Trophy, Medal, Star, Target } from 'lucide-react';
import api from '../utils/axiosConfig';

const LeaderboardModal = ({ onClose }) => {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.get('/api/academic/leaderboard').then(res => setUsers(res.data));
  }, []);

  const BADGE_MAP = {
    'attendance_king': { label: '👑 Vua điểm danh', color: 'bg-yellow-500' },
    'fast_learner': { label: '⚡ Học nhanh', color: 'bg-blue-500' },
    'helpful_buddy': { label: '🤝 Bạn tốt', color: 'bg-green-500' },
    'top_scorer': { label: '🎯 Thủ khoa', color: 'bg-red-500' }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[70vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between bg-indigo-500/5">
          <div className="flex items-center gap-4">
            <Trophy className="w-8 h-8 text-indigo-500" />
            <h2 className="text-2xl font-black">Bảng xếp hạng UTT</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-4">
          {users.map((user, idx) => (
            <div key={user.id} className="flex items-center justify-between p-6 bg-[var(--hover)]/30 rounded-[32px] border border-[var(--border)] group hover:border-indigo-500 transition-all">
              <div className="flex items-center gap-6">
                <div className="text-2xl font-black w-8 text-center">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </div>
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-indigo-500/10">
                  {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-indigo-500">{user.username[0].toUpperCase()}</div>}
                </div>
                <div>
                  <h4 className="font-black text-lg">{user.displayName || user.username}</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(user.badges || []).map(b => (
                      <span key={b} className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg text-white ${BADGE_MAP[b]?.color || 'bg-gray-500'}`}>
                        {BADGE_MAP[b]?.label || b}
                      </span>
                    ))}
                    {(!user.badges || user.badges.length === 0) && <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase">Chưa có danh hiệu</span>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-indigo-500">{user.points}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Điểm tích lũy</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardModal;
