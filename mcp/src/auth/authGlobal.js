/**
 * authGlobal — installs global Authorization-header injection for every HTTP
 * call the SPA makes (axios default instance, all axios.create() instances, and
 * window.fetch), plus reactive 401 -> refresh -> retry.
 *
 * MUST be imported before App (before any service module calls axios.create),
 * so patch the axios factory here and let App's instances inherit it.
 *
 * Auth endpoints (/auth/login, /auth/refresh) are never touched, and the token
 * is only attached to our own API origin (authClient.isApiUrl).
 */

import axios from 'axios';
import authClient from './authClient';

const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh'];
const isAuthEndpoint = (url) => AUTH_ENDPOINTS.some((p) => url.includes(p));

function fullUrlFromAxios(config = {}) {
  const url = config.url || '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = (config.baseURL || '').replace(/\/$/, '');
  if (!url) return base;
  return base + (url.startsWith('/') ? url : `/${url}`);
}

function attachAxiosRequest(config) {
  try {
    const full = fullUrlFromAxios(config);
    if (authClient.isApiUrl(full) && !isAuthEndpoint(full)) {
      const token = authClient.getAccess();
      if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {
    /* never block a request over header injection */
  }
  return config;
}

function installOnAxios(instance) {
  instance.interceptors.request.use(attachAxiosRequest);
  instance.interceptors.response.use(
    (r) => r,
    async (error) => {
      const cfg = error.config || {};
      const full = fullUrlFromAxios(cfg);
      const is401 = error.response && error.response.status === 401;
      if (is401 && authClient.isApiUrl(full) && !isAuthEndpoint(full) && !cfg.__authRetried) {
        cfg.__authRetried = true;
        const token = await authClient.ensureFresh();
        if (token) {
          cfg.headers = cfg.headers || {};
          cfg.headers['Authorization'] = `Bearer ${token}`;
          return instance(cfg);
        }
        authClient.logout();
      }
      return Promise.reject(error);
    },
  );
}

// Patch the default instance + every future axios.create() instance.
installOnAxios(axios);
const originalCreate = axios.create.bind(axios);
axios.create = function patchedCreate(...args) {
  const instance = originalCreate(...args);
  installOnAxios(instance);
  return instance;
};

// Wrap window.fetch (captured original; authClient already grabbed its own).
const originalFetch = window.fetch.bind(window);
window.fetch = async function patchedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  let opts = init || {};
  try {
    if (authClient.isApiUrl(url) && !isAuthEndpoint(url)) {
      const token = authClient.getAccess();
      if (token) {
        const headers = new Headers(opts.headers || (typeof input !== 'string' && input.headers) || {});
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        opts = { ...opts, headers };
      }
    }
  } catch {
    /* ignore */
  }

  let res = await originalFetch(input, opts);

  try {
    if (res.status === 401 && authClient.isApiUrl(url) && !isAuthEndpoint(url) && !opts.__authRetried) {
      const token = await authClient.ensureFresh();
      if (token) {
        const headers = new Headers(opts.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        res = await originalFetch(input, { ...opts, headers, __authRetried: true });
      } else {
        authClient.logout();
      }
    }
  } catch {
    /* ignore */
  }

  return res;
};
