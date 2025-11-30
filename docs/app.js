// frontend/app.js

// Ordered by priority; app will try each until one works.
const API_BASE_URLS = [
  '', // same-origin (works with local proxy/dev server)
  'http://localhost:3000', // local backend
  'https://volunteering-app-109370863016.europe-west1.run.app',
  'https://volunteering-app-fc5r.onrender.com'
];
let activeApiBase = API_BASE_URLS[0];

function getCandidateBases() {
  const isFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
  // If opened as file://, skip relative/localhost options that will fail.
  if (isFile) {
    return API_BASE_URLS.filter(base => base.startsWith('https://'));
  }
  return API_BASE_URLS;
}

const volunteerTableBody = document.getElementById('volunteer-table-body');
const volunteerCardsEl = document.getElementById('volunteer-cards');
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
const locationSelect = document.getElementById('location');
const dateInput = document.getElementById('date'); // visible text input
const datePicker = document.getElementById('date-picker'); // hidden native picker

let allVolunteers = [];
let filteredVolunteers = [];
let selectedNames = new Set();
let sortDirection = 'asc';
let sortKey = 'name';
let selectedLocationFilter = '';
let sortableHeaders = [];
let existingAttendance = [];
let currentIsoDate = '';

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
  statusChip.textContent = text.toUpperCase();
  statusChip.classList.remove('pill-success', 'pill-alert');

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
}

