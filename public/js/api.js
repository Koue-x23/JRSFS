// Thin fetch wrapper for the local API. No credentials are stored in the browser.
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new ApiError('Cannot reach the server. Check that the application is running and try again.', 0);
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(payload?.error || `Request failed (${res.status}).`, res.status, payload?.details);
  }
  return payload;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  get: (path, params) => request('GET', `/api${path}${qs(params)}`),
  post: (path, body) => request('POST', `/api${path}`, body),
  put: (path, body) => request('PUT', `/api${path}`, body),
  del: (path) => request('DELETE', `/api${path}`),
};

export const pdfUrl = (resource, id, download = false) =>
  `/api/${resource}/${id}/pdf${download ? '?download=1' : ''}`;
