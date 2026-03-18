import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Wallet, TrendingUp, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Budget', href: '/budget', icon: Wallet },
  { name: 'FIRE', href: '/fire', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function AppShell() {
  const { user, signOut } = useAuth();

  // Force dark mode for premium AMOLED experience
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground font-sans selection:bg-accent/30 overflow-hidden">
      {/* Desktop Sidebar (Optional, but kept and polished) */}
      <div className="hidden md:flex md:w-64 md:flex-col shrink-0">
        <div className="flex grow flex-col overflow-y-auto border-r border-white/5 bg-black pt-8">
          <div className="flex flex-shrink-0 items-center px-6 mb-10">
            <span className="text-2xl font-display font-bold tracking-tight text-accent accent-glow rounded-lg px-2 py-1">
              FINANCE
            </span>
          </div>
          <nav className="flex-1 space-y-2 px-4 pb-4">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  )
                }
              >
                <item.icon
                  className={cn(
                    'mr-3 h-5 w-5 shrink-0 transition-colors',
                    'group-hover:text-foreground'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </NavLink>
            ))}
          </nav>
          
          <div className="p-4 border-t border-white/5">
            <button
              onClick={signOut}
              className="flex w-full items-center rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Header - Subtle and clean */}
        <header className="flex h-16 shrink-0 items-center justify-between px-6 md:px-10 z-10">
          <div className="md:hidden">
            <span className="text-xl font-display font-bold tracking-tight text-accent">
              FINANCE
            </span>
          </div>
          <div className="flex flex-1 justify-end items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Authenticated</span>
              <span className="text-sm font-medium">{user?.email?.split('@')[0]}</span>
            </div>
            <button
              onClick={signOut}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-4 pb-32 pt-2 md:px-10 md:pb-10 scroll-smooth">
          <div className="max-w-7xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Tab Bar - Premium Glass Effect */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/5 safe-bottom">
          <div className="flex h-16 items-center justify-around px-2">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-1 transition-all duration-300 relative px-4 py-1',
                    isActive ? 'text-accent' : 'text-muted-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn('h-6 w-6 transition-transform duration-300', isActive && 'scale-110')} />
                    <span className="text-[10px] font-medium tracking-wide uppercase">{item.name}</span>
                    {isActive && (
                      <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent shadow-[0_0_8px_rgba(0,229,195,0.8)]" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
