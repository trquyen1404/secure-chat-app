import React, { useState } from 'react';
import { generateRSAKeyPair, generateAESKey, encryptMessageAES, encryptKeyRSA, decryptKeyRSA, decryptMessageAES, generateECDHKeyPair, deriveSharedAESKey } from '../utils/crypto';
import { ArrowLeft, Clock, ShieldCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BenchmarkMode = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  
  const addLog = (msg) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  // Create a payload to encrypt (representing a standard message)
  const payload = "Đây là một tin nhắn kiểm thử bí mật, chứa các ký tự Unicode để đánh giá tốc độ mã hóa và giải mã của các hệ mật mã.";

  const runRSATest = async () => {
    setIsTesting(true);
    setLogs([]);
    addLog('Bắt đầu thử nghiệm RSA-4096 (Key Wrapping)...');
    
    try {
      // 1. Generate RSA Keys (Alice & Bob)
      const t0 = performance.now();
      const aliceRSA = await generateRSAKeyPair();
      const bobRSA = await generateRSAKeyPair();
      const t1 = performance.now();
      addLog(`[RSA] Sinh 2 cặp khóa RSA-4096 mất: ${(t1 - t0).toFixed(2)} ms`);
      
      addLog(`[RSA] Kích thước Public Key của Alice: ${aliceRSA.publicKeyPem.length} bytes`);

      // 2. Alice sends a message to Bob
      const t2 = performance.now();
      const aesKey = await generateAESKey();
      
      const { ciphertextB64, ivB64 } = await encryptMessageAES(payload, aesKey);
      
      // Alice wraps AES key with Bob's Public Key
      const wrappedKeyB64 = await encryptKeyRSA(aesKey, bobRSA.publicKeyPem);
      const t3 = performance.now();
      addLog(`[RSA] Alice mã hóa nội dung và bọc khóa AES (Encrypt + Wrap) mất: ${(t3 - t2).toFixed(2)} ms`);

      // 3. Bob receives and decrypts
      const t4 = performance.now();
      const unwrappedAesKey = await decryptKeyRSA(wrappedKeyB64, bobRSA.privateKey);
      const decryptedText = await decryptMessageAES(ciphertextB64, unwrappedAesKey, ivB64);
      const t5 = performance.now();
      addLog(`[RSA] Bob gỡ bọc khóa AES và giải mã nội dung (Unwrap + Decrypt) mất: ${(t5 - t4).toFixed(2)} ms`);
      
      addLog(`[RSA] Tổng thời gian xử lý 1 tin nhắn: ${((t5 - t4) + (t3 - t2)).toFixed(2)} ms`);
      
    } catch (err) {
      addLog(`Lỗi RSA: ${err.message}`);
    }
    setIsTesting(false);
  };

  const runECDHTest = async () => {
    setIsTesting(true);
    setLogs([]);
    addLog('Bắt đầu thử nghiệm ECDH (P-384 Key Agreement)...');
    
    try {
      // 1. Generate ECDH Keys (Alice & Bob)
      const t0 = performance.now();
      const aliceEC = await generateECDHKeyPair('P-384');
      const bobEC = await generateECDHKeyPair('P-384');
      const t1 = performance.now();
      addLog(`[ECDH] Sinh 2 cặp khóa ECDH P-384 mất: ${(t1 - t0).toFixed(2)} ms`);
      
      addLog(`[ECDH] Kích thước Public Key của Alice: ${aliceEC.ecPublicKeyPem.length} bytes`);

      // 2. Alice & Bob Derive Shared Key
      // They don't need to wrap keys. They just derive directly.
      const t2 = performance.now();
      const aliceSharedKey = await deriveSharedAESKey(aliceEC.ecPrivateKey, bobEC.ecPublicKeyPem, 'P-384');
      const t3 = performance.now();
      addLog(`[ECDH] Thỏa thuận khóa (Derive Shared AES Key) mất: ${(t3 - t2).toFixed(2)} ms / 1 user`);

      // 3. Alice encrypts using derived key
      const t4 = performance.now();
      const { ciphertextB64, ivB64 } = await encryptMessageAES(payload, aliceSharedKey);
      const t5 = performance.now();
      addLog(`[ECDH] Alice mã hóa nội dung bằng Shared Key mất: ${(t5 - t4).toFixed(2)} ms`);

      // 4. Bob decrypts
      const t6 = performance.now();
      // Bob mathematically gets the EXACT SAME shared key!
      const bobSharedKey = await deriveSharedAESKey(bobEC.ecPrivateKey, aliceEC.ecPublicKeyPem, 'P-384'); 
      const decryptedText = await decryptMessageAES(ciphertextB64, bobSharedKey, ivB64);
      const t7 = performance.now();
      addLog(`[ECDH] Bob thỏa thuận khóa và giải mã nội dung mất: ${(t7 - t6).toFixed(2)} ms`);
      
      addLog(`[ECDH] Tổng thời gian xử lý 1 tin nhắn: ${((t7 - t6) + (t5 - t4) + (t3 - t2)).toFixed(2)} ms`);

    } catch (err) {
      addLog(`Lỗi ECDH: ${err.message}`);
    }
    setIsTesting(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 mb-6 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Trở về App Chat
        </button>

        <h1 className="text-3xl font-bold mb-4 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-indigo-500" />
          Phân Tích Băng Thông Đo Lường Mã Hóa
        </h1>
        <p className="text-slate-400 mb-8 max-w-2xl">
          Trang kiểm thử phục vụ Đồ án: <span className="text-amber-500 font-semibold cursor-pointer">"Nghiên cứu và xây dựng ứng dụng chat an toàn sử dụng AES và ECDH, đánh giá so sánh với RSA"</span>. 
          Công cụ này chạy trực tiếp thuật toán mật mã trên trình duyệt của bạn (Web Crypto API).
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
           <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                 <Clock className="w-5 h-5 text-rose-400" /> Mô Hình 1: AES + RSA
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Chìa khóa đối xứng AES-GCM được sinh ngẫu nhiên, sau đó **bọc (wrap)** bằng thuật toán bất đối xứng RSA-4096 để truyền đi.
              </p>
              <button 
                 onClick={runRSATest} 
                 disabled={isTesting}
                 className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition disabled:opacity-50"
              >
                 {isTesting ? 'Đang chạy...' : 'Chạy Benchmark RSA'}
              </button>
           </div>
           
           <div className="bg-slate-800 rounded-xl p-6 border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                 <Zap className="w-5 h-5 text-amber-400" /> Mô Hình 2: AES + ECDH
              </h2>
              <p className="text-sm text-indigo-200/70 mb-6">
                Hai bên trao đổi khóa công khai P-384, tự động **lai tạo (derive)** ra khóa đối xứng chung AES-GCM, hoàn toàn không cần bọc khóa truyền đi.
              </p>
              <button 
                 onClick={runECDHTest} 
                 disabled={isTesting}
                 className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold shadow-lg shadow-indigo-600/20 transition disabled:opacity-50 text-white"
              >
                 {isTesting ? 'Đang chạy...' : 'Chạy Benchmark ECDH'}
              </button>
           </div>
        </div>

        {/* Console View */}
        <div className="bg-black rounded-lg border border-slate-800 p-4 font-mono text-sm h-80 overflow-y-auto">
           <div className="text-emerald-500 mb-2">root@benchmark:~# ./start_test.sh</div>
           {logs.map((log, i) => (
             <div key={i} className={`mb-1 ${log.includes('mất:') ? 'text-amber-300' : 'text-slate-300'}`}>
               {log}
             </div>
           ))}
           {logs.length === 0 && <div className="text-slate-600 italic">Chưa có dữ liệu... Bấm nút để bắt đầu</div>}
        </div>
      </div>
    </div>
  );
};

export default BenchmarkMode;
