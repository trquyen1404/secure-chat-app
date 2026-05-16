import React, { useState, useEffect } from 'react';
import { X, Search, Plus, MapPin, Camera, Package } from 'lucide-react';
import api from '../utils/axiosConfig';

const LostFoundModal = ({ onClose }) => {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', location: '', type: 'found' });

  useEffect(() => { fetchItems(); }, []);
  const fetchItems = async () => {
    const res = await api.get('/api/academic/lost-found');
    setItems(res.data);
  };

  const handleCreate = async () => {
    await api.post('/api/academic/lost-found', form);
    setShowAdd(false);
    fetchItems();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[var(--bg-primary)] rounded-[40px] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col h-[80vh]">
        <div className="p-8 border-b border-[var(--border)] flex items-center justify-between bg-orange-500/5">
          <div className="flex items-center gap-4">
            <Package className="w-8 h-8 text-orange-500" />
            <h2 className="text-2xl font-black">Thất lạc & Tìm kiếm</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--hover)] rounded-xl transition-all"><X /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex justify-between items-center">
             <div className="flex gap-2">
               <button className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-black">Tất cả</button>
               <button className="px-4 py-2 bg-[var(--hover)] text-[var(--text-secondary)] rounded-xl text-xs font-black">Đồ thất lạc</button>
               <button className="px-4 py-2 bg-[var(--hover)] text-[var(--text-secondary)] rounded-xl text-xs font-black">Nhặt được</button>
             </div>
             <button onClick={() => setShowAdd(true)} className="px-6 py-3 bg-orange-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-orange-500/20">+ Đăng tin</button>
          </div>

          {showAdd && (
            <div className="p-8 bg-orange-500/5 rounded-[32px] border border-orange-500/20 space-y-4">
               <input type="text" placeholder="Tên món đồ (VD: Ví tiền, Thẻ sinh viên)" className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
               <input type="text" placeholder="Vị trí nhặt được/đánh rơi" className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
               <select className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm outline-none" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                 <option value="lost">Tôi bị mất đồ</option>
                 <option value="found">Tôi nhặt được đồ</option>
               </select>
               <div className="flex justify-end gap-2">
                 <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-bold text-[var(--text-secondary)]">Hủy</button>
                 <button onClick={handleCreate} className="px-6 py-2 bg-orange-500 text-white rounded-xl text-sm font-black shadow-lg">Đăng bài</button>
               </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map(item => (
              <div key={item.id} className="p-6 bg-[var(--hover)]/30 rounded-[32px] border border-[var(--border)] flex gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${item.type === 'lost' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                   <Package className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg mb-2 inline-block ${item.type === 'lost' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>{item.type === 'lost' ? 'Thất lạc' : 'Nhặt được'}</span>
                  <h4 className="font-black text-sm truncate">{item.title}</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.location}</p>
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] mt-4 uppercase">Người đăng: {item.Reporter?.displayName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LostFoundModal;
