import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Bridge jsdom's relative fetch('/api/...') to the live local FastAPI backend.
const BACKEND = process.env.TY_BACKEND_URL || 'http://127.0.0.1:8000';
const nodeFetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? new URL(input, BACKEND).toString()
      : input instanceof URL
        ? input.toString()
        : input.url;
  return nodeFetch(url, init);
}) as typeof fetch;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});
