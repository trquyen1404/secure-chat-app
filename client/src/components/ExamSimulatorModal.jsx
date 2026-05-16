import React, { useState, useEffect } from 'react';
import { X, Timer, BookOpen, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../utils/axiosConfig';

const ExamSimulatorModal = ({ group, onClose }) => {
  const [exams, setExams] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [currentStep, setCurrentStep] = useState(0); // 0: list, 1: quiz, 2: result
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => { fetchExams(); }, []);
  const fetchExams = async () => {
    const res = await api.get(`/api/academic/exams/${group.id}`);
    setExams(res.data);
  };

  const startExam = (exam) => {
    setActiveExam(exam);
    setCurrentStep(1);
    setTimeLeft(exam.durationMinutes * 60);
    setAnswers({});
  };

  useEffect(() => {
    if (currentStep === 1 && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && currentStep === 1) {
      finishExam();
    }
  }, [currentStep, timeLeft]);

  const finishExam = () => {
    let s = 0;
    activeExam.Questions.forEach((q, idx) => {
      if (answers[idx] === q.correctOptionIndex) s++;
    });
    setScore(s);
    setCurrentStep(2);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[85vh]">
        
        {currentStep === 0 && (
          <>
            <div className="p-8 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Timer className="w-8 h-8 text-indigo-500" />
                <h2 className="text-2xl font-black">Luyện đề thi thử</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {exams.map(exam => (
                <div key={exam.id} className="p-8 bg-[var(--hover)]/30 rounded-[32px] border border-[var(--border)] space-y-4">
                  <h3 className="text-lg font-black">{exam.title}</h3>
                  <div className="flex items-center gap-4 text-xs font-bold text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> {exam.durationMinutes} phút</span>
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {exam.Questions?.length} câu hỏi</span>
                  </div>
                  <button onClick={() => startExam(exam)} className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all">Bắt đầu thi ngay</button>
                </div>
              ))}
            </div>
          </>
        )}

        {currentStep === 1 && (
          <div className="flex-1 flex flex-col">
            <div className="p-6 bg-indigo-500 text-white flex items-center justify-between">
              <h3 className="font-black">{activeExam.title}</h3>
              <div className="bg-white/20 px-4 py-2 rounded-xl font-mono font-bold text-lg">{formatTime(timeLeft)}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-12 space-y-12">
              {activeExam.Questions.map((q, idx) => (
                <div key={q.id} className="space-y-6">
                  <h4 className="text-lg font-black flex gap-4"><span className="text-indigo-500">Câu {idx + 1}:</span> {q.text}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {q.options.map((opt, oIdx) => (
                      <button 
                        key={oIdx} 
                        onClick={() => setAnswers({...answers, [idx]: oIdx})}
                        className={`p-6 text-left rounded-[24px] border-2 transition-all font-bold text-sm ${answers[idx] === oIdx ? 'border-indigo-500 bg-indigo-500/5 shadow-lg' : 'border-[var(--border)] hover:border-indigo-500/30'}`}
                      >
                        {String.fromCharCode(65 + oIdx)}. {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={finishExam} className="w-full py-6 bg-indigo-500 text-white rounded-[32px] font-black text-lg shadow-xl shadow-indigo-500/30 mt-12 mb-8">Nộp bài kết thúc</button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-8 animate-in zoom-in duration-500">
            <div className="w-32 h-32 rounded-full bg-green-500 flex items-center justify-center text-white shadow-2xl shadow-green-500/20">
              <CheckCircle2 className="w-16 h-16" />
            </div>
            <div className="text-center">
              <h3 className="text-3xl font-black mb-2">Hoàn thành bài thi!</h3>
              <p className="text-[var(--text-secondary)] font-bold">Kết quả của bạn đã được ghi nhận vào hệ thống</p>
            </div>
            <div className="text-7xl font-black text-indigo-500">{score} / {activeExam.Questions.length}</div>
            <button onClick={() => setCurrentStep(0)} className="px-12 py-4 bg-[var(--hover)] rounded-2xl font-black text-sm">Quay về danh sách đề thi</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamSimulatorModal;
