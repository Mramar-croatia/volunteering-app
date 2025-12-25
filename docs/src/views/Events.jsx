import React, { useState } from 'react';
import { Plus, History, MapPin, Calendar, CheckCircle } from 'lucide-react';
import { useAttendance } from '../hooks/useAttendance';
import { useVolunteers } from '../hooks/useVolunteers';

export default function Events({ volunteers, onRefresh }) {
  const [mode, setMode] = useState('create'); // 'create' or 'history' (placeholder)
  const [form, setForm] = useState({ 
    date: new Date().toISOString().split('T')[0], 
    location: '', childrenCount: '', volunteerCount: '' 
  });
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  
  const { submitAttendance, status } = useAttendance(() => {
    setForm(prev => ({ ...prev, childrenCount: '', volunteerCount: '' }));
    setSelected(new Set());
    if (onRefresh) onRefresh();
  });

  const { useFilteredVolunteers } = useVolunteers();
  const volunteerList = useFilteredVolunteers(search);

  const toggleSelect = (name) => {
    const s = new Set(selected);
    s.has(name) ? s.delete(name) : s.add(name);
    setSelected(s);
  };

  if (mode === 'history') {
    return (
      <div>
        <div className="view-header">
          <div><h1 className="view-title">Povijest Termina</h1></div>
          <button className="btn btn-primary" onClick={() => setMode('create')}><Plus size={18}/> Novi Termin</button>
        </div>
        <div className="card">
            <div className="card-body" style={{textAlign:'center', color:'var(--text-secondary)', padding: '4rem'}}>
                <History size={48} style={{marginBottom: '1rem', opacity: 0.5}} />
                <p>Ovdje će biti prikaz tablice svih prošlih termina.</p>
                <p>Trenutno u izradi.</p>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{maxWidth: '1200px', margin: '0 auto'}}>
      <div className="view-header">
        <div>
          <h1 className="view-title">Novi Termin</h1>
          <p className="view-desc">Unesite detalje termina i označite prisutnost.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => setMode('history')}><History size={18}/> Pregled Povijesti</button>
      </div>

      <div className="app-layout" style={{gridTemplateColumns: '1fr 380px', gap: '2rem', display: 'grid'}}>
        
        {/* Left: Volunteer Selection */}
        <div className="card" style={{height: 'fit-content'}}>
          <div className="card-header">
            <h3 className="card-title">Odabir Volontera <span className="badge badge-blue">{selected.size} odabranih</span></h3>
            <input 
                className="input" 
                placeholder="Traži po imenu..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                style={{width: '200px'}}
            />
          </div>
          <div className="table-wrapper" style={{maxHeight: '600px', overflowY: 'auto', border: 'none'}}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{width: 50}}></th>
                  <th>Volonter</th>
                  <th>Škola</th>
                </tr>
              </thead>
              <tbody>
                {volunteerList.map(vol => {
                    const isSel = selected.has(vol.name);
                    return (
                        <tr key={vol.name} onClick={() => toggleSelect(vol.name)} style={{background: isSel ? 'var(--brand-surface)' : ''}}>
                            <td style={{textAlign:'center'}}>
                                <div style={{
                                    width: 18, height: 18, borderRadius: 4, 
                                    border: '2px solid ' + (isSel ? 'var(--brand-primary)' : 'var(--border-strong)'),
                                    background: isSel ? 'var(--brand-primary)' : 'transparent'
                                }} />
                            </td>
                            <td style={{fontWeight: isSel ? 600 : 400}}>{vol.name}</td>
                            <td><span className="badge badge-gray">{vol.school}</span></td>
                        </tr>
                    )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Details Form */}
        <div style={{display:'flex', flexDirection:'column', gap:'1.5rem'}}>
            <div className="card">
                <div className="card-header"><h3 className="card-title">Detalji</h3></div>
                <div className="card-body" style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                    <div>
                        <label style={{fontWeight:500, fontSize:'0.9rem', display:'block', marginBottom:6}}>Datum</label>
                        <div style={{position:'relative'}}>
                            <Calendar size={16} style={{position:'absolute', left:10, top:12, color:'var(--text-tertiary)'}} />
                            <input type="date" className="input" style={{paddingLeft: 34}} value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label style={{fontWeight:500, fontSize:'0.9rem', display:'block', marginBottom:6}}>Lokacija</label>
                        <div style={{position:'relative'}}>
                            <MapPin size={16} style={{position:'absolute', left:10, top:12, color:'var(--text-tertiary)'}} />
                            <select className="input" style={{paddingLeft: 34}} value={form.location} onChange={e => setForm({...form, location: e.target.value})}>
                                <option value="">Odaberi lokaciju...</option>
                                {['Dubrava', 'Dugave', 'Centar', 'Spansko', 'Samobor', 'Kralj Tomislav'].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid-2">
                        <div>
                            <label style={{fontWeight:500, fontSize:'0.9rem', display:'block', marginBottom:6}}>Broj Djece</label>
                            <input type="number" className="input" value={form.childrenCount} onChange={e => setForm({...form, childrenCount: e.target.value})} />
                        </div>
                        <div>
                            <label style={{fontWeight:500, fontSize:'0.9rem', display:'block', marginBottom:6}}>Br. Volontera</label>
                            <input type="number" className="input" value={form.volunteerCount} onChange={e => setForm({...form, volunteerCount: e.target.value})} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{background: 'var(--brand-surface)', border: '1px solid var(--brand-primary)'}}>
                <div className="card-body">
                    <h4 style={{margin:'0 0 10px 0', color: 'var(--brand-primary-hover)'}}>Sažetak</h4>
                    <ul style={{margin:0, paddingLeft:'1.2rem', color:'var(--brand-primary-hover)', fontSize:'0.9rem'}}>
                        <li>Datum: {new Date(form.date).toLocaleDateString()}</li>
                        <li>Odabrano volontera: <strong>{selected.size}</strong></li>
                    </ul>
                    <button 
                        className="btn btn-primary" 
                        style={{width:'100%', marginTop:'1.5rem', justifyContent:'center'}}
                        onClick={() => submitAttendance(form, selected)}
                    >
                        {status === 'saving' ? 'Spremanje...' : <><CheckCircle size={18} /> Potvrdi i Spremi</>}
                    </button>
                    {status === 'success' && <p style={{color:'green', textAlign:'center', marginTop:10, fontWeight:600}}>Uspješno spremljeno!</p>}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}