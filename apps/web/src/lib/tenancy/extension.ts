// =============================================================================
// Tenancy - Extension Prisma
// =============================================================================
// Construit une extension qui, pour chaque modele tenant-scoped, injecte
// systematiquement `entityId IN [visibleIds]` (ou `id IN [...]` pour Entity)
// dans les operations de lecture et de mutation.
//
// Operations couvertes :
//   - findFirst, findMany, findUnique, findUniqueOrThrow, findFirstOrThrow
//   - count, aggregate, groupBy
//   - update, updateMany, delete, deleteMany
//   - upsert : interdit hors bypass (necessite logique custom)
//   - create / createMany : NON couvert ici - les Server Actions sont
//     responsables d'injecter le bon entityId (ne pas le deduire silencieusement)
// =============================================================================

import { Prisma } from '@reliance-finance/database';
import { buildTenancyWhere, postFilterUniqueResult } from './filter.js';
import { isTenantScoped } from './models.js';

export interface TenancyExtensionConfig {
  visibleEntityIds: string[];
}

export const tenancyExtension = (config: TenancyExtensionConfig) =>
  Prisma.defineExtension({
    name: 'reliance-tenancy',
    query: {
      $allModels: {
        async findFirst({ args, query, model }) {
          if (isTenantScoped(model)) {
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async findFirstOrThrow({ args, query, model }) {
          if (isTenantScoped(model)) {
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async findMany({ args, query, model }) {
          if (isTenantScoped(model)) {
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async findUnique({ args, query, model }) {
          const result = await query(args);
          if (!isTenantScoped(model)) return result;
          return postFilterUniqueResult(
            model,
            result as Record<string, unknown> | null,
            config.visibleEntityIds,
          );
        },
        async findUniqueOrThrow({ args, query, model }) {
          const result = await query(args);
          if (!isTenantScoped(model)) return result;
          const filtered = postFilterUniqueResult(
            model,
            result as Record<string, unknown> | null,
            config.visibleEntityIds,
          );
          if (!filtered) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Tenancy: ressource hors scope',
              { code: 'P2025', clientVersion: '6.x' },
            );
          }
          return filtered;
        },
        async count({ args, query, model }) {
          if (isTenantScoped(model)) {
            (args as Record<string, unknown>).where = buildTenancyWhere(
              model,
              (args as Record<string, unknown>).where as
                | Record<string, unknown>
                | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async aggregate({ args, query, model }) {
          if (isTenantScoped(model)) {
            (args as Record<string, unknown>).where = buildTenancyWhere(
              model,
              (args as Record<string, unknown>).where as
                | Record<string, unknown>
                | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async groupBy({ args, query, model }) {
          if (isTenantScoped(model)) {
            (args as Record<string, unknown>).where = buildTenancyWhere(
              model,
              (args as Record<string, unknown>).where as
                | Record<string, unknown>
                | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async update({ args, query, model }) {
          if (isTenantScoped(model)) {
            // Prisma WhereUniqueInput accepte AND depuis v4 (preview puis GA).
            // Le cast contourne le typage stricte des cles uniques.
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            ) as never;
          }
          return query(args);
        },
        async updateMany({ args, query, model }) {
          if (isTenantScoped(model)) {
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
        async delete({ args, query, model }) {
          if (isTenantScoped(model)) {
            // Idem update : cast pour les WhereUniqueInput etendus.
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            ) as never;
          }
          return query(args);
        },
        async deleteMany({ args, query, model }) {
          if (isTenantScoped(model)) {
            args.where = buildTenancyWhere(
              model,
              args.where as Record<string, unknown> | undefined,
              config.visibleEntityIds,
            );
          }
          return query(args);
        },
      },
    },
  });
