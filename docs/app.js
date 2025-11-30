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
const bazaTableBody = document.getElementById('baza-table-body');
const bazaSearchInput = document.getElementById('baza-search');
const bazaClearSearchBtn = document.getElementById('baza-clear-search');
const bazaSchoolFilter = document.getElementById('baza-school-filter');
const bazaLocationFilter = document.getElementById('baza-location-filter');
const bazaGradeFilter = document.getElementById('baza-grade-filter');
const bazaCardsEl = document.getElementById('baza-cards');
const eventsCardsEl = document.getElementById('events-cards');
const eventsSearchInput = document.getElementById('events-search');
const eventsClearSearchBtn = document.getElementById('events-clear-search');
const eventsLocationFilter = document.getElementById('events-location-filter');
const eventsYearFilter = document.getElementById('events-year-filter');
const eventsTableBody = document.getElementById('events-table-body');
const tabButtons = document.querySelectorAll('[data-tab-target]');
const tabPanels = document.querySelectorAll('.tab-panel');
const formEl = document.getElementById('attendance-form');
const statusEl = document.getElementById('status');
const statusChip = document.getElementById('status-chip');
const sortToggleBtn = document.getElementById('sort-toggle');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const resetBtn = document.getElementById('reset-btn');
const statTotalEl = document.getElementById('stat-total');
const statSelectedEl = document.getElementById('stat-selected');
const statTotalLabel = document.getElementById('stat-total-label');
const statSelectedLabel = document.getElementById('stat-selected-label');
const locationSelect = document.getElementById('location');
const dateInput = document.getElementById('date'); // visible text input
const datePicker = document.getElementById('date-picker'); // hidden native picker

let allVolunteers = [];
let filteredVolunteers = [];
let bazaFiltered = [];
let selectedNames = new Set();
let sortDirection = 'asc';
let sortKey = 'name';
let selectedLocationFilter = '';
let sortableHeaders = [];
let existingAttendance = [];
let currentIsoDate = '';
let eventSortKey = 'date';
let eventSortDirection = 'desc';
let eventSortableHeaders = [];
let bazaSortKey = 'name';
let bazaSortDirection = 'asc';
let bazaSortableHeaders = [];
let eventsFiltered = [];
let activeTabId = 'tab-baza';

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

function formatWithTotal(current, total) {
  if (Number.isFinite(current) && Number.isFinite(total)) {
    return `${current} (${total})`;
  }
  const safeCurrent = current ?? '-';
  const safeTotal = total ?? '-';
  return `${safeCurrent} (${safeTotal})`;
}

function refreshHeroStats() {
  if (!statTotalEl || !statSelectedEl || !statTotalLabel || !statSelectedLabel) return;

  const labels = {
    'tab-unos': { total: 'Na listi', secondary: 'Označeno' },
    'tab-baza': { total: 'Volontera', secondary: 'Sati' },
    'tab-termini': { total: 'Broj termina', secondary: 'Lokacije' }
  };

  const activeLabels = labels[activeTabId] || labels['tab-unos'];
  statTotalLabel.textContent = activeLabels.total;
  statSelectedLabel.textContent = activeLabels.secondary.toUpperCase();

  let totalValue = '-';
  let secondaryValue = '-';

  if (activeTabId === 'tab-unos') {
    totalValue = allVolunteers.length;
    secondaryValue = selectedNames.size;
  } else if (activeTabId === 'tab-baza') {
    const totalCount = allVolunteers.length;
    const filteredCount = bazaFiltered.length || 0;
    const totalHours = allVolunteers.reduce((sum, v) => sum + (Number.parseFloat(v.hours || '0') || 0), 0);
    const filteredHours = bazaFiltered.reduce((sum, v) => sum + (Number.parseFloat(v.hours || '0') || 0), 0);

    totalValue = formatWithTotal(filteredCount, totalCount);
    secondaryValue = formatWithTotal(filteredHours, totalHours);
  } else if (activeTabId === 'tab-termini') {
    const totalEvents = existingAttendance.length;
    const filteredEvents = eventsFiltered.length || 0;
    const totalLocations = new Set(existingAttendance.map(e => (e.location || '').trim().toLowerCase()).filter(Boolean));
    const filteredLocations = new Set(eventsFiltered.map(e => (e.location || '').trim().toLowerCase()).filter(Boolean));

    totalValue = formatWithTotal(filteredEvents, totalEvents);
    // For Lokacije, show only the filtered unique count (no total).
    secondaryValue = filteredLocations.size || 0;
  }

  statTotalEl.textContent = totalValue;
  statSelectedEl.textContent = secondaryValue;
}

