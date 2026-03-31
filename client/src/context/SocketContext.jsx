import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  useEffect(() => {
    if (token) {
      const newSocket = io('/', {
        auth: {
          token
        }
      });

      setSocket(newSocket);

      newSocket.on('userStatusChange', ({ userId, online }) => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          if (online) {
            newSet.add(userId);
          } else {
            newSet.delete(userId);
          }
          return newSet;
        });
      });

      return () => {
        newSocket.close();
      };
    } else {
      setSocket(null);
    }
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, setOnlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};
