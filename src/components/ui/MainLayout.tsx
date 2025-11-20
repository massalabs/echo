// MainLayout.tsx
import React from 'react';
import BottomNavigation from './BottomNavigation';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative h-full flex flex-col">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 relative pb-(--bottom-nav-height)">
        {children}
      </div>

      {/* Bottom navigation — now with a subtle top blur to melt perfectly */}
      <BottomNavigation />
    </div>
  );
};

export default MainLayout;
