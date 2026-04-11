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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in transition-all">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300">
        <div className="p-8">
          <div className="flex flex-col items-center mb-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors ${user.vaultVersion > 1 ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
              {user.vaultVersion > 1 ? <RefreshCw className="w-8 h-8 text-amber-500 animate-spin-slow" /> : <ShieldCheck className="w-8 h-8 text-blue-500" />}
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">
              {user.vaultVersion > 1 ? 'Cập nhật Két sắt' : 'Khôi phục Két sắt'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center mt-2 px-4 transition-colors">
              {user.vaultVersion > 1 
                ? "Mật khẩu của bạn đã được thay đổi từ một thiết bị khác. Vui lòng nhập mật khẩu mới để tiếp tục." 
                : "Thiết bị mới phát hiện. Vui lòng nhập mật khẩu khôi phục để dải mã tin nhắn của bạn."
              }
            </p>
          </div>

          <form onSubmit={handleRestore} className="space-y-4">
            <div>
              <input
                type="password"
                required
                autoFocus
                className="w-full px-4 py-3.5 bg-white dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Nhập Mật khẩu khôi phục (8+ ký tự)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
              />
            </div>

            {loading && (
              <div className="space-y-2">
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[10px] text-center text-amber-500 font-bold uppercase tracking-widest animate-pulse">
                  {progress < 20 ? 'Đang kết nối...' : progress < 60 ? 'Đang dải mã Két sắt...' : 'Đang khôi phục lịch sử...'}
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 transition-all animate-shake">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || passphrase.length < 8}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-900/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                'Mở khóa Két sắt'
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              disabled={loading}
              className="w-full py-2.5 text-xs text-gray-500 dark:text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest font-bold"
            >
              Hủy và Đăng xuất
            </button>
          </form>
        </div>

        <div className="bg-gray-50 dark:bg-slate-950/50 p-4 border-t border-gray-100 dark:border-slate-800/50">
          <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-relaxed text-center italic transition-colors">
            Khóa bí mật của bạn được mã hóa hoàn toàn. Chúng tôi không bao giờ lưu trữ mật khẩu khôi phục của bạn trên máy chủ.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RestoreKeyModal;
