import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Register from './pages/Register';
import Login from './pages/Login';
import ChatApp from './pages/ChatApp';

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
