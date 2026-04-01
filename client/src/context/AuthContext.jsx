import React, { createContext, useState, useEffect, useContext } from 'react';
import { loadKey, deleteKey } from '../utils/keyStore';
import { authApi } from '../utils/axiosConfig';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [privateKey, setPrivateKey] = useState(null); // CryptoKey object, NOT a string
  const [needsPinRestore, setNeedsPinRestore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (token) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          // Load the non-extractable CryptoKey from IndexedDB
          const pk = await loadKey(`privateKey_${parsedUser.id}`);
          if (pk) {
            setPrivateKey(pk);
            setNeedsPinRestore(false);
          } else {
            setNeedsPinRestore(true);
          }
        }
      }
      setLoading(false);
    };
    init();
  }, [token]);

  const login = async (data) => {
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    // Check key
    const pk = await loadKey(`privateKey_${data.user.id}`);
    if (pk) {
       setPrivateKey(pk);
       setNeedsPinRestore(false);
    } else {
       setNeedsPinRestore(true);
    }
  };

  const completePinRestore = async (pk) => {
    setPrivateKey(pk);
    setNeedsPinRestore(false);
  };

  useEffect(() => {
    const handleForcedLogout = () => {
      setToken(null);
      setUser(null);
      setPrivateKey(null);
      setNeedsPinRestore(false);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    };

    const handleTokenRefreshed = (e) => {
      setToken(e.detail);
    };
    
    window.addEventListener('auth-logout', handleForcedLogout);
    window.addEventListener('auth-refreshed', handleTokenRefreshed);
    
    return () => {
       window.removeEventListener('auth-logout', handleForcedLogout);
       window.removeEventListener('auth-refreshed', handleTokenRefreshed);
    }
  }, []);

  const logout = async () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const { id } = JSON.parse(storedUser);
        // Remove from IndexedDB on logout for security (optional — key is non-extractable anyway)
        await deleteKey(`privateKey_${id}`);
      } catch (_) {}
    }
    
    try {
      // Clear HTTP-Only cookie via API
      await authApi.logout();
    } catch (_) {}

    setToken(null);
    setUser(null);
    setPrivateKey(null);
    setNeedsPinRestore(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, privateKey, needsPinRestore, login, logout, completePinRestore, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
