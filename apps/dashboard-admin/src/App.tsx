import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Overview from './pages/Overview';
import Login from './pages/Login';
import Sessions from './pages/Sessions';
import Workers from './pages/Workers';
import Events from './pages/Events';
import Explorer from './pages/Explorer';
import Webhooks from './pages/Webhooks';
import { AuthProvider, useAuth } from './lib/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-surface-base text-on-surface">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen bg-surface-base text-on-surface font-sans selection:bg-primary/30">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-surface-base">
          {children}
        </main>
      </div>
    </div>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <Layout>
            <Overview />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/sessions" element={
        <ProtectedRoute>
          <Layout>
            <Sessions />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/workers" element={
        <ProtectedRoute>
          <Layout>
            <Workers />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/events" element={
        <ProtectedRoute>
          <Layout>
            <Events />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/explorer" element={
        <ProtectedRoute>
          <Layout>
            <Explorer />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/webhooks" element={
        <ProtectedRoute>
          <Layout>
            <Webhooks />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

import { Toaster } from 'sonner';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors theme="dark" />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
