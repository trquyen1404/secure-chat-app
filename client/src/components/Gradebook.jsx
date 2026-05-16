import React, { useState, useEffect } from 'react';
import { X, GraduationCap, TrendingUp, Plus, Target, PieChart } from 'lucide-react';
import api from '../utils/axiosConfig';

const Gradebook = ({ group, isTeacher, onClose }) => {
  const [grades, setGrades] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', score: '', weight: 1.0, userId: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchGrades(); }, []);
  const fetchGrades = async () => {
    try {
      const res = await api.get(`/api/academic/grades/${group.id}`);
      setGrades(res.data);
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    await api.post('/api/academic/grades', { ...form, groupId: group.id });
    setShowAdd(false);
    fetchGrades();
  };

  const calculateGPA = () => {
    if (grades.length === 0) return 0;
    const total = grades.reduce((acc, curr) => acc + (curr.score * curr.weight), 0);
    const totalWeight = grades.reduce((acc, curr) => acc + curr.weight, 0);
    return (total / totalWeight).toFixed(2);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[32px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[80vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <GraduationCap className="w-8 h-8 text-indigo-500" />
            <div>
              <h2 className="text-2xl font-black">Sổ điểm cá nhân</h2>
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em]">{group.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-indigo-500 rounded-[32px] text-white shadow-xl shadow-indigo-500/20">
              <p className="text-[10px] font-black uppercase opacity-60 mb-2">Điểm trung bình (GPA)</p>
              <h3 className="text-4xl font-black">{calculateGPA()}</h3>
            </div>
            <div className="p-6 bg-[var(--hover)]/50 rounded-[32px] border border-[var(--border)]">
              <p className="text-[10px] font-black uppercase text-[var(--text-secondary)] mb-2">Số đầu điểm</p>
              <h3 className="text-4xl font-black text-[var(--text-primary)]">{grades.length}</h3>
            </div>
            <div className="p-6 bg-[var(--hover)]/50 rounded-[32px] border border-[var(--border)]">
              <p className="text-[10px] font-black uppercase text-[var(--text-secondary)] mb-2">Xếp loại dự kiến</p>
              <h3 className="text-4xl font-black text-indigo-500">{Number(calculateGPA()) >= 3.6 ? 'A+' : Number(calculateGPA()) >= 3.2 ? 'A' : 'B'}</h3>
            </div>
          </div>

          {isTeacher && !showAdd && (
            <button onClick={() => setShowAdd(true)} className="w-full py-4 border-2 border-dashed border-indigo-500/30 rounded-3xl text-indigo-500 font-bold hover:bg-indigo-500/5 transition-all">
              + Nhập điểm cho sinh viên
            </button>
          )}

          {showAdd && (
            <div className="p-8 bg-indigo-500/5 rounded-[32px] border border-indigo-500/20 grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-300">
               <input type="text" placeholder="Tên bài kiểm tra" className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
               <input type="number" placeholder="Điểm số" className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.score} onChange={e => setForm({...form, score: e.target.value})} />
               <input type="number" placeholder="Trọng số (VD: 0.1)" className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} />
               <button onClick={handleAdd} className="bg-indigo-500 text-white rounded-xl font-black text-xs">Lưu điểm</button>
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">Lịch sử điểm số</h4>
            <div className="grid grid-cols-1 gap-4">
              {grades.map(g => (
                <div key={g.id} className="flex items-center justify-between p-6 bg-[var(--bg-primary)] border border-[var(--border)] rounded-[24px] hover:border-indigo-500 transition-all shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${g.score >= 8 ? 'bg-green-500 text-white' : g.score >= 5 ? 'bg-indigo-500 text-white' : 'bg-red-500 text-white'}`}>
                      {g.score}
                    </div>
                    <div>
                      <p className="text-sm font-black text-[var(--text-primary)]">{g.title}</p>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Trọng số: {Math.round(g.weight * 100)}% • {new Date(g.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <PieChart className="w-5 h-5 text-[var(--text-secondary)] opacity-20" />
                </div>
              ))}
              {grades.length === 0 && !loading && <div className="text-center py-10 opacity-30 italic">Chưa có điểm số nào được ghi nhận</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Gradebook;
