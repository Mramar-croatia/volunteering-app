import React, { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { getColorForSchool } from '../utils/formatting';

export default function Volunteers({ volunteers, isLoading }) {
  const [search, setSearch] = useState('');
  
  // Filter logic
  const filtered = useMemo(() => {
    return volunteers.filter(v => (v.name + v.school).toLowerCase().includes(search.toLowerCase()));
  }, [volunteers, search]);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Baza Volontera</h1>
          <p className="view-desc">Pregled svih registriranih volontera i njihovih sati.</p>
        </div>
        <div style={{position:'relative'}}>
            <Search size={18} style={{position:'absolute', left:12, top:12, color:'var(--text-tertiary)'}} />
            <input 
                className="input" 
                placeholder="Pretraži..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                style={{paddingLeft: 40, width: 300}}
            />
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ime i Prezime</th>
                <th>Škola</th>
                <th>Razred</th>
                <th>Lokacije</th>
                <th style={{textAlign:'right'}}>Sati</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                  <tr><td colSpan={5} style={{textAlign:'center', padding: '2rem'}}>Učitavanje podataka...</td></tr>
              ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{textAlign:'center', padding: '2rem'}}>Nema rezultata.</td></tr>
              ) : (
                  filtered.map((vol, i) => (
                    <tr key={i}>
                        <td style={{fontWeight: 500}}>{vol.name}</td>
                        <td>
                            <span className="badge" style={{backgroundColor: getColorForSchool(vol.school), color: '#1e293b'}}>
                                {vol.school || 'N/A'}
                            </span>
                        </td>
                        <td><span className="badge badge-gray">{vol.grade}</span></td>
                        <td style={{color: 'var(--text-secondary)', fontSize:'0.85rem'}}>
                            {vol.locations && Array.isArray(vol.locations) ? vol.locations.join(', ') : (vol.locations || '-')}
                        </td>
                        <td style={{textAlign:'right', fontWeight: 700}}>{vol.hours}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}