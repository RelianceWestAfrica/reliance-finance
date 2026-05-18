import { describe, expect, it } from 'vitest';

import { RoleCode } from '@reliance-finance/database';

import { expandVisibleEntities, hasGroupLevelRole, GROUP_LEVEL_ROLES } from './expand.js';

// Arbre de test :
//   HOLDING (ent_holding, root)
//   |- TOGO (ent_togo, parent=ent_holding)
//   |   |- SPV1 (ent_spv1, parent=ent_togo)
//   |   |- SPV2 (ent_spv2, parent=ent_togo)
//   |- CI (ent_ci, parent=ent_holding)
//       |- SPV3 (ent_spv3, parent=ent_ci)
const ENTITIES = [
  { id: 'ent_holding', parentEntityId: null },
  { id: 'ent_togo', parentEntityId: 'ent_holding' },
  { id: 'ent_spv1', parentEntityId: 'ent_togo' },
  { id: 'ent_spv2', parentEntityId: 'ent_togo' },
  { id: 'ent_ci', parentEntityId: 'ent_holding' },
  { id: 'ent_spv3', parentEntityId: 'ent_ci' },
];

describe('GROUP_LEVEL_ROLES', () => {
  it('inclut DFG, AG, ADMIN, AUDITEUR au minimum', () => {
    expect(GROUP_LEVEL_ROLES.has(RoleCode.DFG)).toBe(true);
    expect(GROUP_LEVEL_ROLES.has(RoleCode.AG)).toBe(true);
    expect(GROUP_LEVEL_ROLES.has(RoleCode.ADMIN)).toBe(true);
    expect(GROUP_LEVEL_ROLES.has(RoleCode.AUDITEUR)).toBe(true);
  });

  it('exclut les roles strictement locaux (DAF_PAYS, COMPTABLE_PAYS, AP_OFFICER, DEMANDEUR)', () => {
    expect(GROUP_LEVEL_ROLES.has(RoleCode.DAF_PAYS)).toBe(false);
    expect(GROUP_LEVEL_ROLES.has(RoleCode.COMPTABLE_PAYS)).toBe(false);
    expect(GROUP_LEVEL_ROLES.has(RoleCode.AP_OFFICER)).toBe(false);
    expect(GROUP_LEVEL_ROLES.has(RoleCode.DEMANDEUR)).toBe(false);
  });
});

describe('hasGroupLevelRole', () => {
  it('true si au moins un role groupe quel que soit l\'entite', () => {
    expect(
      hasGroupLevelRole([
        { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DAF_PAYS },
        { entityId: 'ent_holding', entityCode: 'HOLDING', role: RoleCode.DFG },
      ]),
    ).toBe(true);
  });

  it('false si tous les roles sont locaux', () => {
    expect(
      hasGroupLevelRole([
        { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DAF_PAYS },
        { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DEMANDEUR },
      ]),
    ).toBe(false);
  });

  it('false sur un set vide', () => {
    expect(hasGroupLevelRole([])).toBe(false);
  });
});

describe('expandVisibleEntities', () => {
  it('renvoie toutes les entites si l\'utilisateur a un role Groupe', () => {
    const result = expandVisibleEntities(
      [{ entityId: 'ent_holding', entityCode: 'HOLDING', role: RoleCode.DFG }],
      ENTITIES,
    );
    expect(result).toHaveLength(6);
    expect(new Set(result)).toEqual(new Set(ENTITIES.map((e) => e.id)));
  });

  it('renvoie les entites directes + descendants pour un role local', () => {
    const result = expandVisibleEntities(
      [{ entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DAF_PAYS }],
      ENTITIES,
    );
    // DAF Togo voit Togo + SPV1 + SPV2 (descendants directs)
    expect(new Set(result)).toEqual(new Set(['ent_togo', 'ent_spv1', 'ent_spv2']));
  });

  it('un DEMANDEUR sur 2 entites voit les 2 (+ descendants)', () => {
    const result = expandVisibleEntities(
      [
        { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DEMANDEUR },
        { entityId: 'ent_spv3', entityCode: 'SPV3', role: RoleCode.DEMANDEUR },
      ],
      ENTITIES,
    );
    expect(new Set(result)).toEqual(new Set(['ent_togo', 'ent_spv1', 'ent_spv2', 'ent_spv3']));
  });

  it('un DEMANDEUR sur Togo ne voit jamais CI ni SPV3', () => {
    const result = expandVisibleEntities(
      [{ entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DEMANDEUR }],
      ENTITIES,
    );
    expect(result).not.toContain('ent_ci');
    expect(result).not.toContain('ent_spv3');
    expect(result).not.toContain('ent_holding');
  });

  it('renvoie un tableau vide si pas de memberships et pas role groupe', () => {
    expect(expandVisibleEntities([], ENTITIES)).toEqual([]);
  });

  it('gere les entites orphelines (parentEntityId vers une entite inexistante)', () => {
    const broken = [
      { id: 'ent_orphan', parentEntityId: 'ent_nonexistent' },
      { id: 'ent_togo', parentEntityId: null },
    ];
    const result = expandVisibleEntities(
      [{ entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DAF_PAYS }],
      broken,
    );
    // L'orphan n'est pas descendant de Togo donc invisible
    expect(result).not.toContain('ent_orphan');
    expect(result).toContain('ent_togo');
  });

  it('ne boucle pas en cas de cycle dans l\'arbre (entites se referencant mutuellement)', () => {
    const cyclic = [
      { id: 'a', parentEntityId: 'b' },
      { id: 'b', parentEntityId: 'a' },
    ];
    const result = expandVisibleEntities(
      [{ entityId: 'a', entityCode: 'A', role: RoleCode.DAF_PAYS }],
      cyclic,
    );
    // Doit terminer (pas de stack overflow) avec a et b accessibles
    expect(new Set(result)).toEqual(new Set(['a', 'b']));
  });
});
