import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Register from './pages/Register';
import Login from './pages/Login';
import ChatApp from './pages/ChatApp';
import AdminDashboard from './pages/AdminDashboard';
import { clearRatchetDB } from './utils/ratchetStore';
import { clearKeyStore } from './utils/keyStore';
import RestoreKeyModal from './components/RestoreKeyModal';
import EmailVerification from './components/EmailVerification';

const PrivateRoute = ({ children }) => {
  const { user, token, loading, needsPassphraseRestore } = useAuth();
  
  if (!token && !loading) return <Navigate to="/login" replace />;
  
  return (
    <div className="h-full w-full relative overflow-hidden bg-[var(--bg-primary)]">
      {children}
      {loading && (
        <div className="fixed inset-0 z-[9999] glass flex flex-col items-center justify-center animate-fade-in">
           <div className="relative mb-8">
             <div className="w-20 h-20 border-4 border-indigo-500/20 rounded-3xl animate-spin [animation-duration:3s]"></div>
             <div className="absolute inset-0 w-20 h-20 border-t-4 border-indigo-500 rounded-3xl animate-spin [animation-duration:1s]"></div>
             <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-8 h-8 premium-gradient rounded-xl animate-pulse"></div>
             </div>
           </div>
           <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">ANTIGRAVITY SECURE</h2>
           <p className="text-sm font-semibold text-[var(--text-secondary)] animate-pulse uppercase tracking-[0.2em]">Đang khởi tạo bảo mật...</p>
        </div>
      )}
      {needsPassphraseRestore && user?.isVerified && <RestoreKeyModal />}
      {user && !user.isVerified && <EmailVerification />}
    </div>
  );
};

const AdminRoute = ({ children }) => {
  const { user, token, loading } = useAuth();
  
  if (!loading && (!token || user?.role !== 'admin')) {
    return <Navigate to="/" replace />;
  }
  
  return (
    <div className="h-full w-full relative overflow-hidden bg-[var(--bg-primary)]">
      {children}
      {loading && (
        <div className="fixed inset-0 z-[9999] glass flex flex-col items-center justify-center animate-fade-in">
           <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

function App() {
  useEffect(() => {
    // ONE-TIME RESET for protocol migration (RSA -> Ratchet)
    const CURRENT_V = 'v19_1_deadlock_breaker';
    if (localStorage.getItem('crypto_version') !== CURRENT_V) {
      console.warn('New protocol detected. Clearing old security data...');
      
      localStorage.setItem('crypto_version', CURRENT_V);
      localStorage.removeItem('token'); // Force re-auth
      
      Promise.all([
        clearRatchetDB(),
        clearKeyStore()
      ]).then(() => {
        console.log('[App] Global storage purged. Version:', CURRENT_V);
        window.location.reload();
      }).catch(err => {
        console.error('[App] Purge failed:', err);
        window.location.reload();
      });
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        } />
        <Route path="/" element={
          <PrivateRoute>
            <ChatApp />
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
