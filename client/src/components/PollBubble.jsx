import React, { useState, useEffect } from 'react';
import { BarChart3, Check, Users } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const PollBubble = ({ pollId, groupId }) => {
  const { user } = useAuth();
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    fetchPoll();
    // In a real app, we'd listen for socket updates for this pollId
  }, [pollId]);

  const fetchPoll = async () => {
    try {
      // In a real app, we might get the poll object directly from the message payload 
      // or fetch it if it's just an ID.
      const res = await api.get(`/api/polls/groups/${groupId}`);
      const found = res.data.find(p => p.id === pollId);
      setPoll(found);
    } catch (err) {
      console.error('Failed to fetch poll:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (optionId) => {
    if (voting || !poll || poll.status === 'closed') return;
    try {
      setVoting(true);
      const res = await api.post('/api/polls/vote', { pollId, optionId });
      setPoll(res.data);
    } catch (err) {
      console.error('Vote failed:', err);
    } finally {
      setVoting(false);
    }
  };

  if (loading) return <div className="p-4 bg-[var(--hover)] rounded-2xl animate-pulse text-xs text-[var(--text-secondary)]">Đang tải bình chọn...</div>;
  if (!poll) return null;

  const totalVotes = poll.Votes?.length || 0;
  const myVotes = poll.Votes?.filter(v => v.userId === user?.id).map(v => v.optionId) || [];

  return (
    <div className="w-full max-w-[300px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm my-2">
      <div className="p-4 border-b border-[var(--border)] bg-gradient-to-r from-indigo-500/5 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">Khảo sát lớp học</span>
        </div>
        <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{poll.question}</h4>
      </div>

      <div className="p-3 space-y-2">
        {poll.Options?.map(option => {
          const optionVotes = option.Votes?.length || 0;
          const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
          const isSelected = myVotes.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={voting || poll.status === 'closed'}
              className="w-full text-left relative group overflow-hidden rounded-xl border border-[var(--border)] hover:border-indigo-500/30 transition-all active:scale-[0.98]"
            >
              {/* Progress Bar Background */}
              <div 
                className={`absolute inset-0 bg-indigo-500/10 transition-all duration-500 ease-out`}
                style={{ width: `${percentage}%` }}
              />
              
              <div className="relative p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-[var(--border)]'}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={`text-xs font-medium truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-[var(--text-primary)]'}`}>
                    {option.text}
                  </span>
                </div>
                <span className="text-[10px] font-black text-[var(--text-secondary)]">{percentage}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-2 bg-[var(--hover)]/30 flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-tight">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {totalVotes} lượt bình chọn
        </div>
        {poll.status === 'closed' && <span className="text-red-500">Đã kết thúc</span>}
      </div>
    </div>
  );
};

export default PollBubble;
