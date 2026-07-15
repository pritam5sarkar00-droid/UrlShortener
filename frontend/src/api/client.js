const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 No Content (delete) has no body to parse
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  register: (email, password) => request('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  loginWithGoogle: (idToken) => request('/auth/google', { method: 'POST', body: { idToken } }),
  createLink: (token, payload) => request('/shorten', { method: 'POST', body: payload, token }),
  listLinks: (token) => request('/links', { token }),
  deleteLink: (token, code) => request(`/links/${code}`, { method: 'DELETE', token }),
  permanentDeleteLink: (token, code) => request(`/links/${code}/permanent`, { method: 'DELETE', token }),
};
