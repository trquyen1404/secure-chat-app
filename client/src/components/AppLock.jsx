import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, Delete, ArrowRight } from 'lucide-react';

const AppLock = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [storedPin, setStoredPin] = useState(localStorage.getItem('app_pin'));
  const [mode, setMode] = useState(storedPin ? 'unlock' : 'setup'); // 'unlock' or 'setup'
  const [setupStep, setSetupStep] = useState(1); // 1: enter new pin, 2: confirm pin
  const [tempPin, setTempPin] = useState('');

  const handleKeyPress = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
      
      if (newPin.length === 4) {
        processPin(newPin);
      }
    }
  };

  const processPin = (enteredPin) => {
    if (mode === 'unlock') {
      if (enteredPin === storedPin) {
        onUnlock();
      } else {
        setError(true);
        setPin('');
        // Shake animation handled by CSS
      }
    } else {
      // Setup mode
      if (setupStep === 1) {
        setTempPin(enteredPin);
        setSetupStep(2);
        setPin('');
      } else {
        if (enteredPin === tempPin) {
          localStorage.setItem('app_pin', enteredPin);
          setStoredPin(enteredPin);
          onUnlock();
        } else {
          setError(true);
          setPin('');
          setSetupStep(1);
          alert('Mã PIN xác nhận không khớp. Vui lòng thử lại.');
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[var(--bg-primary)] flex items-center justify-center font-['Outfit']">
      <div className="mesh-bg" />
      
      <div className="w-full max-w-sm p-8 flex flex-col items-center animate-fade-in">
        {/* Header Icon */}
        <div className="relative mb-12">
          <div className="absolute -inset-4 bg-indigo-500/20 rounded-full blur-2xl animate-pulse" />
          <div className="w-20 h-20 bg-indigo-500 rounded-3xl flex items-center justify-center text-white shadow-2xl relative z-10">
            <Lock className="w-10 h-10" />
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center mb-10 space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-[var(--text-primary)] uppercase">
            {mode === 'unlock' ? 'Mở khóa bảo mật' : (setupStep === 1 ? 'Thiết lập mã PIN' : 'Xác nhận mã PIN')}
          </h2>
          <p className="text-sm font-bold text-[var(--text-secondary)] opacity-60">
            {mode === 'unlock' ? 'Vui lòng nhập mã PIN 4 số của bạn' : 'Để bảo vệ các cuộc hội thoại của bạn'}
          </p>
        </div>

        {/* PIN Dots */}
        <div className={`flex gap-6 mb-12 ${error ? 'animate-shake' : ''}`}>
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i} 
              className={`w-4 h-4 rounded-full transition-all duration-300 ${
                pin.length >= i 
                  ? 'bg-indigo-500 scale-125 shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                  : 'bg-[var(--hover)] border border-[var(--border)]'
              }`} 
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num.toString())}
              className="w-16 h-16 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl font-bold text-[var(--text-primary)]"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleKeyPress('0')}
            className="w-16 h-16 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-2xl font-bold text-[var(--text-primary)]"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-2xl bg-red-500/5 border border-red-500/5 hover:bg-red-500/10 hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-red-500"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        {/* Footer Info */}
        <div className="mt-16 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">
          <ShieldCheck className="w-3 h-3" />
          <span>Mã hóa đầu cuối E2EE bảo vệ bạn</span>
        </div>
      </div>
    </div>
  );
};

export default AppLock;
