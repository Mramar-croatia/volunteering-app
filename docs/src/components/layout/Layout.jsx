import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ activeTab, onTabChange, stats, onRefresh, loading, children }) {
  const titles = {
    baza: 'Baza Volontera',
    termini: 'Pregled Termina',
    statistika: 'Analitika',
    unos: 'Novi Termin'
  };

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      <main className="main-content">
        <Header 
          title={titles[activeTab]} 
          stats={stats} 
          onRefresh={onRefresh} 
          loading={loading} 
        />
        {children}
      </main>
    </div>
  );
}