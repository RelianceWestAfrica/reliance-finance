import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkCronAuth } from './auth.js';

const validSecret = 'a'.repeat(32); // 32 chars >= 16 min

function makeRequest(headerValue?: string): Request {
  const headers = new Headers();
  if (headerValue !== undefined) {
    headers.set('x-cron-secret', headerValue);
  }
  return new Request('http://test.local/api/cron/x', { method: 'POST', headers });
}

describe('checkCronAuth', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = original;
    }
  });

  it('retourne 500 si CRON_SECRET non defini', () => {
    delete process.env.CRON_SECRET;
    const r = checkCronAuth(makeRequest(validSecret));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(500);
      expect(r.message).toMatch(/CRON_SECRET/);
    }
  });

  it('retourne 500 si CRON_SECRET trop court (<16 chars)', () => {
    process.env.CRON_SECRET = 'short';
    const r = checkCronAuth(makeRequest('short'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it('retourne 401 si le header X-Cron-Secret est absent', () => {
    process.env.CRON_SECRET = validSecret;
    const r = checkCronAuth(makeRequest(undefined));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.message).toMatch(/manquant/i);
    }
  });

  it('retourne 403 si le secret a une longueur differente', () => {
    process.env.CRON_SECRET = validSecret;
    const r = checkCronAuth(makeRequest('a'.repeat(31)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('retourne 403 si le secret a la meme longueur mais une valeur differente', () => {
    process.env.CRON_SECRET = validSecret;
    const r = checkCronAuth(makeRequest('b'.repeat(32)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('retourne ok:true si le secret correspond exactement', () => {
    process.env.CRON_SECRET = validSecret;
    const r = checkCronAuth(makeRequest(validSecret));
    expect(r.ok).toBe(true);
  });

  it('header case-insensitive (HTTP standard)', () => {
    process.env.CRON_SECRET = validSecret;
    const headers = new Headers();
    headers.set('X-Cron-Secret', validSecret);
    const req = new Request('http://test.local/api/cron/x', { method: 'POST', headers });
    expect(checkCronAuth(req).ok).toBe(true);
  });

  it('rejette un secret vide (longueur 0)', () => {
    process.env.CRON_SECRET = validSecret;
    const r = checkCronAuth(makeRequest(''));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Header vide = headers.get('x-cron-secret') retourne '' (truthy check
      // echoue), donc treated as missing
      expect([401, 403]).toContain(r.status);
    }
  });
});
