import React, { useState, useEffect } from 'react';
import { X, Users, Heart, Zap, Palette, Trophy } from 'lucide-react';
import api from '../utils/axiosConfig';

const ClubHubModal = ({ onClose }) => {
  const [clubs, setClubs] = useState([]);

  useEffect(() => {
    api.get('/api/academic/clubs').then(res => setClubs(res.data));
  }, []);

  const CAT_MAP = {
    'technical': { icon: <Zap />, color: 'bg-yellow-500', label: 'Kỹ thuật' },
    'volunteer': { icon: <Heart />, color: 'bg-red-500', label: 'Tình nguyện' },
    'art': { icon: <Palette />, color: 'bg-purple-500', label: 'Nghệ thuật' },
    'sport': { icon: <Trophy />, color: 'bg-emerald-500', label: 'Thể thao' }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[85vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Users className="w-8 h-8 text-indigo-500" />
            <h2 className="text-2xl font-black">Cộng đồng Câu lạc bộ UTT</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {clubs.map(club => {
            const cat = CAT_MAP[club.category] || CAT_MAP['technical'];
            return (
              <div key={club.id} className="p-8 bg-[var(--hover)]/30 rounded-[40px] border border-[var(--border)] hover:border-indigo-500 transition-all group flex gap-6">
                <div className={`w-20 h-20 rounded-[28px] ${cat.color} flex items-center justify-center text-white shrink-0 shadow-lg`}>
                  {React.cloneElement(cat.icon, { className: 'w-10 h-10' })}
                </div>
                <div className="flex-1 space-y-2">
                  <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">{cat.label}</span>
                  <h4 className="text-xl font-black">{club.name}</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">{club.description}</p>
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{club.memberCount} Thành viên</span>
                    <button className="px-6 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black hover:scale-105 transition-all">Tham gia ngay</button>
                  </div>
                </div>
              </div>
            );
          })}
          {clubs.length === 0 && <div className="text-center py-20 col-span-2 opacity-30 italic font-bold">Dữ liệu CLB đang được cập nhật</div>}
        </div>
      </div>
    </div>
  );
};

export default ClubHubModal;
