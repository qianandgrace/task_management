const TOKEN_KEY = 'taskmgmt_token';

/**
 * Save token to localStorage.
 */
export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Get stored token.
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
