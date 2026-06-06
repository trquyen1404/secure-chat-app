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
      window.socket = newSocket;

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

      const heartbeatInterval = setInterval(() => {
        if (newSocket.connected) {
          newSocket.emit('heartbeat');
        }
      }, 30000);

      return () => {
        clearInterval(heartbeatInterval);
        newSocket.off('receiveMessage');
        newSocket.off('receiveGroupMessage');
        newSocket.off('userStatusChange');
        newSocket.close();
        if (window.socket === newSocket) {
          window.socket = null;
        }
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
