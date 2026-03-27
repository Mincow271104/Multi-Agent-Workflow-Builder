import axios from 'axios';
import type { ApiResponse, Workflow, Agent, Execution, User } from '@/types';

// Axios instance — uses the Vite proxy so no need for full URL
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ── Auth ────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<ApiResponse<{ user: User; token: string }>>('/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', data).then((r) => r.data),
  getMe: () =>
    api.get<ApiResponse<User>>('/auth/me').then((r) => r.data),
};

// ── Workflows ───────────────────────────────────────────────────

export const workflowApi = {
  getAll: () =>
    api.get<ApiResponse<Workflow[]>>('/workflows').then((r) => r.data),
  getById: (id: string) =>
    api.get<ApiResponse<Workflow>>(`/workflows/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post<ApiResponse<Workflow>>('/workflows', data).then((r) => r.data),
  update: (id: string, data: Partial<Workflow>) =>
    api.put<ApiResponse<Workflow>>(`/workflows/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete<ApiResponse>(`/workflows/${id}`).then((r) => r.data),
};

// ── Agents ──────────────────────────────────────────────────────

export const agentApi = {
  create: (data: Partial<Agent> & { workflowId: string }) =>
    api.post<ApiResponse<Agent>>('/agents', data).then((r) => r.data),
  getByWorkflow: (workflowId: string) =>
    api.get<ApiResponse<Agent[]>>(`/agents/workflow/${workflowId}`).then((r) => r.data),
  update: (id: string, data: Partial<Agent>) =>
    api.put<ApiResponse<Agent>>(`/agents/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete<ApiResponse>(`/agents/${id}`).then((r) => r.data),
};

// ── Executions ──────────────────────────────────────────────────

export const executionApi = {
  start: (data: { workflowId: string; input: string }) =>
    api.post<ApiResponse<{ executionId: string }>>('/executions/start', data).then((r) => r.data),
  getById: (id: string) =>
    api.get<ApiResponse<Execution>>(`/executions/${id}`).then((r) => r.data),
  getByWorkflow: (workflowId: string, page = 1) =>
    api.get<ApiResponse<{ executions: Execution[]; pagination: object }>>(`/executions/workflow/${workflowId}?page=${page}`).then((r) => r.data),
};

export default api;
