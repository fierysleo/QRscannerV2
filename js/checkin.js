/* ============================================================
   checkin.js — Mode B: Teacher Displays Class QR for Students to Scan
   QR Attendance System
   ============================================================ */

/* ── Configuration ───────────────────────────────────────── */
/**
 * Google Apps Script Web App endpoint.
 * Used for both POSTing self-check-in data (from attend.html)
 * and GETting the live check-in count for a class session.
 * GET request shape: ?action=count&session=TOKEN
 * GET response shape: { "count": <number> }
 */
const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwHNBpb_YZqUjq_pP4-OfHXSiv3uH2q24u5Pv-E0JE-pboFL5v_7QSHFrJczl7TAV5E3A/exec';

/**
 * Base URL of this application.
 * Used to build the URL that gets encoded into the QR code.
 * Auto-detected from the current page's origin + path.
 */
const APP_BASE_URL = (() => {
  const url = new URL(window.location.href);
  return url.origin + url.pathname.replace('checkin.html', '');
})();

/* ── State ────────────────────────────────────────────────── */
let currentSessionToken = null;  // Active session token string
let currentEventName    = '';    // Friendly event name entered by admin
let qrInstance          = null;  // QRCode.js instance reference
let pollIntervalId      = null;  // setInterval handle for live count polling

/* ── Polling Interval (milliseconds) ─────────────────────── */
const POLL_INTERVAL_MS = 5000;  // Fetch count every 5 seconds

/* ── DOM References ───────────────────────────────────────── */
const eventNameInput   = document.getElementById('eventNameInput');
const generateBtn      = document.getElementById('generateBtn');
const resetBtn         = document.getElementById('resetBtn');
const qrContainer      = document.getElementById('qrContainer');
const qrPlaceholder    = document.getElementById('qrPlaceholder');
const qrDisplayBox     = document.getElementById('qrDisplayBox');
const qrCanvas         = document.getElementById('qrCanvas');
const qrSessionLabel   = document.getElementById('qrSessionLabel');
const checkinCountEl   = document.getElementById('checkinCount');
const pollStatusEl     = document.getElementById('pollStatus');
const sessionTokenEl   = document.getElementById('sessionTokenDisplay');
const sessionInfoRow   = document.getElementById('sessionInfoRow');
const copyLinkBtn      = document.getElementById('copyLinkBtn');

/* ── QR Generation ────────────────────────────────────────── */
/**
 * Generates a unique session token from the class name + timestamp.
 * Format: "ClassName-YYYYMMDD-HHMMSS"
 * @param {string} eventName - The class or subject name entered by the teacher
 * @returns {string} A URL-safe session token
 */
function generateSessionToken(eventName) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');   // YYYYMMDD
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');   // HHMMSS
  const slug     = eventName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24);
  return `${slug}-${datePart}-${timePart}`;
}

/**
 * Builds the full URL that students land on when they scan the QR.
 * @param {string} sessionToken
 * @returns {string} Full URL to attend.html with session parameter
 */
function buildCheckinUrl(sessionToken) {
  return `${APP_BASE_URL}attend.html?session=${encodeURIComponent(sessionToken)}`;
}

/**
 * Renders a new QR code into #qrCanvas using the QRCode.js library.
 * Clears any previously rendered QR first.
 * @param {string} url - The URL to encode into the QR code
 */
function renderQRCode(url) {
  // Clear previous render
  qrCanvas.innerHTML = '';

  new QRCode(qrCanvas, {
    text:          url,
    width:         220,
    height:        220,
    colorDark:     '#111827',
    colorLight:    '#ffffff',
    correctLevel:  QRCode.CorrectLevel.H  // High error correction
  });
}

/* ── Live Count Polling ───────────────────────────────────── */
/**
 * Fetches the current check-in count for a session from the GAS backend.
 * The backend must implement a doGet(e) handler that:
 *   - Reads e.parameter.action === 'count'
 *   - Reads e.parameter.session (the session token)
 *   - Returns ContentService.createTextOutput(JSON.stringify({ count: N }))
 *     .setMimeType(ContentService.MimeType.JSON)
 *
 * @param {string} sessionToken - The session token to query
 */
