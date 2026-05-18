// =============================================================================
// Payment - Rate limiting (sliding window in-memory)
// =============================================================================
// Cadre brief : "Rate limiting sur endpoints sensibles (paiements, changements
// RIB) : 5 req/min/IP".
//
// V0 : in-memory Map (single-process). Pour deployer en multi-instance,
// remplacer par Redis (session M12 deploiement).
//
// Logique PURE : `check()` prend un timestamp + memoire courante, retourne
// allowed + remaining. Pas d'I/O.
// =============================================================================

export interface RateLimitConfig {
  /** Nombre max de requetes dans la fenetre */
  maxRequests: number;
  /** Duree de la fenetre en millisecondes */
  windowMs: number;
}

export const DEFAULT_PAYMENT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 60_000, // 1 minute
};

export interface RateLimitState {
  /** Timestamps des requetes (epoch ms), gardes uniquement ceux dans la fenetre */
  timestamps: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Logique pure : decide si une requete est autorisee + met a jour la fenetre.
 *
 * @returns nouveau state + verdict
 */
export function checkRateLimit(
  state: RateLimitState,
  now: number,
  config: RateLimitConfig = DEFAULT_PAYMENT_RATE_LIMIT,
): { state: RateLimitState; result: RateLimitResult } {
  const windowStart = now - config.windowMs;
  // Garde uniquement les timestamps dans la fenetre courante
  const recent = state.timestamps.filter((ts) => ts > windowStart);

  if (recent.length >= config.maxRequests) {
    // Refuse - le plus ancien dans la fenetre defini quand la limite se libere
    const oldest = recent[0] ?? now;
    return {
      state: { timestamps: recent },
      result: {
        allowed: false,
        remaining: 0,
        resetAt: oldest + config.windowMs,
      },
    };
  }

  // Autorise + enregistre la nouvelle requete
  recent.push(now);
  return {
    state: { timestamps: recent },
    result: {
      allowed: true,
      remaining: config.maxRequests - recent.length,
      resetAt: now + config.windowMs,
    },
  };
}

// =============================================================================
// Stockage in-memory par cle (typiquement IP + endpoint)
// =============================================================================

const store = new Map<string, RateLimitState>();

export function checkAndRecord(
  key: string,
  config: RateLimitConfig = DEFAULT_PAYMENT_RATE_LIMIT,
  now: number = Date.now(),
): RateLimitResult {
  const current = store.get(key) ?? { timestamps: [] };
  const { state, result } = checkRateLimit(current, now, config);
  store.set(key, state);
  return result;
}

export function clearRateLimit(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}

/**
 * @internal pour les tests : taille du store global
 */
export function _storeSize(): number {
  return store.size;
}
