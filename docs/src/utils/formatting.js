export const getColorForSchool = (school) => {
  const map = {
    'gimnazija antun gustav matos samobor': '#ffb9c1ff',
    'gimnazija lucijana vranjanina': '#b6ffcfff',
    'klasicna gimnazija': '#ffea95ff',
    'prirodoslovna skola vladimir prelog': '#bfe9ff',
    'xv. gimnazija (mioc)': '#93c5fd'
  };
  const key = (school || '').trim().toLowerCase();
  if (map[key]) return map[key];
  const palette = ['#bfdbfe', '#bbf7d0', '#fecdd3', '#ddd6fe', '#fef3c7', '#e2e8f0'];
  return palette[key.length % palette.length];
};

export const formatLocations = (vol) => {
  if (Array.isArray(vol.locations)) return vol.locations;
  return String(vol.locations || vol.location || '').split(',').filter(Boolean);
};