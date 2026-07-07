import api from './api';
import type { ApiResponse, DashboardStats } from '../types';

export const dashboardService = {
  stats: () => api.get<ApiResponse<DashboardStats>, ApiResponse<DashboardStats>>('/dashboard'),
};