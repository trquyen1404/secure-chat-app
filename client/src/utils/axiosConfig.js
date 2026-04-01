import axios from 'axios';

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Create a custom instance
const api = axios.create();

// Request interceptor to attach token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response interceptor to handle 401
api.interceptors.response.use(
  response => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/api/auth/login' && originalRequest.url !== '/api/auth/register') {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        localStorage.setItem('token', data.token);
        
        // Let AuthContext know indirectly or directly? For now, updating localStorage works for the interceptor.
        // It's best if we had a callback, but this is simple and works.
        
        api.defaults.headers.common['Authorization'] = 'Bearer ' + data.token;
        originalRequest.headers['Authorization'] = 'Bearer ' + data.token;
        
        window.dispatchEvent(new CustomEvent('auth-refreshed', { detail: data.token }));
        
        processQueue(null, data.token);
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        // Dispatch custom event to logout user if refresh fails
        window.dispatchEvent(new Event('auth-logout'));
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Auth functions for specific routes since we need withCredentials for login/register/logout to set/clear cookies.
export const authApi = {
  login: (data) => api.post('/api/auth/login', data, { withCredentials: true }),
  register: (data) => api.post('/api/auth/register', data, { withCredentials: true }),
  logout: () => api.post('/api/auth/logout', {}, { withCredentials: true }),
};

export default api;
