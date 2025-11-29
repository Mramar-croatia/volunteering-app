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

/**
 * Fetch volunteer names from the backend and render them as checkboxes.
 */
async function loadVolunteers() {
  statusEl.textContent = "Učitavanje popisa volontera...";
  try {
    const res = await fetch(`${API_BASE_URL}/api/names`);
    if (!res.ok) {
      throw new Error('Network response was not ok');
    }
    const volunteers = await res.json();

    volunteerListEl.innerHTML = '';

    volunteers.forEach((vol, index) => {
      const id = `vol-${index}`;
      const wrapper = document.createElement('label');
      wrapper.className = 'volunteer-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = vol.name;
      checkbox.id = id;

      const span = document.createElement('span');
      span.textContent = vol.name;

      wrapper.appendChild(checkbox);
      wrapper.appendChild(span);
      volunteerListEl.appendChild(wrapper);
    });

    statusEl.textContent = "";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Pogreška pri učitavanju liste volontera.";
    statusEl.style.color = "red";
  }
}

/**
 * Collect form data and send it to the backend.
 */
async function handleSubmit(event) {
  event.preventDefault(); // prevent page reload

  statusEl.style.color = "";
  statusEl.textContent = "Spremanje termina u evidenciju...";

  const dateValue = document.getElementById('date').value;
  const locationValue = document.getElementById('location').value;
  const childrenCountValue = document.getElementById('childrenCount').value;
  const volunteerCountValue = document.getElementById('volunteerCount').value;

  // Collect selected volunteers
  const selected = [];
  volunteerListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked) {
      selected.push(cb.value);
    }
  });

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
      statusEl.style.color = "green";
      statusEl.textContent = "Termin uspješno upisan u evidenciju!";

      // Optionally reset form and uncheck volunteers
      formEl.reset();
      volunteerListEl
        .querySelectorAll('input[type="checkbox"]')
        .forEach(cb => (cb.checked = false));
    } else {
      throw new Error('Server returned an error');
    }
  } catch (err) {
    console.error(err);
    statusEl.style.color = "red";
    statusEl.textContent = "Došlo je do pogreške pri spremanju.";
  }
}

// On page load, fetch volunteers and set up form handler
document.addEventListener('DOMContentLoaded', () => {
  loadVolunteers();
  formEl.addEventListener('submit', handleSubmit);
});

const selectAllBtn = document.getElementById('select-all-btn');

if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = volunteerListEl.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    // If all are already checked, uncheck them; otherwise check all
    checkboxes.forEach(cb => {
      cb.checked = !allChecked;
    });
  });
}