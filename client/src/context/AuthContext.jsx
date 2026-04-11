import React, { createContext, useState, useEffect, useContext } from 'react';
import { deleteKey } from '../utils/keyStore';
import api, { authApi } from '../utils/axiosConfig';
import { uploadVault } from '../utils/vaultSyncService';
import { loadDeviceMasterKey, loadLocalVaultVersion, wipeLocalSecurity, loadWrappedVaultKey } from '../utils/localSecurityService';
import { unwrapVaultKey } from '../utils/crypto';

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
    
    // [Immediate Feedback] Clear UI state and tokens first so the user sees progress
    setToken(null);
    setUser(null);
    setIdentityKeys(null);
    setMasterKey(null);
    setNeedsPassphraseRestore(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    let shouldWipe = false;

    // 1. Attempt mandatory Vault Sync before losing context
    if (masterKey) {
      try {
        console.log('[AUTH] Mandatory Vault Sync initiated...');
        await Promise.race([
          uploadVault(masterKey),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync Timeout')), 5000)) // Reduced to 5s for better UX
        ]);
        shouldWipe = true;
      } catch (err) {
        console.warn('[AUTH] Pre-logout sync failed or timed out:', err.message);
        if (window.confirm("⚠️ Không thể sao lưu Két sắt. Nếu đăng xuất, dữ liệu cục bộ sẽ bị XÓA. Tiếp tục?")) {
          shouldWipe = true;
        } else {
          // Rollback logout if user cancels (but token is already cleared, so they'll likely need to log in again regardless)
          setIsLoggingOut(false);
          window.location.reload(); 
          return;
        }
      }
    } else {
      shouldWipe = true;
    }

    if (shouldWipe) {
      try {
        console.log('[AUTH-WIPE] Cleaning up local storage...');
        const { clearRatchetDB } = await import('../utils/ratchetStore');
        const { clearSenderKeyDB } = await import('../utils/senderKeyStore');
        const { clearKeyStore } = await import('../utils/keyStore');
        
        await Promise.allSettled([
          clearRatchetDB(),
          clearSenderKeyDB(),
          clearKeyStore(),
          wipeLocalSecurity()
        ]);
        
        try { await api.delete('/api/users/opks'); } catch (_) {}
      } catch (e) {
        console.error('[AUTH-WIPE] Cleanup error:', e);
      }
    }

    try {
      await authApi.logout();
    } catch (_) {}

    setIsLoggingOut(false);
    // [Fix] Final hard redirect
    window.location.href = '/login';
  };

  useEffect(() => {
    const init = async () => {
      if (token) {
        try {
          // [Security Hardening] Verify token validity
          const response = await api.get('/api/users/profile');
          const profile = response.data;
          setUser(profile);
          localStorage.setItem('user', JSON.stringify(profile));

          // [Standard Industry Solution] Passwordless Restore via Wrapped Vault Key
          const deviceKey = await loadDeviceMasterKey();
          const wrappedVault = await loadWrappedVaultKey();
          const localVer = await loadLocalVaultVersion();
          const serverVer = profile.vaultVersion || 1;

          if (deviceKey && wrappedVault && localVer === serverVer) {
            console.log(`[AUTH-INIT] Device Key found and Version matches (${localVer}). Unwrapping Vault Key...`);
            
            try {
              const restoredMKey = await unwrapVaultKey(wrappedVault.wrappedKeyB64, wrappedVault.ivB64, deviceKey);
              
              // Re-load identity keys from KeyStore using recovered MasterKey
              const { getKey } = await import('../utils/keyStore');
              const ikSign = await getKey(`ik_sign_priv_${profile.id}`, restoredMKey);
              const ikDh = await getKey(`ik_dh_priv_${profile.id}`, restoredMKey);
              
              if (ikSign && ikDh) {
                setIdentityKeys({ sign: ikSign, dh: ikDh });
                setMasterKey(restoredMKey);
                setNeedsPassphraseRestore(false);
                console.log('[AUTH-INIT] Session auto-restored via unwrap! No passphrase needed.');
              } else {
                console.warn('[AUTH-INIT] Keys missing in KeyStore. Manual restore required.');
                setNeedsPassphraseRestore(true);
              }
            } catch (unwrapErr) {
              console.error('[AUTH-INIT] Failed to unwrap vault key:', unwrapErr);
              setNeedsPassphraseRestore(true);
            }
          } else if (deviceKey && localVer < serverVer) {
            console.log(`[AUTH-INIT] Vault Version mismatch (Local: ${localVer}, Server: ${serverVer}). Gating with Passphrase.`);
            setNeedsPassphraseRestore(true);
          } else {
            console.log('[AUTH-INIT] No device key found. Manual restore required.');
            setNeedsPassphraseRestore(true);
          }
        } catch (err) {
          console.warn('[AUTH] Session invalid or expired during init. Cleaning up.', err);
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

  const updateUser = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
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
      login, logout, updateUser, completePassphraseRestore, loading, isLoggingOut
    }}>
      {children}
    </AuthContext.Provider>
  );
};
