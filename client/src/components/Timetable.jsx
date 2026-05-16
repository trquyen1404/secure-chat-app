import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, User, Plus, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/axiosConfig';

const DAYS = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const Timetable = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ subjectName: '', dayOfWeek: 1, startTime: '', endTime: '', room: '', teacherName: '' });

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/schedules');
      setSchedules(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      await api.post('/api/schedules', form);
      setShowAddModal(false);
      setForm({ subjectName: '', dayOfWeek: 1, startTime: '', endTime: '', room: '', teacherName: '' });
      fetchSchedules();
    } catch (err) {
      alert('Lỗi khi thêm lịch');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa lịch học này?')) return;
    try {
      await api.delete(`/api/schedules/${id}`);
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  const scheduleByDay = schedules.reduce((acc, curr) => {
    if (!acc[curr.dayOfWeek]) acc[curr.dayOfWeek] = [];
    acc[curr.dayOfWeek].push(curr);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] p-6 overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-[var(--text-primary)]">Thời khóa biểu UTT</h2>
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Quản lý lịch học cá nhân</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="p-3 bg-indigo-500 text-white rounded-2xl shadow-lg shadow-indigo-500/20 hover:scale-105 transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-6 pb-20">
        {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => (
          <div key={dayIdx} className="space-y-3">
            <h3 className={`text-sm font-black uppercase tracking-widest ${dayIdx === new Date().getDay() ? 'text-indigo-500' : 'text-[var(--text-secondary)]'}`}>
              {DAYS[dayIdx]} {dayIdx === new Date().getDay() && '• Hôm nay'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {!scheduleByDay[dayIdx] || scheduleByDay[dayIdx].length === 0 ? (
                <div className="p-4 rounded-3xl border border-dashed border-[var(--border)] text-[10px] font-bold text-[var(--text-secondary)] uppercase text-center opacity-40">
                  Không có lịch học
                </div>
              ) : (
                scheduleByDay[dayIdx].map(item => (
                  <div key={item.id} className="group relative p-5 bg-[var(--bg-secondary)] rounded-3xl border border-[var(--border)] hover:border-indigo-500/50 transition-all hover:shadow-xl">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="absolute top-4 right-4 p-1.5 text-red-500 bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-[var(--text-primary)]">{item.startTime} - {item.endTime}</p>
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Giờ học</p>
                      </div>
                    </div>

                    <h4 className="text-base font-black text-[var(--text-primary)] mb-4 line-clamp-1">{item.subjectName}</h4>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Phòng: {item.room || 'Chưa cập nhật'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                        <User className="w-3.5 h-3.5" />
                        <span>GV: {item.teacherName || 'Chưa cập nhật'}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--bg-primary)] rounded-[32px] p-8 shadow-2xl border border-[var(--border)] animate-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-[var(--text-primary)]">Thêm lịch học mới</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Tên môn học</label>
                <input
                  type="text"
                  placeholder="VD: Lập trình di động"
                  value={form.subjectName}
                  onChange={e => setForm({...form, subjectName: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-5 py-3 text-sm focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Ngày trong tuần</label>
                  <select
                    value={form.dayOfWeek}
                    onChange={e => setForm({...form, dayOfWeek: Number(e.target.value)})}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-5 py-3 text-sm outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Phòng học</label>
                  <input
                    type="text"
                    placeholder="VD: 402-H1"
                    value={form.room}
                    onChange={e => setForm({...form, room: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-5 py-3 text-sm outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Bắt đầu</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm({...form, startTime: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-5 py-3 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Kết thúc</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm({...form, endTime: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-5 py-3 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-1 block">Tên giảng viên</label>
                <input
                  type="text"
                  placeholder="VD: TS. Nguyễn Văn A"
                  value={form.teacherName}
                  onChange={e => setForm({...form, teacherName: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-5 py-3 text-sm outline-none"
                />
              </div>

              <button
                onClick={handleAdd}
                className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm hover:brightness-110 shadow-lg shadow-indigo-500/20 transition-all mt-4"
              >
                Lưu vào lịch học
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timetable;
