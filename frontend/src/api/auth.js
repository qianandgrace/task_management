import request from './fetch';
import { setToken, getToken } from './token';

// ---- Authentication endpoints ----

export async function register(email, password, name) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  setToken(data.token);
  return data;
}

export async function login(email, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}
