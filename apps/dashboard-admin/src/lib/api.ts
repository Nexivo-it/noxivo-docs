import axios from 'axios';

const DEFAULT_BASE_URL = 'http://localhost:4000';
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;

export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');
export const ADMIN_API_BASE_URL = `${API_BASE_URL}/api/v1/admin`;

export const api = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  withCredentials: true, // Crucial for cookie-based session passthrough
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for handling 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid redirect loops if already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
