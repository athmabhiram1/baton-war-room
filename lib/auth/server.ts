import { createNeonAuth } from '@neondatabase/auth/next/server';

// Env-driven (T2): Wave 0 blocker NEON_AUTH_BASE_URL may be absent locally
// or in edge build environments. NEVER throw at import time — Vercel's
// page-data collection imports every route, so an import-time throw breaks
// `next build` even though no request is served. Validation happens per
// request: routes fail closed (401/503) when env is absent, and live
// session calls report auth_unavailable until the env lands.
// NOT a real secret — placeholder below is clearly labeled and dev-only.
const baseUrl = process.env.NEON_AUTH_BASE_URL;
const secret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!secret) {
  console.warn('[auth] NEON_AUTH_COOKIE_SECRET absent — dev/test placeholder in use; live sessions deferred.');
}

export const auth = createNeonAuth({
  baseUrl: baseUrl ?? 'http://localhost:3112',
  cookies: { secret: secret ?? 'dev-only-placeholder-secret-32-chars!' },
});
