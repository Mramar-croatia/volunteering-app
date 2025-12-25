import React from 'react';
import { Users, Clock, CalendarCheck, TrendingUp } from 'lucide-react';

export default function Dashboard({ stats, volunteers, onNavigate }) {
  // Mock recent activity based on volunteer data (just for demo visualization)
  const recentVolunteers = volunteers.slice(0, 5);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Dobrodošli natrag!</h1>
          <p className="view-desc">Evo pregleda trenutnog stanja u evidenciji.</p>
        </div>
        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
          {new Date().toLocaleDateString('hr-HR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{marginBottom: '2.5rem'}}>
        <StatCard label="Ukupno Volontera" value={stats.volunteersCount} icon={Users} color="blue" />
        <StatCard label="Ukupno Sati" value={stats.totalHours} icon={Clock} color="amber" />
        <StatCard label="Održanih Termina" value={stats.eventsCount} icon={CalendarCheck} color="green" />
        <StatCard label="Djece u Programu" value={stats.totalChildren} icon={TrendingUp} color="purple" />
      </div>

      <div className="grid-2">
        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Brze Akcije</h3>
          </div>
          <div className="card-body" style={{display: 'flex', gap: '1rem', flexDirection: 'column'}}>
            <button className="btn btn-primary" style={{justifyContent: 'center', padding: '1rem'}} onClick={() => onNavigate('events')}>
              <CalendarCheck size={20} /> Unesi Novi Termin
            </button>
            <button className="btn btn-ghost" style={{justifyContent: 'center', padding: '1rem'}} onClick={() => onNavigate('volunteers')}>
              <Users size={20} /> Pretraži Bazu Volontera
            </button>
          </div>
        </div>

        {/* Recently Active (Mocked representation) */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Nedavno Aktivni Volonteri</h3>
          </div>
          <div className="table-wrapper" style={{border: 'none', borderRadius: 0}}>
            <table className="data-table">
              <tbody>
                {recentVolunteers.map((vol, i) => (
                  <tr key={i}>
                    <td style={{fontWeight: 500}}>{vol.name}</td>
                    <td style={{color: 'var(--text-tertiary)', textAlign: 'right'}}>{vol.hours} sati</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="stat-card">
    <Icon className="stat-icon" size={64} />
    <span className="stat-label">{label}</span>
    <span className="stat-val">{value}</span>
  </div>
);