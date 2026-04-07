import React, { createContext, useState, useEffect, useContext } from 'react';
import { deleteKey } from '../utils/keyStore';
import api, { authApi } from '../utils/axiosConfig';
import { uploadVault } from '../utils/vaultSyncService';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [identityKeys, setIdentityKeys] = useState(null);
  const [masterKey, setMasterKey] = useState(null); // RAM-only Master Key
  const [needsPassphraseRestore, setNeedsPassphraseRestore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    let shouldWipe = false;

    // [Safety Path] 1. Attempt mandatory Vault Sync before losing token
    if (masterKey) {
      try {
        console.log('[AUTH] Mandatory Vault Sync initiated before logout...');
        // Increased timeout to 15s to handle larger history bundles
        await Promise.race([
          uploadVault(masterKey),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync Timeout')), 15000))
        ]);
        console.log('[AUTH] Pre-logout sync successful.');
        shouldWipe = true; // Safe to wipe since data is on server
      } catch (err) {
        console.warn('[AUTH] Mandatory sync failed or timed out.', err.message);
        
        // [Offline Safety] Ask user if they want to force logout (data loss vs security)
        const isOffline = !navigator.onLine;
        const confirmMsg = isOffline 
          ? "⚠️ Không có kết nối mạng. Nếu bạn đăng xuất bây giờ, các tin nhắn gần nhất chưa được sao lưu sẽ bị XÓA để bảo mật. Bạn có chắc chắn muốn đăng xuất?"
          : "⚠️ Không thể sao lưu Két sắt (Lỗi Server/Mạng). Nếu đăng xuất, dữ liệu cục bộ sẽ bị XÓA. Bạn có chắc chắn muốn tiếp tục?";
        
        if (window.confirm(confirmMsg)) {
          shouldWipe = true;
        } else {
          setIsLoggingOut(false);
          return; // Cancel logout
        }
      }
    } else {
      // If no masterKey (uninitialized), it's safe to just logout
      shouldWipe = true;
    }

    if (shouldWipe) {
      try {
        const { clearRatchetDB } = await import('../utils/ratchetStore');
        await clearRatchetDB();
      } catch (e) {
        console.error('[AUTH] Failed to wipe local DB:', e);
      }
    }

    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const { id } = JSON.parse(storedUser);
        await deleteKey(`ik_sign_priv_${id}`);
        await deleteKey(`ik_dh_priv_${id}`);
      }
    } catch (_) {}

    try {
      await authApi.logout();
    } catch (_) {}

    setToken(null);
    setUser(null);
    setIdentityKeys(null);
    setMasterKey(null);
    setNeedsPassphraseRestore(false);
    setIsLoggingOut(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Dispatch is removed to prevent infinite loop
  };

  useEffect(() => {
    const init = async () => {
      if (token) {
        try {
          // [Security Hardening] Verify token validity and session version before restore
          const response = await api.get('/api/users/profile');
          const profile = response.data;
          setUser(profile);
          localStorage.setItem('user', JSON.stringify(profile));
          setNeedsPassphraseRestore(true);
        } catch (err) {
          console.warn('[AUTH] Session invalid or expired during init. Cleaning up.');
          await logout();
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
    setNeedsPassphraseRestore(true);
  };

  const completePassphraseRestore = async (keysObject, mKey) => {
    console.log('[AUTH] Passphrase Restore Complete. Master Key initialized in RAM.');
    setIdentityKeys(keysObject);
    setMasterKey(mKey);
    setNeedsPassphraseRestore(false);
  };

  useEffect(() => {
    const handleForcedLogout = async () => {
      await logout();
    };
    const handleTokenRefreshed = (e) => setToken(e.detail);
    window.addEventListener('auth-logout', handleForcedLogout);
    window.addEventListener('auth-refreshed', handleTokenRefreshed);
    return () => {
       window.removeEventListener('auth-logout', handleForcedLogout);
       window.removeEventListener('auth-refreshed', handleTokenRefreshed);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, token, identityKeys, masterKey, needsPassphraseRestore, 
      login, logout, completePassphraseRestore, loading, isLoggingOut
    }}>
      {children}
    </AuthContext.Provider>
  );
};
