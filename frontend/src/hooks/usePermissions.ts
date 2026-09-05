// src/hooks/usePermissions.ts
import { useAuth } from '../context/AuthContext';

export type Role = 'RH' | 'EMPLOYE' | 'CANDIDAT';

export const PERMISSIONS = {
  RH: {
    canViewAllEmployees: true,
    canEditEmployees: true,
    canViewPipeline: true,
    canManageJobs: true,
    canViewInvoices: true,
    canViewTimeTracking: true,
  },
  EMPLOYE: {
    canViewAllEmployees: false,
    canEditEmployees: false,
    canViewPipeline: false,
    canManageJobs: false,
    canViewInvoices: false,
    canViewTimeTracking: true,
  },
  CANDIDAT: {
    canViewAllEmployees: false,
    canEditEmployees: false,
    canViewPipeline: false,
    canManageJobs: false,
    canViewInvoices: false,
    canViewTimeTracking: false,
  },
} as const;

export type Permission = keyof typeof PERMISSIONS.RH;

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role?.toUpperCase() || 'CANDIDAT') as Role;
  
  return {
    role,
    permissions: PERMISSIONS[role],
    isRH: role === 'RH',
    isEmploye: role === 'EMPLOYE',
    isCandidat: role === 'CANDIDAT',
  };
}