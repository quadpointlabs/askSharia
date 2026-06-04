import axios from 'axios';

const API_URL = 'http://51.84.201.250:8001';

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
export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password });

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