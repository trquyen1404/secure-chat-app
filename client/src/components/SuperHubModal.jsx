import React, { useState } from 'react';
import { 
  X, LayoutGrid, Calculator, Coffee, Wallet, BookOpen, Bus, 
  ShieldAlert, PenTool, BarChart2, Ticket, Users, GraduationCap, 
  Star, Trophy, Zap, Lock, Coins, Home, Globe, Calendar, Heart
} from 'lucide-react';

const SuperHubModal = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const PILLARS = [
    {
      title: "Học tập & Rèn luyện",
      color: "text-blue-500",
      items: [
        { id: 'gpa', icon: <Calculator />, label: 'Tính điểm GPA', color: 'bg-blue-500' },
        { id: 'timetable', icon: <Calendar />, label: 'Lịch học UTT', color: 'bg-indigo-500' },
        { id: 'library', icon: <BookOpen />, label: 'Thư viện số', color: 'bg-cyan-500' },
        { id: 'diary', icon: <PenTool />, label: 'Nhật ký học tập', color: 'bg-purple-500' },
      ]
    },
    {
      title: "Đời sống sinh viên",
      color: "text-orange-500",
      items: [
        { id: 'bus', icon: <Bus />, label: 'Theo dõi xe Bus', color: 'bg-sky-500' },
        { id: 'canteen', icon: <Coffee />, label: 'Đặt món Canteen', color: 'bg-orange-500' },
        { id: 'home', icon: <Home />, label: 'Tìm nhà trọ', color: 'bg-emerald-500' },
        { id: 'sos', icon: <ShieldAlert />, label: 'Khẩn cấp SOS', color: 'bg-red-500' },
      ]
    },
    {
      title: "Cộng đồng UTT",
      color: "text-purple-500",
      items: [
        { id: 'green', icon: <Zap />, label: 'Điểm rèn luyện', color: 'bg-green-500' },
        { id: 'events', icon: <Ticket />, label: 'Sự kiện & CLB', color: 'bg-pink-500' },
        { id: 'alumni', icon: <Users />, label: 'Mạng lưới Cựu SV', color: 'bg-teal-500' },
        { id: 'election', icon: <BarChart2 />, label: 'Bầu cử SV', color: 'bg-zinc-800' },
      ]
    },
    {
      title: "Tài chính & Bảo mật",
      color: "text-emerald-500",
      items: [
        { id: 'tuition', icon: <Wallet />, label: 'Học phí UTT', color: 'bg-zinc-600' },
        { id: 'wallet', icon: <Coins />, label: 'Ví điện tử UTT', color: 'bg-yellow-600' },
        { id: 'vault', icon: <Lock />, label: 'Kho bảo mật', color: 'bg-zinc-900' },
        { id: 'translate', icon: <Globe />, label: 'Trình thông dịch', color: 'bg-blue-700' },
      ]
    }
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard':
        return (
          <div className="p-6 md:p-10 space-y-12 animate-fade-in">
            {PILLARS.map((pillar, idx) => (
              <div key={idx} className="space-y-6">
                <div className="flex items-center gap-3">
                   <div className={`w-1 h-6 rounded-full ${pillar.color.replace('text', 'bg')}`} />
                   <h3 className={`text-xs font-black uppercase tracking-[0.25em] ${pillar.color}`}>
                     {pillar.title}
                   </h3>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {pillar.items.map(item => (
                    <button 
                      key={item.id} 
                      onClick={() => setActiveTab(item.id)}
                      className="flex flex-col items-start p-5 bg-white/5 border border-white/5 rounded-[28px] hover:bg-white/10 hover:border-white/10 hover:scale-[1.03] transition-all group relative overflow-hidden"
                    >
                      <div className={`w-12 h-12 rounded-2xl ${item.color} text-white flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all`}>
                        {React.cloneElement(item.icon, { className: 'w-6 h-6' })}
                      </div>
                      <span className="text-[13px] font-bold text-[var(--text-primary)]">{item.label}</span>
                      <p className="text-[9px] text-[var(--text-secondary)] mt-1 font-medium opacity-60">Xem chi tiết &gt;</p>
                      
                      {/* Decoration circle */}
                      <div className={`absolute -bottom-4 -right-4 w-12 h-12 rounded-full opacity-5 group-hover:scale-150 transition-transform ${item.color}`} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      case 'gpa':
        return (
          <div className="p-12 max-w-md mx-auto space-y-8 animate-scale-in">
             <div className="text-center space-y-2">
                <h3 className="text-3xl font-black tracking-tighter uppercase text-gradient">Tính điểm GPA</h3>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Hệ thống mô phỏng điểm số</p>
             </div>
             <div className="space-y-4">
               {[1,2,3].map(i => (
                 <div key={i} className="flex gap-4">
                   <input type="text" placeholder={`Tên môn học ${i}`} className="flex-1 bg-white/5 p-4 rounded-2xl outline-none text-sm font-bold border border-white/5 focus:border-indigo-500/30 transition-all" />
                   <input type="number" placeholder="4.0" className="w-24 bg-white/5 p-4 rounded-2xl outline-none text-sm font-bold border border-white/5 focus:border-indigo-500/30 transition-all text-center" />
                 </div>
               ))}
               <div className="mt-8 p-10 premium-gradient rounded-[40px] text-white text-center shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-white/10 animate-pulse group-hover:opacity-0 transition-opacity" />
                 <p className="text-[11px] font-black uppercase opacity-60 mb-2 relative z-10 tracking-[0.2em]">GPA Dự kiến của bạn</p>
                 <h4 className="text-7xl font-black relative z-10 drop-shadow-2xl">3.85</h4>
               </div>
               <p className="text-center text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest opacity-50 px-8">
                 Dữ liệu chỉ mang tính chất tham khảo dựa trên thuật toán tính điểm hiện tại của UTT.
               </p>
             </div>
          </div>
        );
      case 'sos':
        return (
          <div className="p-12 flex flex-col items-center justify-center space-y-10 h-full animate-scale-in">
             <div className="relative">
                <div className="absolute -inset-10 bg-red-500/20 rounded-full blur-[60px] animate-pulse" />
                <div className="w-56 h-56 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_80px_rgba(239,68,68,0.4)] cursor-pointer active:scale-90 transition-all border-[12px] border-white/10 group relative z-10">
                   <ShieldAlert className="w-28 h-28 text-white group-hover:rotate-12 transition-transform" />
                </div>
             </div>
             <div className="text-center space-y-4">
               <h3 className="text-4xl font-black text-red-500 uppercase tracking-tighter">KHẨN CẤP SOS</h3>
               <p className="text-base font-bold text-[var(--text-primary)] max-w-sm mx-auto">
                 Nhấn giữ nút để gửi tọa độ GPS và thông tin sinh viên cho Đội bảo vệ trường.
               </p>
               <div className="flex gap-3 justify-center pt-4">
                  <div className="px-4 py-2 bg-red-500/10 text-red-500 text-[10px] font-black rounded-full uppercase">Cơ sở 1</div>
                  <div className="px-4 py-2 bg-red-500/10 text-red-500 text-[10px] font-black rounded-full uppercase">Cơ sở 2</div>
               </div>
             </div>
          </div>
        );
      default:
        return (
          <div className="p-20 text-center flex flex-col items-center animate-fade-in">
             <div className="w-24 h-24 bg-white/5 rounded-[40px] flex items-center justify-center mb-8 border border-white/5">
                <LayoutGrid className="w-10 h-10 opacity-20" />
             </div>
             <h3 className="text-2xl font-black uppercase tracking-tight mb-4 text-gradient">Đang đồng bộ dữ liệu</h3>
             <p className="text-sm text-[var(--text-secondary)] max-w-md leading-relaxed mb-10">
               Tính năng <span className="text-white font-bold italic">"{activeTab}"</span> đang được kết nối với API cổng thông tin sinh viên UTT. Vui lòng quay lại sau.
             </p>
             <button 
               onClick={() => setActiveTab('dashboard')} 
               className="px-10 py-4 premium-gradient text-white rounded-[24px] text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all"
             >
               Quay lại Dashboard
             </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[150] flex items-center justify-center p-4 md:p-8 animate-fade-in font-['Outfit']">
      <div className="w-full max-w-6xl glass-card border-white/10 overflow-hidden flex flex-col h-[92vh] md:h-[88vh]">
        
        {/* Modern Header */}
        <div className="p-8 md:p-10 border-b border-white/5 flex items-center justify-between bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] -mr-32 -mt-32" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 rounded-3xl premium-gradient flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40">
              <LayoutGrid className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter text-gradient leading-none mb-2">UTT Super Hub</h2>
              <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.4em] opacity-60">Hệ sinh thái tiện ích sinh viên toàn diện</p>
            </div>
          </div>
          
          <button 
            onClick={onClose} 
            className="w-14 h-14 bg-white/5 rounded-3xl flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-all border border-white/5 active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-transparent">
          {renderContent()}
        </div>

        {/* Bottom Navigation / Meta */}
        <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/5">
           <div className="flex gap-10">
             <button 
               onClick={() => setActiveTab('dashboard')} 
               className={`text-[11px] font-black uppercase tracking-[0.25em] transition-all relative group ${activeTab === 'dashboard' ? 'text-indigo-500' : 'text-[var(--text-secondary)] opacity-40 hover:opacity-100'}`}
             >
               Bảng điều khiển
               {activeTab === 'dashboard' && <div className="absolute -bottom-2 left-0 right-0 h-1 bg-indigo-500 rounded-full animate-pulse" />}
             </button>
             <button className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--text-secondary)] opacity-20 cursor-not-allowed hidden md:block">Cấu hình hệ thống</button>
           </div>
           
           <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Máy chủ UTT: Online</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SuperHubModal;
