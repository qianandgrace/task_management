import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Tasks from './pages/Tasks';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/tasks" element={<Tasks />} />
      </Route>

      {/* Redirect root to tasks */}
      <Route path="/" element={<Navigate to="/tasks" replace />} />

      {/* Catch-all: redirect to tasks for auth users, login for others — handled by browser since we can't check sync here */}
      <Route path="*" element={<Navigate to="/tasks" replace />} />
    </Routes>
  );
}
