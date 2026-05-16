import React, { useState, useEffect } from 'react';
import { X, ClipboardCheck, Users, Clock, CheckCircle, XCircle, Plus, Download, QrCode, Scan } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const AttendanceModal = ({ group, isTeacher, onClose }) => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail'
  const [selectedSession, setSelectedSession] = useState(null);
  const [form, setForm] = useState({ title: `Điểm danh ${new Date().toLocaleDateString('vi-VN')}`, durationMinutes: 10 });
  const [submitting, setSubmitting] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [qrToken, setQrToken] = useState('');

  useEffect(() => {
    fetchSessions();
  }, [group.id]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/attendance/groups/${group.id}/sessions`);
      setSessions(res.data || []);
      // Check if current user already checked in to any active session
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
      scanner.render(async (decodedText) => {
        scanner.clear();
        setShowScanner(false);
        // decodedText should be the sessionId
        const session = sessions.find(s => s.id === decodedText);
        if (session) {
          handleCheckIn(session);
        } else {
          alert('Mã QR không hợp lệ hoặc không thuộc lớp này');
        }
      });
      return () => scanner.clear();
    }
  }, [showScanner]);

  const handleCreateSession = async () => {
    if (!form.title.trim()) return alert('Vui lòng nhập tiêu đề buổi điểm danh');
    try {
      setSubmitting(true);
      await api.post('/api/attendance/sessions', {
        groupId: group.id,
        title: form.title,
        durationMinutes: Number(form.durationMinutes),
      });
      await fetchSessions();
      setView('list');
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi khi tạo buổi điểm danh');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckIn = async (session) => {
    if (checkedIn) return;
    // Check already recorded
    const alreadyIn = session.Records?.some(r => r.userId === user?.id);
    if (alreadyIn) return alert('Bạn đã điểm danh buổi học này rồi!');

    try {
      setSubmitting(true);
      // Build the data string the student needs to sign
      const dataToSign = `${session.id}:${session.sessionData}:${user?.id}`;

      // Sign using Web Crypto
      const encoder = new TextEncoder();
      const privateKeyJwk = JSON.parse(localStorage.getItem('utt_privateKey_jwk'));
      if (!privateKeyJwk) throw new Error('Không tìm thấy khóa bí mật. Vui lòng đăng nhập lại.');

      const privateKey = await window.crypto.subtle.importKey(
        'jwk', privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, ['sign']
      );
      const signatureBuffer = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        encoder.encode(dataToSign)
      );
      const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
      const deviceInfo = navigator.userAgent.substring(0, 150);

      await api.post('/api/attendance/submit', {
        sessionId: session.id,
        signature,
        deviceInfo,
      });

      setCheckedIn(true);
      alert('✅ Điểm danh thành công!');
      await fetchSessions();
      setSelectedSession(sessions.find(s => s.id === session.id));
    } catch (err) {
      if (err.response?.data?.message === 'You have already checked in for this session') {
        alert('Bạn đã điểm danh buổi học này rồi!');
      } else {
        alert(err.message || err.response?.data?.message || 'Lỗi điểm danh');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = (session) => {
    if (!session.Records?.length) return alert('Chưa có sinh viên điểm danh');
    const header = 'STT,Họ và tên,Tài khoản,Thời gian điểm danh\n';
    const rows = session.Records.map((r, i) =>
      `${i+1},"${r.User?.displayName || r.User?.username || 'N/A'}","${r.User?.username || ''}","${new Date(r.scannedAt).toLocaleString('vi-VN')}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DiemDanh_${session.title}_${new Date().toLocaleDateString('vi-VN').replace(/\//g,'-')}.csv`;
    link.click();
  };

  const activeSession = sessions.find(s => s.isActive && new Date() < new Date(s.expiresAt));
  const isExpired = (s) => !s.isActive || new Date() > new Date(s.expiresAt);
  const iHaveCheckedIn = (s) => s.Records?.some(r => r.userId === user?.id);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[var(--bg-primary)] rounded-3xl shadow-2xl border border-[var(--border)] flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--text-primary)]">Điểm Danh Trực Tuyến</h2>
              <p className="text-xs text-[var(--text-secondary)]">{group.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher && view === 'list' && (
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all"
              >
                <Plus className="w-4 h-4" /> Tạo buổi mới
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover)] transition-all">
              <X className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {/* === Create View === */}
          {view === 'create' && (
            <div className="space-y-4">
              <h3 className="text-base font-black text-[var(--text-primary)]">Tạo Buổi Điểm Danh Mới</h3>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Tiêu đề buổi học</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({...p, title: e.target.value}))}
                  className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm outline-none focus:border-green-500/50"
                  placeholder="VD: Buổi 12 - Lập trình Web"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Thời gian điểm danh (phút)</label>
                <div className="flex gap-2 mt-1.5">
                  {[5, 10, 15, 30].map(min => (
                    <button
                      key={min}
                      onClick={() => setForm(p => ({...p, durationMinutes: min}))}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${form.durationMinutes === min ? 'bg-green-500 text-white border-green-500' : 'bg-[var(--hover)] border-[var(--border)] text-[var(--text-primary)] hover:border-green-500/50'}`}
                    >
                      {min} phút
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setView('list')}
                  className="flex-1 py-3 rounded-xl bg-[var(--hover)] text-[var(--text-secondary)] font-bold text-sm hover:brightness-95 transition-all"
                >
                  Hủy
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Đang tạo...' : '✅ Tạo & Bắt đầu điểm danh'}
                </button>
              </div>
            </div>
          )}

          {/* === List View === */}
          {view === 'list' && (
            <div className="space-y-3">
              {/* Active Session Banner for Students */}
              {!isTeacher && activeSession && !iHaveCheckedIn(activeSession) && (
                <div className="p-4 bg-green-500/10 border-2 border-green-500 rounded-2xl animate-pulse">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-500 font-black text-sm">🔔 Đang có buổi điểm danh!</p>
                      <p className="text-[var(--text-primary)] font-bold mt-0.5">{activeSession.title}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        Hết hạn: {new Date(activeSession.expiresAt).toLocaleTimeString('vi-VN')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowScanner(true)}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all"
                      >
                        <QrCode className="w-4 h-4" /> Quét QR
                      </button>
                      <button
                        onClick={() => handleCheckIn(activeSession)}
                        disabled={submitting}
                        className="px-4 py-2 bg-green-500 text-white rounded-xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50"
                      >
                        {submitting ? '...' : '✋ Điểm danh nhanh'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showScanner && (
                <div className="p-4 bg-zinc-900 rounded-2xl">
                  <div id="reader" className="w-full"></div>
                  <button onClick={() => setShowScanner(false)} className="w-full mt-4 py-2 bg-white/10 text-white rounded-xl text-xs font-bold">Hủy bỏ</button>
                </div>
              )}

              {loading ? (
                <div className="text-center py-10 text-[var(--text-secondary)]">Đang tải...</div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-10">
                  <ClipboardCheck className="w-12 h-12 text-[var(--text-secondary)] opacity-30 mx-auto mb-3" />
                  <p className="text-[var(--text-secondary)] font-bold">Chưa có buổi điểm danh nào</p>
                  {isTeacher && <p className="text-xs text-[var(--text-secondary)] mt-1">Bấm "Tạo buổi mới" để bắt đầu</p>}
                </div>
              ) : (
                sessions.map(session => {
                  const expired = isExpired(session);
                  const presentCount = session.Records?.length || 0;
                  const alreadyIn = iHaveCheckedIn(session);

                  return (
                    <div key={session.id} className={`p-4 rounded-2xl border transition-all ${expired ? 'border-[var(--border)] opacity-70' : 'border-green-500/40 bg-green-500/5'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {expired ? (
                              <span className="text-[10px] font-black bg-[var(--hover)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full uppercase">Đã kết thúc</span>
                            ) : (
                              <span className="text-[10px] font-black bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block"></span> Đang mở
                              </span>
                            )}
                          </div>
                          <p className="font-black text-[var(--text-primary)] truncate">{session.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)]">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {presentCount} SV đã điểm danh</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(session.expiresAt).toLocaleTimeString('vi-VN')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isTeacher ? (
                            <>
                              <button
                                onClick={() => { setSelectedSession(session); setView('detail'); }}
                                className="px-3 py-1.5 rounded-xl bg-[var(--hover)] text-[var(--text-primary)] text-xs font-bold hover:brightness-95 transition-all"
                              >
                                Chi tiết
                              </button>
                              <button
                                onClick={() => handleExportCSV(session)}
                                className="p-1.5 rounded-xl bg-[var(--hover)] text-[var(--text-secondary)] hover:text-green-500 transition-all"
                                title="Xuất Excel"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            alreadyIn ? (
                              <span className="flex items-center gap-1 text-xs font-bold text-green-500">
                                <CheckCircle className="w-4 h-4" /> Đã điểm danh
                              </span>
                            ) : !expired ? (
                              <button
                                onClick={() => handleCheckIn(session)}
                                disabled={submitting}
                                className="px-3 py-1.5 bg-green-500 text-white rounded-xl text-xs font-black hover:brightness-110 transition-all disabled:opacity-50"
                              >
                                Điểm danh
                              </button>
                            ) : (
                              <span className="flex items-center gap-1 text-xs font-bold text-red-400">
                                <XCircle className="w-4 h-4" /> Vắng
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* === Detail View (Teacher) === */}
          {view === 'detail' && selectedSession && (
            <div>
              <button onClick={() => setView('list')} className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] mb-4 hover:text-[var(--text-primary)] transition-colors">
                ← Quay lại danh sách
              </button>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-black text-[var(--text-primary)]">{selectedSession.title}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {selectedSession.Records?.length || 0} sinh viên đã điểm danh
                  </p>
                </div>
                <button
                  onClick={() => handleExportCSV(selectedSession)}
                  className="flex items-center gap-1 px-3 py-2 bg-green-500/10 text-green-500 rounded-xl text-xs font-bold hover:bg-green-500/20 transition-all"
                >
                  <Download className="w-4 h-4" /> Xuất CSV
                </button>
              </div>

              {!isExpired(selectedSession) && (
                <div className="mb-6 p-6 bg-white rounded-3xl flex flex-col items-center gap-4 border-2 border-indigo-500/20 shadow-xl">
                  <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Mã QR Điểm Danh</p>
                  <div className="p-4 bg-white rounded-2xl shadow-inner">
                    <QRCodeSVG value={selectedSession.id} size={200} level="H" />
                  </div>
                  <p className="text-[10px] font-bold text-zinc-400 text-center uppercase">Sinh viên quét mã này bằng điện thoại<br/>để ghi nhận sự có mặt</p>
                </div>
              )}

              <div className="space-y-2">
                {selectedSession.Records?.length === 0 && (
                  <p className="text-center py-6 text-[var(--text-secondary)] text-sm">Chưa có sinh viên nào điểm danh</p>
                )}
                {selectedSession.Records?.map((record, i) => (
                  <div key={record.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover)]">
                    <span className="text-xs font-bold text-[var(--text-secondary)] w-6">{i+1}</span>
                    <div className="w-8 h-8 rounded-xl premium-gradient flex items-center justify-center text-white text-xs font-black">
                      {(record.User?.displayName || record.User?.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[var(--text-primary)] text-sm truncate">
                        {record.User?.displayName || record.User?.username || 'N/A'}
                      </p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        {new Date(record.scannedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceModal;
