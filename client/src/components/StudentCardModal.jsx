import React from 'react';
import { X, ShieldCheck, MapPin, Calendar, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';

const StudentCardModal = ({ onClose }) => {
  const { user } = useAuth();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-in zoom-in duration-300">
        <div className="flex justify-end mb-4">
          <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all"><X /></button>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-800 rounded-[40px] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border-t border-white/20 relative">
          {/* Logo / School Name */}
          <div className="p-8 pb-4 flex justify-between items-start">
             <div>
               <h2 className="text-xl font-black text-white tracking-tighter leading-tight">University of Transport<br/>and Technology</h2>
               <p className="text-[9px] font-bold text-white/60 uppercase tracking-[0.2em] mt-2">Digital Student Identity</p>
             </div>
             <div className="w-10 h-10 bg-white/20 rounded-xl backdrop-blur-md flex items-center justify-center">
               <ShieldCheck className="text-white w-6 h-6" />
             </div>
          </div>

          {/* Profile Section */}
          <div className="px-8 flex items-center gap-6 my-6">
            <div className="w-24 h-24 rounded-[32px] overflow-hidden border-4 border-white/20 shadow-2xl shrink-0">
               {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white flex items-center justify-center text-3xl font-black text-indigo-600">{user?.username[0].toUpperCase()}</div>}
            </div>
            <div className="min-w-0">
              <h3 className="text-2xl font-black text-white truncate">{user?.displayName || user?.username}</h3>
              <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mt-1">MSSV: {user?.username || 'N/A'}</p>
            </div>
          </div>

          {/* Details */}
          <div className="px-8 grid grid-cols-2 gap-4 mb-8">
            <div className="bg-black/10 rounded-2xl p-3 border border-white/5">
              <p className="text-[8px] font-black text-indigo-200 uppercase mb-1">Cơ sở học tập</p>
              <p className="text-xs font-bold text-white flex items-center gap-1"><MapPin className="w-3 h-3" /> Hà Nội</p>
            </div>
            <div className="bg-black/10 rounded-2xl p-3 border border-white/5">
              <p className="text-[8px] font-black text-indigo-200 uppercase mb-1">Niên khóa</p>
              <p className="text-xs font-bold text-white flex items-center gap-1"><Calendar className="w-3 h-3" /> 2022-2027</p>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-white p-10 flex flex-col items-center gap-4">
             <div className="p-4 bg-zinc-100 rounded-[32px] shadow-inner">
               <QRCodeSVG value={`UTT_ID:${user?.id}`} size={160} />
             </div>
             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">ID VERIFIED BY UTT APP</p>
          </div>

          <div className="p-4 bg-zinc-50 border-t border-zinc-200 text-center">
            <p className="text-[9px] font-bold text-zinc-400 flex items-center justify-center gap-1 uppercase">
              <Smartphone className="w-3 h-3" /> Xuất trình khi ra vào trường
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCardModal;
