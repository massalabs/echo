import React from 'react';
import BottomNavigation from './BottomNavigation';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <>
      {children}
      <BottomNavigation />
    </>
  );
};

export default MainLayout;
