import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { loading, currentUser } = useAuth();

  if (loading) {
    return <div className="spinner">Loading...</div>;
  }

  return currentUser ? <Outlet /> : <Navigate to="/login" replace />;
}
