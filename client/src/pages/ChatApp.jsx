import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import NavigationRail from '../components/NavigationRail';
import SuperHubModal from '../components/SuperHubModal';
import FriendModal from '../components/FriendModal';
import ProfileModal from '../components/ProfileModal';
import SettingsView from '../components/SettingsView';
import { useSocket } from '../context/SocketContext';
import { UserPlus, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import AppLock from '../components/AppLock';

const ChatApp = () => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetail, setShowDetail] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(!!localStorage.getItem('app_pin'));
  const { setActiveChatId } = useSocket();

  if (isLocked) {
    return <AppLock onUnlock={() => setIsLocked(false)} />;
  }

  // Restore selection
  React.useEffect(() => {
    const saved = sessionStorage.getItem('lastSelectedUser');
    if (saved && !selectedUser) {
      try {
        const u = JSON.parse(saved);
        setSelectedUser(u);
        setActiveChatId(u.id);
      } catch (e) { }
    }
  }, []);

  const handleSelectUser = (u) => {
    if (!u) {
      setSelectedUser(null);
      setActiveChatId(null);
      return;
    }
    setSelectedUser(u);
    setActiveChatId(u.id);
    sessionStorage.setItem('lastSelectedUser', JSON.stringify(u));
  };

  const handleTabChange = (tab) => {
    if (tab === 'hub') {
      setIsHubOpen(true);
    } else {
      setActiveTab(tab);
      if (tab !== 'chat') setSelectedUser(null);
    }
  };

  return (
    <div className="h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden relative font-['Outfit']">
      {/* Mesh Background */}
      <div className="mesh-bg" />

      {/* Main Layout Container */}
      <div className="h-full w-full flex flex-col md:flex-row p-0 md:p-4 gap-0 md:gap-4 relative z-10">
        
        {/* 1. Navigation Rail - Floating Island */}
        <div className="order-2 md:order-1 flex-shrink-0">
          <div className="h-full md:h-full glass-card md:w-[80px] flex md:flex-col items-center justify-between py-2 md:py-8 overflow-hidden">
            <NavigationRail 
              activeTab={activeTab} 
              onTabChange={handleTabChange} 
              onOpenProfile={() => setIsProfileModalOpen(true)}
            />
          </div>
        </div>

        {/* 2. Content Area */}
        <div className="order-1 md:order-2 flex-1 flex gap-4 overflow-hidden relative">
          
          {/* Sidebar Column - Floating Glass */}
          <div className={`${selectedUser ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] h-full glass-card overflow-hidden animate-scale-in`}>
            {activeTab === 'chat' && (
              <Sidebar 
                selectedUser={selectedUser} 
                onSelectUser={handleSelectUser} 
                className="w-full bg-transparent border-none"
              />
            )}

            {activeTab === 'contacts' && (
              <div className="w-full h-full flex flex-col p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Danh bạ</h2>
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Đồng bộ bạn bè UTT</p>
                  </div>
                  <button 
                    onClick={() => setIsFriendModalOpen(true)}
                    className="w-10 h-10 premium-gradient text-white rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center hover:scale-110 transition-all"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-indigo-500/20 rounded-3xl animate-ping" />
                    <UserPlus className="w-10 h-10 text-indigo-500 relative z-10" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Danh bạ đang trống</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-[200px]">Hãy kết nối với bạn bè cùng lớp để bắt đầu trò chuyện bảo mật.</p>
                  </div>
                  <button 
                    onClick={() => setIsFriendModalOpen(true)}
                    className="px-6 py-3 bg-[var(--hover)] hover:bg-indigo-500 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                  >
                    Tìm bạn ngay
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <SettingsView onOpenProfile={() => setIsProfileModalOpen(true)} />
            )}
          </div>

          {/* Chat Window Column - Floating Glass */}
          <div className={`${selectedUser ? 'flex' : 'hidden md:flex'} flex-1 h-full glass-card overflow-hidden animate-scale-in`}>
            {selectedUser ? (
              <ChatWindow
                key={selectedUser.id}
                user={selectedUser}
                onClose={() => setSelectedUser(null)}
                showDetail={showDetail}
                onToggleDetail={() => setShowDetail(!showDetail)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white/5">
                <div className="relative mb-8">
                  <div className="absolute -inset-8 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
                  <div className="w-32 h-32 rounded-[40px] bg-white p-6 shadow-2xl relative z-10 hover:rotate-6 transition-transform duration-500">
                    <img src="/images/utt/logo.jpg" alt="UTT Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-green-500 text-white p-2 rounded-xl shadow-lg">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>
                
                <h2 className="text-3xl font-black tracking-tighter mb-4">UTT SUPER APP</h2>
                <p className="text-[var(--text-secondary)] max-w-sm leading-relaxed mb-8">
                  Hệ sinh thái giao tiếp và học tập bảo mật dành riêng cho sinh viên UTT. 
                  Mọi tin nhắn đều được mã hóa <span className="text-indigo-500 font-bold">E2EE</span>.
                </p>

                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
                    <Zap className="w-5 h-5 text-orange-500 mb-2" />
                    <p className="font-bold text-sm">Tốc độ cao</p>
                    <p className="text-[10px] opacity-60">Kết nối thời gian thực</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
                    <MessageSquare className="w-5 h-5 text-indigo-500 mb-2" />
                    <p className="font-bold text-sm">Bảo mật</p>
                    <p className="text-[10px] opacity-60">Mã hóa đầu cuối</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modals */}
      {isHubOpen && <SuperHubModal onClose={() => setIsHubOpen(false)} />}
      <FriendModal isOpen={isFriendModalOpen} onClose={() => setIsFriendModalOpen(false)} />
      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
    </div>
  );
};

export default ChatApp;
