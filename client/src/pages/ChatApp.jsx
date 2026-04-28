import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import PinLock from '../components/PinLock';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axiosConfig';

const ChatApp = () => {
  const { user } = useAuth();
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetail, setShowDetail] = useState(true);
  
  // App Lock states
  const [hasPinSetup, setHasPinSetup] = useState(true); // default true to prevent flickering
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  
  // Chat Lock states
  const [chatUnlockedFor, setChatUnlockedFor] = useState(null); // stores user ID that is unlocked

  useEffect(() => {
    if (user) {
      const storedPin = localStorage.getItem(`app_pin_${user.id}`);
      if (storedPin) {
        setHasPinSetup(true);
        setIsAppUnlocked(false);
      } else {
        setHasPinSetup(false);
        setIsAppUnlocked(false);
      }

      // --- Push Notification Registration ---
      if ('serviceWorker' in navigator && 'PushManager' in window && !window.pushRegistered) {
        window.pushRegistered = true; // prevent multiple triggers
        const registerPush = async () => {
          try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('SW Registered');

            const vapidRes = await api.get('/api/push/vapidPublicKey');
            const publicKey = vapidRes.data.publicKey;

            // Convert base64 to Uint8Array
            const padding = '='.repeat((4 - publicKey.length % 4) % 4);
            const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);

            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: outputArray
            });

            await api.post('/api/push/subscribe', subscription);
            console.log('Push subscription sent to backend');
          } catch (err) {
            console.error('Push registration error:', err);
          }
        };
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') registerPush();
        });
      }
    }
  }, [user]);

  const handleSelectUser = (u) => {
    if (selectedUser?.id !== u.id) {
       setSelectedUser(u);
       setChatUnlockedFor(null); // lock again for new user
    }
  };

  const handleAppUnlockSuccess = () => {
    setIsAppUnlocked(true);
  };

  const handleAppSetupSuccess = () => {
    setHasPinSetup(true);
    setIsAppUnlocked(true);
  };

  const handleChatUnlockSuccess = () => {
    setChatUnlockedFor(selectedUser.id);
  };

  const handleCancelChatLock = () => {
    setSelectedUser(null);
    setChatUnlockedFor(null);
  };

  if (!user) return null;

  return (
    <div className="h-screen w-screen flex bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-200 overflow-hidden relative transition-colors duration-500">
      
      {/* 1. App Level Lock: Show full screen PinLock if app is not unlocked */}
      {!isAppUnlocked && !hasPinSetup && (
        <PinLock userId={user.id} mode="setup" onSuccess={handleAppSetupSuccess} />
      )}
      {!isAppUnlocked && hasPinSetup && (
        <PinLock userId={user.id} mode="verifyApp" onSuccess={handleAppUnlockSuccess} />
      )}

      <Sidebar 
        selectedUser={selectedUser} 
        onSelectUser={handleSelectUser} 
      />
      
      {selectedUser ? (
        <div className="flex-1 relative flex overflow-hidden">
          {chatUnlockedFor === selectedUser.id ? (
            <ChatWindow 
              key={selectedUser.id}
              user={selectedUser} 
              onClose={() => { setSelectedUser(null); setChatUnlockedFor(null); }}
              showDetail={showDetail}
              onToggleDetail={() => setShowDetail(!showDetail)}
            />
          ) : (
            <PinLock 
              userId={user.id} 
              mode="verifyChat" 
              chatTarget={selectedUser} 
              onSuccess={handleChatUnlockSuccess} 
              onCancel={handleCancelChatLock}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#18191a]">
          <div className="w-24 h-24 mb-6 rounded-full bg-white/5 flex items-center justify-center shadow-inner">
             <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/20 to-blue-400/20 border border-blue-500/10 flex items-center justify-center">
                 <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                 </svg>
             </div>
          </div>
          <h3 className="text-xl font-medium text-gray-200">Bắt đầu trò chuyện</h3>
          <p className="text-gray-500 mt-2 text-sm text-center max-w-sm">
             Chọn một người hoặc nhóm từ danh sách bên trái để bắt đầu. <br/>
             Mọi tin nhắn đều được mã hóa đầu cuối.
          </p>
        </div>
      )}
    </div>
  );
};

export default ChatApp;
