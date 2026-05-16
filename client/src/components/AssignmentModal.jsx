import React, { useState, useEffect, useRef } from 'react';
import { X, BookOpen, Plus, Clock, FileText, CheckCircle, Download, Send, Edit, Trash2, Award } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const AssignmentModal = ({ group, isTeacher, onClose }) => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'submissions'
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', deadline: '', points: 10 });
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState({ id: null, grade: '', feedback: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchAssignments();
  }, [group.id]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/assignments/groups/${group.id}`);
      setAssignments(res.data || []);
    } catch (err) {
      console.error('Failed to load assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAssignment = async () => {
    if (!form.title || !form.deadline) return alert('Vui lòng nhập đủ thông tin');
    try {
      setSubmitting(true);
      await api.post('/api/assignments', {
        groupId: group.id,
        ...form
      });
      await fetchAssignments();
      setView('list');
      setForm({ title: '', description: '', deadline: '', points: 10 });
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi khi giao bài tập');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitWork = async (assignmentId) => {
    // In a real app, this would upload to S3/Cloudinary
    // For now, we simulate with a prompt or a dummy URL
    const fileUrl = window.prompt('Nhập link tài liệu bài làm (hoặc mô tả):');
    if (!fileUrl) return;

    try {
      setSubmitting(true);
      await api.post('/api/assignments/submit', {
        assignmentId,
        fileUrl,
        fileName: 'BaiLam_SinhVien.pdf'
      });
      alert('Nộp bài thành công!');
      await fetchAssignments();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi khi nộp bài');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrade = async () => {
    try {
      setSubmitting(true);
      await api.patch(`/api/assignments/grade/${grading.id}`, {
        grade: Number(grading.grade),
        feedback: grading.feedback
      });
      setGrading({ id: null, grade: '', feedback: '' });
      await fetchAssignments();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi khi chấm điểm');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[var(--bg-primary)] rounded-3xl shadow-2xl border border-[var(--border)] flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)] bg-gradient-to-r from-indigo-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--text-primary)]">Bài tập & Nhiệm vụ</h2>
              <p className="text-xs text-[var(--text-secondary)]">{group.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher && view === 'list' && (
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-lg shadow-indigo-500/20"
              >
                <Plus className="w-4 h-4" /> Giao bài mới
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover)] transition-all">
              <X className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {view === 'create' && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              <button onClick={() => setView('list')} className="text-xs font-bold text-indigo-500 mb-2">← Quay lại danh sách</button>
              <h3 className="text-base font-black text-[var(--text-primary)]">Giao bài tập mới cho lớp</h3>
              <div className="grid gap-4">
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Tiêu đề bài tập</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                    placeholder="VD: Lab 03 - React Context API"
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Yêu cầu / Mô tả</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    placeholder="Nhập hướng dẫn chi tiết cho sinh viên..."
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm h-32 focus:border-indigo-500 outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Hạn chót (Deadline)</label>
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={e => setForm({...form, deadline: e.target.value})}
                      className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Thang điểm</label>
                    <input
                      type="number"
                      value={form.points}
                      onChange={e => setForm({...form, points: e.target.value})}
                      className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateAssignment}
                  disabled={submitting}
                  className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm hover:brightness-110 transition-all disabled:opacity-50 mt-4"
                >
                  {submitting ? 'Đang giao bài...' : '✅ Giao bài tập ngay'}
                </button>
              </div>
            </div>
          )}

          {view === 'list' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-20 text-[var(--text-secondary)]">Đang tải danh sách bài tập...</div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-20">
                  <BookOpen className="w-16 h-16 text-[var(--text-secondary)] opacity-10 mx-auto mb-4" />
                  <p className="text-[var(--text-secondary)] font-bold">Chưa có bài tập nào được giao</p>
                </div>
              ) : (
                assignments.map(asm => {
                  const mySubmission = asm.Submissions?.find(s => s.studentId === user?.id);
                  const isExpired = new Date() > new Date(asm.deadline);

                  return (
                    <div key={asm.id} className="p-5 rounded-3xl border border-[var(--border)] bg-[var(--hover)]/30 hover:bg-[var(--hover)]/50 transition-all group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${isExpired ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                              {isExpired ? 'Hết hạn' : 'Đang mở'}
                            </span>
                            <span className="text-[10px] font-black bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full uppercase">
                              {asm.points} điểm
                            </span>
                          </div>
                          <h4 className="font-black text-[var(--text-primary)] text-base mb-1">{asm.title}</h4>
                          <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">{asm.description}</p>
                          <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)] font-bold">
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Deadline: {new Date(asm.deadline).toLocaleString('vi-VN')}</span>
                            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {asm.Submissions?.length || 0} bài nộp</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {isTeacher ? (
                            <button
                              onClick={() => { setSelectedAssignment(asm); setView('submissions'); }}
                              className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black hover:brightness-110 transition-all"
                            >
                              Xem bài nộp
                            </button>
                          ) : (
                            mySubmission ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-xs font-black text-green-500 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Đã nộp</span>
                                {mySubmission.grade !== null && (
                                  <span className="text-lg font-black text-indigo-500">{mySubmission.grade}/{asm.points}đ</span>
                                )}
                              </div>
                            ) : (
                              !isExpired && (
                                <button
                                  onClick={() => handleSubmitWork(asm.id)}
                                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black hover:brightness-110 transition-all flex items-center gap-2"
                                >
                                  <Send className="w-3 h-3" /> Nộp bài
                                </button>
                              )
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

          {view === 'submissions' && selectedAssignment && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              <button onClick={() => setView('list')} className="text-xs font-bold text-indigo-500 mb-2">← Quay lại danh sách</button>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-[var(--text-primary)]">Danh sách nộp bài: {selectedAssignment.title}</h3>
                <span className="text-xs font-bold text-[var(--text-secondary)]">{selectedAssignment.Submissions?.length || 0} sinh viên</span>
              </div>
              <div className="space-y-2">
                {selectedAssignment.Submissions?.map(sub => (
                  <div key={sub.id} className="p-4 bg-[var(--hover)] rounded-2xl border border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full premium-gradient flex items-center justify-center text-white text-xs font-black">
                        {sub.Student?.displayName?.charAt(0) || sub.Student?.username?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{sub.Student?.displayName || sub.Student?.username}</p>
                        <p className="text-[10px] text-[var(--text-secondary)]">{new Date(sub.submittedAt).toLocaleString('vi-VN')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <a href={sub.fileUrl} target="_blank" rel="noreferrer" className="p-2 hover:bg-indigo-500/10 text-indigo-500 rounded-lg transition-all" title="Xem bài làm">
                        <FileText className="w-5 h-5" />
                      </a>
                      {sub.grade !== null ? (
                        <div className="text-right">
                          <p className="text-sm font-black text-indigo-500">{sub.grade}đ</p>
                          <button onClick={() => setGrading({ id: sub.id, grade: sub.grade, feedback: sub.feedback })} className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-indigo-500 underline">Sửa</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setGrading({ id: sub.id, grade: '', feedback: '' })}
                          className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-[10px] font-black hover:brightness-110 transition-all"
                        >
                          Chấm điểm
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Grading Overlay */}
        {grading.id && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[110] flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-[var(--bg-secondary)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] animate-in zoom-in duration-200">
              <h4 className="text-lg font-black mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-green-500" /> Chấm điểm bài làm</h4>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Số điểm (Max: {selectedAssignment?.points})</label>
                  <input
                    type="number"
                    value={grading.grade}
                    onChange={e => setGrading({...grading, grade: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-green-500 outline-none"
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Nhận xét của giảng viên</label>
                  <textarea
                    value={grading.feedback}
                    onChange={e => setGrading({...grading, feedback: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm h-24 focus:border-green-500 outline-none resize-none"
                    placeholder="VD: Bài làm tốt, trình bày sạch đẹp..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setGrading({ id: null, grade: '', feedback: '' })} className="flex-1 py-3 bg-[var(--hover)] rounded-xl font-bold text-sm">Hủy</button>
                  <button onClick={handleGrade} className="flex-1 py-3 bg-green-500 text-white rounded-xl font-bold text-sm hover:brightness-110">Lưu điểm</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignmentModal;