function applyResponsiveLayout() {
  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  document.body.classList.toggle('mobile-active', isMobile);
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
  if (volunteerCardsEl) volunteerCardsEl.innerHTML = '';

  if (!filteredVolunteers.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    const query = searchInput.value.trim();
    cell.textContent = query ? `Nema rezultata za "${query}".` : 'Lista je prazna.';
    row.appendChild(cell);
    volunteerTableBody.appendChild(row);

    if (volunteerCardsEl) {
      const card = document.createElement('div');
      card.className = 'vol-card empty-card';
      card.textContent = query ? `Nema rezultata za "${query}".` : 'Lista je prazna.';
      volunteerCardsEl.appendChild(card);
    }
    updateCounts();
    return;
  }

  filteredVolunteers.forEach(vol => {
    const row = document.createElement('tr');
    row.className = 'volunteer-row';

    const nameCell = document.createElement('td');
    nameCell.className = 'volunteer-name col-name';
    nameCell.textContent = vol.name;
    row.appendChild(nameCell);

    const schoolCell = document.createElement('td');
    schoolCell.className = 'col-school';
    const schoolTag = document.createElement('span');
    schoolTag.className = 'pill-tag';
    schoolTag.textContent = vol.school || 'N/A';
    schoolTag.style.background = colorForSchool(vol.school || '');
    schoolTag.style.borderColor = 'rgba(0,0,0,0.05)';
    schoolCell.appendChild(schoolTag);
    row.appendChild(schoolCell);

    const gradeCell = document.createElement('td');
    gradeCell.className = 'center col-grade';
    const gradeTag = document.createElement('span');
    gradeTag.className = 'pill-tag grade';
    gradeTag.textContent = displayGrade(vol.grade);
    gradeTag.style.background = colorForGrade(vol.grade || '');
    gradeCell.appendChild(gradeTag);
    row.appendChild(gradeCell);

    const locationsCell = document.createElement('td');
    locationsCell.className = 'volunteer-meta col-locations';
    const locationsList = parseLocations(vol);
    const locText = locationsList.length
      ? locationsList
          .map(loc => loc.trim())
          .filter(Boolean)
          .map(loc => loc.charAt(0).toUpperCase())
          .join(', ')
      : 'N/A';
    locationsCell.appendChild(document.createTextNode(locText));
    row.appendChild(locationsCell);

    const hoursCell = document.createElement('td');
    hoursCell.className = 'center col-hours';
    hoursCell.textContent = vol.hours || '0';
    row.appendChild(hoursCell);

    const presentCell = document.createElement('td');
    presentCell.className = 'center col-present';
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

    // Mobile card
    if (volunteerCardsEl) {
      const card = document.createElement('article');
      card.className = 'vol-card';

      const top = document.createElement('div');
      top.className = 'vol-card-top';

      const title = document.createElement('div');
      title.className = 'vol-card-title';
      const nameEl = document.createElement('div');
      nameEl.className = 'vol-card-name';
      nameEl.textContent = vol.name;
      title.appendChild(nameEl);

      top.appendChild(title);

      const statsRow = document.createElement('div');
      statsRow.className = 'vol-card-stats';
      const gradeEl = document.createElement('span');
      gradeEl.className = 'stat-chip stat-chip-grade';
      gradeEl.innerHTML = `<span class="stat-label">RAZRED</span><strong>${displayGrade(vol.grade)}</strong>`;
      const hoursEl = document.createElement('span');
      hoursEl.className = 'stat-chip stat-chip-hours';
      hoursEl.innerHTML = `<span class="stat-label">SATI</span><strong>${vol.hours || '0'}</strong>`;
      statsRow.appendChild(gradeEl);
      statsRow.appendChild(hoursEl);

      const meta = document.createElement('div');
      meta.className = 'vol-card-meta';
      const schoolEl = document.createElement('span');
      schoolEl.className = 'pill-tag';
      schoolEl.style.background = colorForSchool(vol.school || '');
      schoolEl.textContent = vol.school || 'N/A';
      meta.appendChild(schoolEl);

      const checkboxWrap = document.createElement('label');
      checkboxWrap.className = 'vol-card-presence';
      checkboxWrap.setAttribute('aria-label', `Oznaci ${vol.name} kao prisutnog`);
      const srOnly = document.createElement('span');
      srOnly.className = 'visually-hidden';
      srOnly.textContent = 'Prisutan';

      const switchWrap = document.createElement('div');
      switchWrap.className = 'switch';
      const mobileCheckbox = document.createElement('input');
      mobileCheckbox.type = 'checkbox';
      mobileCheckbox.value = vol.name;
      mobileCheckbox.checked = selectedNames.has(vol.name);
      mobileCheckbox.className = 'present-checkbox';
      const slider = document.createElement('span');
      slider.className = 'switch-slider';
      switchWrap.appendChild(mobileCheckbox);
      switchWrap.appendChild(slider);

      checkboxWrap.appendChild(srOnly);
      checkboxWrap.appendChild(switchWrap);

      mobileCheckbox.addEventListener('change', ev => {
        if (ev.target.checked) {
          selectedNames.add(vol.name);
        } else {
          selectedNames.delete(vol.name);
        }
        // sync desktop checkbox
        const desktopCb = volunteerTableBody.querySelector(`input[type="checkbox"][value="${CSS.escape(vol.name)}"]`);
        if (desktopCb) desktopCb.checked = ev.target.checked;
        updateCounts();
      });

      switchWrap.addEventListener('click', ev => ev.stopPropagation());

      card.appendChild(top);
      card.appendChild(statsRow);
      card.appendChild(meta);
      card.appendChild(checkboxWrap);
      card.addEventListener('click', ev => {
        if (ev.target.tagName.toLowerCase() === 'input' || ev.target.closest('.switch')) {
          return;
        }
        mobileCheckbox.checked = !mobileCheckbox.checked;
        mobileCheckbox.dispatchEvent(new Event('change'));
      });

      volunteerCardsEl.appendChild(card);
    }
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

async function tryFetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function loadVolunteers() {
  statusEl.style.color = '';
  statusEl.textContent = 'Ucitavanje popisa volontera...';
  setStatusChip('Ucitavanje', 'info');

  try {
    let volunteers = [];
    let lastError = null;
    let success = false;
    for (const base of getCandidateBases()) {
      try {
        const data = await tryFetchJSON(`${base}/api/names`);
        activeApiBase = base;
        volunteers = data;
        success = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!success) {
      throw lastError || new Error('Nije pronađen dostupni backend');
    }

    allVolunteers = volunteers;
    filteredVolunteers = [...allVolunteers];
    renderVolunteers();
    refreshSortIndicators();
    statusEl.textContent = '';
  setStatusChip('Spremno', 'success');
  hydrateLocationSelect();
  await loadExistingAttendance();
  setDateInputDisplay(toIsoDate(dateInput ? dateInput.value : ''));
  updateExistingIndicator();
  } catch (err) {
    console.error(err);
    statusEl.style.color = 'red';
    statusEl.textContent = 'Pogreska pri ucitavanju liste volontera. Provjeri backend ili kredencijale.';
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

  const isoDate = toIsoDate(dateValue);
  setDateInputDisplay(isoDate || dateValue);

  const payload = {
    selectedDate: isoDate || dateValue,
    location: locationValue,
    childrenCount: childrenCountValue,
    volunteerCount: volunteerCountValue,
    selected: Array.from(selectedNames)
  };

  try {
    const res = await fetch(`${activeApiBase}/api/attendance`, {
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
      currentIsoDate = '';
      if (datePicker) datePicker.value = '';
      setDateInputDisplay('');
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
    dateInput.addEventListener('change', () => {
      const iso = toIsoDate(dateInput.value);
      setDateInputDisplay(iso);
      updateExistingIndicator();
    });

    dateInput.addEventListener('focus', () => {
      if (datePicker && datePicker.showPicker) {
        datePicker.showPicker();
      }
    });
  }

  if (datePicker) {
    datePicker.addEventListener('change', () => {
      const iso = datePicker.value;
      setDateInputDisplay(iso);
      updateExistingIndicator();
    });
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
      refreshSortIndicators();
      applyFilters();
    });
  });
  refreshSortIndicators();

  formEl.addEventListener('reset', () => {
    selectedNames.clear();
    sortDirection = 'asc';
    sortToggleBtn.textContent = 'A-Z';
    searchInput.value = '';
    if (locationSelect) {
      locationSelect.selectedIndex = 0;
    }
    updateDateDisplay();
    setStatusChip('Spremno', 'info');
    setTimeout(() => applyFilters(), 0);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      statusEl.textContent = '';
      setStatusChip('Spremno', 'info');
      updateExistingIndicator();
      if (volunteerCardsEl) {
        // Uncheck all mobile cards
        volunteerCardsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadVolunteers();
  wireEvents();
  if (dateInput && dateInput.value) {
    setDateInputDisplay(toIsoDate(dateInput.value));
  }
  applyResponsiveLayout();
  window.addEventListener('resize', applyResponsiveLayout);
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
    let data = [];
    let lastError = null;
    let success = false;
    for (const base of getCandidateBases()) {
      try {
        const res = await fetch(`${base}/api/evidencija`);
        if (!res.ok) throw new Error('Network response was not ok');
        data = await res.json();
        activeApiBase = base;
        success = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!success) throw lastError || new Error('Nije pronadjen dostupni backend');
    existingAttendance = data;
  } catch (err) {
    console.error('Failed to load evidencija', err);
    existingAttendance = [];
  }
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  let cleaned = dateStr.replace(/\./g, '/').replace(/\s+/g, '');
  // drop trailing separators (e.g. "4/11/2025/")
  cleaned = cleaned.replace(/\/+$/, '');
  // Accept yyyy-mm-dd
  if (cleaned.includes('-')) return cleaned;
  // Expect dd/mm/yyyy
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return '';
}

function toIsoDate(value) {
  if (!value) return '';
  let trimmed = value.trim();
  // normalize separators and remove trailing dots/spaces
  trimmed = trimmed.replace(/\./g, '/').replace(/\s+/g, '');
  trimmed = trimmed.replace(/\/+$/, '');
  if (trimmed.includes('-')) return trimmed;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map(p => p.padStart(2, '0'));
    if (dd && mm && yyyy) return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

function formatDateForDisplay(isoDate) {
  if (!isoDate) return '';
  if (isoDate.includes('-')) {
    const [year, month, day] = isoDate.split('-');
    return `${Number(day)}.${Number(month)}.${year}.`;
  }
  return isoDate;
}

function updateExistingIndicator() {
  if (!statusChip) return;
  const currentDate = normalizeDate(currentIsoDate || toIsoDate(dateInput ? dateInput.value : ''));
  const currentLocation = locationSelect ? locationSelect.value.trim().toLowerCase() : '';

  if (!currentDate || !currentLocation || !existingAttendance.length) {
    setStatusChip('Provjera', 'info');
    return;
  }

  const found = existingAttendance.some(row => {
    const rowDate = normalizeDate(row.date);
    const rowLoc = (row.location || '').trim().toLowerCase();
    return rowDate === currentDate && rowLoc === currentLocation;
  });

  if (found) {
    setStatusChip('Evidentirano', 'error');
  } else {
    setStatusChip('Novo', 'success');
  }
}

function setDateInputDisplay(isoDate) {
  if (!dateInput) return;
  if (!isoDate) {
    dateInput.value = '';
    if (datePicker) datePicker.value = '';
    currentIsoDate = '';
    return;
  }
  currentIsoDate = toIsoDate(isoDate) || '';
  if (datePicker) datePicker.value = currentIsoDate;
  dateInput.value = currentIsoDate ? formatDateForDisplay(currentIsoDate) : isoDate;
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

function displayGrade(raw) {
  if (!raw) return 'N/A';
  const g = String(raw).trim();
  if (g.toLowerCase().includes('fakultet')) return 'f';
  return g;
}
