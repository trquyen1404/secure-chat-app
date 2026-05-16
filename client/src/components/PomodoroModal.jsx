import React, { useState, useEffect } from 'react';
import { X, Timer, Play, Pause, RotateCcw, Coffee, Zap } from 'lucide-react';

const PomodoroModal = ({ onClose }) => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('work'); // 'work' or 'break'

  useEffect(() => {
    let timer;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      alert(mode === 'work' ? 'Đã xong ca học! Nghỉ ngơi tí nhé!' : 'Hết giờ nghỉ, tiếp tục nào!');
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft, mode]);

  const toggle = () => setIsActive(!isActive);
  const reset = () => {
    setIsActive(false);
    setTimeLeft(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  const switchMode = (m) => {
    setMode(m);
    setIsActive(false);
    setTimeLeft(m === 'work' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className={`w-full max-w-md rounded-[40px] shadow-2xl p-8 border-4 transition-all duration-500 ${mode === 'work' ? 'bg-indigo-600 border-indigo-400' : 'bg-emerald-600 border-emerald-400'} text-white`}>
        <div className="flex justify-between items-center mb-8">
           <Zap className="w-8 h-8 opacity-50" />
           <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X /></button>
        </div>

        <div className="text-center space-y-4">
          <div className="flex justify-center gap-2 mb-6">
            <button onClick={() => switchMode('work')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${mode === 'work' ? 'bg-white text-indigo-600' : 'bg-white/10 text-white'}`}>PHIÊN HỌC</button>
            <button onClick={() => switchMode('break')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${mode === 'break' ? 'bg-white text-emerald-600' : 'bg-white/10 text-white'}`}>NGHỈ NGƠI</button>
          </div>
          
          <h2 className="text-8xl font-black font-mono tracking-tighter drop-shadow-2xl">{formatTime(timeLeft)}</h2>
          <p className="text-sm font-bold opacity-60 uppercase tracking-[0.3em] pt-4">{mode === 'work' ? 'ĐANG TẬP TRUNG...' : 'ĐANG THƯ GIÃN'}</p>
        </div>

        <div className="flex items-center justify-center gap-6 mt-12">
          <button onClick={reset} className="p-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"><RotateCcw /></button>
          <button onClick={toggle} className="w-20 h-20 bg-white text-[var(--bg-primary)] rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all">
            {isActive ? <Pause className={`w-8 h-8 ${mode === 'work' ? 'text-indigo-600' : 'text-emerald-600'}`} /> : <Play className={`w-8 h-8 ml-1 ${mode === 'work' ? 'text-indigo-600' : 'text-emerald-600'}`} />}
          </button>
          <div className="w-14" />
        </div>
      </div>
    </div>
  );
};

export default PomodoroModal;
