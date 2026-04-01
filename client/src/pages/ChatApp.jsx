import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

const ChatApp = () => {
  const [selectedUser, setSelectedUser] = useState(null);

  return (
    <div className="h-screen w-screen flex bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-200 overflow-hidden transition-colors duration-500">
      <Sidebar 
        selectedUser={selectedUser} 
        onSelectUser={setSelectedUser} 
      />
      
      {selectedUser ? (
        <ChatWindow 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800/50 transition-colors duration-500">
          <div className="w-24 h-24 mb-6 rounded-full bg-slate-200 dark:bg-slate-800/50 flex items-center justify-center shadow-inner transition-colors">
             <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/10 flex items-center justify-center">
                 <svg className="w-8 h-8 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                 </svg>
             </div>
          </div>
          <h3 className="text-xl font-medium text-gray-800 dark:text-slate-300 transition-colors">Antigravity Secure Chat</h3>
          <p className="text-gray-500 dark:text-slate-500 mt-2 text-sm text-center max-w-sm transition-colors">
             Chọn một người để bắt đầu cuộc trò chuyện. <br/>
             Mọi tin nhắn đều được lập mã E2EE.
          </p>
        </div>
      )}
    </div>
  );
};

export default ChatApp;
