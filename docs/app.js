// frontend/app.js
// Frontend logic for the Zlatni Zmaj volunteer roster, attendance entry and stats UI.

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

function getApiBaseOrder() {
  // Prefer the last working base first, then fall back to the default order.
  const bases = getCandidateBases();
  if (!activeApiBase) return bases;
  return [activeApiBase, ...bases.filter(base => base !== activeApiBase)];
}

async function fetchFromApi(path, options = {}) {
  const opts = { headers: {}, ...options };
  const expectJson = opts.expectJson !== false;
  let lastError = null;

  for (const base of getApiBaseOrder()) {
    try {
      const res = await fetch(`${base}${path}`, opts);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      activeApiBase = base;
      return expectJson ? res.json() : res.text();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('No API base responded');
}

// DOM references
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
const statsSummaryEl = document.getElementById('stats-summary');
const statsUpdatedEl = document.getElementById('stats-updated');
const statsChartsEl = document.getElementById('stats-charts');
const statsTables = {
  location: document.getElementById('stats-table-location'),
  school: document.getElementById('stats-table-school'),
  grade: document.getElementById('stats-table-grade')
};
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

// In-memory state
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
let statisticsData = null;
let statsChartInstances = [];
let statsTablesData = {};
let statsSortState = {};

const LOCALE = 'hr';
const LOCALE_COMPARE_OPTIONS = { sensitivity: 'base' };
const MOBILE_MEDIA_QUERY = '(max-width: 720px)';

function compareLocale(a, b) {
  return String(a).localeCompare(String(b), LOCALE, LOCALE_COMPARE_OPTIONS);
}

function clearElement(el) {
  if (el) el.innerHTML = '';
}

function createOption(value, text, { disabled = false, selected = false } = {}) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  if (disabled) option.disabled = true;
  if (selected) option.selected = true;
  return option;
}

function createEmptyRow(colSpan, text) {
  const row = document.createElement('tr');
  row.className = 'empty-row';
  const cell = document.createElement('td');
  cell.colSpan = colSpan;
  cell.textContent = text;
  row.appendChild(cell);
  return row;
}

function createEmptyCard(text) {
  const card = document.createElement('div');
  card.className = 'vol-card empty-card';
  card.textContent = text;
  return card;
}

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

function formatLocationsShort(vol, fallback = 'N/A') {
  const locations = parseLocations(vol);
  if (!locations.length) return fallback;
  return locations
    .map(loc => loc.trim())
    .filter(Boolean)
    .map(loc => loc.charAt(0).toUpperCase())
    .join(', ');
}

function formatLocationsFull(vol, fallback = 'N/A') {
  const locations = parseLocations(vol);
  return locations.length ? locations.join(', ') : fallback;
}

function updateSortIndicators(headers, activeKey, direction, dataAttr) {
  if (!headers.length) return;
  headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
  const active = headers.find(h => h.getAttribute(dataAttr) === activeKey);
  if (active) {
    active.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
  }
}

function renderStatsTableCard(host, tableId, data) {
  if (!host || !data) return;
  host.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'stats-table-card';
  const title = document.createElement('div');
  title.className = 'stats-table-title';
  title.textContent = data.title || '';
  const tableEl = buildStatsTable(data.columns, data.rows, tableId);
  card.appendChild(title);
  card.appendChild(tableEl);
  host.appendChild(card);
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
    'tab-unos': { total: 'Na listi', secondary: 'Oznaceno' },
    'tab-baza': { total: 'Volontera', secondary: 'Sati' },
    'tab-termini': { total: 'Broj termina', secondary: 'Broj djece' },
    'tab-statistika': { total: 'Tablice', secondary: 'Grafovi' }
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
    const totalChildren = existingAttendance.reduce(
      (sum, entry) => sum + (Number.parseInt(entry.childrenCount, 10) || 0),
      0
    );
    const filteredChildren = eventsFiltered.reduce(
      (sum, entry) => sum + (Number.parseInt(entry.childrenCount, 10) || 0),
      0
    );

    totalValue = formatWithTotal(filteredEvents, totalEvents);
    secondaryValue = formatWithTotal(filteredChildren, totalChildren);
  } else if (activeTabId === 'tab-statistika') {
    const tablesCount = (statisticsData && statisticsData.tables ? statisticsData.tables.length : 0) || 0;
    const chartsCount = (statisticsData && statisticsData.charts ? statisticsData.charts.length : 0) || 0;

    totalValue = tablesCount || '-';
    secondaryValue = chartsCount || '-';
  }

  statTotalEl.textContent = totalValue;
  statSelectedEl.textContent = secondaryValue;
}

