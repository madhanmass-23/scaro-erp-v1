import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from '../components/ui/MobileBottomNav';
import { useMeetingReminders } from '../hooks/useMeetingReminders';

export const AppLayout: React.FC = () => {
  // Activate client-side 5-minute meeting reminder watcher for active sessions
  useMeetingReminders();

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
      </div>
    </div>
  );
};
