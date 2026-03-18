import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import Login from './components/auth/Login';
import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from './lib/utils';

// Lazy load pages for performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Budget = lazy(() => import('./pages/Budget'));
const FIRE = lazy(() => import('./pages/FIRE'));
const Settings = lazy(() => import('./pages/Settings'));

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 animate-fade-in">
    <div className="w-10 h-10 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
  </div>
);

const OfflineIndicator = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 3000);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline && !showBackOnline) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-slide-up">
      <div className={cn(
        "px-4 py-2 rounded-full flex items-center gap-2 shadow-2xl border border-white/10 glass text-xs font-mono font-bold tracking-tight",
        isOffline ? "text-destructive" : "text-accent"
      )}>
        {isOffline ? (
          <>
            <WifiOff size={14} />
            <span>OFFLINE — CACHED DATA</span>
          </>
        ) : (
          <>
            <Wifi size={14} />
            <span>BACK ONLINE</span>
          </>
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OfflineIndicator />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/fire" element={<FIRE />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
