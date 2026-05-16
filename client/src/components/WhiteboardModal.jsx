import React, { useState, useRef, useEffect } from 'react';
import { X, Palette, Eraser, Trash2, Download, MousePointer2 } from 'lucide-react';

const WhiteboardModal = ({ onClose }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#6366f1');
  const [lineWidth, setLineWidth] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e) => {
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-xl">
             <Palette className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Bảng trắng tương tác</h2>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Thảo luận & Vẽ đồ thị nhóm</p>
          </div>
        </div>
        <button onClick={onClose} className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center text-white transition-all"><X /></button>
      </div>

      <div className="flex-1 bg-white rounded-[40px] shadow-2xl overflow-hidden relative border-8 border-white/10">
        <canvas
          ref={canvasRef}
          width={window.innerWidth - 100}
          height={window.innerHeight - 200}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="w-full h-full cursor-crosshair"
        />

        {/* Toolbar */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-xl px-8 py-4 rounded-[32px] shadow-2xl flex items-center gap-6 border border-indigo-500/10">
          <div className="flex items-center gap-2">
            {['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#000000'].map(c => (
              <button 
                key={c} 
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-indigo-500 scale-125' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="w-px h-8 bg-indigo-500/10" />
          <div className="flex items-center gap-4">
            <button onClick={() => setColor('#ffffff')} className={`p-2 rounded-xl transition-all ${color === '#ffffff' ? 'bg-indigo-500 text-white' : 'hover:bg-indigo-500/10 text-indigo-500'}`}><Eraser className="w-5 h-5" /></button>
            <button onClick={clearCanvas} className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
          </div>
          <div className="w-px h-8 bg-indigo-500/10" />
          <div className="flex items-center gap-3">
            <input type="range" min="1" max="20" value={lineWidth} onChange={(e) => setLineWidth(e.target.value)} className="w-24 accent-indigo-500" />
            <span className="text-[10px] font-black text-indigo-500 w-4">{lineWidth}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhiteboardModal;
