import React, { useState, useEffect } from 'react';
import { X, Briefcase, Building2, MapPin, DollarSign, ExternalLink } from 'lucide-react';
import api from '../utils/axiosConfig';

const JobPortalModal = ({ onClose }) => {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    api.get('/api/academic/jobs').then(res => setJobs(res.data));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[85vh]">
        <div className="p-10 border-b border-[var(--border)] flex items-center justify-between bg-blue-600 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter">Cổng việc làm UTT</h2>
              <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Cơ hội thực tập & Việc làm kỹ thuật</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {jobs.map(job => (
              <div key={job.id} className="p-8 bg-[var(--hover)]/30 rounded-[40px] border border-[var(--border)] hover:border-blue-500 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 bg-blue-500 text-white text-[10px] font-black uppercase rounded-bl-[24px]">{job.type}</div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                         <Building2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black group-hover:text-blue-600 transition-colors">{job.title}</h4>
                        <p className="text-sm font-bold text-[var(--text-secondary)]">{job.company}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]"><MapPin className="w-3 h-3" /> {job.location}</span>
                      <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]"><DollarSign className="w-3 h-3" /> {job.salary || 'Thỏa thuận'}</span>
                    </div>
                  </div>
                  <button className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-600/20 flex items-center gap-2 hover:scale-105 transition-all">
                    Ứng tuyển ngay <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {jobs.length === 0 && <div className="text-center py-20 opacity-30 italic font-bold">Hiện tại chưa có tin tuyển dụng mới</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobPortalModal;
