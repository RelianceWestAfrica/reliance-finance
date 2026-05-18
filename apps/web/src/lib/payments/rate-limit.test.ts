import { afterEach, describe, expect, it } from 'vitest';

import {
  checkRateLimit,
  checkAndRecord,
  clearRateLimit,
  DEFAULT_PAYMENT_RATE_LIMIT,
} from './rate-limit.js';

const NOW = 1700000000000; // arbitraire
const CONFIG = { maxRequests: 5, windowMs: 60_000 };

describe('checkRateLimit (pure)', () => {
  it('autorise la premiere requete avec remaining = max - 1', () => {
    const { result, state } = checkRateLimit({ timestamps: [] }, NOW, CONFIG);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(state.timestamps).toEqual([NOW]);
  });

  it('refuse la 6e requete dans la meme fenetre', () => {
    const state = { timestamps: [NOW, NOW + 1, NOW + 2, NOW + 3, NOW + 4] };
    const { result } = checkRateLimit(state, NOW + 5, CONFIG);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('autorise apres expiration de la fenetre', () => {
    const state = { timestamps: [NOW - 70_000, NOW - 65_000] }; // > 60s avant
    const { result, state: newState } = checkRateLimit(state, NOW, CONFIG);
    expect(result.allowed).toBe(true);
    expect(newState.timestamps).toEqual([NOW]); // anciens oublies
  });

  it('purge les anciens timestamps hors fenetre meme si refuse', () => {
    const state = {
      timestamps: [NOW - 80_000, NOW - 70_000, NOW - 100, NOW - 50, NOW - 10, NOW - 5],
    };
    const { state: newState } = checkRateLimit(state, NOW, CONFIG);
    // Les 2 plus anciens sont hors fenetre, les 4 plus recents sont dedans + on
    // tente d'ajouter le timestamp courant -> 5 au total mais on est deja a 4
    // donc ajoute -> 5 records (= maxRequests, autorise mais a la limite).
    expect(newState.timestamps.every((ts) => ts > NOW - CONFIG.windowMs)).toBe(true);
  });

  it('resetAt = oldest + windowMs quand refuse', () => {
    const oldest = NOW - 30_000;
    const state = { timestamps: [oldest, NOW - 20_000, NOW - 10_000, NOW - 5_000, NOW - 1_000] };
    const { result } = checkRateLimit(state, NOW, CONFIG);
    expect(result.allowed).toBe(false);
    expect(result.resetAt).toBe(oldest + 60_000);
  });

  it('config personnalisee : 1 req par 10s', () => {
    const { state, result } = checkRateLimit({ timestamps: [] }, NOW, {
      maxRequests: 1,
      windowMs: 10_000,
    });
    expect(result.allowed).toBe(true);

    const { result: r2 } = checkRateLimit(state, NOW + 5_000, {
      maxRequests: 1,
      windowMs: 10_000,
    });
    expect(r2.allowed).toBe(false);

    const { result: r3 } = checkRateLimit(state, NOW + 11_000, {
      maxRequests: 1,
      windowMs: 10_000,
    });
    expect(r3.allowed).toBe(true);
  });

  it('config defaut = 5 req / 60s (cadre brief)', () => {
    expect(DEFAULT_PAYMENT_RATE_LIMIT.maxRequests).toBe(5);
    expect(DEFAULT_PAYMENT_RATE_LIMIT.windowMs).toBe(60_000);
  });
});

describe('checkAndRecord (I/O wrapper)', () => {
  afterEach(() => clearRateLimit());

  it('isole par cle', () => {
    const r1 = checkAndRecord('ip:1.1.1.1', CONFIG, NOW);
    const r2 = checkAndRecord('ip:2.2.2.2', CONFIG, NOW);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('refuse apres N requetes sur la meme cle', () => {
    for (let i = 0; i < CONFIG.maxRequests; i++) {
      checkAndRecord('ip:3.3.3.3', CONFIG, NOW + i);
    }
    const r = checkAndRecord('ip:3.3.3.3', CONFIG, NOW + CONFIG.maxRequests);
    expect(r.allowed).toBe(false);
  });

  it('clearRateLimit(key) supprime une cle', () => {
    for (let i = 0; i < CONFIG.maxRequests; i++) {
      checkAndRecord('ip:4.4.4.4', CONFIG, NOW + i);
    }
    clearRateLimit('ip:4.4.4.4');
    const r = checkAndRecord('ip:4.4.4.4', CONFIG, NOW + CONFIG.maxRequests);
    expect(r.allowed).toBe(true);
  });
});
