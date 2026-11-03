import { getToken } from './token';

/**
 * Unified fetch wrapper: injects Authorization header, parses error body.
 * Throws on non-2xx with a structured error object.
 */
async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // DELETE may return 204 with no body
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const error = data?.error || { code: 'UNKNOWN_ERROR', message: response.statusText };
    const err = new Error(error.message);
    err.error = error;
    err.status = response.status;
    throw err;
  }

  return data;
}

export default request;
