import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  base64ToArrayBuffer, 
  pbkdf2Derive
} from '../utils/crypto';
import { downloadAndRestoreVault } from '../utils/vaultSyncService';
import { getKey } from '../utils/keyStore';
import { generateDeviceMasterKey, wrapVaultKey } from '../utils/crypto';
import { saveDeviceMasterKey, saveLocalVaultVersion, loadLocalVaultVersion, saveWrappedVaultKey } from '../utils/localSecurityService';
import { ShieldCheck, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const RestoreKeyModal = () => {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { user, completePassphraseRestore, logout, needsPassphraseRestore } = useAuth();

  const handleRestore = async (e) => {
    e.preventDefault();
    const isVersionMismatch = await loadLocalVaultVersion() > 0 && await loadLocalVaultVersion() < (user.vaultVersion || 1);
    
    if (passphrase.length < 8) {
      setError('Mật khẩu khôi phục phải có ít nhất 8 ký tự.');
      return;
    }

    setLoading(true);
    setProgress(5);
    setError(null);

    try {
      // 1. Derive Master Key from Passphrase + Server Salt
      console.log('[RESTORE] Starting Passphrase derivation and decryption...');
      const salt = base64ToArrayBuffer(user.keyBackupSalt);
      const mKey = await pbkdf2Derive(passphrase, new Uint8Array(salt));
      console.log('[RESTORE] Master Key successfully derived.');

      // 2. Unwrap the Global Identity Bundle (IK_sign, IK_dh, SPK)
      // This is our primary source of cryptographic identity truth.
      const { unwrapIdentityBundleWithPIN } = await import('../utils/crypto');
      const { pkcs8Sign, pkcs8Dh, pkcs8Spk } = await unwrapIdentityBundleWithPIN(
        user.encryptedPrivateKey,
        user.keyBackupSalt,
        user.keyBackupIv,
        passphrase
      );

      // 3. Import and Persist Identity Keys to the secure KeyStore
      const ikSign = await window.crypto.subtle.importKey(
        'pkcs8', pkcs8Sign, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']
      );
      const ikDh = await window.crypto.subtle.importKey(
        'pkcs8', pkcs8Dh, { name: 'X25519' }, true, ['deriveKey', 'deriveBits']
      );
      const spkPriv = await window.crypto.subtle.importKey(
        'pkcs8', pkcs8Spk, { name: 'X25519' }, true, ['deriveKey', 'deriveBits']
      );

      const { setKey } = await import('../utils/keyStore');
      await setKey(`ik_sign_priv_${user.id}`, ikSign, mKey);
      await setKey(`ik_dh_priv_${user.id}`, ikDh, mKey);
      await setKey(`spk_priv_${user.id}`, spkPriv, mKey);
      
      // Mark identity as initialized on this device
      await setKey('local_identity_initialized', true);
      localStorage.setItem('hasIdentity', 'true');

      // 4. Download and Decrypt Vault (Mirror for Sessions and Messages)
      const success = await downloadAndRestoreVault(mKey, (p) => setProgress(p));
      
      if (success) {
        console.log('[RESTORE] Session vault restoration SUCCESSFUL');
      } else {
        console.log('[RESTORE] Session vault restoration NONE FOUND');
      }

      // 5. OPK Survival Check
      const { getAllKeys } = await import('../utils/keyStore');
      const allKeys = await getAllKeys();
      const hasOPKs = allKeys.some(k => k.id.startsWith(`opk_priv_${user.id}_`));
      
      if (!hasOPKs) {
        console.warn('[RESTORE] No OPKs found locally or in Vault. Regenerating to prevent X3DH lockout...');
        const { generateX25519KeyPair } = await import('../utils/crypto');
        const { authApi } = await import('../utils/axiosConfig');
        const opks = [];
        const opksPrivate = [];
        for (let i = 0; i < 20; i++) {
          const key = await generateX25519KeyPair();
          opks.push({ publicKey: key.publicKeyBase64 });
          opksPrivate.push(key);
        }
        for (let i = 0; i < opksPrivate.length; i++) {
          await setKey(`opk_priv_${user.id}_${opks[i].publicKey}`, opksPrivate[i].privateKey, mKey);
        }
        await authApi.uploadOpks({ oneTimePreKeys: opks });
        console.log('[RESTORE] OPKs successfully regenerated and uploaded to backend.');
      }

      // 6. Trigger Offline Message Sync (Background)
      const { syncOfflineMessages } = await import('../utils/offlineSyncService');
      syncOfflineMessages(mKey, user);

      // 7. [Standard Industry Solution] Handle Passwordless Persistence (Wrapped Vault Key)
      console.log('[RESTORE] Establishing Device-bound persistence...');
      const deviceKey = await generateDeviceMasterKey();
      const wrappedVault = await wrapVaultKey(mKey, deviceKey);
      
      await saveDeviceMasterKey(deviceKey);
      await saveWrappedVaultKey(wrappedVault);
      await saveLocalVaultVersion(user.vaultVersion || 1);

      // 8. Re-persist Identity Keys using the recovered MasterKey 
      // Note: We use the recovered mKey here to ensure KeyStore decryption works in future
      await setKey(`ik_sign_priv_${user.id}`, ikSign, mKey);
      await setKey(`ik_dh_priv_${user.id}`, ikDh, mKey);
      await setKey(`spk_priv_${user.id}`, spkPriv, mKey);

      console.log('[RESTORE] Device security initialized. Next refresh will be passwordless.');

      completePassphraseRestore({ sign: ikSign, dh: ikDh }, mKey);
    } catch (err) {
      console.error('[RESTORE]', err);
      const isAuthError = err.name === 'OperationError' || err.message.includes('Decryption Failed');
      setError(isAuthError
        ? 'Mật khẩu khôi phục không chính xác. Vui lòng thử lại.' 
        : 'Lỗi khôi phục: ' + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  if (!needsPassphraseRestore) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-fade-in">
      {/* Background Decor */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse [animation-delay:1.5s]"></div>

      <div className="relative z-10 w-full max-w-md glass p-10 rounded-[40px] premium-shadow border-[var(--glass-border)] animate-scale-in">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl transition-all duration-500 ${user.vaultVersion > 1 ? 'bg-amber-500/20 text-amber-500' : 'bg-indigo-500/20 text-indigo-500'}`}>
            {user.vaultVersion > 1 ? <RefreshCw className="w-10 h-10 animate-spin-slow" /> : <ShieldCheck className="w-10 h-10" />}
          </div>
          
          <h3 className="text-3xl font-black text-[var(--text-primary)] tracking-tight mb-3">
            {user.vaultVersion > 1 ? 'Cập nhật Két sắt' : 'Mở khóa Két sắt'}
          </h3>
          <p className="text-[14px] text-[var(--text-secondary)] font-medium leading-relaxed px-2">
            {user.vaultVersion > 1 
              ? "Mật khẩu của bạn đã được thay đổi. Vui lòng xác thực mật khẩu mới để tiếp tục phiên bản bảo mật mới." 
              : "Phát hiện thiết bị mới. Vui lòng nhập mật khẩu khôi phục để giải mã toàn bộ lịch sử tin nhắn của bạn."
            }
          </p>
        </div>

        <form onSubmit={handleRestore} className="space-y-8">
          <div className="space-y-3">
            <label className="text-[13px] font-bold text-[var(--text-secondary)] ml-1 uppercase tracking-wider">Passphrase Bảo mật</label>
            <input
              type="password"
              required
              autoFocus
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-amber-500/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-amber-500/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50"
              placeholder="Nhập khóa khôi phục 8+ ký tự..."
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={loading}
            />
          </div>

          {loading && (
            <div className="space-y-4 animate-fade-in">
              <div className="h-2 w-full bg-[var(--bg-accent)] rounded-full overflow-hidden border border-[var(--border)]">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center px-1">
                <p className="text-[11px] text-amber-500 font-black uppercase tracking-widest animate-pulse">
                  {progress < 20 ? 'Kết nối...' : progress < 60 ? 'Giải mã Két sắt...' : 'Đang khôi phục...'}
                </p>
                <span className="text-[11px] font-bold text-amber-500">{Math.round(progress)}%</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-shake">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-500 leading-relaxed font-bold">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading || passphrase.length < 8}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-amber-500/20 transition-all duration-300 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:hover:scale-100 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                'Kích hoạt Khôi phục'
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              disabled={loading}
              className="w-full py-3 text-[11px] text-[var(--text-secondary)] hover:text-red-500 transition-colors uppercase tracking-[0.2em] font-black"
            >
              Hủy bỏ và Đăng xuất
            </button>
          </div>
        </form>

        <div className="mt-10 pt-8 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--text-secondary)]/60 leading-relaxed text-center font-medium italic">
            🛡️ Khóa bí mật của bạn được bảo vệ bởi giao thức AES-256. <br/> Chúng tôi không bao giờ có thể truy cập vào khóa này.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RestoreKeyModal;
