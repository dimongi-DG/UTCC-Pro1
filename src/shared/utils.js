const crypto = require('node:crypto');
const id = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
module.exports = { id, now, clone, clamp, csvCell };
