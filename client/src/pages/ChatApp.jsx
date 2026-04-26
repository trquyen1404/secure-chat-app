import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

const ChatApp = () => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetail, setShowDetail] = useState(true);

  return (
    <div className="h-screen w-screen flex bg-black text-gray-100 overflow-hidden">
      <Sidebar 
        selectedUser={selectedUser} 
        onSelectUser={setSelectedUser} 
      />
      
      {selectedUser ? (
        <div className="flex-1 flex overflow-hidden">
          <ChatWindow 
            key={selectedUser.id}
            user={selectedUser} 
            onClose={() => setSelectedUser(null)}
            showDetail={showDetail}
            onToggleDetail={() => setShowDetail(!showDetail)}
          />
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
