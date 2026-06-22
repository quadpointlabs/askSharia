import axios from 'axios';

// Default server is Sharea. Switch with: vite --mode qpl  |  vite --mode localhost
// Sharea (.env): http://51.17.251.190:8001  |  QPL (.env.qpl): http://51.84.201.250:8001  |  Local (.env.localhost): http://localhost:8001
const API_URL = import.meta.env.VITE_API_URL || '/api';

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

export const sendVerificationCode = (email) =>
  api.post('/auth/send-verification', { email });

export const register = (name, email, password, mobile, verificationCode) =>
  api.post('/auth/register', { name, email, password, mobile, verification_code: verificationCode });

export const getMe = () =>
  api.get('/auth/me');

// Owner Auth (separate credentials)
const ownerApi = axios.create({ baseURL: API_URL });

ownerApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('ownerToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const ownerLogin = (email, password) =>
  ownerApi.post('/owner/auth/login', { email, password });

export const ownerGetMe = () =>
  ownerApi.get('/owner/auth/me');

export const ownerListUsers = () =>
  ownerApi.get('/owner/users');

export const ownerSetUserStatus = (userId, enabled) =>
  ownerApi.put(`/owner/users/${userId}/status`, { enabled });

export const ownerDeleteUser = (userId) =>
  ownerApi.delete(`/owner/users/${userId}`);

export const ownerListUserFiles = (userId) =>
  ownerApi.get(`/owner/users/${userId}/files`);

export const ownerTopUpTokens = (userId, amount) =>
  ownerApi.put(`/owner/users/${userId}/tokens`, { amount });

export const ownerSetUserPlan = (userId, plan) =>
  ownerApi.put(`/owner/users/${userId}/plan`, { plan });

export const ownerListFiles = () =>
  ownerApi.get('/owner/files');

export const ownerUploadFile = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return ownerApi.post('/owner/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const ownerDeleteFile = (filename) =>
  ownerApi.delete(`/owner/files/${filename}`);

export const ownerDownloadFile = (filename) =>
  ownerApi.get(`/owner/files/${filename}/download`, { responseType: 'blob' });

// Chat
export const sendMessage = (question, chatId) =>
  api.post('/chat', { question, chat_id: chatId ?? null });

export const ownerSendMessage = (question, chatId) =>
  ownerApi.post('/chat', { question, chat_id: chatId ?? null });

// Chat Sessions
export const listChats = () => api.get('/chats');
export const createChat = (name) => api.post('/chats', { name });
export const getMessages = (chatId) => api.get(`/chats/${chatId}/messages`);
export const deleteChat = (chatId) => api.delete(`/chats/${chatId}`);
export const renameChat = (chatId, name) => api.put(`/chats/${chatId}`, { name });

export const ownerListChats = () => ownerApi.get('/chats');
export const ownerCreateChat = (name) => ownerApi.post('/chats', { name });
export const ownerGetMessages = (chatId) => ownerApi.get(`/chats/${chatId}/messages`);
export const ownerDeleteChat = (chatId) => ownerApi.delete(`/chats/${chatId}`);
export const ownerRenameChat = (chatId, name) => ownerApi.put(`/chats/${chatId}`, { name });
export const ownerGetReport = () => ownerApi.get('/owner/reports');

export const ownerGetSystemPrompt = () =>
  ownerApi.get('/owner/system-prompt');

export const ownerSetSystemPrompt = (systemPrompt) =>
  ownerApi.put('/owner/system-prompt', { system_prompt: systemPrompt });

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

export const listOwners = () =>
  adminApi.get('/admin/owners');

export const createOwner = (name, email, password) =>
  adminApi.post('/admin/owners', { name, email, password });

export const setOwnerStatus = (ownerId, enabled) =>
  adminApi.put(`/admin/owners/${ownerId}/status`, { enabled });

export const deleteOwner = (ownerId) =>
  adminApi.delete(`/admin/owners/${ownerId}`);

export const adminGetSystemPrompt = () =>
  adminApi.get('/admin/system-prompt');

export const adminSetSystemPrompt = (systemPrompt) =>
  adminApi.put('/admin/system-prompt', { system_prompt: systemPrompt });