const DEFAULT_VENDORS = Object.freeze([
  { id: 'mock', name: 'Mock (Offline)', protocol: 'mock', endpoint: '', modelsEndpoint: '', defaultModel: 'mock-story-v1', capabilities: ['text', 'tts'], builtIn: true, supportsJsonMode: true },
  { id: 'openai', name: 'OpenAI', protocol: 'openai-responses', endpoint: 'https://api.openai.com/v1/responses', modelsEndpoint: 'https://api.openai.com/v1/models', defaultModel: 'gpt-5.6-terra', capabilities: ['text', 'tts'], builtIn: true, supportsJsonMode: true },
  { id: 'gemini', name: 'Google Gemini', protocol: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models', defaultModel: 'gemini-2.5-flash', capabilities: ['text'], builtIn: true, supportsJsonMode: true },
  { id: 'openrouter', name: 'OpenRouter', protocol: 'openai-chat', endpoint: 'https://openrouter.ai/api/v1/chat/completions', modelsEndpoint: 'https://openrouter.ai/api/v1/key', defaultModel: 'openrouter/auto', capabilities: ['text'], builtIn: true, supportsJsonMode: false },
  { id: 'qwen', name: 'Qwen / Alibaba Model Studio', protocol: 'openai-chat', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', modelsEndpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', defaultModel: 'qwen-plus', capabilities: ['text'], builtIn: true, supportsJsonMode: true }
]);

function safeVendorId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error('Vendor ID must use a-z, 0-9, _ or -');
  return id;
}
function validateEndpoint(value, optional = false) {
  if (!value && optional) return '';
  let url;
  try { url = new URL(String(value)); } catch { throw new Error('Vendor endpoint must be a valid URL'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Vendor endpoint must use HTTPS (HTTP is allowed only for localhost)');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in the endpoint URL');
  return url.toString().replace(/\/$/, '');
}
function normalizeVendors(saved = []) {
  const savedMap = new Map((Array.isArray(saved) ? saved : []).map(v => [v.id, v]));
  const builtIns = DEFAULT_VENDORS.map(v => ({ ...v, ...(savedMap.get(v.id) || {}), id: v.id, builtIn: true }));
  const custom = (Array.isArray(saved) ? saved : []).filter(v => !DEFAULT_VENDORS.some(p => p.id === v.id)).map(v => ({ ...v, builtIn: false }));
  return [...builtIns, ...custom];
}
function validateVendors(vendors) {
  if (!Array.isArray(vendors)) throw new Error('AI vendors must be an array');
  const ids = new Set();
  return vendors.map(vendor => {
    const id = safeVendorId(vendor.id);
    if (ids.has(id)) throw new Error(`Duplicate vendor ID: ${id}`);
    ids.add(id);
    if (!String(vendor.name || '').trim()) throw new Error(`Vendor ${id} requires a name`);
    if (!['mock', 'openai-responses', 'openai-chat', 'gemini'].includes(vendor.protocol)) throw new Error(`Unsupported protocol for ${id}`);
    const endpoint = vendor.protocol === 'mock' ? '' : validateEndpoint(vendor.endpoint);
    const modelsEndpoint = vendor.protocol === 'mock' ? '' : validateEndpoint(vendor.modelsEndpoint, true);
    return { id, name: String(vendor.name).trim().slice(0, 80), protocol: vendor.protocol, endpoint, modelsEndpoint, defaultModel: String(vendor.defaultModel || '').trim().slice(0, 160), capabilities: [...new Set((vendor.capabilities || ['text']).filter(x => ['text', 'tts'].includes(x)))], builtIn: DEFAULT_VENDORS.some(v => v.id === id), supportsJsonMode: Boolean(vendor.supportsJsonMode) };
  });
}
function vendorFor(settings, id) {
  return normalizeVendors(settings.aiVendors).find(v => v.id === id);
}
module.exports = { DEFAULT_VENDORS, safeVendorId, validateEndpoint, normalizeVendors, validateVendors, vendorFor };
