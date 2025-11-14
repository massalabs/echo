import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NavButton from './NavButton';
import {
  // WalletIcon,
  DiscussionsIcon,
  SettingsIcon,
} from './icons/navigationIcons';

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
    <div className="mx-auto max-w-md px-4 w-full">
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
  );
};

export default BottomNavigation;
