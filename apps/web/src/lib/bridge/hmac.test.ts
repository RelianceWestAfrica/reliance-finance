import { describe, expect, it } from 'vitest';

import {
  computeBridgeSignature,
  isTimestampFresh,
  sha256Hex,
  verifyBridgeSignature,
} from '@reliancewestafrica/bridge-contract';

const SECRET = 'x'.repeat(40);
const TS = '1716883200';
const NOW_MS = 1716883200000;
const BODY = '{"hello":"world"}';

describe('computeBridgeSignature', () => {
  it('est deterministe et prefixe sha256=', () => {
    const sig = computeBridgeSignature(TS, BODY, SECRET);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(computeBridgeSignature(TS, BODY, SECRET)).toBe(sig);
  });

  it('change si le corps change', () => {
    const a = computeBridgeSignature(TS, BODY, SECRET);
    const b = computeBridgeSignature(TS, BODY + ' ', SECRET);
    expect(a).not.toBe(b);
  });
});

describe('sha256Hex', () => {
  it('produit un hex de 64 caracteres stable', () => {
    expect(sha256Hex(BODY)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Hex(BODY)).toBe(sha256Hex(BODY));
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});

describe('isTimestampFresh', () => {
  it('accepte dans la fenetre', () => {
    expect(isTimestampFresh(TS, NOW_MS)).toBe(true);
    expect(isTimestampFresh(TS, NOW_MS + 299_000)).toBe(true);
  });
  it('rejette hors fenetre', () => {
    expect(isTimestampFresh(TS, NOW_MS + 301_000)).toBe(false);
    expect(isTimestampFresh('not-a-number', NOW_MS)).toBe(false);
  });
});

describe('verifyBridgeSignature', () => {
  const good = computeBridgeSignature(TS, BODY, SECRET);

  it('ok quand tout est valide', () => {
    const r = verifyBridgeSignature({
      signatureHeader: good,
      timestamp: TS,
      rawBody: BODY,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(r.ok).toBe(true);
  });

  it('CONFIG si secret absent/trop court', () => {
    const r = verifyBridgeSignature({
      signatureHeader: good,
      timestamp: TS,
      rawBody: BODY,
      secret: 'short',
      nowMs: NOW_MS,
    });
    expect(r).toEqual({ ok: false, reason: 'CONFIG' });
  });

  it('MISSING si header absent', () => {
    const r = verifyBridgeSignature({
      signatureHeader: null,
      timestamp: TS,
      rawBody: BODY,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(r).toEqual({ ok: false, reason: 'MISSING' });
  });

  it('MALFORMED si format invalide', () => {
    const r = verifyBridgeSignature({
      signatureHeader: 'sha256=zzz',
      timestamp: TS,
      rawBody: BODY,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(r).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('STALE si timestamp hors fenetre', () => {
    const r = verifyBridgeSignature({
      signatureHeader: good,
      timestamp: TS,
      rawBody: BODY,
      secret: SECRET,
      nowMs: NOW_MS + 600_000,
    });
    expect(r).toEqual({ ok: false, reason: 'STALE' });
  });

  it('MISMATCH si secret different', () => {
    const r = verifyBridgeSignature({
      signatureHeader: good,
      timestamp: TS,
      rawBody: BODY,
      secret: 'y'.repeat(40),
      nowMs: NOW_MS,
    });
    expect(r).toEqual({ ok: false, reason: 'MISMATCH' });
  });

  it('MISMATCH si corps altere', () => {
    const r = verifyBridgeSignature({
      signatureHeader: good,
      timestamp: TS,
      rawBody: BODY + 'tamper',
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(r).toEqual({ ok: false, reason: 'MISMATCH' });
  });
});
