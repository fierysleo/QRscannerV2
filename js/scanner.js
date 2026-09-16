/* ============================================================
   scanner.js — Mode A: Admin Scans Employee QR Codes
   QR Attendance System
   ============================================================ */

/* ── Configuration ────────────────────────────────────────── */
/**
 * Google Apps Script Web App endpoint.
 * Receives POST requests and logs attendance to a Google Sheet.
 * Payload shape: { attendeeId: string, mode: "admin-scan" }
 */
const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwHNBpb_YZqUjq_pP4-OfHXSiv3uH2q24u5Pv-E0JE-pboFL5v_7QSHFrJczl7TAV5E3A/exec';

/* ── State ────────────────────────────────────────────────── */
let isScanning  = true;   // Debounce flag — prevents double-logging one QR
let scanCount   = 0;      // Running total of successful scans
let errorCount  = 0;      // Running total of failed submissions
let sessionStart = Date.now();

/* ── QR Scanner Initialization ────────────────────────────── */
/**
 * html5-qrcode configuration:
 *   fps  - frames per second to analyse for a QR code
 *   qrbox - pixel size of the scanning region overlay
 */
const html5QrcodeScanner = new Html5QrcodeScanner(
  'reader',
  { fps: 10, qrbox: 250 },
  /* verbose= */ false
);
html5QrcodeScanner.render(onScanSuccess, onScanFailure);

/* ── Scan Handlers ────────────────────────────────────────── */
/**
 * Called by the library every time a QR code is successfully decoded.
 * @param {string} decodedText - The raw string content of the QR code.
 */
function onScanSuccess(decodedText) {
  // Guard: ignore new scans while a request is in-flight
  if (!isScanning) return;
  isScanning = false;

  setStatus('logging', '⏳', 'Logging', `Sending: ${decodedText}…`);
  startScanLine();

  // POST the attendee ID to the Google Apps Script backend
  fetch(SCRIPT_URL, {
    method: 'POST',
    mode:   'no-cors',          // GAS doesn't send CORS headers on responses
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendeeId: decodedText, mode: 'admin-scan' })
  })
    .then(() => {
      scanCount++;
      updateStats();
      setStatus('success', '✅', 'Checked In', decodedText);
      stopScanLine();

      // 2-second cooldown before accepting the next scan
      setTimeout(() => {
        setStatus('', '📷', 'Awaiting', 'Ready for next scan…');
        isScanning = true;
      }, 2000);
    })
    .catch(_err => {
      errorCount++;
      updateStats();
      setStatus('error', '❌', 'Error', 'Could not log attendance. Try again.');
      stopScanLine();
      isScanning = true;
    });
}

/**
 * Called by the library on every failed scan attempt (very frequent — ignored).
 * We intentionally do nothing here to avoid noisy UI updates.
 */
function onScanFailure(_error) {
  // Silently ignored
}

/* ── Scan-line Animation Helpers ──────────────────────────── */
function startScanLine() {
  document.getElementById('scanLine').classList.add('active');
}
function stopScanLine() {
  document.getElementById('scanLine').classList.remove('active');
}

/* ── Status Banner Helper ─────────────────────────────────── */
/**
 * Updates the status banner with new state.
 * @param {string} type  - CSS modifier class: '', 'success', 'error', 'logging'
 * @param {string} icon  - Emoji shown as the icon
 * @param {string} label - Small uppercase label above the main text
 * @param {string} text  - Main status message
 */
function setStatus(type, icon, label, text) {
  const banner  = document.getElementById('statusBanner');
  const iconEl  = document.getElementById('statusIcon');
  const labelEl = document.getElementById('statusLabel');
  const textEl  = document.getElementById('status');

  banner.className = 'status-banner pop ' + type;
  iconEl.textContent  = icon;
  labelEl.textContent = label;
  textEl.textContent  = text;

  // Remove 'pop' after animation so it can fire again on the next update
  banner.addEventListener('animationend', () => banner.classList.remove('pop'), { once: true });
}

/* ── Stats Display ────────────────────────────────────────── */
function updateStats() {
  document.getElementById('scanCount').textContent  = scanCount;
  document.getElementById('errorCount').textContent = errorCount;
}

/* ── Session Timer ────────────────────────────────────────── */
/**
 * Updates the MM:SS session timer every second.
 */
function updateSessionTime() {
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  document.getElementById('sessionTime').textContent = `${mm}:${ss}`;
}
setInterval(updateSessionTime, 1000);

/* ── Auto-activate scan line once camera is live ──────────── */
/**
 * The html5-qrcode library inserts a <video> element asynchronously.
 * We poll once after 2 s to activate the decorative scan line.
 */
setTimeout(() => {
  const video = document.querySelector('#reader video');
  if (video) startScanLine();
}, 2000);
