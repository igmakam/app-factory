import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Toaster } from '@/components/ui/toaster';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (showRegister) {
      return <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginPage onSwitchToRegister={() => setShowRegister(true)} />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
