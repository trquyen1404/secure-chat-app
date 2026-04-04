import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Register from './pages/Register';
import Login from './pages/Login';
import ChatApp from './pages/ChatApp';
import { clearRatchetDB } from './utils/ratchetStore';
import { clearKeyStore } from './utils/keyStore';
import RestoreKeyModal from './components/RestoreKeyModal';

const PrivateRoute = ({ children }) => {
  const { token, loading, needsPinRestore } = useAuth();
  if (loading) return null;
  
  if (!token) return <Navigate to="/login" replace />;
  
  return (
    <>
      {children}
      {needsPinRestore && <RestoreKeyModal />}
    </>
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
