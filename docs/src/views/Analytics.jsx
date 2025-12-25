import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useStats } from '../hooks/useStats';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Analytics() {
  // We re-fetch stats here to ensure charts are fresh
  const { stats, loading } = useStats();

  if (loading) return <div style={{padding: '2rem', textAlign: 'center'}}>Učitavanje statistike...</div>;

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Statistika</h1>
          <p className="view-desc">Grafički prikaz trendova i aktivnosti.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Pregled Grafova</h3>
        </div>
        <div className="card-body" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '3rem'}}>
          {stats.charts?.map((chart, i) => (
            <div key={i} style={{height: '350px'}}>
              <h4 style={{marginBottom: '1.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                {chart.title}
              </h4>
              <Bar 
                data={{
                  labels: chart.labels,
                  datasets: chart.datasets.map((ds, idx) => ({
                    label: ds.label,
                    data: ds.data,
                    // Use the new brand colors for the charts
                    backgroundColor: ['#d97706', '#fbbf24', '#f59e0b', '#78350f'][idx % 4],
                    borderRadius: 4
                  }))
                }} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' } },
                  scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: '#f1f5f9' }, border: { display: false } }
                  }
                }} 
              />
            </div>
          ))}
          {(!stats.charts || stats.charts.length === 0) && (
            <p style={{color: 'var(--text-tertiary)', fontStyle: 'italic'}}>Nema dostupnih grafova.</p>
          )}
        </div>
      </div>
    </div>
  );
}