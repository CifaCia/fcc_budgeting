import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Wallet, TrendingUp, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Budget', href: '/budget', icon: Wallet },
  { name: 'FIRE', href: '/fire', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex grow flex-col overflow-y-auto border-r border-gray-200 bg-white pt-5">
          <div className="flex flex-shrink-0 items-center px-4 mb-5">
            <span className="text-xl font-bold text-indigo-600">Budget App</span>
          </div>
          <div className="mt-5 flex grow flex-col">
            <nav className="flex-1 space-y-1 px-2 pb-4">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      'group flex items-center rounded-md px-2 py-2 text-sm font-medium'
                    )
                  }
                >
                  <item.icon
                    className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  {item.name}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="md:hidden">
            <span className="text-xl font-bold text-indigo-600">Budget App</span>
          </div>
          <div className="flex flex-1 justify-end items-center space-x-4">
            <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-gray-400 hover:text-gray-500"
              title="Sign Out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8 mb-16 md:mb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-16 bg-white border-t border-gray-200">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900',
                'flex flex-1 flex-col items-center justify-center text-xs font-medium'
              )
            }
          >
            <item.icon className="h-6 w-6 mb-1" />
            {item.name}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
