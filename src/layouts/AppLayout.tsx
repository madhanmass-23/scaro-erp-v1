import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from '../components/ui/MobileBottomNav';
import { AutoInstallPrompt } from '../components/pwa/AutoInstallPrompt';

export const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen bg-surface-muted overflow-hidden">
      {/* Persistent Desktop Sidebar (hidden on <1024px) */}
      <Sidebar />
      
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header />
        
        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-20 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile & Tablet Bottom Navigation (<1024px) */}
        <MobileBottomNav />

        {/* Automatic Post-Login PWA Install Prompt */}
        <AutoInstallPrompt />
      </div>
    </div>
  );
};