function updateCounts() {
  refreshHeroStats();
}

function applyResponsiveLayout() {
  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  document.body.classList.toggle('mobile-active', isMobile);
}

function setActiveTab(targetId) {
  if (!tabButtons.length || !tabPanels.length) return;
  activeTabId = targetId;

  tabButtons.forEach(btn => {
    const isActive = btn.getAttribute('data-tab-target') === targetId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.tabIndex = isActive ? 0 : -1;
  });

  tabPanels.forEach(panel => {
    const isActive = panel.id === targetId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  refreshHeroStats();
}

function setupTabs() {
  if (!tabButtons.length || !tabPanels.length) return;
  const defaultTab = Array.from(tabButtons).find(btn => btn.classList.contains('active'));
  const initialTarget = defaultTab ? defaultTab.getAttribute('data-tab-target') : (tabButtons[0] && tabButtons[0].getAttribute('data-tab-target'));
  setActiveTab(initialTarget);

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab-target');
      setActiveTab(target);
    });
  });
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
        row.classList.add('selected');
      } else {
        selectedNames.delete(vol.name);
        row.classList.remove('selected');
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

    if (selectedNames.has(vol.name)) {
      row.classList.add('selected');
    }

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

      const meta = document.createElement('div');
      meta.className = 'vol-card-meta';
      const schoolEl = document.createElement('span');
      schoolEl.className = 'pill-tag';
      schoolEl.style.background = colorForSchool(vol.school || '');
      schoolEl.textContent = vol.school || 'N/A';
      meta.appendChild(schoolEl);

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

      const checkboxWrap = document.createElement('label');
      checkboxWrap.className = 'vol-card-presence';
      checkboxWrap.setAttribute('aria-label', `Oznaci ${vol.name} kao prisutnog`);
      const srOnly = document.createElement('span');
      srOnly.className = 'visually-hidden';
      srOnly.textContent = 'Prisutan';
      const mobileCheckbox = document.createElement('input');
      mobileCheckbox.type = 'checkbox';
      mobileCheckbox.value = vol.name;
      mobileCheckbox.checked = selectedNames.has(vol.name);
      mobileCheckbox.className = 'present-checkbox presence-check';

      checkboxWrap.appendChild(srOnly);
      checkboxWrap.appendChild(mobileCheckbox);

      mobileCheckbox.addEventListener('change', ev => {
        if (ev.target.checked) {
          selectedNames.add(vol.name);
          card.classList.add('selected');
        } else {
          selectedNames.delete(vol.name);
          card.classList.remove('selected');
        }
        // sync desktop checkbox
        const desktopCb = volunteerTableBody.querySelector(`input[type="checkbox"][value="${CSS.escape(vol.name)}"]`);
        if (desktopCb) desktopCb.checked = ev.target.checked;
        updateCounts();
      });

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(statsRow);
      card.appendChild(checkboxWrap);
      card.addEventListener('click', ev => {
        if (ev.target.tagName.toLowerCase() === 'input') {
          return;
        }
        mobileCheckbox.checked = !mobileCheckbox.checked;
        mobileCheckbox.dispatchEvent(new Event('change'));
      });

      if (selectedNames.has(vol.name)) {
        card.classList.add('selected');
      }

      volunteerCardsEl.appendChild(card);
    }
  });

  updateCounts();
}

