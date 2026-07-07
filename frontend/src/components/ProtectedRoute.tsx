// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions, type Permission, type Role } from '../hooks/usePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: Permission;
  allowedRoles?: Role[];
  roles?: string[]; 
}

export default function ProtectedRoute({ 
  children, 
  requiredPermission,
  allowedRoles,
  roles, 
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { role, permissions } = usePermissions();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#2D5C1A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#6B6B6B]">Chargement...</p>
        </div>
      </div>
    );
  }

  // Pas connecté
  if (!user) {
    console.log('🔒 Pas connecté → redirection login');
    return <Navigate to="/login" replace />;
  }

  // Support de l'ancien système avec "roles"
  if (roles && !roles.includes(user.role)) {
    console.log('🚫 Rôle non autorisé (ancien système):', user.role);
    return <Navigate to="/unauthorized" replace />;
  }

  // Nouveau système : vérifier le rôle
  if (allowedRoles && !allowedRoles.includes(role)) {
    console.log('🚫 Rôle non autorisé:', role);
    return <Navigate to="/unauthorized" replace />;
  }

  // Nouveau système : vérifier la permission
  if (requiredPermission && !permissions[requiredPermission]) {
    console.log('🚫 Permission refusée:', requiredPermission);
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}