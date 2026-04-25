import React, { createContext, useState, useEffect, useContext } from 'react';
import { loadKey, deleteKey } from '../utils/keyStore';
import { authApi } from '../utils/axiosConfig';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [identityKeys, setIdentityKeys] = useState(null);
  const [needsPinRestore, setNeedsPinRestore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (token) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          const lowerUsername = parsedUser.username.toLowerCase();
          const pkSign = await loadKey(`ik_sign_priv_${parsedUser.id}`);
          const pkDh = await loadKey(`ik_dh_priv_${parsedUser.id}`);
          if (pkSign && pkDh) {
            setIdentityKeys({ sign: pkSign, dh: pkDh });
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
    const pkSign = await loadKey(`ik_sign_priv_${data.user.id}`);
    const pkDh = await loadKey(`ik_dh_priv_${data.user.id}`);
    if (pkSign && pkDh) {
       setIdentityKeys({ sign: pkSign, dh: pkDh });
       setNeedsPinRestore(false);
    } else {
       setNeedsPinRestore(true);
    }
  };

  const completePinRestore = async (keysObject) => {
    setIdentityKeys(keysObject);
    setNeedsPinRestore(false);
  };

  useEffect(() => {
    const handleForcedLogout = () => {
      setToken(null);
      setUser(null);
      setIdentityKeys(null);
      setNeedsPinRestore(false);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    };
    const handleTokenRefreshed = (e) => setToken(e.detail);
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
        await deleteKey(`ik_sign_priv_${id}`);
        await deleteKey(`ik_dh_priv_${id}`);
        await deleteKey(`privateKey_${id}`).catch(() => {});
        await deleteKey(`ik_priv_${id}`).catch(() => {});
        await deleteKey(`spk_priv_${id}`).catch(() => {});
        await deleteKey(`opk_priv_${id}`).catch(() => {});
      } catch (_) {}
    }
    try {
      await authApi.logout();
    } catch (_) {}
    setToken(null);
    setUser(null);
    setIdentityKeys(null);
    setNeedsPinRestore(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, identityKeys, needsPinRestore, login, logout, completePinRestore, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
