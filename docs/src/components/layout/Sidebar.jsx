import React from 'react';
import { LayoutDashboard, Users, CalendarDays, BarChart3, PlusCircle } from 'lucide-react';
import zmajLogo from '../../assets/zmaj.jpg';

export default function Sidebar({ activeTab, onTabChange }) {
  const menu = [
    { id: 'dashboard', label: 'Pregled', icon: LayoutDashboard },
    { id: 'volunteers', label: 'Volonteri', icon: Users },
    { id: 'events', label: 'Termini', icon: CalendarDays },
    { id: 'analytics', label: 'Statistika', icon: BarChart3 },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon" style={{overflow:'hidden', padding:0, background:'transparent'}}>
            <img src={zmajLogo} alt="Logo" style={{width:'100%', height:'100%', objectFit:'cover'}} />
        </div>
        <span className="brand-name" style={{fontWeight:'700', fontSize:'1.1rem'}}>Zlatni Zmaj</span>
      </div>

      <nav className="nav-menu">
        {menu.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <Icon size={20} />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quick Action */}
      <div style={{marginTop: 'auto', paddingTop: '2rem'}}>
        <button 
            className="btn btn-primary" 
            style={{width: '100%', justifyContent: 'center'}}
            onClick={() => onTabChange('events')} // Redirects to events creation
        >
            <PlusCircle size={18} />
            <span className="nav-label">Novi Termin</span>
        </button>
      </div>
    </aside>
  );
}