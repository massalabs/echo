import React from 'react';
import BottomNavigation from './BottomNavigation';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="h-full">
      <div className="overflow-y-auto h-full">{children}</div>
      <div className="flex  items-center bg-transparent fixed bottom-3 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  );
};

export default MainLayout;
