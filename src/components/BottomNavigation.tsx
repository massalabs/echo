import React from 'react';
import walletIcon from '../assets/icons/wallet.svg';
import walletActiveIcon from '../assets/icons/wallet_active.svg';
import discussionIcon from '../assets/icons/discussion.svg';
import discussionActiveIcon from '../assets/icons/discussion_active.svg';
import settingsIcon from '../assets/icons/settings.svg';
import settingsActiveIcon from '../assets/icons/settings_active.svg';

interface BottomNavigationProps {
  activeTab: 'wallet' | 'discussions' | 'settings';
  onTabChange: (tab: 'wallet' | 'discussions' | 'settings') => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#fcfcfc] dark:bg-gray-800 border-t border-[#cacaca] dark:border-gray-700 h-[76px] flex items-center justify-center">
      <div className="flex items-center justify-center space-x-16">
        {/* Wallet Button */}
        <button
          onClick={() => onTabChange('wallet')}
          className="w-8 h-8 flex items-center justify-center"
        >
          <img
            src={activeTab === 'wallet' ? walletActiveIcon : walletIcon}
            alt="Wallet"
            className="w-8 h-8"
          />
        </button>

        {/* Discussions Button */}
        <button
          onClick={() => onTabChange('discussions')}
          className="w-8 h-8 flex items-center justify-center"
        >
          <img
            src={
              activeTab === 'discussions'
                ? discussionActiveIcon
                : discussionIcon
            }
            alt="Discussions"
            className="w-8 h-8"
          />
        </button>

        {/* Settings Button */}
        <button
          onClick={() => onTabChange('settings')}
          className="w-8 h-8 flex items-center justify-center"
        >
          <img
            src={activeTab === 'settings' ? settingsActiveIcon : settingsIcon}
            alt="Settings"
            className="w-8 h-8"
          />
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation;
