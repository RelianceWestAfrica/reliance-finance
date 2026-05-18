// =============================================================================
// Workflow definitions - ExpenseRequest standard + urgence
// =============================================================================
// Implementation des machines a etats selon le cadre §5 + ADR 0002.
//
// Standard `expense_request_standard_v1` :
//   DRAFT
//     -> SUBMITTED (submit, demandeur)
//   SUBMITTED
//     -> FINANCE_FIL_VISA_PENDING (start-signatures, automatique apres submit)
//   FINANCE_FIL_VISA_PENDING / FINANCE_FIL_VISA_OK / FINANCE_GROUPE_VISA_PENDING ...
//   -> APPROVED (toutes signatures collectees)
//   -> REJECTED (n'importe quel approbateur)
//   -> CANCELLED (demandeur, depuis DRAFT seulement)
//
// Note : la "vraie" cascade de signatures est geree par `computeApprovalChain`
// + `canActorSignNext`. Le workflow ici materialise les transitions globales
// (status du dossier), pas chaque cran intermediaire.
// =============================================================================

import {
  DocumentType,
  ExpenseRequestStatus,
  RoleCode,
} from '@reliance-finance/database';
import type { WorkflowDefinition, Guard } from '@reliance-finance/workflow-engine';

export interface ExpenseRequestCtx {
  amountInGroupCurrency: number;
  hasOfferComparison: boolean;
  hasSoleSourceJustification: boolean;
  threeOffersThreshold: number | null;
  hasPV: boolean;
  isFinalPayment: boolean;
  isUrgence: boolean;
  emergencyConditionsMet: boolean;
}

// =============================================================================
// Guards reutilisables
// =============================================================================

/** Cadre §6 : tout achat > seuil "3 offres" doit avoir un comparatif OU une justification offre unique */
export const guardOfferComparisonOrJustification: Guard<ExpenseRequestCtx> = (ctx) => {
  if (ctx.threeOffersThreshold === null) return true;
  if (ctx.amountInGroupCurrency <= ctx.threeOffersThreshold) return true;
  if (ctx.hasOfferComparison || ctx.hasSoleSourceJustification) return true;
  return {
    blocked:
      'Au-dessus du seuil "3 offres" (' +
      ctx.threeOffersThreshold +
      ') : un comparatif d\'offres OU une justification offre unique signee est requis (cadre §6).',
  };
};

/** Cadre §4.1 : "Sans PV = pas de paiement final" - bloque APPROVED si pas de PV pour un paiement final */
export const guardPVRequiredForFinalPayment: Guard<ExpenseRequestCtx> = (ctx) => {
  if (!ctx.isFinalPayment) return true;
  if (ctx.hasPV) return true;
  return {
    blocked:
      'Sans PV de reception/service fait, paiement final interdit (cadre §4.1 + §6.4).',
  };
};

/** Pour FD_URGENCE : les 4 conditions cumulatives doivent etre remplies */
export const guardEmergencyConditionsMet: Guard<ExpenseRequestCtx> = (ctx) => {
  if (!ctx.isUrgence) return true;
  if (ctx.emergencyConditionsMet) return true;
  return {
    blocked:
      'Les 4 conditions cumulatives de la procedure urgence (cadre §7) ne sont pas reunies.',
  };
};

// =============================================================================
// Workflow standard
// =============================================================================

export const expenseRequestStandardWorkflow: WorkflowDefinition<
  ExpenseRequestStatus,
  ExpenseRequestCtx
