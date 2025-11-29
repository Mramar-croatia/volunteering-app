// backend/server.js

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// We'll set this in environment variables later (Render)
// For local testing you can temporarily hard-code your ID here.
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Allow frontend from another domain (Netlify) to call this API
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

function getAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    console.error('❌ Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY env vars');
    throw new Error('Missing Google service account credentials');
  }

  // Handle both cases:
  // - key stored with real newlines
  // - key stored as a single line with "\n"
  const privateKey = rawKey.replace(/\\n/g, '\n');

  console.log('✅ GOOGLE_CLIENT_EMAIL present:', !!clientEmail);
  console.log('✅ GOOGLE_PRIVATE_KEY length:', privateKey.length);
  console.log('✅ SPREADSHEET_ID present:', !!SPREADSHEET_ID);

  // Extra sanity check – should print: "-----BEGIN PRIVATE KEY-----"
  console.log('✅ GOOGLE_PRIVATE_KEY starts with:', privateKey.split('\n')[0]);

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  await auth.authorize(); // forces it to actually use the key
  return google.sheets({ version: 'v4', auth });
}


/**
 * GET /api/names
 * Reads volunteers from BAZA!A2:E and returns an array of objects:
 * [{ name, school, grade, location, phone }, ...]
 */
app.get('/api/names', async (req, res) => {
  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'BAZA!A2:E' // Name, School, Grade, Location, Phone
    });

    const rows = response.data.values || [];

    const result = rows
      .filter(row => row[0] && row[0].toString().trim() !== '')
      .map(row => ({
        name: row[0] || '',
        school: row[1] || '',
        grade: row[2] || '',
        location: row[3] || '',
        phone: row[4] || ''
      }));

    res.json(result);
  } catch (err) {
    console.error('Error in /api/names:', err);
    res.status(500).json({ error: 'Failed to fetch names' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Helper: convert yyyy-mm-dd to dd/mm/yyyy
 */
function formatDateToDDMMYYYY(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

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
  try {
    const data = req.body;
    const sheets = await getSheetsClient();

    const date = formatDateToDDMMYYYY(data.selectedDate);
    const location = data.location || '';
    const childrenCount = data.childrenCount || '';
    const volunteerCount = data.volunteerCount || '';
    const selectedNames = Array.isArray(data.selected)
      ? data.selected.join(', ')
      : '';

    // --- Ensure "Evidencija" sheet exists, create if needed ---
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    const sheetExists = (spreadsheet.data.sheets || []).some(
      s => s.properties && s.properties.title === 'Evidencija'
    );

    if (!sheetExists) {
      // Create "Evidencija" sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Evidencija'
                }
              }
            }
          ]
        }
      });

      // Add header row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Evidencija!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['DATUM', 'LOKACIJA', 'BROJ DJECE', 'BROJ VOLONTERA', 'VOLONTERI']
          ]
        }
      });
    }

    // --- Append new attendance row ---
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Evidencija!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[date, location, childrenCount, volunteerCount, selectedNames]]
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/attendance:', err);
    res.status(500).json({ error: 'Failed to save attendance' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
