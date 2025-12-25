import React from 'react';
import Sidebar from './Sidebar';

export default function AppShell({ activeTab, onTabChange, children }) {
  return (
    <div className="app-layout">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      <main className="main-area">
        {children}
      </main>
    </div>
  );
}