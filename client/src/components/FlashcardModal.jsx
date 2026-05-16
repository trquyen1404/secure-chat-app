import React, { useState, useEffect } from 'react';
import { X, Brain, ChevronLeft, ChevronRight, RotateCcw, Plus } from 'lucide-react';
import api from '../utils/axiosConfig';

const FlashcardModal = ({ group, onClose }) => {
  const [sets, setSets] = useState([]);
  const [activeSet, setActiveSet] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newSet, setNewSet] = useState({ title: '', cards: [{ front: '', back: '' }] });

  useEffect(() => { fetchSets(); }, []);
  const fetchSets = async () => {
    const res = await api.get(`/api/academic/flashcards/${group.id}`);
    setSets(res.data);
  };

  const handleCreate = async () => {
    await api.post('/api/academic/flashcards', { ...newSet, groupId: group.id });
    setShowCreate(false);
    fetchSets();
  };

  const nextCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % activeSet.Cards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + activeSet.Cards.length) % activeSet.Cards.length);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[var(--bg-primary)] rounded-[32px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[75vh]">
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-indigo-500" />
            <h2 className="text-xl font-black">Flashcards ôn tập</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {!activeSet ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-black">Bộ thẻ của lớp</h3>
                <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold">+ Tạo bộ thẻ</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sets.map(set => (
                  <button key={set.id} onClick={() => { setActiveSet(set); setCurrentIndex(0); }} className="p-6 bg-[var(--hover)]/30 border border-[var(--border)] rounded-[24px] text-left hover:border-indigo-500 transition-all">
                    <h4 className="font-black text-sm mb-1">{set.title}</h4>
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">{set.Cards?.length || 0} thẻ ghi nhớ</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center">
              <button onClick={() => setActiveSet(null)} className="absolute top-20 left-8 flex items-center gap-2 text-xs font-bold text-indigo-500">
                <ChevronLeft className="w-4 h-4" /> Quay lại danh sách
              </button>
              
              <div 
                className={`relative w-full max-w-md h-64 cursor-pointer perspective-1000 transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <div className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-[32px] shadow-xl border-2 border-indigo-500/20 flex flex-col items-center justify-center p-8 backface-hidden">
                  <span className="text-[10px] font-black uppercase text-indigo-500 mb-4">Mặt trước</span>
                  <p className="text-xl font-bold text-center">{activeSet.Cards[currentIndex].front}</p>
                </div>
                <div className="absolute inset-0 bg-indigo-500 rounded-[32px] shadow-xl flex flex-col items-center justify-center p-8 backface-hidden rotate-y-180 text-white">
                  <span className="text-[10px] font-black uppercase opacity-60 mb-4">Đáp án</span>
                  <p className="text-xl font-bold text-center">{activeSet.Cards[currentIndex].back}</p>
                </div>
              </div>

              <div className="flex items-center gap-8 mt-12">
                <button onClick={prevCard} className="p-4 bg-[var(--hover)] rounded-2xl hover:scale-110 transition-all"><ChevronLeft /></button>
                <div className="text-sm font-black">{currentIndex + 1} / {activeSet.Cards.length}</div>
                <button onClick={nextCard} className="p-4 bg-[var(--hover)] rounded-2xl hover:scale-110 transition-all"><ChevronRight /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlashcardModal;
