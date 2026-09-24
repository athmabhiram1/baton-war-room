import { createNeonAuth } from '@neondatabase/auth/next/server';

// Env-driven (T2): Wave 0 blocker NEON_AUTH_BASE_URL may be absent locally.
// Fail closed in production; use clearly-labeled dev/test fallbacks so route
// modules import (validation/401 paths stay verifiable) while live session
// calls report auth_unavailable until the env lands. NOT a real secret.
const isProd = process.env.NODE_ENV === 'production';
const baseUrl = process.env.NEON_AUTH_BASE_URL;
const secret = process.env.NEON_AUTH_COOKIE_SECRET;

if (isProd && (!baseUrl || !secret)) {
  throw new Error('NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required in production');
}
if (!secret && !isProd) {
  console.warn('[auth] NEON_AUTH_COOKIE_SECRET absent — dev/test placeholder in use; live sessions deferred.');
}

export const auth = createNeonAuth({
  baseUrl: baseUrl ?? 'http://localhost:3112',
  cookies: { secret: secret ?? 'dev-only-placeholder-secret-32-chars!' },
});
