import React, { useState } from 'react';
import { X, BarChart3, Plus, Trash2, Send } from 'lucide-react';
import api from '../utils/axiosConfig';

const CreatePollModal = ({ groupId, onClose, onCreated }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [loading, setLoading] = useState(false);

  const handleAddOption = () => {
    if (options.length < 10) setOptions([...options, '']);
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = async () => {
    if (!question.trim()) return alert('Vui lòng nhập câu hỏi');
    const filteredOptions = options.filter(opt => opt.trim() !== '');
    if (filteredOptions.length < 2) return alert('Vui lòng nhập ít nhất 2 lựa chọn');

    try {
      setLoading(true);
      const res = await api.post('/api/polls', {
        groupId,
        question,
        options: filteredOptions
      });
      onCreated(res.data);
      onClose();
    } catch (err) {
      alert('Lỗi khi tạo khảo sát');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-primary)] rounded-3xl shadow-2xl border border-[var(--border)] overflow-hidden animate-in zoom-in duration-200">
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-black text-[var(--text-primary)]">Tạo khảo sát lớp học</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all">
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-2 block">Câu hỏi của bạn</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Nhập nội dung khảo sát..."
              className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:border-indigo-500 outline-none resize-none h-24"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-[var(--text-secondary)] uppercase mb-2 block">Các lựa chọn</label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={e => handleOptionChange(idx, e.target.value)}
                  placeholder={`Lựa chọn ${idx + 1}`}
                  className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none"
                />
                {options.length > 2 && (
                  <button onClick={() => handleRemoveOption(idx)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                onClick={handleAddOption}
                className="w-full py-2 border-2 border-dashed border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:border-indigo-500 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Thêm lựa chọn
              </button>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm hover:brightness-110 shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'Đang tạo...' : <><Send className="w-4 h-4" /> Gửi khảo sát vào lớp</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePollModal;
