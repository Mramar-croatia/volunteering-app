# volunteering-app

Volunteer attendance tracker for AC Zlatni Zmaj. The backend writes to Google Sheets; the frontend lives in `docs/` and can be served statically (GitHub Pages/Netlify or any static server).

## Structure
- `backend/` - Express API that proxies to Google Sheets.
- `docs/` - Static frontend (HTML/CSS/JS).

## Backend setup
1) Install Node.js 18+ and run `npm install` inside `backend/`.
2) Provide environment variables (Render/Cloud Run/local `.env`):
   - `SPREADSHEET_ID` - ID of the target Google Sheet.
   - `GOOGLE_CLIENT_EMAIL` - service account email.
   - `GOOGLE_PRIVATE_KEY` - private key; keep `\n` sequences for newlines if set inline.
3) Start the server: `npm start` (defaults to port 8080). For development with auto-reload: `npm run dev`.

## API
- `GET /api/names` - volunteer roster from `BAZA!A2:I`.
- `POST /api/attendance` - append attendance to `Evidencija` (auto-creates sheet + headers). Body: `{ selectedDate, location, childrenCount, volunteerCount, selected: [] }`.
- `GET /api/evidencija` - existing attendance rows.
- `GET /health` - liveness probe.

## Frontend
Open `docs/index.html` directly or serve the folder (e.g., `npx serve docs`). The JS will try local/https backends in order until one responds (config in `docs/app.js`).
