import React, { useState, useEffect } from 'react';
import { Search, X, Smile, Star, Heart, Zap, Clock } from 'lucide-react';
import api from '../utils/axiosConfig';

const BUILT_IN_STICKERS = [
  { id: 's1', url: 'https://cdn-icons-png.flaticon.com/512/2274/2274543.png', category: 'happy' },
  { id: 's2', url: 'https://cdn-icons-png.flaticon.com/512/2274/2274556.png', category: 'happy' },
  { id: 's3', url: 'https://cdn-icons-png.flaticon.com/512/2274/2274548.png', category: 'love' },
  { id: 's4', url: 'https://cdn-icons-png.flaticon.com/512/2274/2274555.png', category: 'sad' },
  { id: 's5', url: 'https://cdn-icons-png.flaticon.com/512/4148/4148560.png', category: 'cool' },
  { id: 's6', url: 'https://cdn-icons-png.flaticon.com/512/4148/4148600.png', category: 'wow' },
  { id: 's7', url: 'https://cdn-icons-png.flaticon.com/512/4148/4148612.png', category: 'angry' },
  { id: 's8', url: 'https://cdn-icons-png.flaticon.com/512/4148/4148615.png', category: 'sleepy' },
  { id: 's9', url: 'https://cdn-icons-png.flaticon.com/512/4148/4148625.png', category: 'celebrate' },
  { id: 's10', url: 'https://cdn-icons-png.flaticon.com/512/2274/2274545.png', category: 'laugh' },
];

export const StickerPicker = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  
  const categories = [
    { id: 'all', icon: <Smile className="w-4 h-4" /> },
    { id: 'happy', icon: <Star className="w-4 h-4" /> },
    { id: 'love', icon: <Heart className="w-4 h-4" /> },
    { id: 'cool', icon: <Zap className="w-4 h-4" /> },
  ];

  const filtered = activeCategory === 'all' 
    ? BUILT_IN_STICKERS 
    : BUILT_IN_STICKERS.filter(s => s.category === activeCategory);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-sm font-bold text-[var(--text-primary)]">Nhãn dán</span>
        <button onClick={onClose} className="p-1 hover:bg-[var(--hover)] rounded-full text-[var(--text-secondary)]">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-2 flex gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] overflow-x-auto no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`p-2 rounded-lg transition-all ${activeCategory === cat.id ? 'bg-blue-500 text-white shadow-md' : 'hover:bg-[var(--hover)] text-[var(--text-secondary)]'}`}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      <div className="p-3 grid grid-cols-4 gap-2 max-h-60 overflow-y-auto no-scrollbar">
        {filtered.map(sticker => (
          <button
            key={sticker.id}
            onClick={() => onSelect(sticker.url)}
            className="aspect-square p-1 hover:bg-[var(--hover)] rounded-xl transition-all hover:scale-110 active:scale-95"
          >
            <img src={sticker.url} alt="" className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  );
};

export const GifPicker = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchGifs = async (q = '') => {
    setLoading(true);
    try {
      // Using Giphy Public Beta Key for demonstration
      const apiKey = 'dc6zaTOxFJmzC'; 
      const endpoint = q 
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=20`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20`;
      
      const res = await fetch(endpoint);
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error('Failed to fetch GIFs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchGifs(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
      <div className="p-3 border-b border-[var(--border)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Tìm kiếm GIF trên Giphy..."
            className="w-full bg-[var(--hover)] border-none rounded-full py-1.5 pl-9 pr-8 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="p-2 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto no-scrollbar min-h-[200px]">
        {loading ? (
          <div className="col-span-2 flex items-center justify-center py-10">
            <Clock className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : (
          gifs.map(gif => (
            <button
              key={gif.id}
              onClick={() => onSelect(gif.images.fixed_height.url)}
              className="relative aspect-video bg-[var(--hover)] rounded-lg overflow-hidden group hover:ring-2 hover:ring-blue-500 transition-all"
            >
              <img 
                src={gif.images.fixed_height.url} 
                alt={gif.title} 
                className="w-full h-full object-cover"
              />
            </button>
          ))
        )}
        {!loading && gifs.length === 0 && (
          <p className="col-span-2 text-center py-10 text-xs text-[var(--text-secondary)]">Không tìm thấy ảnh GIF nào</p>
        )}
      </div>
      
      <div className="p-2 bg-[var(--bg-secondary)] flex justify-center border-t border-[var(--border)]">
        <img src="https://images.ctfassets.net/77l22z9el0aa/6x89Z98a7hXvYVvE3W0GvG/a8a1a3b1f9b3e1a6b0f1f1a5b8f1a1a1/PoweredBy_200px-White_HorizontalLogo.png" alt="Powered by Giphy" className="h-4 opacity-50 grayscale hover:grayscale-0 transition-all" />
      </div>
    </div>
  );
};
