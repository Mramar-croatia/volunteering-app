// backend/server.js
// Express API that proxies volunteer data to Google Sheets.

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 8080;

// Environment-driven configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const ROSTER_RANGE = 'BAZA!A2:I';
const ATTENDANCE_SHEET = 'EVIDENCIJA';
const ATTENDANCE_RANGE = `${ATTENDANCE_SHEET}!A:E`;
const ATTENDANCE_HEADER_RANGE = `${ATTENDANCE_SHEET}!A1:E1`;
const ATTENDANCE_HEADERS = ['DATUM', 'LOKACIJA', 'BROJ DJECE', 'BROJ VOLONTERA', 'VOLONTERI'];

// Column indexes for the published STATISTIKA TSV export
const STATS_COLUMNS = {
  location: 0,
  locationChildren: 1,
  locationVolunteers: 2,
  locationSessions: 3,
  locationPctChildren: 4,
  locationPctVolunteers: 5,
  locationRatio: 6,
  schoolName: 8,
  schoolVolunteers: 9,
  schoolActive: 10,
  schoolPctActive: 11,
  schoolArrivals: 12,
  schoolPctHours: 13,
  gradeName: 15,
  gradeVolunteers: 16,
  gradeActive: 17,
  gradePctActive: 18,
  gradeArrivals: 19,
  gradePctHours: 20,
  metricType: 22,
  metricRecorded: 23,
  metricCalculated: 24,
  summaryLabel: 26,
  summaryValue: 27
};

// Public STATISTIKA sheet (published TSV)
const STATS_TSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSVWywHd-Rw3go4LqK8WnV3BK7NPeUI-2NSZa65De3XmY8Ka4k2VmQaq_iNfEojwgFbM7pYnkBvIu-S/pub?gid=425993995&single=true&output=tsv';

if (!SPREADSHEET_ID) {
  console.warn('Warning: SPREADSHEET_ID is not set. API calls will fail until it is provided.');
}

app.use(cors()); // allow frontend calls from another domain
app.use(express.json()); // parse JSON request bodies

// --- Google Sheets helpers --------------------------------------------------

function getAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    console.error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY env vars');
    throw new Error('Missing Google service account credentials');
  }

  // The key arrives with literal "\n" sequences; restore them to real newlines.
  const privateKey = rawKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  await auth.authorize(); // ensures the key is used immediately
  return google.sheets({ version: 'v4', auth });
}

function assertSpreadsheetId(res) {
  if (!SPREADSHEET_ID) {
    res.status(500).json({ error: 'Missing SPREADSHEET_ID env var' });
    return false;
  }
  return true;
}

async function ensureAttendanceSheet(sheetsClient) {
  // Create the attendance sheet on first run so later writes succeed.
  const spreadsheet = await sheetsClient.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const sheetExists = (spreadsheet.data.sheets || []).some(
    s => s.properties && s.properties.title === ATTENDANCE_SHEET
  );

  if (sheetExists) return;

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: ATTENDANCE_SHEET } } }]
    }
  });

  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: ATTENDANCE_HEADER_RANGE,
    valueInputOption: 'RAW',
    requestBody: { values: [ATTENDANCE_HEADERS] }
  });
}

// --- Formatting helpers -----------------------------------------------------

