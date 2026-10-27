// Small shared helpers.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const code = (s) => `<code>${esc(s)}</code>`;
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