function renderVolunteerDatabaseTable(list = allVolunteers) {
  if (!bazaTableBody) return;
  bazaTableBody.innerHTML = '';
  if (bazaCardsEl) bazaCardsEl.innerHTML = '';

  if (!list.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'Lista je prazna.';
    row.appendChild(cell);
    bazaTableBody.appendChild(row);
    if (bazaCardsEl) {
      const card = document.createElement('div');
      card.className = 'vol-card empty-card';
      card.textContent = 'Lista je prazna.';
      bazaCardsEl.appendChild(card);
    }
    return;
  }

  list.forEach(vol => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.className = 'col-name';
    nameCell.textContent = vol.name || 'N/A';
    row.appendChild(nameCell);

    const schoolCell = document.createElement('td');
    schoolCell.className = 'col-school';
    const schoolTag = document.createElement('span');
    schoolTag.className = 'pill-tag';
    schoolTag.textContent = vol.school || 'N/A';
    schoolTag.style.background = colorForSchool(vol.school || '');
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

    const locCell = document.createElement('td');
    locCell.className = 'col-locations';
    const locationsList = parseLocations(vol);
    locCell.textContent = locationsList.length ? locationsList.join(', ') : '—';
    row.appendChild(locCell);

    const phoneCell = document.createElement('td');
    phoneCell.className = 'col-phone';
    phoneCell.textContent = vol.phone || '—';
    row.appendChild(phoneCell);

    const hoursCell = document.createElement('td');
    hoursCell.className = 'center col-hours';
    hoursCell.textContent = vol.hours || '0';
    row.appendChild(hoursCell);

    bazaTableBody.appendChild(row);

    if (bazaCardsEl) {
      const card = document.createElement('article');
      card.className = 'vol-card baza-card';
      const title = document.createElement('div');
      title.className = 'vol-card-title';
      const nameEl = document.createElement('div');
      nameEl.className = 'vol-card-name';
      nameEl.textContent = vol.name || 'N/A';
      title.appendChild(nameEl);

      const badgeRow = document.createElement('div');
      badgeRow.className = 'pill-row';
      const schoolTag = document.createElement('span');
      schoolTag.className = 'pill-tag';
      schoolTag.style.background = colorForSchool(vol.school || '');
      schoolTag.textContent = vol.school || 'Škola';
      const gradeTag = document.createElement('span');
      gradeTag.className = 'pill-tag grade';
      gradeTag.style.background = colorForGrade(vol.grade || '');
      gradeTag.textContent = `Razred: ${displayGrade(vol.grade)}`;
      const hoursBadge = document.createElement('span');
      hoursBadge.className = 'meta-pill';
      hoursBadge.textContent = `Sati: ${vol.hours || '0'}`;
      badgeRow.appendChild(schoolTag);
      badgeRow.appendChild(gradeTag);
      badgeRow.appendChild(hoursBadge);

      const meta = document.createElement('div');
      meta.className = 'vol-card-meta';
      const loc = parseLocations(vol);
      const locationsText = loc.length
        ? loc
            .map(l => l.trim())
            .filter(Boolean)
            .map(l => l.charAt(0).toUpperCase())
            .join(', ')
        : (vol.location || '').trim()
          ? (vol.location || '')
              .split(',')
              .map(l => l.trim())
              .filter(Boolean)
              .map(l => l.charAt(0).toUpperCase())
              .join(', ')
          : '-';
      meta.innerHTML = `
        <div class="meta-line"><strong>Lokacije:</strong> ${locationsText}</div>
        <div class="meta-line"><strong>Kontakt:</strong> ${vol.phone || '-'}</div>
      `;

      card.appendChild(title);
      card.appendChild(badgeRow);
      card.appendChild(meta);
      bazaCardsEl.appendChild(card);
    }
  });
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

    if (sortKey === 'grade' || sortKey === 'hours') {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }

    const compare = (first, second) =>
      first.localeCompare(second, 'hr', { sensitivity: 'base' });

    return sortDirection === 'asc'
      ? compare(valA.toString(), valB.toString())
      : compare(valB.toString(), valA.toString());
  });

  filteredVolunteers = list;
  renderVolunteers();
  refreshSortIndicators();
  applyBazaFilters();
}

function toggleSort() {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  sortToggleBtn.textContent = sortDirection === 'asc' ? 'A-Z' : 'Z-A';
  refreshSortIndicators();
  applyFilters();
}

