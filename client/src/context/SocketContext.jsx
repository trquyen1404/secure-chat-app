import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const [activeChatId, setActiveChatId] = useState(null);

  useEffect(() => {
    if (token) {
      const newSocket = io('/', {
        auth: { token }
      });

      setSocket(newSocket);

      newSocket.on('userStatusChange', ({ userId, online, lastSeenAt }) => {
        setOnlineUsers(prev => {
          const newMap = new Map(prev);
          newMap.set(userId, { online, lastSeenAt: lastSeenAt || new Date() });
          return newMap;
        });
      });

      // Global Notification Listener
      const handleIncomingMessage = async (msg) => {
        const isFromActive = activeChatId === (msg.senderId || msg.groupId);
        if (!isFromActive && Notification.permission === 'granted') {
          const { default: notificationService } = await import('../utils/notificationService');
          notificationService.notifyNewMessage(
            msg.senderName || 'Người dùng',
            'Bạn có tin nhắn mã hóa mới',
            !!msg.groupId
          );
        }
      };

      newSocket.on('receiveMessage', handleIncomingMessage);
      newSocket.on('receiveGroupMessage', (msg) => handleIncomingMessage({ ...msg, groupId: msg.groupId }));

      return () => {
        newSocket.off('receiveMessage');
        newSocket.off('receiveGroupMessage');
        newSocket.off('userStatusChange');
        newSocket.close();
      };
    } else {
      setSocket(null);
    }
  }, [token, activeChatId]);

  return (
    <SocketContext.Provider value={{ 
      socket, onlineUsers, setOnlineUsers, 
      activeChatId, setActiveChatId 
    }}>
      {children}
    </SocketContext.Provider>
  );
};
