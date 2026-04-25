import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axiosConfig';
import { 
  base64ToArrayBuffer, 
  unwrapIdentityBundleWithPIN,
  generateX25519KeyPair,
  signDataECDSA
} from '../utils/crypto';
import { saveKey } from '../utils/keyStore';
import { Lock, Loader2, KeyRound } from 'lucide-react';

const RestoreKeyModal = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user, completePinRestore, logout } = useAuth();

  const handleRestore = async (e) => {
    e.preventDefault();
    if (pin.length < 6) {
      setError('Mã PIN không hợp lệ.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { encryptedPrivateKey, keyBackupSalt, keyBackupIv } = user;
      if (!encryptedPrivateKey || !keyBackupSalt || !keyBackupIv) {
        throw new Error('Backup data missing or corrupted.');
      }

      // Unwrap both identity keys
      const { pkcs8Sign, pkcs8Dh } = await unwrapIdentityBundleWithPIN(
        encryptedPrivateKey, keyBackupSalt, keyBackupIv, pin
      );

      // Import ECDSA
      const restoredSignKey = await window.crypto.subtle.importKey(
        'pkcs8', pkcs8Sign, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
      );

      // Import X25519
      const restoredDhKey = await window.crypto.subtle.importKey(
        'pkcs8', pkcs8Dh, { name: 'X25519' }, false, ['deriveKey', 'deriveBits']
      );

      await saveKey(`ik_sign_priv_${user.id}`, restoredSignKey);
      await saveKey(`ik_dh_priv_${user.id}`, restoredDhKey);

      // --- CRITICAL SECURITY STEP ---
      // The user successfully recovered their identity but their device lost the old SPK and OPKs.
      // We must generate NEW PreKeys, sign them with the restored Identity Key, and upload them.
      const spk = await generateX25519KeyPair();
      const spkSignature = await signDataECDSA(restoredSignKey, base64ToArrayBuffer(spk.publicKeyBase64));

      const opks = [];
      const opksPrivate = [];
      for (let i = 0; i < 20; i++) {
        const key = await generateX25519KeyPair();
        opks.push({ publicKey: key.publicKeyBase64 });
        opksPrivate.push(key);
      }

      await api.post('/api/users/update-prekeys', {
        signedPreKey: {
          publicKey: spk.publicKeyBase64,
          signature: spkSignature
        },
        oneTimePreKeys: opks
      });

      // Save the new SPK and OPKs locally
      await saveKey(`spk_priv_${user.id}`, spk.privateKey);
      for (let i = 0; i < opksPrivate.length; i++) {
        await saveKey(`opk_priv_${user.id}_${opks[i].publicKey}`, opksPrivate[i].privateKey);
      }
      
      // We pass both keys to context or just complete
      await completePinRestore({ sign: restoredSignKey, dh: restoredDhKey });
    } catch (err) {
      console.error('[RestoreKeyModal] Error:', err);
      if (err.response?.status === 404) {
        setError('Lỗi hệ thống: Không tìm thấy máy chủ cập nhật khóa.');
      } else if (err.message === 'Backup data missing or corrupted.') {
        setError('Dữ liệu sao lưu trên máy chủ bị lỗi.');
      } else {
        setError('Mã PIN không chính xác hoặc dữ liệu sao lưu bị hỏng.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 dark:bg-slate-950/80 backdrop-blur-md transition-colors duration-500">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl relative overflow-hidden transition-colors duration-300">
        {/* Decorative background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="flex flex-col items-center text-center relative z-10">
          <div className="w-14 h-14 bg-indigo-500/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
            <KeyRound className="w-7 h-7" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 transition-colors">Khôi phục Lịch sử Chat</h2>
          
          {!user.encryptedPrivateKey ? (
            <div className="text-sm text-gray-500 dark:text-slate-400 mb-6 transition-colors">
              <p className="text-amber-500 dark:text-amber-400 mb-2 font-medium">Lưu ý: Thiết bị này chưa có khóa bảo mật và tài khoản của bạn chưa được sao lưu bằng mã PIN trên máy chủ.</p>
              <p>Bạn không thể đọc lại tin nhắn cũ. Vui lòng đăng xuất để thử lại, hoặc nhấn nút bên dưới để tạo phiên bản khóa mới (bạn sẽ có thể trò chuyện tiếp, nhưng tin nhắn cũ sẽ mất).</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-6 transition-colors">
              Hệ thống phát hiện bạn đang đăng nhập từ một thiết bị mới. Hãy nhập mã PIN bảo mật để giải mã tin nhắn.
            </p>
          )}

          <form onSubmit={handleRestore} className="w-full space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}
            
            {user.encryptedPrivateKey && (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                <input
                  type="password"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 tracking-[0.5em] font-mono text-center placeholder-gray-400 dark:placeholder-gray-600"
                  placeholder="Mã PIN 6 số"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  pattern="\d*"
                  maxLength={12}
                />
              </div>
            )}

            {!user.encryptedPrivateKey ? (
               <button
                 type="button"
                 disabled={loading}
                 onClick={logout}
                 className="w-full py-3 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-white rounded-xl font-medium transition-all"
               >
                 Đăng xuất (Không khôi phục)
               </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Khôi phục ngay'}
              </button>
            )}
            
            <button
               type="button"
               onClick={logout}
               disabled={loading}
               className="w-full py-2 text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white text-sm transition-colors"
            >
              Hủy và Đăng xuất
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RestoreKeyModal;
