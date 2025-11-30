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
const ATTENDANCE_SHEET = 'Evidencija';
const ATTENDANCE_RANGE = `${ATTENDANCE_SHEET}!A:E`;
const ATTENDANCE_HEADER_RANGE = `${ATTENDANCE_SHEET}!A1:E1`;
const ATTENDANCE_HEADERS = ['DATUM', 'LOKACIJA', 'BROJ DJECE', 'BROJ VOLONTERA', 'VOLONTERI'];

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

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
