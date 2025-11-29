// frontend/app.js

/**
 * To only be used if you want Render hosted backend.
 * const API_BASE_URL = "https://volunteering-app-fc5r.onrender.com";
 */
const API_BASE_URL = "https://volunteering-app-109370863016.europe-west1.run.app";

const volunteerTableBody = document.getElementById('volunteer-table-body');
const formEl = document.getElementById('attendance-form');
const statusEl = document.getElementById('status');
const statusChip = document.getElementById('status-chip');
const sortToggleBtn = document.getElementById('sort-toggle');
const selectAllBtn = document.getElementById('select-all-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const resetBtn = document.getElementById('reset-btn');
const statTotalEl = document.getElementById('stat-total');
const statSelectedEl = document.getElementById('stat-selected');
const statSortEl = document.getElementById('stat-sort');
const locationSelect = document.getElementById('location');
const existingIndicator = document.getElementById('existing-indicator');
const dateInput = document.getElementById('date');

let allVolunteers = [];
let filteredVolunteers = [];
let selectedNames = new Set();
let sortDirection = 'asc';
let sortKey = 'name';
let selectedLocationFilter = '';
let sortableHeaders = [];
let existingAttendance = [];

function parseLocations(vol) {
  if (Array.isArray(vol.locations)) {
    return vol.locations.map(loc => String(loc).trim()).filter(Boolean);
  }
  if (vol.locations) {
    return String(vol.locations)
      .split(',')
      .map(loc => loc.trim())
      .filter(Boolean);
  }
  if (vol.location) {
    return String(vol.location)
      .split(',')
      .map(loc => loc.trim())
      .filter(Boolean);
  }
  return [];
}

function setStatusChip(text, tone = 'info') {
  if (!statusChip) return;
  statusChip.textContent = text;

  const palette = {
    info: { bg: 'var(--accent-soft)', color: '#4c1d95', border: 'rgba(124, 58, 237, 0.35)' },
    success: { bg: 'rgba(34, 197, 94, 0.12)', color: '#166534', border: 'rgba(34, 197, 94, 0.3)' },
    error: { bg: 'rgba(244, 63, 94, 0.12)', color: '#991b1b', border: 'rgba(244, 63, 94, 0.35)' }
  };

  const toneColors = palette[tone] || palette.info;
  statusChip.style.background = toneColors.bg;
  statusChip.style.color = toneColors.color;
  statusChip.style.borderColor = toneColors.border;
}

function updateCounts() {
  statTotalEl.textContent = allVolunteers.length;
  statSelectedEl.textContent = selectedNames.size;
  statSortEl.textContent = sortDirection === 'asc' ? 'A-Z' : 'Z-A';
}

function captureSelection() {
  volunteerTableBody.querySelectorAll('.present-checkbox').forEach(cb => {
    if (cb.checked) {
      selectedNames.add(cb.value);
    } else {
      selectedNames.delete(cb.value);
    }
  });
}

function renderVolunteers() {
  volunteerTableBody.innerHTML = '';

  if (!filteredVolunteers.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    const query = searchInput.value.trim();
    cell.textContent = query ? `Nema rezultata za "${query}".` : 'Lista je prazna.';
    row.appendChild(cell);
    volunteerTableBody.appendChild(row);
    updateCounts();
    return;
  }

  filteredVolunteers.forEach(vol => {
    const row = document.createElement('tr');
    row.className = 'volunteer-row';

    const nameCell = document.createElement('td');
    nameCell.className = 'volunteer-name';
    nameCell.textContent = vol.name;
    row.appendChild(nameCell);

    const schoolCell = document.createElement('td');
    const schoolTag = document.createElement('span');
    schoolTag.className = 'pill-tag';
    schoolTag.textContent = vol.school || 'N/A';
    schoolTag.style.background = colorForSchool(vol.school || '');
    schoolTag.style.borderColor = 'rgba(0,0,0,0.05)';
    schoolCell.appendChild(schoolTag);
    row.appendChild(schoolCell);

    const gradeCell = document.createElement('td');
    gradeCell.className = 'center';
    const gradeTag = document.createElement('span');
    gradeTag.className = 'pill-tag grade';
    gradeTag.textContent = vol.grade || 'N/A';
    gradeTag.style.background = colorForGrade(vol.grade || '');
    gradeCell.appendChild(gradeTag);
    row.appendChild(gradeCell);

    const locationsCell = document.createElement('td');
    locationsCell.className = 'volunteer-meta';
    const locations = parseLocations(vol);
    const locText = locations.length ? locations.join(', ') : 'N/A';
    locationsCell.appendChild(document.createTextNode(locText));
    row.appendChild(locationsCell);

    const hoursCell = document.createElement('td');
    hoursCell.className = 'center';
    hoursCell.textContent = vol.hours || '0';
    row.appendChild(hoursCell);

    const presentCell = document.createElement('td');
    presentCell.className = 'center';
    const pill = document.createElement('div');
    pill.className = 'checkbox-pill';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = vol.name;
    checkbox.className = 'present-checkbox';
    checkbox.checked = selectedNames.has(vol.name);
    checkbox.addEventListener('click', ev => ev.stopPropagation());
    checkbox.addEventListener('change', ev => {
      if (ev.target.checked) {
        selectedNames.add(vol.name);
      } else {
        selectedNames.delete(vol.name);
      }
      updateCounts();
    });
    pill.appendChild(checkbox);
    presentCell.appendChild(pill);
    row.appendChild(presentCell);

    row.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

    volunteerTableBody.appendChild(row);
  });

  updateCounts();
}

function applyFilters() {
  captureSelection();
  const query = searchInput.value.trim().toLowerCase();
  selectedLocationFilter = locationSelect && locationSelect.value ? locationSelect.value.trim().toLowerCase() : '';

  let list = [...allVolunteers];
  if (query) {
    list = list.filter(vol => {
      const haystack = [
        vol.name || '',
        vol.school || '',
        vol.grade || '',
        Array.isArray(vol.locations) ? vol.locations.join(',') : vol.locations || '',
        vol.location || ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  if (selectedLocationFilter) {
    list = list.filter(vol => {
      const locations = parseLocations(vol).map(loc => loc.toLowerCase());
      return locations.includes(selectedLocationFilter);
    });
  }

  list.sort((a, b) => {
    const getValue = vol => {
      switch (sortKey) {
        case 'school':
          return (vol.school || '').toString();
        case 'grade':
          return Number.parseInt(vol.grade, 10) || 0;
        case 'hours':
          return Number.parseFloat(vol.hours || '0') || 0;
        case 'locations':
          return parseLocations(vol).join(', ');
        case 'name':
        default:
          return (vol.name || '').toString();
      }
    };

    const valA = getValue(a);
    const valB = getValue(b);

  if (sortKey === 'grade') {
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  }

  if (sortKey === 'hours') {
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  }

  return sortDirection === 'asc'
    ? valA.localeCompare(valB, 'hr', { sensitivity: 'base' })
      : valB.localeCompare(valA, 'hr', { sensitivity: 'base' });
  });

  filteredVolunteers = list;
  renderVolunteers();
  refreshSortIndicators();
}

function toggleSort() {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  sortToggleBtn.textContent = sortDirection === 'asc' ? 'A-Z' : 'Z-A';
  statSortEl.textContent = sortToggleBtn.textContent;
  refreshSortIndicators();
  applyFilters();
}

function selectAllVisible() {
  const allVisibleChecked = filteredVolunteers.length > 0 &&
    filteredVolunteers.every(vol => selectedNames.has(vol.name));

  if (allVisibleChecked) {
    filteredVolunteers.forEach(vol => selectedNames.delete(vol.name));
  } else {
    filteredVolunteers.forEach(vol => selectedNames.add(vol.name));
  }

  renderVolunteers();
}

function hydrateLocationSelect() {
  if (!locationSelect) return;

  const previous = locationSelect.value;
  const locationsSet = new Set();

  allVolunteers.forEach(vol => {
    parseLocations(vol).forEach(loc => locationsSet.add(loc));
  });

  if (!locationsSet.size) {
    ['Dubrava', 'Dugave', 'Centar'].forEach(loc => locationsSet.add(loc));
  }

  const sorted = Array.from(locationsSet).filter(Boolean).sort((a, b) =>
    a.localeCompare(b, 'hr', { sensitivity: 'base' })
  );

  locationSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.textContent = 'Odaberi lokaciju';
  placeholder.selected = true;
  locationSelect.appendChild(placeholder);

  sorted.forEach(loc => {
    const option = document.createElement('option');
    option.value = loc;
    option.textContent = loc;
    locationSelect.appendChild(option);
  });

  if (previous && sorted.includes(previous)) {
    locationSelect.value = previous;
  } else {
    locationSelect.selectedIndex = 0;
  }
}

async function loadVolunteers() {
  statusEl.style.color = '';
  statusEl.textContent = 'Ucitavanje popisa volontera...';
  setStatusChip('Ucitavanje', 'info');

  try {
    const res = await fetch(`${API_BASE_URL}/api/names`);
    if (!res.ok) {
      throw new Error('Network response was not ok');
    }
    allVolunteers = await res.json();
    filteredVolunteers = [...allVolunteers];
    renderVolunteers();
    refreshSortIndicators();
    statusEl.textContent = '';
    setStatusChip('Popis spreman', 'success');
    hydrateLocationSelect();
    await loadExistingAttendance();
    updateExistingIndicator();
  } catch (err) {
    console.error(err);
    statusEl.style.color = 'red';
    statusEl.textContent = 'Pogreska pri ucitavanju liste volontera.';
    volunteerTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">Ne mogu ucitati listu volontera.</td>
      </tr>`;
    setStatusChip('Greska', 'error');
  } finally {
    updateCounts();
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  statusEl.style.color = '';
  statusEl.textContent = 'Spremanje termina u evidenciju...';
  setStatusChip('Spremanje', 'info');

  const dateValue = document.getElementById('date').value;
  const locationValue = locationSelect.value;
  const childrenCountValue = document.getElementById('childrenCount').value;
  const volunteerCountValue = document.getElementById('volunteerCount').value;

  const payload = {
    selectedDate: dateValue,
    location: locationValue,
    childrenCount: childrenCountValue,
    volunteerCount: volunteerCountValue,
    selected: Array.from(selectedNames)
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await res.json();
    if (data.ok) {
      statusEl.style.color = 'green';
      statusEl.textContent = 'Termin uspjesno upisan u evidenciju!';
      setStatusChip('Spremljeno', 'success');
      await loadExistingAttendance();
      updateExistingIndicator();
      formEl.reset();
      selectedNames.clear();
      sortDirection = 'asc';
      sortToggleBtn.textContent = 'A-Z';
      searchInput.value = '';
      statSortEl.textContent = 'A-Z';
      applyFilters();
    } else {
      throw new Error('Server returned an error');
    }
  } catch (err) {
    console.error(err);
    statusEl.style.color = 'red';
    statusEl.textContent = 'Doslo je do pogreske pri spremanju.';
    setStatusChip('Greska', 'error');
  }
}

function wireEvents() {
  formEl.addEventListener('submit', handleSubmit);

  sortToggleBtn.addEventListener('click', toggleSort);

  selectAllBtn.addEventListener('click', selectAllVisible);

  searchInput.addEventListener('input', () => {
    applyFilters();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilters();
  });

  if (locationSelect) {
    locationSelect.addEventListener('change', () => {
      applyFilters();
      updateExistingIndicator();
    });
  }

  if (dateInput) {
    dateInput.addEventListener('change', updateExistingIndicator);
  }

  sortableHeaders = Array.from(document.querySelectorAll('[data-sort-key]'));
  sortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const key = header.getAttribute('data-sort-key');
      if (sortKey === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDirection = 'asc';
      }
      sortToggleBtn.textContent = sortDirection === 'asc' ? 'A-Z' : 'Z-A';
      statSortEl.textContent = sortToggleBtn.textContent;
      refreshSortIndicators();
      applyFilters();
    });

    renderVolunteers(filteredVolunteers);
  });
  refreshSortIndicators();

  formEl.addEventListener('reset', () => {
    selectedNames.clear();
    sortDirection = 'asc';
    sortToggleBtn.textContent = 'A-Z';
    statSortEl.textContent = 'A-Z';
    searchInput.value = '';
    if (locationSelect) {
      locationSelect.selectedIndex = 0;
    }
    setTimeout(() => applyFilters(), 0);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      statusEl.textContent = '';
      setStatusChip('Spremno', 'info');
      updateExistingIndicator();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadVolunteers();
  wireEvents();
});

function refreshSortIndicators() {
  if (!sortableHeaders.length) return;
  sortableHeaders.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
  const active = sortableHeaders.find(h => h.getAttribute('data-sort-key') === sortKey);
  if (active) {
    active.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
  }
}

async function loadExistingAttendance() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/evidencija`);
    if (!res.ok) throw new Error('Network response was not ok');
    existingAttendance = await res.json();
  } catch (err) {
    console.error('Failed to load evidencija', err);
    existingAttendance = [];
  }
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  // Accept yyyy-mm-dd
  if (dateStr.includes('-')) return dateStr;
  // Expect dd/mm/yyyy
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return '';
}

function updateExistingIndicator() {
  if (!existingIndicator) return;
  const currentDate = normalizeDate(dateInput ? dateInput.value : '');
  const currentLocation = locationSelect ? locationSelect.value.trim().toLowerCase() : '';

  if (!currentDate || !currentLocation || !existingAttendance.length) {
    existingIndicator.textContent = 'Provjera...';
    existingIndicator.classList.remove('pill-success', 'pill-alert');
    return;
  }

  const found = existingAttendance.some(row => {
    const rowDate = normalizeDate(row.date);
    const rowLoc = (row.location || '').trim().toLowerCase();
    return rowDate === currentDate && rowLoc === currentLocation;
  });

  if (found) {
    existingIndicator.textContent = 'Već evidentirano';
    existingIndicator.classList.add('pill-alert');
    existingIndicator.classList.remove('pill-success');
  } else {
    existingIndicator.textContent = 'Novo';
    existingIndicator.classList.add('pill-success');
    existingIndicator.classList.remove('pill-alert');
  }
}

function colorForSchool(school) {
  const palette = [
    '#ede9fe', // purple soft
    '#e0f2fe', // blue soft
    '#fef3c7', // amber soft (gold accent)
    '#dcfce7', // green soft
    '#ffe4e6'  // rose soft
  ];
  if (!school) return palette[0];
  const hash = Array.from(school).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function colorForGrade(grade) {
  const palette = {
    '1': '#e0f2fe',
    '2': '#dcfce7',
    '3': '#fef3c7',
    '4': '#fee2e2'
  };
  const key = String(grade || '').trim();
  return palette[key] || '#f1f5f9';
}
