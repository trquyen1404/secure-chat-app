import React, { useState, useEffect } from 'react';
import { 
  Users, MessageSquare, Shield, Activity, 
  BarChart3, Settings, LogOut, UserMinus, 
  UserCheck, AlertTriangle, Search, Filter,
  ChevronRight, LayoutDashboard, Database, RefreshCw
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, LineChart, Line,
  PieChart, Pie, Cell
} from 'recharts';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(50);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const fetchUsers = async (page = 1, search = '') => {
    try {
      const res = await api.get('/api/admin/users', {
        params: { page, limit, search }
      });
      setUsers(res.data.users);
      setTotalUsers(res.data.total);
      setTotalPages(res.data.totalPages);
      setCurrentPage(res.data.page);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sync users whenever page or search query updates
  useEffect(() => {
    fetchUsers(currentPage, debouncedSearchTerm);
  }, [currentPage, debouncedSearchTerm]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/logs')
      ]);
      setStats(statsRes.data);
      setLogs(logsRes.data);
      await fetchUsers(currentPage, debouncedSearchTerm);
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBan = async (userId, currentStatus) => {
    const reason = currentStatus ? null : window.prompt('Lý do khóa tài khoản:', 'Vi phạm chính sách cộng đồng');
    if (!currentStatus && reason === null) return;

    try {
      await api.post(`/api/admin/users/${userId}/ban`, { 
        isBanned: !currentStatus,
        banReason: reason 
      });
      fetchUsers(currentPage, debouncedSearchTerm); // Refresh list only
    } catch (err) {
      alert('Lỗi khi thực hiện thao tác');
    }
  };

  const handleResetAccount = async (userId) => {
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa toàn bộ khóa bảo mật của người dùng, khiến họ không thể đọc lại tin nhắn cũ. Bạn có chắc chắn muốn KHÔI PHỤC tài khoản này không?')) return;
    
    try {
      const res = await api.post(`/api/admin/users/${userId}/reset`);
      alert(res.data.message || 'Đã khôi phục tài khoản thành công.');
      fetchUsers(currentPage, debouncedSearchTerm); // Refresh list only
    } catch (err) {
      alert('Lỗi khi khôi phục tài khoản: ' + (err.response?.data?.error || err.message));
    }
  };

  const filteredUsers = users;

  const COLORS = ['#0054a6', '#f47920', '#10b981', '#ef4444'];

  if (loading && !stats) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      {/* Admin Sidebar */}
      <div className="w-72 h-full glass border-r border-[var(--border)] flex flex-col z-20 shrink-0">
        <div className="p-8 border-b border-[var(--border)] flex flex-col items-center gap-2">
          <div className="w-16 h-16 premium-gradient rounded-3xl flex items-center justify-center shadow-lg mb-2">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">UTT ADMIN</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] font-bold">System Management</p>
        </div>

        <nav className="flex-1 p-4 space-y-2 mt-4 overflow-y-auto no-scrollbar">
          <SidebarItem 
            icon={<LayoutDashboard className="w-5 h-5" />} 
            label="Tổng quan" 
            active={activeTab === 'overview'} 
            onClick={() => setActiveTab('overview')} 
          />
          <SidebarItem 
            icon={<Users className="w-5 h-5" />} 
            label="Quản lý người dùng" 
            active={activeTab === 'users'} 
            onClick={() => setActiveTab('users')} 
          />
          <SidebarItem 
            icon={<Database className="w-5 h-5" />} 
            label="Nhật ký hệ thống" 
            active={activeTab === 'logs'} 
            onClick={() => setActiveTab('logs')} 
          />
          <SidebarItem 
            icon={<Settings className="w-5 h-5" />} 
            label="Cài đặt hệ thống" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-[var(--border)]">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-500/10 rounded-2xl transition-all font-semibold"
          >
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 glass border-b border-[var(--border)] flex items-center justify-between px-8 shrink-0 z-10">
          <h1 className="text-2xl font-bold capitalize">{activeTab.replace('-', ' ')}</h1>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--hover)] rounded-full text-xs font-bold text-green-500">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
               Server: Stable
             </div>
             <div className="w-10 h-10 rounded-full premium-gradient flex items-center justify-center text-white font-bold border-2 border-white/20">A</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 no-scrollbar relative">
          <div className="max-w-7xl mx-auto space-y-8">
            
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
                {/* Stats Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard 
                    icon={<Users className="text-blue-500" />} 
                    label="Tổng người dùng" 
                    value={stats?.summary?.totalUsers || 0} 
                    trend="+12% từ tuần trước"
                  />
                  <StatCard 
                    icon={<Activity className="text-green-500" />} 
                    label="Đang trực tuyến" 
                    value={stats?.summary?.activeUsers || 0} 
                    trend="Ổn định"
                  />
                  <StatCard 
                    icon={<MessageSquare className="text-orange-500" />} 
                    label="Tổng tin nhắn" 
                    value={stats?.summary?.totalMessages || 0} 
                    trend="Mã hóa E2EE"
                  />
                  <StatCard 
                    icon={<BarChart3 className="text-purple-500" />} 
                    label="Tin nhắn gần đây" 
                    value={stats?.summary?.recentMessages || 0} 
                    trend="Trong 7 ngày qua"
                  />
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="glass p-6 rounded-[2.5rem] premium-shadow border border-[var(--border)] h-[400px]">
                    <h3 className="text-lg font-bold mb-6">Phân bố vai trò người dùng</h3>
                    <ResponsiveContainer width="100%" height="85%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Sinh viên', value: stats?.distribution?.students || 0 },
                            { name: 'Giảng viên', value: stats?.distribution?.teachers || 0 },
                            { name: 'Quản trị', value: stats?.distribution?.admins || 0 }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {COLORS.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="glass p-6 rounded-[2.5rem] premium-shadow border border-[var(--border)] h-[400px]">
                    <h3 className="text-lg font-bold mb-6">Tương tác hệ thống</h3>
                    <ResponsiveContainer width="100%" height="85%">
                      <BarChart data={[
                        { name: 'Mon', msgs: 400 },
                        { name: 'Tue', msgs: 300 },
                        { name: 'Wed', msgs: 600 },
                        { name: 'Thu', msgs: 800 },
                        { name: 'Fri', msgs: 500 },
                        { name: 'Sat', msgs: 200 },
                        { name: 'Sun', msgs: 150 },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-secondary)', fontSize: 12}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-secondary)', fontSize: 12}} />
                        <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="msgs" fill="#0054a6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="relative w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm sinh viên/giảng viên..." 
                      className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-2xl py-3 pl-12 pr-4 outline-none focus:ring-2 ring-blue-500/50 transition-all"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button className="flex items-center gap-2 px-6 py-3 bg-[var(--hover)] hover:bg-[var(--bg-accent)] rounded-2xl font-bold transition-all">
                    <Filter className="w-5 h-5" />
                    Lọc
                  </button>
                </div>

                <div className="glass rounded-[2.5rem] overflow-hidden border border-[var(--border)] premium-shadow">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[var(--hover)] border-b border-[var(--border)]">
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Người dùng</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Vai trò</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Trạng thái</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Hoạt động cuối</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {filteredUsers.map(user => (
                        <tr key={user.id} className="hover:bg-[var(--hover)] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl premium-gradient flex items-center justify-center text-white font-bold shadow-md">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-sm">{user.username}</p>
                                <p className="text-[11px] text-[var(--text-secondary)]">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                              user.role === 'admin' ? 'bg-red-500/10 text-red-500' : 
                              user.role === 'teacher' ? 'bg-blue-500/10 text-blue-500' : 
                              'bg-green-500/10 text-green-500'
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${user.online ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-400'}`} />
                              <span className="text-xs font-medium">{user.isBanned ? 'Bị khóa' : (user.online ? 'Trực tuyến' : 'Ngoại tuyến')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-[var(--text-secondary)] font-medium">
                            {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : 'Chưa có dữ liệu'}
                          </td>
                          <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button 
                              onClick={() => handleResetAccount(user.id)}
                              className="p-2 rounded-xl transition-all text-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
                              title="Khôi phục tài khoản (Reset Keys)"
                            >
                              <RefreshCw className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleToggleBan(user.id, user.isBanned)}
                              className={`p-2 rounded-xl transition-all ${user.isBanned ? 'text-green-500 bg-green-500/10 hover:bg-green-500/20' : 'text-red-500 bg-red-500/10 hover:bg-red-500/20'}`}
                              title={user.isBanned ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                            >
                              {user.isBanned ? <UserCheck className="w-5 h-5" /> : <UserMinus className="w-5 h-5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-8 py-4 bg-[var(--hover)] border-t border-[var(--border)] rounded-b-[2.5rem]">
                      <span className="text-xs text-[var(--text-secondary)] font-medium">
                        Hiển thị {users.length} trên {totalUsers} người dùng
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-primary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-50 disabled:pointer-events-none transition-all border border-[var(--border)] shadow-sm"
                        >
                          Đầu
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-primary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-50 disabled:pointer-events-none transition-all border border-[var(--border)] shadow-sm"
                        >
                          Trước
                        </button>
                        <span className="text-xs font-bold px-3 py-1.5 bg-[var(--bg-accent)] text-[var(--text-primary)] rounded-lg border border-[var(--border)] shadow-inner">
                          Trang {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-primary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-50 disabled:pointer-events-none transition-all border border-[var(--border)] shadow-sm"
                        >
                          Sau
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-primary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-50 disabled:pointer-events-none transition-all border border-[var(--border)] shadow-sm"
                        >
                          Cuối
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
               <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
                 <div className="glass rounded-[2.5rem] p-8 border border-[var(--border)] premium-shadow overflow-hidden">
                   <div className="flex items-center justify-between mb-8">
                     <h3 className="text-lg font-bold">Hoạt động hệ thống gần đây</h3>
                     <button className="text-xs font-bold text-blue-500 hover:underline">Tải về báo cáo (.csv)</button>
                   </div>
                   <div className="space-y-4">
                     {logs.map(log => (
                       <div key={log.id} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--hover)] border border-[var(--border)] hover:border-blue-500/30 transition-all">
                         <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                           <Activity className="w-5 h-5" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center justify-between mb-1">
                             <p className="font-bold text-sm">{log.event}</p>
                             <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">{new Date(log.timestamp).toLocaleTimeString()}</span>
                           </div>
                           <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{log.details}</p>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
      active 
        ? 'premium-gradient text-white shadow-lg shadow-blue-500/20' 
        : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]'
    }`}
  >
    <div className="flex items-center gap-3">
      {icon}
      <span className="font-bold text-sm tracking-tight">{label}</span>
    </div>
    {active && <ChevronRight className="w-4 h-4" />}
  </button>
);

const StatCard = ({ icon, label, value, trend }) => (
  <div className="glass p-6 rounded-[2.5rem] premium-shadow border border-[var(--border)] hover:scale-[1.02] transition-all duration-300">
    <div className="flex items-start justify-between mb-4">
      <div className="p-3 bg-[var(--hover)] rounded-2xl">
        {icon}
      </div>
    </div>
    <div>
      <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">{label}</p>
      <h4 className="text-3xl font-black">{value}</h4>
      <p className="text-[10px] text-green-500 font-bold mt-2 flex items-center gap-1">
        <Activity className="w-3 h-3" />
        {trend}
      </p>
    </div>
  </div>
);

export default AdminDashboard;