function formatDateToISO(input) {
  if (!input) return '';
  const trimmed = input.toString().trim().replace(/\./g, '/').replace(/\s+/g, '');
  const cleaned = trimmed.replace(/\/+$/, '');
  if (cleaned.includes('-')) return cleaned; // already ISO-ish

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map(p => p.padStart(2, '0'));
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

function formatDateToDDMMYYYY(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function validateAttendancePayload(data) {
  if (!data) return { ok: false, message: 'Missing request body' };

  const isoDate = formatDateToISO(data.selectedDate || data.date || '');
  if (!isoDate) return { ok: false, message: 'selectedDate is required (yyyy-mm-dd or dd/mm/yyyy)' };

  const location = (data.location || '').trim();
  if (!location) return { ok: false, message: 'location is required' };

  return {
    ok: true,
    payload: {
      date: formatDateToDDMMYYYY(isoDate),
      location,
      childrenCount: data.childrenCount || '',
      volunteerCount: data.volunteerCount || '',
      selectedNames: Array.isArray(data.selected) ? data.selected.join(', ') : ''
    }
  };
}

function cleanCell(cell = '') {
  if (cell === undefined || cell === null) return '';
  return cell.toString().replace(/\ufeff/g, '').trim();
}

function toNumber(value) {
  const text = cleanCell(value);
  if (!text) return null;
  const normalized = text
    .replace(/\./g, '') // drop thousand separators if present
    .replace(/,/g, '.')
    .replace(/%/g, '')
    .replace(/\s+/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- Statistics parsing (STATISTIKA sheet) ---------------------------------

function parseTsvRows(tsvText) {
  return tsvText
    .split(/\r?\n/)
    .map(line => line.split('\t'))
    .filter(row => row.length && row.some(cell => cleanCell(cell)));
}

function collectStatRows(dataRows) {
  const locationRows = [];
  const schoolRows = [];
  const gradeRows = [];
  const extraCards = [];
  const metrics = {
    volunteersRecorded: null,
    volunteersCalculated: null,
    childrenRecorded: null,
    childrenCalculated: null,
    totalVolunteers: null,
    activeVolunteers: null,
    pctActive: null
  };

  for (const row of dataRows) {
    const location = cleanCell(row[STATS_COLUMNS.location]);
    if (location) {
      locationRows.push({
        location,
        children: cleanCell(row[STATS_COLUMNS.locationChildren]),
        volunteers: cleanCell(row[STATS_COLUMNS.locationVolunteers]),
        sessions: cleanCell(row[STATS_COLUMNS.locationSessions]),
        pctChildren: cleanCell(row[STATS_COLUMNS.locationPctChildren]),
        pctVolunteers: cleanCell(row[STATS_COLUMNS.locationPctVolunteers]),
        ratio: cleanCell(row[STATS_COLUMNS.locationRatio])
      });
    }

    const school = cleanCell(row[STATS_COLUMNS.schoolName]);
    if (school) {
      schoolRows.push({
        school,
        volunteers: cleanCell(row[STATS_COLUMNS.schoolVolunteers]),
        active: cleanCell(row[STATS_COLUMNS.schoolActive]),
        pctActive: cleanCell(row[STATS_COLUMNS.schoolPctActive]),
        arrivals: cleanCell(row[STATS_COLUMNS.schoolArrivals]),
        pctHours: cleanCell(row[STATS_COLUMNS.schoolPctHours])
      });
    }

    const grade = cleanCell(row[STATS_COLUMNS.gradeName]);
    if (grade) {
      gradeRows.push({
        grade,
        volunteers: cleanCell(row[STATS_COLUMNS.gradeVolunteers]),
        active: cleanCell(row[STATS_COLUMNS.gradeActive]),
        pctActive: cleanCell(row[STATS_COLUMNS.gradePctActive]),
        arrivals: cleanCell(row[STATS_COLUMNS.gradeArrivals]),
        pctHours: cleanCell(row[STATS_COLUMNS.gradePctHours])
      });
    }

    const metricType = cleanCell(row[STATS_COLUMNS.metricType]).toUpperCase();
    const recorded = cleanCell(row[STATS_COLUMNS.metricRecorded]);
    const calculated = cleanCell(row[STATS_COLUMNS.metricCalculated]);
    if (metricType === 'VOLONTERI') {
      if (recorded) metrics.volunteersRecorded = recorded;
      if (calculated) metrics.volunteersCalculated = calculated;
    } else if (metricType === 'DJECA') {
      if (recorded) metrics.childrenRecorded = recorded;
      if (calculated) metrics.childrenCalculated = calculated;
    }

    const summaryLabel = cleanCell(row[STATS_COLUMNS.summaryLabel]);
    const summaryValue = cleanCell(row[STATS_COLUMNS.summaryValue]);
    if (summaryLabel && summaryValue) {
      const upper = summaryLabel.toUpperCase();
      if (upper === 'VOLONTERI') {
        metrics.totalVolunteers = summaryValue;
      } else if (upper === 'AKTIVNI VOLONTERI') {
        metrics.activeVolunteers = summaryValue;
      } else if (upper === 'POSTOTAK AKTIVNIH') {
        metrics.pctActive = summaryValue;
      } else {
        extraCards.push({ label: summaryLabel, value: summaryValue });
      }
    }
  }

  return { locationRows, schoolRows, gradeRows, metrics, extraCards };
}

function buildSummaryCards(metrics, extraCards) {
  const cards = [...extraCards];
  const volunteerHours = metrics.volunteersCalculated || metrics.volunteersRecorded;
  const childrenArrivals = metrics.childrenCalculated || metrics.childrenRecorded;

  if (volunteerHours) {
    const mismatch =
      metrics.volunteersCalculated &&
      metrics.volunteersRecorded &&
      metrics.volunteersCalculated !== metrics.volunteersRecorded;
    cards.push({
      label: 'VOLONTERSKI SATI',
      value: volunteerHours,
      delta: mismatch ? `Biljezeno: ${metrics.volunteersRecorded}` : null
    });
  }

  if (childrenArrivals) {
    const mismatch =
      metrics.childrenCalculated &&
      metrics.childrenRecorded &&
      metrics.childrenCalculated !== metrics.childrenRecorded;
    cards.push({
      label: 'DOLASCI DJECE',
      value: childrenArrivals,
      delta: mismatch ? `Biljezeno: ${metrics.childrenRecorded}` : null
    });
  }

  if (metrics.totalVolunteers) {
    cards.push({ label: 'BROJ VOLONTERA', value: metrics.totalVolunteers });
  }
  if (metrics.activeVolunteers) {
    cards.push({ label: 'AKTIVNI VOLONTERI', value: metrics.activeVolunteers });
  }
  if (metrics.pctActive) {
    const pctVal = metrics.pctActive.endsWith('%') ? metrics.pctActive : `${metrics.pctActive}%`;
    cards.push({ label: 'POSTOTAK AKTIVNIH', value: pctVal });
  }

  const childrenNum = toNumber(childrenArrivals);
  const volunteerNum = toNumber(volunteerHours);
  if (childrenNum !== null && volunteerNum !== null && volunteerNum !== 0) {
    const ratio = childrenNum / volunteerNum;
    cards.push({ label: 'OMJER', value: ratio.toFixed(2).replace('.', ',') });
  }

  return cards;
}

function buildStatTables(locationRows, schoolRows, gradeRows) {
  return [
    {
      id: 'by-location',
      title: 'Po lokaciji',
      columns: [
        'Lokacija',
        'Djeca',
        'Volonteri',
        'Odrzani termini',
        'Postotak djece',
        'Postotak volontera',
        'Omjer'
      ],
      rows: locationRows.map(r => [
        r.location,
        r.children,
        r.volunteers,
        r.sessions,
        r.pctChildren,
        r.pctVolunteers,
        r.ratio
      ])
    },
    {
      id: 'by-school',
      title: 'Po skoli',
      columns: ['Skola', 'Volonteri', 'Aktivni', 'Postotak aktivnih', 'Broj dolazaka', 'Postotak sati'],
      rows: schoolRows.map(r => [r.school, r.volunteers, r.active, r.pctActive, r.arrivals, r.pctHours])
    },
    {
      id: 'by-grade',
      title: 'Po razredu',
      columns: ['Razred', 'Volonteri', 'Aktivni', 'Postotak aktivnih', 'Broj dolazaka', 'Postotak sati'],
      rows: gradeRows.map(r => [r.grade, r.volunteers, r.active, r.pctActive, r.arrivals, r.pctHours])
    }
  ];
}

function buildStatCharts(locationRows, schoolRows, gradeRows) {
  const charts = [];

  if (locationRows.length) {
    charts.push({
      id: 'location-children-volunteers',
      title: 'Djeca i volonteri po lokaciji',
      type: 'bar',
      labels: locationRows.map(r => r.location),
      datasets: [
        { label: 'Djeca', data: locationRows.map(r => toNumber(r.children) || 0) },
        { label: 'Volonteri', data: locationRows.map(r => toNumber(r.volunteers) || 0) }
      ]
    });
  }

  if (schoolRows.length) {
    const filteredSchools = schoolRows.filter(r => (toNumber(r.arrivals) || 0) >= 10) || [];
    const rowsForChart = filteredSchools.length ? filteredSchools : schoolRows;
    charts.push({
      id: 'school-active',
      title: 'Aktivni volonteri po skoli',
      type: 'bar',
      labels: rowsForChart.map(r => r.school),
      datasets: [
        { label: 'Aktivni', data: rowsForChart.map(r => toNumber(r.active) || 0) },
        { label: 'Dolazaka', data: rowsForChart.map(r => toNumber(r.arrivals) || 0) }
      ]
    });
  }

  if (gradeRows.length) {
    charts.push({
      id: 'grade-active-share',
      title: 'Aktivni po razredu',
      type: 'bar',
      labels: gradeRows.map(r => r.grade),
      datasets: [
        { label: 'Aktivni', data: gradeRows.map(r => toNumber(r.active) || 0) },
        { label: 'Dolazaka', data: gradeRows.map(r => toNumber(r.arrivals) || 0) }
      ]
    });
  }

  return charts;
}

function buildStatFilters(locationRows, schoolRows, gradeRows) {
  return {
    locations: locationRows.map(r => r.location),
    schools: schoolRows.map(r => r.school),
    grades: gradeRows.map(r => r.grade)
  };
}

function parseStatisticsTsv(tsvText) {
  if (!tsvText) return null;

  const rows = parseTsvRows(tsvText);
  const headerIndex = rows.findIndex(row => cleanCell(row[0]).toUpperCase() === 'LOKACIJA');
  if (headerIndex === -1) return null;

  const dataRows = rows.slice(headerIndex + 1);
  const { locationRows, schoolRows, gradeRows, metrics, extraCards } = collectStatRows(dataRows);

  return {
    summaryCards: buildSummaryCards(metrics, extraCards),
    tables: buildStatTables(locationRows, schoolRows, gradeRows),
    charts: buildStatCharts(locationRows, schoolRows, gradeRows),
    filters: buildStatFilters(locationRows, schoolRows, gradeRows)
  };
}

// --- Routes -----------------------------------------------------------------

/**
 * GET /api/names
 * Reads volunteers from BAZA!A2:I and returns an array of objects:
 * [{ name, school, grade, location, phone, hours }, ...]
 */
app.get('/api/names', async (req, res) => {
  if (!assertSpreadsheetId(res)) return;
  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: ROSTER_RANGE // Name, School, Grade, Location, Phone, Hours (col I)
    });

    const rows = response.data.values || [];

    const result = rows
      .filter(row => row[0] && row[0].toString().trim() !== '')
      .map(row => ({
        name: row[0] || '',
        school: row[1] || '',
        grade: row[2] || '',
        location: row[3] || '',
        phone: row[4] || '',
        hours: row[8] || ''
      }));

    res.json(result);
  } catch (err) {
    console.error('Error in /api/names:', err);
    res.status(500).json({ error: 'Failed to fetch names' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /api/attendance
 * Expects JSON like:
 * {
 *   "selectedDate": "2025-11-29",
 *   "location": "Some location",
 *   "childrenCount": "10",
 *   "volunteerCount": "3",
 *   "selected": ["Name1", "Name2"]
 * }
 */
app.post('/api/attendance', async (req, res) => {
  if (!assertSpreadsheetId(res)) return;
  try {
    const validation = validateAttendancePayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.message });
    }
    const data = validation.payload;
    const sheets = await getSheetsClient();

    await ensureAttendanceSheet(sheets);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: ATTENDANCE_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[data.date, data.location, data.childrenCount, data.volunteerCount, data.selectedNames]] }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/attendance:', err);
    res.status(500).json({ error: 'Failed to save attendance' });
  }
});

/**
 * GET /api/evidencija
 * Returns existing attendance rows from Evidencija!A2:E
 */
app.get('/api/evidencija', async (req, res) => {
  if (!assertSpreadsheetId(res)) return;
  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ATTENDANCE_SHEET}!A2:E`
    });

    const rows = response.data.values || [];
    const result = rows
      .filter(row => row.length)
      .map(row => ({
        date: row[0] || '',
        location: row[1] || '',
        childrenCount: row[2] || '',
        volunteerCount: row[3] || '',
        volunteers: row[4] || ''
      }));

    res.json(result);
  } catch (err) {
    console.error('Error in /api/evidencija:', err);
    res.status(500).json({ error: 'Failed to fetch evidencija' });
  }
});

/**
 * GET /api/statistika
 * Reads published STATISTIKA sheet (TSV) and returns structured summary, tables and chart-friendly data.
 */
app.get('/api/statistika', async (req, res) => {
  try {
    if (typeof fetch !== 'function') {
      throw new Error('fetch is not available in this runtime (requires Node 18+)');
    }

    const response = await fetch(STATS_TSV_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch STATISTIKA sheet: ${response.status}`);
    }
    const tsv = await response.text();
    const parsed = parseStatisticsTsv(tsv);
    if (!parsed) {
      return res.status(500).json({ error: 'Failed to parse STATISTIKA sheet' });
    }

    res.json({
      lastUpdated: new Date().toISOString(),
      ...parsed
    });
  } catch (err) {
    console.error('Error in /api/statistika:', err);
    res.status(500).json({ error: 'Failed to fetch statistika' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
