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
// Public STATISTIKA sheet (published TSV)
const STATS_TSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSVWywHd-Rw3go4LqK8WnV3BK7NPeUI-2NSZa65De3XmY8Ka4k2VmQaq_iNfEojwgFbM7pYnkBvIu-S/pub?gid=425993995&single=true&output=tsv';

if (!SPREADSHEET_ID) {
  console.warn('Warning: SPREADSHEET_ID is not set. API calls will fail until it is provided.');
}

app.use(cors()); // allow frontend calls from another domain
app.use(express.json()); // parse JSON request bodies

function getAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    console.error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY env vars');
    throw new Error('Missing Google service account credentials');
  }

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

function formatDateToISO(input) {
  if (!input) return '';
  const trimmed = input.toString().trim().replace(/\./g, '/').replace(/\s+/g, '');
  const cleaned = trimmed.replace(/\/+$/, '');
  if (cleaned.includes('-')) return cleaned;
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

function parseStatisticsTsv(tsvText) {
  if (!tsvText) return null;
  const rows = tsvText
    .split(/\r?\n/)
    .map(line => line.split('\t'))
    .filter(row => row.length && row.some(cell => cleanCell(cell)));

  const headerIndex = rows.findIndex(row => cleanCell(row[0]).toUpperCase() === 'LOKACIJA');
  if (headerIndex === -1) return null;

  const dataRows = rows.slice(headerIndex + 1);

  const locationRows = [];
  const schoolRows = [];
  const gradeRows = [];
  const summaryCards = [];
  const metrics = {
    volunteersRecorded: null,
    volunteersCalculated: null,
    childrenRecorded: null,
    childrenCalculated: null,
    totalVolunteers: null,
    activeVolunteers: null,
    pctActive: null
  };

  dataRows.forEach(row => {
    const loc = cleanCell(row[0]);
    if (loc) {
      locationRows.push({
        location: loc,
        children: cleanCell(row[1]),
        volunteers: cleanCell(row[2]),
        sessions: cleanCell(row[3]),
        pctChildren: cleanCell(row[4]),
        pctVolunteers: cleanCell(row[5]),
        ratio: cleanCell(row[6])
      });
    }

    const school = cleanCell(row[8]);
    if (school) {
      schoolRows.push({
        school,
        volunteers: cleanCell(row[9]),
        active: cleanCell(row[10]),
        pctActive: cleanCell(row[11]),
        arrivals: cleanCell(row[12]),
        pctHours: cleanCell(row[13])
      });
    }

    const grade = cleanCell(row[15]);
    if (grade) {
      gradeRows.push({
        grade,
        volunteers: cleanCell(row[16]),
        active: cleanCell(row[17]),
        pctActive: cleanCell(row[18]),
        arrivals: cleanCell(row[19]),
        pctHours: cleanCell(row[20])
      });
    }

    const tip = cleanCell(row[22]);
    const biljezeno = cleanCell(row[23]);
    const izracun = cleanCell(row[24]);
    if (tip) {
      if (tip.toUpperCase() === 'VOLONTERI') {
        if (biljezeno) metrics.volunteersRecorded = biljezeno;
        if (izracun) metrics.volunteersCalculated = izracun;
      } else if (tip.toUpperCase() === 'DJECA') {
        if (biljezeno) metrics.childrenRecorded = biljezeno;
        if (izracun) metrics.childrenCalculated = izracun;
      }
    }

    const valueName = cleanCell(row[26]);
    const valueNum = cleanCell(row[27]);
    if (valueName && valueNum) {
      const upper = valueName.toUpperCase();
      if (upper === 'VOLONTERI') {
        metrics.totalVolunteers = valueNum;
      } else if (upper === 'AKTIVNI VOLONTERI') {
        metrics.activeVolunteers = valueNum;
      } else if (upper === 'POSTOTAK AKTIVNIH') {
        metrics.pctActive = valueNum;
      } else {
        summaryCards.push({ label: valueName, value: valueNum });
      }
    }
  });

  const volunteerHours = metrics.volunteersCalculated || metrics.volunteersRecorded;
  const childrenArrivals = metrics.childrenCalculated || metrics.childrenRecorded;

  if (volunteerHours) {
    const note =
      metrics.volunteersCalculated && metrics.volunteersRecorded && metrics.volunteersCalculated !== metrics.volunteersRecorded
        ? `Bilježeno: ${metrics.volunteersRecorded}`
        : null;
    summaryCards.push({ label: 'VOLONTERSKI SATI', value: volunteerHours, delta: note });
  }
  if (childrenArrivals) {
    const note =
      metrics.childrenCalculated && metrics.childrenRecorded && metrics.childrenCalculated !== metrics.childrenRecorded
        ? `Bilježeno: ${metrics.childrenRecorded}`
        : null;
    summaryCards.push({ label: 'DOLASCI DJECE', value: childrenArrivals, delta: note });
  }
  if (metrics.totalVolunteers) {
    summaryCards.push({ label: 'BROJ VOLONTERA', value: metrics.totalVolunteers });
  }
  if (metrics.activeVolunteers) {
    summaryCards.push({ label: 'AKTIVNI VOLONTERI', value: metrics.activeVolunteers });
  }
  if (metrics.pctActive) {
    const pctVal = metrics.pctActive.endsWith('%') ? metrics.pctActive : `${metrics.pctActive}%`;
    summaryCards.push({ label: 'POSTOTAK AKTIVNIH', value: pctVal });
  }

  const childrenNum = toNumber(childrenArrivals);
  const volunteerNum = toNumber(volunteerHours);
  if (childrenNum !== null && volunteerNum) {
    const ratio = volunteerNum === 0 ? null : childrenNum / volunteerNum;
    if (ratio !== null) {
      const pretty = ratio.toFixed(2).replace('.', ',');
      summaryCards.push({ label: 'OMJER', value: pretty });
    }
  }

  const tables = [
    {
      id: 'by-location',
      title: 'Po lokaciji',
      columns: ['Lokacija', 'Djeca', 'Volonteri', 'Održani termini', 'Postotak djece', 'Postotak volontera', 'Omjer'],
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
      title: 'Po školi',
      columns: ['Škola', 'Volonteri', 'Aktivni', 'Postotak aktivnih', 'Broj dolazaka', 'Postotak sati'],
      rows: schoolRows.map(r => [r.school, r.volunteers, r.active, r.pctActive, r.arrivals, r.pctHours])
    },
    {
      id: 'by-grade',
      title: 'Po razredu',
      columns: ['Razred', 'Volonteri', 'Aktivni', 'Postotak aktivnih', 'Broj dolazaka', 'Postotak sati'],
      rows: gradeRows.map(r => [r.grade, r.volunteers, r.active, r.pctActive, r.arrivals, r.pctHours])
    }
  ];

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
    charts.push({
      id: 'school-active',
      title: 'Aktivni volonteri po školi',
      type: 'bar',
      labels: schoolRows.map(r => r.school),
      datasets: [
        { label: 'Aktivni', data: schoolRows.map(r => toNumber(r.active) || 0) },
        { label: 'Dolazaka', data: schoolRows.map(r => toNumber(r.arrivals) || 0) }
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

  const filters = {
    locations: locationRows.map(r => r.location),
    schools: schoolRows.map(r => r.school),
    grades: gradeRows.map(r => r.grade)
  };

  return { summaryCards, tables, charts, filters };
}

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
