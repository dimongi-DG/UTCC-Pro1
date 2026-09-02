const fs = require('node:fs');
const path = require('node:path');
let app;
try {
  const electron = require('electron');
  if (typeof electron === 'object' && electron !== null && electron.app) {
    app = electron.app;
  }
} catch { /* empty */ }

if (!app) {
  const os = require('node:os');
  const path = require('node:path');
  app = { getPath: () => path.join(os.tmpdir(), 'clip-story-studio-test') };
}

function redact(value) {
  return String(value || '').replace(/(api[_ -]?key|authorization|bearer)\s*[:=]?\s*[^\s,}]+/gi, '$1=[REDACTED]');
}
function appendDiagnostic(scope, error) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()} [${scope}] ${redact(error?.stack || error)}\n`;
    fs.appendFileSync(path.join(dir, 'studio.log'), line, 'utf8');
  } catch { /* diagnostics must never crash the app */ }
}
module.exports = { redact, appendDiagnostic };
