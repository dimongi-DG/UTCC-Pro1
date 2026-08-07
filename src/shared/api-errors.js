function classifyApiError(status, message = '') {
  if (/moderation|blocked|content[ _-]?policy|safety system|safety/i.test(message)) return { code: 'content_policy', retryable: false };
  if (status === 401 || status === 403) return { code: 'authentication', retryable: false };
  if (status === 429) return { code: 'rate_limit', retryable: true };
  if (status >= 500) return { code: 'provider_unavailable', retryable: true };
  if (/timeout/i.test(message)) return { code: 'timeout', retryable: true };
  return { code: 'request_failed', retryable: false };
}
module.exports = { classifyApiError };
