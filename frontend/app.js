// frontend/app.js

/**
 * To only be used if you want Render hosted backend.
const API_BASE_URL = "https://volunteering-app-fc5r.onrender.com";
 */

const API_BASE_URL = "https://volunteering-app-109370863016.europe-west1.run.app";

// Get JSON file elements for the app
const volunteerListEl = document.getElementById('volunteer-list');
const formEl = document.getElementById('attendance-form');
const statusEl = document.getElementById('status');
const volunteerFilterEl = document.getElementById('volunteer-filter');
const volunteerCountEl = document.getElementById('volunteer-count');

let volunteersData = [];
let filteredVolunteers = [];
const selectedVolunteers = new Set();

function updateStatus(message, color = '') {
  statusEl.style.color = color;
  statusEl.textContent = message;
}

function createChip(text, extraClass = '') {
  const chip = document.createElement('span');
  chip.className = `meta-chip ${extraClass}`.trim();
  chip.textContent = text;
  return chip;
}

function updateCountDisplay(list) {
  if (!volunteerCountEl) return;
  const count = list.length;
  volunteerCountEl.textContent = `${count} volontera`;
}

function updateSelectAllButton() {
  const selectAllBtn = document.getElementById('select-all-btn');
  if (!selectAllBtn) return;

  const visible = filteredVolunteers.length ? filteredVolunteers : volunteersData;
  const allVisibleSelected =
    visible.length > 0 && visible.every(vol => selectedVolunteers.has(vol.name));

  selectAllBtn.textContent = allVisibleSelected ? 'Odznači sve' : 'Označi sve';
}

function renderVolunteers(list) {
  const previousScroll = volunteerListEl.scrollTop;
  volunteerListEl.innerHTML = '';

  if (!list.length) {
    const emptyState = document.createElement('p');
    emptyState.textContent = 'Nema rezultata za prikaz.';
    emptyState.className = 'hint';
    volunteerListEl.appendChild(emptyState);
    updateCountDisplay(list);
    updateSelectAllButton();
    return;
  }

  list.forEach((vol, index) => {
    const id = `vol-${index}`;

    const wrapper = document.createElement('label');
    wrapper.className = 'volunteer-item';
    wrapper.htmlFor = id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = vol.name;
    checkbox.id = id;
    checkbox.checked = selectedVolunteers.has(vol.name);

    checkbox.addEventListener('change', e => {
      if (e.target.checked) {
        selectedVolunteers.add(vol.name);
      } else {
        selectedVolunteers.delete(vol.name);
      }
      updateSelectAllButton();
    });

    const content = document.createElement('div');
    content.className = 'volunteer-content';

    const nameRow = document.createElement('div');
    nameRow.className = 'volunteer-name-row';

    const name = document.createElement('span');
    name.className = 'volunteer-name';
    name.textContent = vol.name || 'Nepoznat volonter';

    const grade = document.createElement('span');
    grade.className = 'badge';
    grade.textContent = vol.grade ? `${vol.grade}. razred` : 'Razred nije naveden';

    nameRow.appendChild(name);
    nameRow.appendChild(grade);

    const meta = document.createElement('div');
    meta.className = 'volunteer-meta';

    meta.appendChild(
      createChip(vol.school || 'Škola nije navedena')
    );
    meta.appendChild(
      createChip(vol.location || 'Lokacija nije navedena', 'location')
    );
    meta.appendChild(
      createChip(vol.phone || 'Telefon nije naveden', 'phone')
    );

    content.appendChild(nameRow);
    content.appendChild(meta);

    wrapper.appendChild(checkbox);
    wrapper.appendChild(content);
    volunteerListEl.appendChild(wrapper);
  });

  volunteerListEl.scrollTop = previousScroll;
  updateCountDisplay(list);
  updateSelectAllButton();
}

function applyFilter() {
  const query = (volunteerFilterEl?.value || '').toLowerCase().trim();
  filteredVolunteers = !query
    ? [...volunteersData]
    : volunteersData.filter(vol => {
        const values = [vol.name, vol.school, vol.location, vol.grade].join(' ').toLowerCase();
        return values.includes(query);
      });

  renderVolunteers(filteredVolunteers);
}

/**
 * Fetch volunteer names from the backend and render them as checkboxes.
 */
async function loadVolunteers() {
  updateStatus('Učitavanje popisa volontera...');
  try {
    const res = await fetch(`${API_BASE_URL}/api/names`);
    if (!res.ok) {
      throw new Error('Network response was not ok');
    }
    volunteersData = await res.json();
    filteredVolunteers = [...volunteersData];
    renderVolunteers(filteredVolunteers);
    updateStatus('');
  } catch (err) {
    console.error(err);
    updateStatus('Pogreška pri učitavanju liste volontera.', 'red');
  }
}

function handleReset() {
  selectedVolunteers.clear();
  applyFilter();
}

/**
 * Collect form data and send it to the backend.
 */
async function handleSubmit(event) {
  event.preventDefault(); // prevent page reload

  updateStatus('Spremanje termina u evidenciju...');

  const dateValue = document.getElementById('date').value;
  const locationValue = document.getElementById('location').value;
  const childrenCountValue = document.getElementById('childrenCount').value;
  const volunteerCountValue = document.getElementById('volunteerCount').value;

  const selected = Array.from(selectedVolunteers);

  const payload = {
    selectedDate: dateValue,
    location: locationValue,
    childrenCount: childrenCountValue,
    volunteerCount: volunteerCountValue,
    selected
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await res.json();
    if (data.ok) {
      updateStatus('Termin uspješno upisan u evidenciju!', 'green');

      // Optionally reset form and uncheck volunteers
      formEl.reset();
      selectedVolunteers.clear();
      renderVolunteers(filteredVolunteers);
    } else {
      throw new Error('Server returned an error');
    }
  } catch (err) {
    console.error(err);
    updateStatus('Došlo je do pogreške pri spremanju.', 'red');
  }
}

// On page load, fetch volunteers and set up form handler
document.addEventListener('DOMContentLoaded', () => {
  loadVolunteers();
  formEl.addEventListener('submit', handleSubmit);
  formEl.addEventListener('reset', handleReset);
  if (volunteerFilterEl) {
    volunteerFilterEl.addEventListener('input', applyFilter);
  }
});

const selectAllBtn = document.getElementById('select-all-btn');

if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    const visible = filteredVolunteers.length ? filteredVolunteers : volunteersData;
    const allVisibleSelected =
      visible.length > 0 && visible.every(vol => selectedVolunteers.has(vol.name));

    visible.forEach(vol => {
      if (allVisibleSelected) {
        selectedVolunteers.delete(vol.name);
      } else {
        selectedVolunteers.add(vol.name);
      }
    });

    renderVolunteers(filteredVolunteers);
  });
}