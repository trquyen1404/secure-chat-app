import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Tag, Search, Image as ImageIcon } from 'lucide-react';
import api from '../utils/axiosConfig';

const MarketplaceModal = ({ onClose }) => {
  const [listings, setListings] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', price: 0, type: 'sell', subject: '', imageUrl: '' });

  useEffect(() => { fetchListings(); }, []);
  const fetchListings = async () => {
    const res = await api.get('/api/academic/marketplace');
    setListings(res.data);
  };

  const handleCreate = async () => {
    await api.post('/api/academic/marketplace', form);
    setShowAdd(false);
    fetchListings();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[85vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between bg-emerald-500/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black">Chợ giáo trình UTT</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="flex justify-between items-center">
            <div className="relative w-72">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
               <input type="text" placeholder="Tìm sách, tài liệu..." className="w-full pl-12 pr-4 py-3 bg-[var(--hover)]/50 rounded-2xl text-xs outline-none border border-transparent focus:border-emerald-500 transition-all" />
            </div>
            <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-emerald-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-emerald-500/20 flex items-center gap-2">+ Đăng tin bán</button>
          </div>

          {showAdd && (
            <div className="p-8 bg-emerald-500/5 rounded-[32px] border border-emerald-500/20 space-y-4">
               <input type="text" placeholder="Tên sách/tài liệu" className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
               <div className="grid grid-cols-2 gap-4">
                 <input type="number" placeholder="Giá (0 nếu tặng)" className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
                 <select className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="sell">Bán</option>
                    <option value="give">Tặng miễn phí</option>
                 </select>
               </div>
               <div className="flex justify-end gap-2">
                 <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">Hủy</button>
                 <button onClick={handleCreate} className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-sm font-black shadow-lg">Đăng bài</button>
               </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {listings.map(item => (
              <div key={item.id} className="bg-[var(--bg-secondary)] rounded-3xl overflow-hidden border border-[var(--border)] hover:border-emerald-500 transition-all group shadow-sm hover:shadow-xl">
                 <div className="aspect-[3/4] bg-emerald-500/5 flex items-center justify-center relative">
                   {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-12 h-12 text-emerald-500/20" />}
                   <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-black text-emerald-600 shadow-sm">{item.type === 'give' ? 'TẶNG' : `${item.price.toLocaleString()}đ`}</div>
                 </div>
                 <div className="p-4 space-y-1">
                   <h4 className="font-black text-sm truncate">{item.title}</h4>
                   <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Người bán: {item.Seller?.displayName || item.Seller?.username}</p>
                   <button className="w-full mt-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black shadow-lg shadow-emerald-500/20 opacity-0 group-hover:opacity-100 transition-all">LIÊN HỆ MUA</button>
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceModal;
