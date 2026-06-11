import axios from 'axios';

// Default server is Sharea. Switch with: vite --mode qpl  |  vite --mode localhost
// Sharea (.env): http://51.17.251.190:8001  |  QPL (.env.qpl): http://51.84.201.250:8001  |  Local (.env.localhost): http://localhost:8001
const API_URL = import.meta.env.VITE_API_URL || 'http://51.17.251.190:8001';

const api = axios.create({
  baseURL: API_URL,
});

// Automatically attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const login = (email, password) =>
  api.post('/auth/login', { email, password });

export const getMe = () =>
  api.get('/auth/me');

// Chat
export const sendMessage = (question) =>
  api.post('/chat', { question });

// Files
export const uploadFile = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const listFiles = () =>
  api.get('/files');

export const deleteFile = (filename) =>
  api.delete(`/files/${filename}`);

export const downloadFile = (filename) =>
  api.get(`/files/${filename}/download`, { responseType: 'blob' });

// Admin API — uses separate adminToken in localStorage
const adminApi = axios.create({ baseURL: API_URL });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const adminLogin = (username, password) =>
  adminApi.post('/admin/auth/login', { username, password });

export const changeAdminPassword = (currentPassword, newPassword) =>
  adminApi.post('/admin/auth/change-password', { current_password: currentPassword, new_password: newPassword });

export const getAdminStats = () =>
  adminApi.get('/admin/stats');

export const listUsers = () =>
  adminApi.get('/admin/users');

export const setUserStatus = (userId, enabled) =>
  adminApi.put(`/admin/users/${userId}/status`, { enabled });

export const createUser = (name, email, password) =>
  adminApi.post('/admin/users', { name, email, password });