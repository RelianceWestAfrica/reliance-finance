import { describe, expect, it, vi } from 'vitest';

import { appendAudit, verifyChain } from './log.js';
import { computeHash } from './hash.js';

// =============================================================================
// Helper : construit un mock Prisma client minimal pour tester la logique de
// chainage sans toucher a la DB. On instrumente uniquement les operations
// utilisees par appendAudit et verifyChain.
// =============================================================================

interface FakeAuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  payload: unknown;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
  ip: string | null;
  userAgent: string | null;
}

function buildMockPrisma(initialRows: FakeAuditRow[] = []) {
  const rows: FakeAuditRow[] = [...initialRows];

  const tx = {
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { entityType: string; entityId: string } }) => {
        // Tri composite : createdAt DESC puis id DESC (deterministe en cas de
        // collision ms), aligne avec l'orderBy de la prod.
        const matches = rows
          .filter((r) => r.entityType === where.entityType && r.entityId === where.entityId)
          .sort((a, b) => {
            const t = b.createdAt.getTime() - a.createdAt.getTime();
            if (t !== 0) return t;
            return b.id.localeCompare(a.id);
          });
        return matches[0] ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<FakeAuditRow, 'id'> }) => {
        const row: FakeAuditRow = {
          id: 'log_' + (rows.length + 1),
          ...data,
          actorId: data.actorId ?? null,
          ip: data.ip ?? null,
          userAgent: data.userAgent ?? null,
        };
        rows.push(row);
        return row;
      }),
    },
  };

  const client = {
    auditLog: {
      findMany: vi.fn(async ({ where }: { where: { entityType: string; entityId: string } }) => {
        // verifyChain consomme toujours en ordre asc (createdAt puis id).
        const matches = rows.filter(
          (r) => r.entityType === where.entityType && r.entityId === where.entityId,
        );
        return matches.sort((a, b) => {
          const t = a.createdAt.getTime() - b.createdAt.getTime();
          if (t !== 0) return t;
          return a.id.localeCompare(b.id);
        });
      }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { client, rows, tx };
}

describe('appendAudit', () => {
  it('insere la premiere entree avec prevHash = null et un hash deterministe', async () => {
    const { client, rows } = buildMockPrisma();

    const result = await appendAudit(
      {
        entityType: 'User',
        entityId: 'u1',
        action: 'auth.login.success',
        actorId: 'u1',
        payload: { ip: '1.2.3.4' },
      },
      client as never,
    );

    expect(rows).toHaveLength(1);
    expect(result.prevHash).toBeNull();
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.hash).toBe(
      computeHash({
        prevHash: null,
        action: 'auth.login.success',
        payload: { ip: '1.2.3.4' },
        actorId: 'u1',
        createdAt: result.createdAt,
      }),
    );
  });

  it('chaine la 2e entree au hash de la 1ere', async () => {
    const { client, rows } = buildMockPrisma();

    const first = await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a1', actorId: 'u1', payload: {} },
      client as never,
    );
    const second = await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a2', actorId: 'u1', payload: {} },
      client as never,
    );

    expect(rows).toHaveLength(2);
    expect(second.prevHash).toBe(first.hash);
  });

  it('chaines independantes pour deux (entityType, entityId) distincts', async () => {
    const { client, rows } = buildMockPrisma();

    await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a', actorId: null, payload: {} },
      client as never,
    );
    const otherFirst = await appendAudit(
      { entityType: 'User', entityId: 'u2', action: 'a', actorId: null, payload: {} },
      client as never,
    );
    expect(otherFirst.prevHash).toBeNull();
    expect(rows).toHaveLength(2);
  });

  it('utilise une transaction Serializable', async () => {
    const { client } = buildMockPrisma();
    await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a', actorId: null, payload: {} },
      client as never,
    );
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});

describe('verifyChain', () => {
  it('OK sur une chaine vide', async () => {
    const { client } = buildMockPrisma();
    const result = await verifyChain('User', 'u1', client as never);
    expect(result).toEqual({ ok: true, count: 0, reason: 'NO_ENTRIES' });
  });

  it('OK sur une chaine valide (3 entrees consecutives)', async () => {
    const { client } = buildMockPrisma();
    for (let i = 0; i < 3; i++) {
      await appendAudit(
        { entityType: 'User', entityId: 'u1', action: 'a' + i, actorId: 'u1', payload: { i } },
        client as never,
      );
    }
    const result = await verifyChain('User', 'u1', client as never);
    expect(result).toEqual({ ok: true, count: 3 });
  });

  it('detecte une rupture quand payload est altere a posteriori', async () => {
    const { client, rows } = buildMockPrisma();
    await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a1', actorId: 'u1', payload: { v: 1 } },
      client as never,
    );
    await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a2', actorId: 'u1', payload: { v: 2 } },
      client as never,
    );

    // Falsification : on modifie le payload de la 1ere ligne sans recalculer son hash.
    rows[0]!.payload = { v: 999 };

    const result = await verifyChain('User', 'u1', client as never);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('HASH_MISMATCH');
    expect(result.brokenAtIndex).toBe(0);
  });

  it('detecte un prevHash incoherent (insertion frauduleuse)', async () => {
    const { client, rows } = buildMockPrisma();
    await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a1', actorId: 'u1', payload: {} },
      client as never,
    );
    await appendAudit(
      { entityType: 'User', entityId: 'u1', action: 'a2', actorId: 'u1', payload: {} },
      client as never,
    );

    // Falsification : on remplace le prevHash de la 2e entree par une valeur arbitraire.
    rows[1]!.prevHash = 'deadbeef'.repeat(8);

    const result = await verifyChain('User', 'u1', client as never);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('PREV_HASH_MISMATCH');
    expect(result.brokenAtIndex).toBe(1);
  });

  it('chaine d\'une seule entree avec actorId null', async () => {
    const { client } = buildMockPrisma();
    await appendAudit(
      { entityType: 'System', entityId: 'startup', action: 'boot', payload: { v: 1 } },
      client as never,
    );
    const result = await verifyChain('System', 'startup', client as never);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });
});