> = {
  type: DocumentType.FD,
  key: 'expense_request_standard',
  version: 1,
  initialStatus: ExpenseRequestStatus.DRAFT,
  states: {
    DRAFT: {
      transitions: {
        submit: {
          to: ExpenseRequestStatus.SUBMITTED,
          guards: [guardOfferComparisonOrJustification],
        },
        cancel: {
          to: ExpenseRequestStatus.CANCELLED,
        },
      },
    },
    SUBMITTED: {
      transitions: {
        'start-control': {
          to: ExpenseRequestStatus.CONTROL_DOC_OK,
          requiredRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS, RoleCode.AP_OFFICER],
        },
        reject: {
          to: ExpenseRequestStatus.REJECTED,
          requiredRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS, RoleCode.DFG],
        },
      },
    },
    CONTROL_DOC_OK: {
      transitions: {
        'budget-ok': {
          to: ExpenseRequestStatus.BUDGET_OK,
          requiredRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS],
        },
        reject: {
          to: ExpenseRequestStatus.REJECTED,
          requiredRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS, RoleCode.DFG],
        },
      },
    },
    CONTROL_DOC_KO: {
      transitions: {
        // Apres correction : retour SUBMITTED pour re-controle
        resubmit: {
          to: ExpenseRequestStatus.SUBMITTED,
        },
      },
    },
    BUDGET_OK: {
      transitions: {
        'start-signatures': {
          to: ExpenseRequestStatus.FINANCE_FIL_VISA_PENDING,
        },
      },
    },
    BUDGET_KO: {
      transitions: {
        resubmit: { to: ExpenseRequestStatus.SUBMITTED },
      },
    },
    FINANCE_FIL_VISA_PENDING: {
      transitions: {
        sign: {
          to: ExpenseRequestStatus.FINANCE_FIL_VISA_OK,
          // requiredRoles + separation valides par canActorSignNext en amont
        },
        reject: {
          to: ExpenseRequestStatus.REJECTED,
          requiredRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.FINANCE_FIL_N2, RoleCode.DAF_PAYS],
        },
      },
    },
    FINANCE_FIL_VISA_OK: {
      transitions: {
        // Avance soit vers Groupe, soit directement APPROVED si pas de Groupe requis
        'continue-to-groupe': { to: ExpenseRequestStatus.FINANCE_GROUPE_VISA_PENDING },
        approve: { to: ExpenseRequestStatus.APPROVED, guards: [guardPVRequiredForFinalPayment] },
      },
    },
    FINANCE_GROUPE_VISA_PENDING: {
      transitions: {
        sign: { to: ExpenseRequestStatus.FINANCE_GROUPE_VISA_OK },
        reject: {
          to: ExpenseRequestStatus.REJECTED,
          requiredRoles: [RoleCode.FINANCE_GROUPE, RoleCode.DFG],
        },
      },
    },
    FINANCE_GROUPE_VISA_OK: {
      transitions: {
        'continue-to-ag': { to: ExpenseRequestStatus.AG_APPROVAL_PENDING },
        approve: { to: ExpenseRequestStatus.APPROVED, guards: [guardPVRequiredForFinalPayment] },
      },
    },
    AG_APPROVAL_PENDING: {
      transitions: {
        sign: { to: ExpenseRequestStatus.AG_APPROVED },
        reject: {
          to: ExpenseRequestStatus.REJECTED,
          requiredRoles: [RoleCode.AG, RoleCode.DFG],
        },
      },
    },
    AG_APPROVED: {
      transitions: {
        approve: { to: ExpenseRequestStatus.APPROVED, guards: [guardPVRequiredForFinalPayment] },
      },
    },
    APPROVED: {
      transitions: {
        archive: { to: ExpenseRequestStatus.ARCHIVED },
      },
    },
    REJECTED: {
      transitions: {
        archive: { to: ExpenseRequestStatus.ARCHIVED },
      },
    },
    ARCHIVED: { transitions: {} },
    CANCELLED: { transitions: {} },
  },
};

// =============================================================================
// Workflow urgence (FD_URGENCE) - parcours allege avec post-regularisation
// =============================================================================

export const expenseRequestEmergencyWorkflow: WorkflowDefinition<
  ExpenseRequestStatus,
  ExpenseRequestCtx
> = {
  type: DocumentType.FD_URGENCE,
  key: 'expense_request_emergency',
  version: 1,
  initialStatus: ExpenseRequestStatus.DRAFT,
  states: {
    DRAFT: {
      transitions: {
        submit: {
          to: ExpenseRequestStatus.SUBMITTED,
          guards: [guardEmergencyConditionsMet],
        },
        cancel: { to: ExpenseRequestStatus.CANCELLED },
      },
    },
    SUBMITTED: {
      transitions: {
        // En urgence, on saute directement a AG_APPROVAL_PENDING
        'start-ag-emergency': { to: ExpenseRequestStatus.AG_APPROVAL_PENDING },
        reject: { to: ExpenseRequestStatus.REJECTED },
      },
    },
    AG_APPROVAL_PENDING: {
      transitions: {
        sign: { to: ExpenseRequestStatus.AG_APPROVED },
        reject: { to: ExpenseRequestStatus.REJECTED, requiredRoles: [RoleCode.AG, RoleCode.DFG] },
      },
    },
    AG_APPROVED: {
      transitions: {
        // Apres approbation AG, le dossier est APPROVED mais en regularisation pendante
        approve: { to: ExpenseRequestStatus.APPROVED },
      },
    },
    APPROVED: {
      transitions: {
        // Regularisation = retour a un dossier complet (PV + facture + ...) post-execution
        regularize: { to: ExpenseRequestStatus.ARCHIVED },
        archive: { to: ExpenseRequestStatus.ARCHIVED },
      },
    },
    // Etats non utilises dans le parcours urgence (declares pour completude
    // du type ExpenseRequestStatus)
    CONTROL_DOC_OK: { transitions: {} },
    CONTROL_DOC_KO: { transitions: {} },
    BUDGET_OK: { transitions: {} },
    BUDGET_KO: { transitions: {} },
    FINANCE_FIL_VISA_PENDING: { transitions: {} },
    FINANCE_FIL_VISA_OK: { transitions: {} },
    FINANCE_GROUPE_VISA_PENDING: { transitions: {} },
    FINANCE_GROUPE_VISA_OK: { transitions: {} },
    REJECTED: {
      transitions: {
        archive: { to: ExpenseRequestStatus.ARCHIVED },
      },
    },
    ARCHIVED: { transitions: {} },
    CANCELLED: { transitions: {} },
  },
};

export function workflowForType(
  type: 'FDA' | 'FD' | 'FD_URGENCE',
): WorkflowDefinition<ExpenseRequestStatus, ExpenseRequestCtx> {
  if (type === 'FD_URGENCE') return expenseRequestEmergencyWorkflow;
  // FDA et FD partagent le workflow standard pour simplifier (FDA peut etre
  // upgrade en FD via UI). Differenciation se fait sur le champ `type` du modele.
  return expenseRequestStandardWorkflow;
}