function updateCounts() {
  refreshHeroStats();
}

function applyResponsiveLayout() {
  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  document.body.classList.toggle('mobile-active', isMobile);
}

function isMobileView() {
  if (document.body.classList.contains('mobile-active')) return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  }
  return false;
}

function formatSchoolNameForDisplay(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'N/A';
  if (trimmed.toUpperCase() === 'N/A') return 'N/A';
  if (!isMobileView()) return trimmed;

  // Mobile: collapse long school names to a consistent short code.
  const canonical = trimmed
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[().]/g, ' ')
    .replace(/[^\p{L}0-9\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const shortMap = {
    'xv gimnazija mioc': 'MIOC',
    'iii gimnazija': 'III. gimnazija',
    'ii gimnazija': 'II. gimnazija',
    'i gimnazija': 'I. gimnazija',
    'gimnazija titusa brezojevica': 'GTB',
    'klasicna gimnazija': 'Klasicna'
  };
  if (shortMap[canonical]) return shortMap[canonical];

  const tokens = canonical
    .split(/\s+/)
    .map(t => t.replace(/[^\p{L}0-9]/gu, ''))
    .filter(Boolean);

  const abbreviation = tokens.map(t => t[0]).join('').toUpperCase();
  if (abbreviation && abbreviation.length < trimmed.length) {
    return abbreviation;
  }

  return trimmed;
}

function buildSchoolTag(school, fallback = 'N/A') {
  const tag = document.createElement('span');
  tag.className = 'pill-tag';
  tag.textContent = formatSchoolNameForDisplay(school || fallback);
  tag.style.background = colorForSchool(school || '');
  tag.style.borderColor = 'rgba(0, 0, 0, 0.05)';
  return tag;
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

  if (targetId === 'tab-statistika' && !statisticsData) {
    loadStatistics();
  }

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
  clearElement(volunteerTableBody);
  clearElement(volunteerCardsEl);

  if (!filteredVolunteers.length) {
    const query = searchInput.value.trim();
    const message = query ? `Nema rezultata za "${query}".` : 'Lista je prazna.';
    volunteerTableBody.appendChild(createEmptyRow(6, message));

    if (volunteerCardsEl) {
      volunteerCardsEl.appendChild(createEmptyCard(message));
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
    const schoolTag = buildSchoolTag(vol.school, 'N/A');
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
    const locText = formatLocationsShort(vol, 'N/A');
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
      const schoolEl = buildSchoolTag(vol.school, 'N/A');
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
  clearElement(bazaTableBody);
  clearElement(bazaCardsEl);

  if (!list.length) {
    bazaTableBody.appendChild(createEmptyRow(6, 'Lista je prazna.'));
    if (bazaCardsEl) {
      bazaCardsEl.appendChild(createEmptyCard('Lista je prazna.'));
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
    const schoolTag = buildSchoolTag(vol.school, 'N/A');
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
    locCell.textContent = formatLocationsFull(vol, 'N/A');
    row.appendChild(locCell);

    const phoneCell = document.createElement('td');
    phoneCell.className = 'col-phone';
    phoneCell.textContent = vol.phone || 'N/A';
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
      const schoolTag = buildSchoolTag(vol.school, 'Skola');
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
      const locationsText = formatLocationsShort(vol, '-');
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

    return sortDirection === 'asc'
      ? compareLocale(valA, valB)
      : compareLocale(valB, valA);
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

    return bazaSortDirection === 'asc'
      ? compareLocale(valA, valB)
      : compareLocale(valB, valA);
  });

  bazaFiltered = list;
  renderVolunteerDatabaseTable(list);
  refreshBazaSortIndicators();
  refreshHeroStats();
}

function refreshBazaSortIndicators() {
  updateSortIndicators(bazaSortableHeaders, bazaSortKey, bazaSortDirection, 'data-baza-sort');
}

function hydrateBazaSchoolFilter() {
  if (!bazaSchoolFilter) return;
  const previous = bazaSchoolFilter.value;
  const schools = Array.from(new Set(allVolunteers.map(v => (v.school || '').trim()).filter(Boolean))).sort(compareLocale);
  clearElement(bazaSchoolFilter);
  bazaSchoolFilter.appendChild(createOption('', 'Sve skole'));
  schools.forEach(s => {
    bazaSchoolFilter.appendChild(createOption(s, s));
  });
  if (previous && schools.includes(previous)) {
    bazaSchoolFilter.value = previous;
  }
}

function hydrateBazaGradeFilter() {
  if (!bazaGradeFilter) return;
  const previous = bazaGradeFilter.value;
  const grades = Array.from(new Set(allVolunteers.map(v => (v.grade || '').toString().trim()).filter(Boolean))).sort(compareLocale);
  clearElement(bazaGradeFilter);
  bazaGradeFilter.appendChild(createOption('', 'Svi razredi'));
  grades.forEach(g => {
    bazaGradeFilter.appendChild(createOption(g, displayGrade(g)));
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

  const locations = Array.from(locs.values()).sort(compareLocale);
  clearElement(bazaLocationFilter);
  bazaLocationFilter.appendChild(createOption('', 'Sve lokacije'));
  locations.forEach(loc => {
    const label = loc.toUpperCase();
    bazaLocationFilter.appendChild(createOption(label, label));
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

  const sorted = Array.from(locationsSet).filter(Boolean).sort(compareLocale);

  clearElement(locationSelect);
  locationSelect.appendChild(
    createOption('', 'Odaberi lokaciju', { disabled: true, selected: true })
  );

  sorted.forEach(loc => {
    locationSelect.appendChild(createOption(loc, loc));
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
    const volunteers = await fetchFromApi('/api/names');

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
          <td colspan="6">Ne mogu ucitati bazu volontera.</td>
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
    const data = await fetchFromApi('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
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
    setDateInputDisplay('');
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
  loadStatistics();
  wireEvents();
  if (dateInput && dateInput.value) {
    setDateInputDisplay(toIsoDate(dateInput.value));
  }
  applyResponsiveLayout();
  window.addEventListener('resize', applyResponsiveLayout);
});

function refreshSortIndicators() {
  updateSortIndicators(sortableHeaders, sortKey, sortDirection, 'data-sort-key');
}

function refreshEventSortIndicators() {
  updateSortIndicators(eventSortableHeaders, eventSortKey, eventSortDirection, 'data-events-sort');
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

    return eventSortDirection === 'asc'
      ? compareLocale(valA, valB)
      : compareLocale(valB, valA);
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
    .sort(compareLocale);

  clearElement(eventsLocationFilter);
  eventsLocationFilter.appendChild(createOption('', 'Sve lokacije'));
  locs.forEach(loc => {
    eventsLocationFilter.appendChild(createOption(loc, loc));
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

  clearElement(eventsYearFilter);
  eventsYearFilter.appendChild(createOption('', 'Sve godine'));
  years.forEach(y => {
    eventsYearFilter.appendChild(createOption(y, y));
  });
  if (previous && years.includes(previous)) {
    eventsYearFilter.value = previous;
  }
}

function renderEventsList(list = eventsFiltered) {
  if (!eventsTableBody) return;
  clearElement(eventsTableBody);
  clearElement(eventsCardsEl);

  if (!list.length) {
    eventsTableBody.appendChild(createEmptyRow(5, 'Evidencija je prazna ili se ucitava.'));
    if (eventsCardsEl) {
      eventsCardsEl.appendChild(createEmptyCard('Evidencija je prazna.'));
    }
    return;
  }

  list.forEach(entry => {
    const row = document.createElement('tr');

    const iso = normalizeDate(entry.date);
    const displayDate = formatDateForDisplay(iso) || entry.date || 'N/A';

    const dateCell = document.createElement('td');
    dateCell.className = 'col-date';
    dateCell.textContent = displayDate;
    row.appendChild(dateCell);

    const locCell = document.createElement('td');
    locCell.className = 'col-location center';
    const locPill = document.createElement('span');
    locPill.className = 'pill-tag';
    locPill.textContent = entry.location || 'N/A';
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
    volunteersCell.textContent = entry.volunteers || 'N/A';
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
    const data = await fetchFromApi('/api/evidencija');
    existingAttendance = Array.isArray(data) ? data : [];
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

function renderStatsSummary(cards = []) {
  if (!statsSummaryEl) return;
  statsSummaryEl.innerHTML = '';
  if (!cards.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nema sazetaka za prikaz.';
    statsSummaryEl.appendChild(empty);
    return;
  }

  cards.forEach(card => {
    const wrap = document.createElement('div');
    wrap.className = 'stats-card';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = card.label || '-';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = card.value || '-';
    wrap.appendChild(label);
    wrap.appendChild(value);
    if (card.delta) {
      const delta = document.createElement('div');
      delta.className = 'delta';
      const deltaText = String(card.delta).trim();
      delta.textContent = deltaText;
      if (deltaText.startsWith('+')) {
        delta.classList.add('positive');
      } else if (deltaText.startsWith('-')) {
        delta.classList.add('negative');
      }
      wrap.appendChild(delta);
    }
    statsSummaryEl.appendChild(wrap);
  });
}

function buildStatsTable(columns = [], rows = [], tableId = '') {
  const numericColumns = columns.map((_, colIdx) => {
    if (!rows.length) return false;
    return rows.every(row => {
      const val = row[colIdx];
      if (val === null || val === undefined || val === '') return true;
      const num = Number.parseFloat(String(val).replace(',', '.'));
      return !Number.isNaN(num);
    });
  });

  const table = document.createElement('table');
  table.className = 'roster-table compact';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col, idx) => {
    const th = document.createElement('th');
    const label = document.createElement('span');
    label.textContent = col;
    th.appendChild(label);
    th.classList.add('sortable');
    if (numericColumns[idx]) {
      th.classList.add('numeric');
    }
    th.tabIndex = 0;
    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    const sortState = statsSortState[tableId];
    if (sortState && sortState.col === idx) {
      indicator.textContent = sortState.dir === 'asc' ? '^' : 'v';
    } else {
      indicator.textContent = '';
    }
    th.appendChild(indicator);
    th.addEventListener('click', () => {
      handleStatsSort(tableId, idx);
    });
    th.addEventListener('keypress', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStatsSort(tableId, idx);
      }
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!rows.length) {
    tbody.appendChild(createEmptyRow(columns.length || 1, 'Nema podataka.'));
  } else {
    rows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach((cell, cellIdx) => {
        const td = document.createElement('td');
        td.setAttribute('data-label', columns[cellIdx] || '');
        if (numericColumns[cellIdx]) {
          td.classList.add('numeric');
        }
        td.textContent = cell || '-';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
  return table;
}

function renderStatsTables(tables = []) {
  const hostMap = {
    'by-location': statsTables.location,
    'by-school': statsTables.school,
    'by-grade': statsTables.grade
  };

  Object.values(hostMap).forEach(host => {
    if (host) host.innerHTML = '';
  });

  statsTablesData = {};

  tables.forEach(table => {
    const host = hostMap[table.id];
    if (!host) return;
    statsTablesData[table.id] = { columns: table.columns, rows: table.rows, title: table.title };
    renderStatsTableCard(host, table.id, statsTablesData[table.id]);
  });
}

function handleStatsSort(tableId, colIndex) {
  const data = statsTablesData[tableId];
  if (!data) return;
  const current = statsSortState[tableId] || { col: colIndex, dir: 'asc' };
  const nextDir = current.col === colIndex && current.dir === 'asc' ? 'desc' : 'asc';
  statsSortState[tableId] = { col: colIndex, dir: nextDir };

  const rows = [...data.rows];
  rows.sort((a, b) => {
    const valA = a[colIndex] || '';
    const valB = b[colIndex] || '';
    const numA = Number.parseFloat(String(valA).replace(',', '.'));
    const numB = Number.parseFloat(String(valB).replace(',', '.'));
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return nextDir === 'asc' ? numA - numB : numB - numA;
    }
    return nextDir === 'asc'
      ? compareLocale(valA, valB)
      : compareLocale(valB, valA);
  });

  statsTablesData[tableId].rows = rows;
  const host =
    tableId === 'by-location'
      ? statsTables.location
      : tableId === 'by-school'
      ? statsTables.school
      : tableId === 'by-grade'
      ? statsTables.grade
      : null;
  if (!host) return;
  renderStatsTableCard(host, tableId, data);
}

function destroyStatsCharts() {
  statsChartInstances.forEach(instance => {
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
    }
  });
  statsChartInstances = [];
}

function renderStatsCharts(charts = []) {
  if (!statsChartsEl) return;
  destroyStatsCharts();
  statsChartsEl.innerHTML = '';

  if (!charts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-row';
    empty.textContent = 'Nema grafova za prikaz.';
    statsChartsEl.appendChild(empty);
    return;
  }

  const palette = ['#7c3aed', '#facc15', '#a855f7', '#fbbf24', '#c084fc', '#fde68a'];

  charts.forEach((chart, chartIndex) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    const title = document.createElement('h4');
    title.textContent = chart.title || 'Graf';
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'chart-canvas';
    if (chartIndex === 1) {
      canvasWrap.style.minHeight = '520px';
      card.style.minHeight = '620px';
    }
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${chart.id || chartIndex}`;
    canvasWrap.appendChild(canvas);
    card.appendChild(title);
    card.appendChild(canvasWrap);
    statsChartsEl.appendChild(card);

    if (typeof Chart !== 'undefined') {
      const isTightBars = chartIndex === 0 || chartIndex === 2;

      const datasets = (chart.datasets || []).map((ds, idx) => {
        const color = palette[idx % palette.length];
        const isLine = ds.type === 'line' || chart.type === 'line';
        const datasetLabel = (ds.label || `Serija ${idx + 1}`).toString().toUpperCase();
        return {
          label: datasetLabel,
          data: ds.data || [],
          type: ds.type || chart.type || 'bar',
          backgroundColor: isLine ? color : `${color}33`,
          borderColor: color,
          borderWidth: 2.5,
          tension: 0.2,
          fill: !isLine,
          borderRadius: isLine ? 0 : 6,
          maxBarThickness: 38,
          categoryPercentage: isLine ? 1 : isTightBars ? 0.45 : 0.7,
          barPercentage: isLine ? 1 : isTightBars ? 0.95 : 0.7
        };
      });

      const xTickRotation =
        chartIndex === 0 || chartIndex === 2
          ? { maxRotation: 0, minRotation: 0 }
          : { maxRotation: 65, minRotation: 55 };

      const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1 }
        },
        scales: {
          y: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { precision: 0 }
          },
          x: {
            grid: { display: false },
            ticks: xTickRotation
          }
        },
        ...chart.options
      };

      const instance = new Chart(canvas.getContext('2d'), {
        type: chart.type || 'bar',
        data: {
          labels: chart.labels || [],
          datasets
        },
        options
      });
      statsChartInstances.push(instance);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'muted';
      fallback.textContent = 'Chart.js nije dostupan.';
      card.appendChild(fallback);
    }
  });
}

function renderStats(payload) {
  if (!payload) return;
  renderStatsSummary(payload.summaryCards || []);
  renderStatsTables(payload.tables || []);
  renderStatsCharts(payload.charts || []);

  if (statsUpdatedEl) {
    const updated = payload.lastUpdated ? new Date(payload.lastUpdated) : null;
    if (updated && !Number.isNaN(updated.getTime())) {
      statsUpdatedEl.textContent = `Azurirano: ${updated.toLocaleString('hr-HR')}`;
    } else {
      statsUpdatedEl.textContent = 'Azurirano: -';
    }
  }
  refreshHeroStats();
}

function renderStatsLoading() {
  if (statsSummaryEl) {
    statsSummaryEl.innerHTML = '<p class=\"muted\">Ucitavanje statistike...</p>';
  }
  if (statsChartsEl) {
    statsChartsEl.innerHTML = '<div class=\"empty-row\">Grafovi se ucitavaju...</div>';
  }
}

function renderStatsError(message) {
  if (statsSummaryEl) {
    statsSummaryEl.innerHTML = `<p class=\"status error\">${message || 'Neuspjelo ucitavanje statistike.'}</p>`;
  }
  if (statsChartsEl) {
    statsChartsEl.innerHTML = '<div class=\"empty-row\">Nije moguce prikazati grafove.</div>';
  }
}

async function loadStatistics() {
  if (!statsSummaryEl && !statsChartsEl) return;
  renderStatsLoading();
  try {
    const data = await fetchFromApi('/api/statistika');
    statisticsData = data;
    renderStats(data);
  } catch (err) {
    console.error('Failed to load statistika', err);
    renderStatsError('Nije moguce dohvatiti statistiku.');
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
    'gimnazija antun gustav matos samobor': '#ffb9c1ff', // red
    'gimnazija lucijana vranjanina': '#b6ffcfff', // green
    'klasicna gimnazija': '#ffea95ff', // yellow
    'prirodoslovna skola vladimir prelog': '#bfe9ff', // cyan
    'privatna umjetnicka gimnazija': '#febff2ff', // blue
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
    'tresnjevka': '#bbf7d0',
    'spansko': '#fecdd3'
  };

  const key = (name || '').trim().toLowerCase();
  if (key && LOCATION_COLOR_MAP[key]) return LOCATION_COLOR_MAP[key];

  const hash = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