async function pollCheckinCount(sessionToken) {
  try {
    const url = `${SCRIPT_URL}?action=count&session=${encodeURIComponent(sessionToken)}`;
    const response = await fetch(url);  // No 'no-cors' here — we need to read the JSON body
    if (!response.ok) throw new Error('Non-OK response');

    const data = await response.json();

    if (typeof data.count === 'number') {
      // Only animate if the number actually changed
      const prev = parseInt(checkinCountEl.textContent, 10) || 0;
      if (data.count !== prev) {
        checkinCountEl.classList.remove('count-bump');
        void checkinCountEl.offsetWidth;           // Force reflow to restart animation
        checkinCountEl.classList.add('count-bump');
      }
      checkinCountEl.textContent = data.count;
    }

    setPollStatus('live');  // Green — connection good
  } catch (_err) {
    // Silently fail — the counter just won't update this tick
    setPollStatus('error');
  }
}

/**
 * Starts the polling loop for the given session token.
 * Fires once immediately, then every POLL_INTERVAL_MS milliseconds.
 * @param {string} sessionToken
 */
function startPolling(sessionToken) {
  stopPolling();                           // Clear any existing interval first
  pollCheckinCount(sessionToken);          // Immediate first fetch
  pollIntervalId = setInterval(() => pollCheckinCount(sessionToken), POLL_INTERVAL_MS);
}

/**
 * Stops the polling loop and clears the interval.
 */
function stopPolling() {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  setPollStatus('idle');
}

/**
 * Updates the small live-status indicator next to the counter.
 * @param {'live'|'error'|'idle'} state
 */
function setPollStatus(state) {
  if (!pollStatusEl) return;
  const states = {
    live:  { text: '🟢 Live — updates every 5 s', cls: 'poll-live'  },
    error: { text: '🟡 Reconnecting…',             cls: 'poll-error' },
    idle:  { text: 'Start a class to track live attendance', cls: '' }
  };
  const s = states[state] || states.idle;
  pollStatusEl.textContent  = s.text;
  pollStatusEl.className    = 'poll-status ' + s.cls;
}

/* ── Event Handlers ───────────────────────────────────────── */
/**
 * Handles the "Generate QR" button click.
 * Validates input, creates a session token, and renders the class QR code.
 */
generateBtn.addEventListener('click', () => {
  const eventName = eventNameInput.value.trim();
  if (!eventName) {
    eventNameInput.focus();
    eventNameInput.style.borderColor = 'var(--error)';
    setTimeout(() => { eventNameInput.style.borderColor = ''; }, 1500);
    return;
  }

  currentEventName    = eventName;
  currentSessionToken = generateSessionToken(eventName);
  const checkinUrl    = buildCheckinUrl(currentSessionToken);

  // Render QR code
  renderQRCode(checkinUrl);

  // Update session label inside the white QR box
  qrSessionLabel.textContent = currentEventName;

  // Show the QR display, hide placeholder
  qrPlaceholder.style.display  = 'none';
  qrDisplayBox.style.display   = 'flex';

  // Show session info row and update token display
  sessionTokenEl.textContent = currentSessionToken;
  sessionInfoRow.style.display = 'flex';

  // Reset the check-in counter for the new session
  checkinCountEl.textContent = '0';

  // Start live polling for this session's check-in count
  startPolling(currentSessionToken);

  // Animate the QR box in
  qrDisplayBox.classList.add('pop');
  qrDisplayBox.addEventListener('animationend', () => qrDisplayBox.classList.remove('pop'), { once: true });
});

/**
 * Handles the "New Class / Reset" button — clears QR and resets state.
 */
resetBtn.addEventListener('click', () => {
  // Stop polling before clearing state
  stopPolling();

  currentSessionToken = null;
  currentEventName    = '';
  eventNameInput.value = '';

  qrPlaceholder.style.display  = '';
  qrDisplayBox.style.display   = 'none';
  sessionInfoRow.style.display = 'none';
  checkinCountEl.textContent   = '0';

  eventNameInput.focus();
});

/* ── Stop polling when admin leaves/closes the page ──────── */
window.addEventListener('beforeunload', stopPolling);

/**
 * Copies the check-in URL to the clipboard so the teacher can
 * share it via other channels (chat, class group, etc.).
 */
copyLinkBtn.addEventListener('click', () => {
  if (!currentSessionToken) return;
  const url = buildCheckinUrl(currentSessionToken);

  navigator.clipboard.writeText(url).then(() => {
    const original = copyLinkBtn.textContent;
    copyLinkBtn.textContent = '✅ Copied!';
    setTimeout(() => { copyLinkBtn.textContent = original; }, 2000);
  });
});

/* ── Allow pressing Enter in the event name field ─────────── */
eventNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') generateBtn.click();
});
