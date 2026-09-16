/* ============================================================
   checkin.js — Mode B: Admin Displays QR for Employees to Scan
   QR Attendance System
   ============================================================ */

/* ── Configuration ────────────────────────────────────────── */
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
const sessionTokenEl   = document.getElementById('sessionTokenDisplay');
const sessionInfoRow   = document.getElementById('sessionInfoRow');
const copyLinkBtn      = document.getElementById('copyLinkBtn');

/* ── QR Generation ────────────────────────────────────────── */
/**
 * Generates a unique session token from the event name + timestamp.
 * Format: "EventName-YYYYMMDD-HHMMSS"
 * @param {string} eventName - The human-readable event/session name
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
 * Builds the full URL that employees land on when they scan the QR.
 * @param {string} sessionToken
 * @returns {string} Full URL to attend.html with session parameter
 */
function buildCheckinUrl(sessionToken) {
  return `${APP_BASE_URL}attend.html?session=${encodeURIComponent(sessionToken)}`;
}

/**
 * Renders a new QR code into #qrCanvas using the QRCode.js library.
 * Clears any previously rendered QR first.
 * @param {string} url - The URL to encode
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

/* ── Event Handlers ───────────────────────────────────────── */
/**
 * Handles the "Generate QR" button click.
 * Validates input, creates a session token, and renders the QR code.
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

  // Animate the QR box in
  qrDisplayBox.classList.add('pop');
  qrDisplayBox.addEventListener('animationend', () => qrDisplayBox.classList.remove('pop'), { once: true });
});

/**
 * Handles the "Reset Session" button — clears QR and resets state.
 */
resetBtn.addEventListener('click', () => {
  currentSessionToken = null;
  currentEventName    = '';
  eventNameInput.value = '';

  qrPlaceholder.style.display  = '';
  qrDisplayBox.style.display   = 'none';
  sessionInfoRow.style.display = 'none';
  checkinCountEl.textContent   = '0';

  eventNameInput.focus();
});

/**
 * Copies the check-in URL to the clipboard so the admin can
 * share it via other channels (chat, email, etc.).
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
