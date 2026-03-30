import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/components/auth/LoginPage';
import DashboardPage from '@/components/dashboard/DashboardPage';
import WorkflowPage from '@/pages/WorkflowPage';
import GlobalHandTracking from '@/components/common/GlobalHandTracking';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loadUser } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) loadUser();
  }, [isAuthenticated, loadUser]);

  return (
    <BrowserRouter>
      <GlobalHandTracking />
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        } />
        <Route path="/" element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path="/workflow/:id" element={
          <ProtectedRoute><WorkflowPage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
