import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NavButton from './NavButton';
import {
  // WalletIcon,
  DiscussionsIcon,
  SettingsIcon,
} from './icons';

const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname || '/';
  const activeTab: 'wallet' | 'discussions' | 'settings' = path.startsWith(
    '/wallet'
  )
    ? 'wallet'
    : path.startsWith('/settings')
      ? 'settings'
      : 'discussions';

  const navItems = [
    // {
    //   id: 'wallet' as const,
    //   path: '/wallet',
    //   title: 'Wallet',
    //   icon: <WalletIcon />,
    // },
    {
      id: 'discussions' as const,
      path: '/',
      title: 'Discussions',
      icon: <DiscussionsIcon />,
    },
    {
      id: 'settings' as const,
      path: '/settings',
      title: 'Settings',
      icon: <SettingsIcon />,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 pb-safe z-50">
      {/* Backdrop that extends upward to hide content scrolling behind the nav bar */}
      <div
        className="absolute inset-x-0 bottom-0 bg-background pointer-events-none"
        style={{ height: 'var(--bottom-nav-backdrop-height)' }}
      />
      <div className="relative mx-auto mb-3 max-w-md px-4">
        <div className="h-[64px] w-full bg-card border border-border rounded-2xl shadow-sm flex items-center justify-center">
          <div className="flex items-center justify-center gap-8">
            {navItems.map(item => (
              <NavButton
                key={item.id}
                onClick={() => navigate(item.path)}
                isActive={activeTab === item.id}
                title={item.title}
                icon={item.icon}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BottomNavigation;
