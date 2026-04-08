import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, Fingerprint, X } from 'lucide-react';

const PinLock = ({ 
  userId, 
  mode = 'verifyApp', 
  chatTarget = null, 
  onSuccess,
  onCancel 
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState(mode === 'setup' ? 'enter' : 'verify'); 
  // steps: 'enter' (for setup 1st), 'confirm' (for setup 2nd), 'verify' (for unlocking)
  
  const [error, setError] = useState(false);

  const PIN_LENGTH = 4;

  const handleKeyPress = (num) => {
    if (error) setError(false);
    
    if (step === 'enter' || step === 'verify') {
      if (pin.length < PIN_LENGTH) {
        const newPin = pin + num;
        setPin(newPin);
        if (newPin.length === PIN_LENGTH) {
          processPinComplete(newPin, step);
        }
      }
    } else if (step === 'confirm') {
      if (confirmPin.length < PIN_LENGTH) {
        const newConfirm = confirmPin + num;
        setConfirmPin(newConfirm);
        if (newConfirm.length === PIN_LENGTH) {
          processPinComplete(newConfirm, step);
        }
      }
    }
  };

  const processPinComplete = (value, currentStep) => {
    if (currentStep === 'enter') {
      // Setup phase 1 complete
      setTimeout(() => {
        setStep('confirm');
      }, 200);
    } else if (currentStep === 'confirm') {
      // Setup phase 2 complete
      setTimeout(() => {
        if (value === pin) {
          // Success! Save PIN
          const hashedPin = btoa(pin); // Simple encoding for local app lock
          localStorage.setItem(`app_pin_${userId}`, hashedPin);
          onSuccess();
        } else {
          // Mismatch
          setError(true);
          setConfirmPin('');
          setTimeout(() => setError(false), 500);
        }
      }, 200);
    } else if (currentStep === 'verify') {
      // Unlocking phase
      setTimeout(() => {
        const storedPin = localStorage.getItem(`app_pin_${userId}`);
        if (storedPin && atob(storedPin) === value) {
          // Correct PIN
          onSuccess();
        } else {
          // Wrong PIN
          setError(true);
          setPin('');
          setTimeout(() => setError(false), 500);
        }
      }, 200);
    }
  };

  const handleDelete = () => {
    if (error) setError(false);
    
    if (step === 'enter' || step === 'verify') {
      setPin(pin.slice(0, -1));
    } else if (step === 'confirm') {
      setConfirmPin(confirmPin.slice(0, -1));
    }
  };

  const renderDots = () => {
    const currentLength = (step === 'confirm') ? confirmPin.length : pin.length;
    return (
      <div className={`flex gap-4 justify-center my-6 ${error ? 'animate-shake' : ''}`}>
        {[...Array(PIN_LENGTH)].map((_, i) => (
          <div 
            key={i} 
            className={`w-4 h-4 rounded-full transition-all duration-300 ${
              i < currentLength 
                ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]' 
                : 'bg-slate-700/50'
            } ${error ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]' : ''}`}
          ></div>
        ))}
      </div>
    );
  };

  const KeypadButton = ({ num, onClick }) => (
    <button 
      onClick={() => onClick(num)}
      className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-slate-200 bg-slate-800/50 hover:bg-slate-700/80 hover:text-white transition-all active:scale-95 shadow-sm border border-slate-700/50 hover:border-indigo-500/30"
    >
      {num}
    </button>
  );

  let title = "Bảo mật ứng dụng";
  let subtitle = "Vui lòng nhập mã PIN";

  if (mode === 'setup') {
    title = step === 'enter' ? "Thiết lập mã PIN" : "Xác nhận mã PIN";
    subtitle = step === 'enter' ? "Tạo mã PIN 4 số để khóa ứng dụng" : "Vui lòng nhập lại mã PIN vừa tạo";
  } else if (mode === 'verifyChat' && chatTarget) {
    title = "Khóa hội thoại";
    subtitle = `Nhập mã PIN để mở chat với ${chatTarget.username}`;
  }

  // If it's verifyApp, it should be full screen overlay
  // If it's verifyChat, it should also be full screen or cover the chat area.
  // We will make it cover the relative parent component.
  
  return (
    <div className={`
      ${mode === 'verifyChat' ? 'absolute inset-0 z-50 rounded-l-none' : 'fixed inset-0 z-50 fixed'} 
      bg-slate-950/80 backdrop-blur-2xl flex flex-col items-center justify-center
    `}>
      {mode === 'verifyChat' && (
        <button 
          onClick={onCancel}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition"
        >
          <X className="w-6 h-6" />
        </button>
      )}

      <div className="flex flex-col items-center max-w-sm w-full p-8 bg-slate-900/40 border border-slate-800/80 rounded-3xl shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center mb-6">
          {mode === 'verifyChat' ? (
             <Lock className="w-8 h-8 text-indigo-400" />
          ) : (
             <Fingerprint className="w-8 h-8 text-indigo-400" />
          )}
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2 text-center">{title}</h2>
        <p className={`text-sm text-center mb-4 ${error ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
          {error ? (step === 'confirm' ? 'Mã PIN không khớp!' : 'Mã PIN không chính xác!') : subtitle}
        </p>

        {renderDots()}

        <div className="grid grid-cols-3 gap-x-6 gap-y-4 mt-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <KeypadButton key={num} num={num} onClick={handleKeyPress} />
          ))}
          <div className="w-16 h-16"></div> {/* Empty space */}
          <KeypadButton num={0} onClick={handleKeyPress} />
          <button 
            onClick={handleDelete}
            className="w-16 h-16 rounded-full flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800/50 transition-all active:scale-95"
          >
            Xóa
          </button>
        </div>
        
        {mode === 'setup' && step === 'confirm' && (
           <button 
             onClick={() => { setStep('enter'); setPin(''); setConfirmPin(''); }}
             className="mt-8 text-sm text-indigo-400 hover:text-indigo-300 transition"
           >
             Làm lại từ đầu
           </button>
        )}
      </div>
    </div>
  );
};

export default PinLock;