function applyBazaFilters() {
  let list = [...allVolunteers];
  const query = bazaSearchInput ? bazaSearchInput.value.trim().toLowerCase() : '';
  const schoolFilter = bazaSchoolFilter ? bazaSchoolFilter.value.trim().toLowerCase() : '';
  const gradeFilter = bazaGradeFilter ? bazaGradeFilter.value.trim().toLowerCase() : '';
  const locationFilter = bazaLocationFilter ? bazaLocationFilter.value.trim().toLowerCase() : '';

  if (query) {
    list = list.filter(vol => {
      const haystack = [
        vol.name || '',
        vol.school || '',
        vol.grade || '',
        Array.isArray(vol.locations) ? vol.locations.join(',') : vol.locations || '',
        vol.location || '',
        vol.phone || '',
        vol.hours || ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  if (schoolFilter) {
    list = list.filter(vol => (vol.school || '').trim().toLowerCase() === schoolFilter);
  }

  if (gradeFilter) {
    list = list.filter(vol => (vol.grade || '').toString().trim().toLowerCase() === gradeFilter);
  }

  if (locationFilter) {
    list = list.filter(vol => {
      const locations = parseLocations(vol).map(l => l.toLowerCase());
      const single = (vol.location || '').trim().toLowerCase();
      return locations.includes(locationFilter) || single === locationFilter;
    });
  }

  list.sort((a, b) => {
    const getValue = vol => {
      switch (bazaSortKey) {
        case 'school':
          return (vol.school || '').toString();
        case 'grade':
          return Number.parseInt(vol.grade, 10) || 0;
        case 'locations':
          return parseLocations(vol).join(', ');
        case 'phone':
          return (vol.phone || '').toString();
        case 'hours':
          return Number.parseFloat(vol.hours || '0') || 0;
        case 'name':
        default:
          return (vol.name || '').toString();
      }
    };
    const valA = getValue(a);
    const valB = getValue(b);

    if (bazaSortKey === 'grade' || bazaSortKey === 'hours') {
      return bazaSortDirection === 'asc' ? valA - valB : valB - valA;
    }

    const compare = (first, second) =>
      first.toString().localeCompare(second.toString(), 'hr', { sensitivity: 'base' });

    return bazaSortDirection === 'asc' ? compare(valA, valB) : compare(valB, valA);
  });

  bazaFiltered = list;
  renderVolunteerDatabaseTable(list);
  refreshBazaSortIndicators();
  refreshHeroStats();
}

function refreshBazaSortIndicators() {
  if (!bazaSortableHeaders.length) return;
  bazaSortableHeaders.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
  const active = bazaSortableHeaders.find(h => h.getAttribute('data-baza-sort') === bazaSortKey);
  if (active) {
    active.classList.add(bazaSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
  }
}

function hydrateBazaSchoolFilter() {
  if (!bazaSchoolFilter) return;
  const previous = bazaSchoolFilter.value;
  const schools = Array.from(new Set(allVolunteers.map(v => (v.school || '').trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'hr', { sensitivity: 'base' })
  );
  bazaSchoolFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Sve škole';
  bazaSchoolFilter.appendChild(allOpt);
  schools.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    bazaSchoolFilter.appendChild(opt);
  });
  if (previous && schools.includes(previous)) {
    bazaSchoolFilter.value = previous;
  }
}

function hydrateBazaGradeFilter() {
  if (!bazaGradeFilter) return;
  const previous = bazaGradeFilter.value;
  const grades = Array.from(new Set(allVolunteers.map(v => (v.grade || '').toString().trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'hr', { sensitivity: 'base' })
  );
  bazaGradeFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Svi razredi';
  bazaGradeFilter.appendChild(allOpt);
  grades.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = displayGrade(g);
    bazaGradeFilter.appendChild(opt);
  });
  if (previous && grades.includes(previous)) {
    bazaGradeFilter.value = previous;
  }
}

function hydrateBazaLocationFilter() {
  if (!bazaLocationFilter) return;
  const previous = bazaLocationFilter.value;
  const locs = new Map(); // key: lowercase, value: display form
  allVolunteers.forEach(v => {
    const parsed = parseLocations(v);
    if (parsed.length) {
      parsed.forEach(loc => {
        const key = loc.trim().toLowerCase();
        if (key && !locs.has(key)) locs.set(key, loc.trim());
      });
    }
    if (v.location) {
      String(v.location)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(loc => {
          const key = loc.toLowerCase();
          if (!locs.has(key)) locs.set(key, loc);
        });
    }
  });

  const locations = Array.from(locs.values()).sort((a, b) =>
    a.localeCompare(b, 'hr', { sensitivity: 'base' })
  );
  bazaLocationFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Sve lokacije';
  bazaLocationFilter.appendChild(allOpt);
  locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.toUpperCase();
    opt.textContent = loc.toUpperCase();
    bazaLocationFilter.appendChild(opt);
  });
  if (previous && locations.includes(previous)) {
    bazaLocationFilter.value = previous.toUpperCase();
  }
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

function deselectAllSelected() {
  if (!selectedNames.size) return;
  selectedNames.clear();
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
      throw lastError || new Error('Nije pronadjen dostupni backend');
    }

    allVolunteers = volunteers;
    filteredVolunteers = [...allVolunteers];
    bazaFiltered = [...allVolunteers];
    renderVolunteers();
    hydrateBazaSchoolFilter();
    hydrateBazaGradeFilter();
    hydrateBazaLocationFilter();
    applyBazaFilters();
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
    if (bazaTableBody) {
      bazaTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="6">Ne mogu ucitati bazu.</td>
        </tr>`;
    }
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
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', deselectAllSelected);
  }

  searchInput.addEventListener('input', () => {
    applyFilters();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilters();
  });

  if (bazaSearchInput) {
    bazaSearchInput.addEventListener('input', applyBazaFilters);
  }
  if (bazaClearSearchBtn) {
    bazaClearSearchBtn.addEventListener('click', () => {
      bazaSearchInput.value = '';
      applyBazaFilters();
    });
  }
  if (bazaSchoolFilter) {
    bazaSchoolFilter.addEventListener('change', applyBazaFilters);
  }
  if (bazaGradeFilter) {
    bazaGradeFilter.addEventListener('change', applyBazaFilters);
  }
  if (bazaLocationFilter) {
    bazaLocationFilter.addEventListener('change', applyBazaFilters);
  }

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

  eventSortableHeaders = Array.from(document.querySelectorAll('[data-events-sort]'));
  eventSortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const key = header.getAttribute('data-events-sort');
      if (eventSortKey === key) {
        eventSortDirection = eventSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        eventSortKey = key;
        eventSortDirection = key === 'date' ? 'desc' : 'asc';
      }
      refreshEventSortIndicators();
      applyEventsFilters();
    });
  });
  refreshEventSortIndicators();

  bazaSortableHeaders = Array.from(document.querySelectorAll('[data-baza-sort]'));
  bazaSortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const key = header.getAttribute('data-baza-sort');
      if (bazaSortKey === key) {
        bazaSortDirection = bazaSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        bazaSortKey = key;
        bazaSortDirection = 'asc';
      }
      refreshBazaSortIndicators();
      applyBazaFilters();
    });
  });
  refreshBazaSortIndicators();

  if (eventsSearchInput) {
    eventsSearchInput.addEventListener('input', applyEventsFilters);
  }
  if (eventsClearSearchBtn) {
    eventsClearSearchBtn.addEventListener('click', () => {
      eventsSearchInput.value = '';
      applyEventsFilters();
    });
  }
  if (eventsLocationFilter) {
    eventsLocationFilter.addEventListener('change', applyEventsFilters);
  }
  if (eventsYearFilter) {
    eventsYearFilter.addEventListener('change', applyEventsFilters);
  }

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
  setupTabs();
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

function refreshEventSortIndicators() {
  if (!eventSortableHeaders.length) return;
  eventSortableHeaders.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
  const active = eventSortableHeaders.find(h => h.getAttribute('data-events-sort') === eventSortKey);
  if (active) {
    active.classList.add(eventSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
  }
}

function applyEventsFilters() {
  let list = [...existingAttendance];
  const query = eventsSearchInput ? eventsSearchInput.value.trim().toLowerCase() : '';
  const locFilter = eventsLocationFilter ? eventsLocationFilter.value.trim().toLowerCase() : '';
  const yearFilter = eventsYearFilter ? eventsYearFilter.value.trim() : '';

  if (query) {
    list = list.filter(entry => {
      const haystack = [
        entry.date || '',
        entry.location || '',
        entry.volunteers || '',
        entry.childrenCount || '',
        entry.volunteerCount || ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  if (locFilter) {
    list = list.filter(entry => (entry.location || '').trim().toLowerCase() === locFilter);
  }

  if (yearFilter) {
    list = list.filter(entry => {
      const iso = normalizeDate(entry.date);
      if (!iso) return false;
      return iso.split('-')[0] === yearFilter;
    });
  }

  list.sort((a, b) => {
    const getValue = entry => {
      switch (eventSortKey) {
        case 'location':
          return (entry.location || '').toString();
        case 'childrenCount':
          return Number.parseInt(entry.childrenCount, 10) || 0;
        case 'volunteerCount':
          return Number.parseInt(entry.volunteerCount, 10) || 0;
        case 'volunteers':
          return (entry.volunteers || '').toString();
        case 'date':
        default: {
          const iso = normalizeDate(entry.date);
          return iso ? new Date(iso).getTime() : 0;
        }
      }
    };

    const valA = getValue(a);
    const valB = getValue(b);

    if (typeof valA === 'number' && typeof valB === 'number') {
      return eventSortDirection === 'asc' ? valA - valB : valB - valA;
    }

    const compare = (first, second) =>
      first.toString().localeCompare(second.toString(), 'hr', { sensitivity: 'base' });

    return eventSortDirection === 'asc' ? compare(valA, valB) : compare(valB, valA);
  });

  eventsFiltered = list;
  renderEventsList(list);
  refreshHeroStats();
}

function hydrateEventsLocationFilter() {
  if (!eventsLocationFilter) return;
  const previous = eventsLocationFilter.value;
  const locs = Array.from(
    new Set(
      existingAttendance
        .map(e => (e.location || '').trim())
        .filter(Boolean)
        .map(l => l.toLowerCase())
    )
  )
    .map(l => l.toUpperCase())
    .sort((a, b) => a.localeCompare(b, 'hr', { sensitivity: 'base' }));

  eventsLocationFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Sve lokacije';
  eventsLocationFilter.appendChild(allOpt);
  locs.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    eventsLocationFilter.appendChild(opt);
  });
  if (previous && locs.includes(previous.toUpperCase())) {
    eventsLocationFilter.value = previous.toUpperCase();
  }
}

function hydrateEventsYearFilter() {
  if (!eventsYearFilter) return;
  const previous = eventsYearFilter.value;
  const years = Array.from(
    new Set(
      existingAttendance
        .map(e => normalizeDate(e.date))
        .filter(Boolean)
        .map(d => d.split('-')[0])
    )
  ).sort();

  eventsYearFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Sve godine';
  eventsYearFilter.appendChild(allOpt);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    eventsYearFilter.appendChild(opt);
  });
  if (previous && years.includes(previous)) {
    eventsYearFilter.value = previous;
  }
}

function renderEventsList(list = eventsFiltered) {
  if (!eventsTableBody) return;
  eventsTableBody.innerHTML = '';
  if (eventsCardsEl) eventsCardsEl.innerHTML = '';

  if (!list.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Evidencija je prazna ili se ucitava.';
    row.appendChild(cell);
    eventsTableBody.appendChild(row);
    if (eventsCardsEl) {
      const card = document.createElement('div');
      card.className = 'vol-card empty-card';
      card.textContent = 'Evidencija je prazna.';
      eventsCardsEl.appendChild(card);
    }
    return;
  }

  list.forEach(entry => {
    const row = document.createElement('tr');

    const iso = normalizeDate(entry.date);
    const displayDate = formatDateForDisplay(iso) || entry.date || '—';

    const dateCell = document.createElement('td');
    dateCell.className = 'col-date';
    dateCell.textContent = displayDate;
    row.appendChild(dateCell);

    const locCell = document.createElement('td');
    locCell.className = 'col-location center';
    const locPill = document.createElement('span');
    locPill.className = 'pill-tag';
    locPill.textContent = entry.location || '—';
    locPill.style.background = colorForLocationName(entry.location || '');
    locPill.style.borderColor = 'rgba(0,0,0,0.05)';
    locCell.appendChild(locPill);
    row.appendChild(locCell);

    const childCell = document.createElement('td');
    childCell.className = 'center col-number';
    childCell.textContent = entry.childrenCount || '0';
    row.appendChild(childCell);

    const volCountCell = document.createElement('td');
    volCountCell.className = 'center col-number';
    volCountCell.textContent = entry.volunteerCount || '0';
    row.appendChild(volCountCell);

    const volunteersCell = document.createElement('td');
    volunteersCell.className = 'col-volunteers';
    volunteersCell.textContent = entry.volunteers || '—';
    row.appendChild(volunteersCell);

    eventsTableBody.appendChild(row);

    if (eventsCardsEl) {
      const card = document.createElement('article');
      card.className = 'vol-card event-card';
      const header = document.createElement('div');
      header.className = 'vol-card-title';
      const nameEl = document.createElement('div');
      nameEl.className = 'vol-card-name';
      nameEl.textContent = displayDate || 'Datum';
      const locPillCard = document.createElement('span');
      locPillCard.className = 'pill-tag';
      locPillCard.textContent = entry.location || 'Lokacija';
      locPillCard.style.background = colorForLocationName(entry.location || '');
      locPillCard.style.borderColor = 'rgba(0,0,0,0.05)';
      header.appendChild(locPillCard);
      header.appendChild(nameEl);

      const meta = document.createElement('div');
      meta.className = 'vol-card-meta';
      meta.innerHTML = `
        <div class="meta-line"><strong>Djeca:</strong> ${entry.childrenCount || '0'}</div>
        <div class="meta-line"><strong>Volonteri:</strong> ${entry.volunteerCount || '0'}</div>
        <div class="meta-line"><strong>Popis:</strong> ${entry.volunteers || '-'}</div>
      `;

      card.appendChild(header);
      card.appendChild(meta);
      eventsCardsEl.appendChild(card);
    }
  });

  refreshEventSortIndicators();
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
    eventsFiltered = [...existingAttendance];
  } catch (err) {
    console.error('Failed to load evidencija', err);
    existingAttendance = [];
    eventsFiltered = [];
  } finally {
    hydrateEventsLocationFilter();
    hydrateEventsYearFilter();
    applyEventsFilters();
    refreshHeroStats();
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
    '#bfdbfe', // blue
    '#bbf7d0', // green
    '#fecdd3', // red
    '#ddd6fe', // purple
    '#fef3c7', // yellow
    '#e2e8f0', // grey
    '#fce7f3', // pink
    '#fed7aa', // orange
    '#c4b5fd', // violet
    '#bfe9ff', // cyan
    '#4b5563'  // dark
  ];

  const SCHOOL_COLOR_MAP = {
    'gimnazija antun gustav matoš samobor': '#fecdd3', // red
    'gimnazija lucijana vranjanina': '#bbf7d0', // green
    'klasična gimnazija': '#fef3c7', // yellow
    'prirodoslovna škola vladimir prelog': '#bfe9ff', // cyan
    'privatna umjetnička gimnazija': '#bfdbfe', // blue
    'xv. gimnazija (mioc)': '#93c5fd' // blue
  };

  const key = (school || '').trim().toLowerCase();
  if (key && SCHOOL_COLOR_MAP[key]) return SCHOOL_COLOR_MAP[key];

  // Fallback deterministic color
  const hash = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
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

function colorForLocationName(name) {
  const palette = [
    '#bfdbfe', // blue
    '#fef3c7', // yellow
    '#ddd6fe', // purple
    '#bbf7d0', // green
    '#fecdd3', // red
    '#e2e8f0',
    '#fce7f3',
    '#fed7aa',
    '#c4b5fd',
    '#bfe9ff'
  ];

  const LOCATION_COLOR_MAP = {
    'mioc': '#bfdbfe',
    'kralj tomislav': '#fef3c7',
    'samobor': '#ddd6fe',
    'trešnjevka': '#bbf7d0',
    'špansko': '#fecdd3'
  };

  const key = (name || '').trim().toLowerCase();
  if (key && LOCATION_COLOR_MAP[key]) return LOCATION_COLOR_MAP[key];

  const hash = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}
