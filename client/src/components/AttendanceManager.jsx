import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { signDataECDSA } from '../utils/crypto';
import { X, CheckCircle, AlertCircle, Loader2, QrCode, User, BarChart2 } from 'lucide-react';

const AttendanceManager = ({ groupId, isOpen, onClose, isTeacher }) => {
  const [activeSession, setActiveSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [view, setView] = useState('list'); // 'list', 'create', 'scan', 'details', 'stats'
  const [groupStats, setGroupStats] = useState(null);
  const { user, masterKey, identityKeys } = useAuth();
  const scannerRef = useRef(null);

  useEffect(() => {
    if (isOpen && groupId) {
      fetchSessions();
    }
  }, [isOpen, groupId]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/attendance/groups/${groupId}/sessions`);
      setSessions(res.data);
      const active = res.data.find(s => s.isActive && new Date(s.expiresAt) > new Date());
      setActiveSession(active);
    } catch (err) {
      setError('Không thể tải dữ liệu điểm danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && view === 'stats') {
      const handleUpdate = () => fetchGroupStats();
      window.addEventListener('new_group_message_stats_update', handleUpdate);
      return () => window.removeEventListener('new_group_message_stats_update', handleUpdate);
    }
  }, [isOpen, view, groupId]);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    const duration = parseInt(e.target.duration.value);
    
    setLoading(true);
    try {
      const res = await api.post('/api/attendance/sessions', {
        groupId,
        title,
        durationMinutes: duration
      });
      setSuccess('Đã tạo phiên điểm danh mới');
      fetchSessions();
      setView('list');
    } catch (err) {
      setError('Lỗi khi tạo phiên điểm danh');
    } finally {
      setLoading(false);
    }
  };

  const startScanner = () => {
    if (typeof Html5QrcodeScanner === 'undefined') {
      setError('Trình quét mã QR không khả dụng.');
      return;
    }
    setView('scan');
    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner("reader", { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        });
        
        scanner.render(async (decodedText) => {
          try {
            const data = JSON.parse(decodedText);
            if (data.type !== 'ATTENDANCE_SESSION') throw new Error('Invalid QR');
            
            scanner.clear();
            submitAttendance(data.sessionId, data.sessionData);
          } catch (err) {
            setError('Mã QR không hợp lệ');
          }
        }, (err) => {
          // console.warn(err);
        });
        scannerRef.current = scanner;
      } catch (e) {
        setError('Không thể khởi động camera.');
        setView('list');
      }
    }, 100);
  };

  const handleSendReport = async (session) => {
    if (!session || !session.Records) return;
    
    setLoading(true);
    try {
      const presentCount = session.Records.length;
      
      let reportText = `📊 **BÁO CÁO ĐIỂM DANH: ${session.title}**\n`;
      reportText += `📅 Thời gian: ${new Date(session.createdAt).toLocaleString()}\n`;
      reportText += `✅ Hiện diện: ${presentCount} thành viên\n\n`;
      reportText += `**Danh sách:**\n`;
      
      session.Records.forEach((r, i) => {
        reportText += `${i + 1}. ${r.User?.displayName || r.User?.username} (${new Date(r.scannedAt).toLocaleTimeString()})\n`;
      });

      if (presentCount === 0) reportText += `(Chưa có ai điểm danh)\n`;
      
      window.dispatchEvent(new CustomEvent('send_system_message', { 
        detail: { text: reportText, groupId } 
      }));

      setSuccess('Đã gửi báo cáo vào nhóm chat');
    } catch (err) {
      setError('Không thể gửi báo cáo');
    } finally {
      setLoading(false);
    }
  };

  const submitAttendance = async (sessionId, sessionData) => {
    if (!identityKeys?.sign) {
      setError('Khóa bảo mật chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }
    setLoading(true);
    try {
      // Data to sign: sessionId:sessionData:userId
      const dataToSign = `${sessionId}:${sessionData}:${user?.id}`;
      const encoder = new TextEncoder();
      const signature = await signDataECDSA(identityKeys.sign, encoder.encode(dataToSign));

      await api.post('/api/attendance/submit', {
        sessionId,
        signature,
        deviceInfo: navigator.userAgent
      });
      
      setSuccess('Điểm danh thành công!');
      setView('list');
      fetchSessions();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi khi điểm danh');
      setView('list');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupStats = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/groups/${groupId}/stats`);
      setGroupStats(res.data);
      setView('stats');
    } catch (err) {
      setError('Không thể tải thống kê nhóm');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-primary)] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5" />
            <h2 className="font-bold">Quản lý điểm danh</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center gap-2 text-sm animate-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-xs hover:underline">Đóng</button>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 text-green-500 rounded-lg flex items-center gap-2 text-sm animate-in slide-in-from-top-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {success}
              <button onClick={() => setSuccess(null)} className="ml-auto text-xs hover:underline">Đóng</button>
            </div>
          )}

          {view === 'list' && (
            <div className="space-y-4">
              {isTeacher && (
                <button 
                  onClick={() => setView('create')}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <QrCode className="w-5 h-5" />
                  Tạo phiên điểm danh mới
                </button>
              )}

              {!isTeacher && activeSession && (
                <button 
                  onClick={startScanner}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                >
                  <QrCode className="w-5 h-5" />
                  Quét mã điểm danh
                </button>
              )}

              <button 
                onClick={fetchGroupStats}
                className="w-full py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-500/20"
              >
                <BarChart2 className="w-5 h-5" />
                Thống kê tương tác nhóm
              </button>

              <div className="pt-2">
                <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Phiên gần đây</h3>
                {loading ? (
                  <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-10 text-[var(--text-secondary)] italic bg-[var(--hover)] rounded-xl border border-dashed border-[var(--border)]">
                    Chưa có phiên điểm danh nào
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map(s => (
                      <div key={s.id} className="p-4 rounded-xl border border-[var(--border)] hover:bg-[var(--hover)] transition-colors group cursor-pointer" onClick={() => setActiveSession(s)}>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-[var(--text-primary)]">{s.title}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${new Date(s.expiresAt) > new Date() ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                            {new Date(s.expiresAt) > new Date() ? 'Đang mở' : 'Đã đóng'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                          <span>{new Date(s.createdAt).toLocaleString()}</span>
                          <span className="flex items-center gap-1 font-medium text-blue-500">
                            <User className="w-3 h-3" />
                            {s.Records?.length || 0} hiện diện
                          </span>
                        </div>
                        {activeSession?.id === s.id && (
                          <div className="mt-4 pt-4 border-t border-[var(--border)] animate-in fade-in zoom-in-95 duration-200">
                            {isTeacher && (
                              <div className="flex flex-col items-center gap-4 py-2">
                                {new Date(s.expiresAt) > new Date() && (
                                  <div className="p-4 bg-white rounded-2xl shadow-xl">
                                    <QRCodeSVG 
                                      value={JSON.stringify({
                                        type: 'ATTENDANCE_SESSION',
                                        sessionId: s.id,
                                        sessionData: s.sessionData
                                      })} 
                                      size={200}
                                      level="H"
                                      includeMargin={true}
                                    />
                                  </div>
                                )}
                                
                                <button 
                                  onClick={() => handleSendReport(s)}
                                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all shadow-md"
                                >
                                  <BarChart2 className="w-4 h-4" />
                                  Gửi báo cáo vào nhóm
                                </button>

                                {new Date(s.expiresAt) > new Date() && (
                                  <p className="text-[11px] text-[var(--text-secondary)] text-center px-4">
                                    Giảng viên trình chiếu mã này để sinh viên quét. <br/>
                                    Mã chứa chữ ký số xác thực.
                                  </p>
                                )}
                              </div>
                            )}
                            
                            <div className="mt-2">
                                <h5 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-2">Danh sách hiện diện</h5>
                                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                    {s.Records?.map(r => (
                                        <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-[var(--hover)]">
                                            <span className="text-xs font-medium">{r.User?.displayName || r.User?.username}</span>
                                            <span className="text-[10px] text-[var(--text-secondary)]">{new Date(r.scannedAt).toLocaleTimeString()}</span>
                                        </div>
                                    ))}
                                    {(!s.Records || s.Records.length === 0) && (
                                        <p className="text-[10px] text-[var(--text-secondary)] italic">Chưa có ai điểm danh</p>
                                    )}
                                </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'create' && (
            <form onSubmit={handleCreateSession} className="space-y-4 animate-in slide-in-from-right-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-1">Tiêu đề phiên</label>
                <input 
                  name="title" 
                  required 
                  placeholder="VD: Điểm danh buổi 1 - 26/04"
                  className="w-full px-4 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] outline-none focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-1">Thời gian hiệu lực (phút)</label>
                <input 
                  name="duration" 
                  type="number" 
                  defaultValue="15" 
                  min="1"
                  className="w-full px-4 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] outline-none focus:border-blue-500 transition-all"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setView('list')}
                  className="flex-1 py-2 rounded-xl border border-[var(--border)] font-bold hover:bg-[var(--hover)] transition-all"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Xác nhận tạo'}
                </button>
              </div>
            </form>
          )}

          {view === 'scan' && (
            <div className="flex flex-col items-center gap-4 animate-in slide-in-from-right-4">
              <div id="reader" className="w-full rounded-2xl overflow-hidden border-2 border-blue-500 shadow-2xl shadow-blue-500/20"></div>
              <p className="text-sm text-[var(--text-secondary)] text-center">
                Vui lòng hướng camera vào mã QR được hiển thị bởi giảng viên
              </p>
              <button 
                onClick={() => {
                    if(scannerRef.current) scannerRef.current.clear();
                    setView('list');
                }}
                className="w-full py-2 rounded-xl border border-[var(--border)] font-bold hover:bg-[var(--hover)] transition-all"
              >
                Hủy quét
              </button>
            </div>
          )}

          {view === 'stats' && groupStats && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button onClick={() => setView('list')} className="text-sm text-blue-500 hover:underline flex items-center gap-1">
                  ← Quay lại
                </button>
                <div className="text-right text-xs text-[var(--text-secondary)]">
                  Tổng tin nhắn: <span className="font-bold text-[var(--text-primary)]">{groupStats.totalMessages}</span>
                </div>
              </div>

              <div className="bg-[var(--hover)] rounded-2xl p-4 border border-[var(--border)]">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-500" />
                  Xếp hạng tương tác (%)
                </h3>
                
                <div className="space-y-5">
                  {groupStats.stats.map((s, idx) => (
                    <div key={s.userId} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-medium">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${idx < 3 ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-slate-700'}`}>
                            {idx + 1}
                          </span>
                          <span className="truncate max-w-[150px]">{s.displayName || s.username}</span>
                        </div>
                        <div className="text-[var(--text-secondary)]">
                          {s.messageCount} tin nhắn ({s.percentage}%)
                        </div>
                      </div>
                      <div className="w-full h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${s.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-500/5 rounded-xl border border-blue-100 dark:border-blue-500/10 text-xs text-blue-600 dark:text-blue-400">
                💡 Số liệu được tính dựa trên toàn bộ lịch sử tin nhắn trong nhóm này (ngoại trừ các tin nhắn hệ thống).
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-[var(--hover)] border-t border-[var(--border)] flex justify-center">
            <div className="flex items-center gap-4 text-[var(--text-secondary)]">
                <div className="flex flex-col items-center">
                    <BarChart2 className="w-4 h-4" />
                    <span className="text-[9px] uppercase font-bold mt-0.5">Báo cáo</span>
                </div>
                <div className="w-px h-6 bg-[var(--border)]"></div>
                <p className="text-[10px] max-w-[200px] text-center italic">
                    Hệ thống tự động tổng hợp và gửi báo cáo cho Giảng viên.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceManager;
