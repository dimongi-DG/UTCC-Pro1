const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

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
