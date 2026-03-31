import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [privateKey, setPrivateKey] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        const pk = localStorage.getItem(`privateKey_${parsedUser.id}`);
        if (pk) setPrivateKey(pk);
      }
    }
    setLoading(false);
  }, [token]);

  const login = (data) => {
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    // Check if we already have the generated key in localStorage for this specific user
    const storedPk = localStorage.getItem(`privateKey_${data.user.id}`);
    if (storedPk) {
      setPrivateKey(storedPk);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPrivateKey(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, privateKey, login, logout, setPrivateKey, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
