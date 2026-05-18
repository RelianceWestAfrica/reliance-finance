# ADR 0002 — Moteur de workflow

- **Statut** : Accepted
- **Date** : 2026-05-18
- **Auteurs** : Bootstrap automatise (session Claude Code)
- **Sources** : [docs/cadre-normatif.md](../cadre-normatif.md), [ADR 0001](./0001-data-model.md)

## 1. Contexte

Le cadre normatif (§5, §3) impose un workflow strict pour chaque dossier de
depense, avec :

- **8 etapes** de traitement (reception → controle doc → budget → visa filiale →
  visa groupe → AG si requis → execution paiement → comptabilisation)
- **Validations cascadees par seuil** (visa Filiale → Groupe → AG selon montants
  configurables)
- **Separation des fonctions** dure : un meme utilisateur ne peut pas tenir deux
  roles incompatibles sur le meme dossier (Demandeur != Validateur != Executeur)
- **Regles "STOP"** par acteur (cadre §p17-22 : "Sans PV = pas de paiement final",
  "RIB non verifie = blocage", etc.)
- **Procedure exceptionnelle "Urgence"** (§7) avec regularisation obligatoire sous 72h
- **Signatures electroniques** : chaque visa produit une preuve cryptographique
  (hash document + timestamp + acteur + IP + UA)

## 2. Decision

### 2.1. Implementation : machines a etats declaratives, custom (pas XState)

Le moteur est implemente dans `packages/workflow-engine/` comme une librairie
TypeScript pure, sans dependance externe lourde. Chaque type de dossier
(`ExpenseRequest`, `PurchaseOrder`, `Reception`, `Invoice`, `Payment`,
`BankAccountChangeRequest`) declare son schema d'etats.

**Rejete : XState** — puissant mais : (1) genere des objets d'etat complexes
mal serialises en DB, (2) overkill pour des transitions lineaires majoritaires,
(3) ajoute 30 KB+ a chaque app cliente qui en aurait besoin. L'implementation
custom tient en ~500 lignes.

### 2.2. Schema d'un workflow

```ts
type WorkflowDefinition<TStatus extends string, TContext> = {
  type: 'EXPENSE_REQUEST' | 'PURCHASE_ORDER' | 'RECEPTION' | 'INVOICE' | 'PAYMENT' | 'BANK_ACCOUNT_CHANGE';
  initialStatus: TStatus;
  states: Record<TStatus, {
    transitions: Record<string /* action */, {
      to: TStatus;
      guards?: Guard<TContext>[];          // bloque la transition si l'un retourne false
      requiredRoles?: Role[];              // role(s) autorises a declencher
      requiredSignatures?: SignatureSlot[];// signatures a recolter (cascade par seuil)
      sideEffects?: SideEffect<TContext>[];// notifications, audit log, etc.
    }>;
    onEnter?: SideEffect<TContext>[];
    onExit?: SideEffect<TContext>[];
    sla?: { hours: number; onBreach: 'NOTIFY' | 'ESCALATE' | 'AUTO_REJECT' };
  }>;
};
```

Une `Guard` est une fonction pure `(ctx) => true | { blocked: string }`.

Exemple — regle "STOP" sur paiement :
```ts
const guard_PV_required: Guard<PaymentContext> = (ctx) =>
  ctx.invoice.receptionId !== null
    ? true
    : { blocked: 'Sans PV de reception, paiement interdit (cadre §4.1 + §6.4)' };
```

### 2.3. Calcul dynamique de la chaine d'approbateurs

Les seuils sont stockes dans la table `Threshold` (cf. ADR 0001), configurables
par l'admin sans deploiement. Pour un montant donne :

```ts
function computeApprovalChain(ctx: ExpenseRequestContext): SignatureSlot[] {
  const slots: SignatureSlot[] = [];

  // N1 toujours requis
  slots.push({ role: 'FINANCE_FIL_N1', stage: 'VISA_FILIALE' });

  // N2 si montant > seuil filiale
  const filThreshold = await getThreshold('FILIALE_N2_REQUIRED_ABOVE', ctx.entityId);
  if (ctx.amountInGroupCurrency > filThreshold) {
    slots.push({ role: 'FINANCE_FIL_N2', stage: 'VISA_FILIALE' });
  }

  // Groupe si montant > seuil groupe OU fournisseur sensible
  const groupThreshold = await getThreshold('GROUPE_REQUIRED_ABOVE', null);
  if (ctx.amountInGroupCurrency > groupThreshold || ctx.supplier.isSensitive) {
    slots.push({ role: 'FINANCE_GROUPE', stage: 'VISA_GROUPE' });
  }

  // AG si montant > seuil strategique OU hors budget OU fournisseur strategique
  const agThreshold = await getThreshold('AG_REQUIRED_ABOVE', null);
  if (ctx.amountInGroupCurrency > agThreshold || ctx.isOutOfBudget || ctx.supplier.isStrategic) {
    slots.push({ role: 'AG', stage: 'AUTHORIZATION_AG' });
  }

  return slots;
}
```

Les seuils par defaut sont seedes (cf. seed.ts) et modifiables par le DFG.

### 2.4. Separation des fonctions (regle dure)

Au moment d'enregistrer une signature, le moteur verifie :

```
forbid_if_actor_already_signed_in_role(dossierId, actorId, signature.role) {
  if (actor a deja signe sur ce dossier avec un role mutuellement exclusif)
    throw new SeparationOfDutiesError(...);
}
```

Matrice d'exclusion :
- Demandeur ne peut PAS etre validateur (N1/N2/Groupe) sur SON dossier
- Validateur ne peut PAS etre executeur paiement
- Executeur paiement ne peut PAS etre comptable du meme dossier
- Comptable ne peut PAS etre controleur interne

Implementee en TS pure + verifiee en DB via un index unique conditionnel sur
`Signature(entityType, entityId, actorId, role)`.

### 2.5. Signatures electroniques (chainage cryptographique)

Chaque transition validee produit un `Signature` :

```
Signature {
  id, workflowInstanceId, stepId, actorId, role,
  documentHash (sha256 du document signe a cet instant),
  prevSignatureHash (signature precedente sur le meme dossier),
  signatureHash (hash de cette signature : prevHash + documentHash + actorId + ts + ip + ua),
  signedAt, ip, userAgent,
  comment?
}
```

L'utilisateur voit "Signer" → modal de confirmation avec preview du document hash +
mot de passe / second facteur (P1+ : WebAuthn). Le serveur capture l'IP/UA et
calcule le hash. La signature est inviolable par chainage.

### 2.6. Procedure "Urgence"

Variante du workflow `ExpenseRequest` avec :

- `type = FD_URGENCE`
- Etats reduits : `DRAFT → AG_EMERGENCY_APPROVAL → EXECUTED → REGULARIZATION_PENDING → REGULARIZED / NON_COMPLIANT`
- Garde dure : les **4 conditions cumulatives** du cadre §7 (risque chantier OU HSE OU legal immediat + montant <= plafond + trace ecrite + engagement de regularisation)
- SLA `72h` (configurable) sur l'etat `REGULARIZATION_PENDING` : depasse → bascule auto en `NON_COMPLIANT` + alerte DFG + entree `Anomaly` automatique
- Compteur "urgences repetees" par demandeur/fournisseur → declenche un workflow de revue contole interne

### 2.7. Notifications

A chaque entree dans un etat `WAITING_FOR_X`, les acteurs habilites (selon
`Membership.role × Entity`) recoivent :

- Notification in-app (table `Notification`)
- Email (via le service `EmailNotificationService` qui utilise Mailhog en dev,
  SMTP de prod sinon)

Les notifications de validation peuvent etre cliquees pour ouvrir directement
le dossier en mode "decision".

### 2.8. Persistance de l'instance

Chaque dossier porte (denormalisation pour perf) :

- `status` (etat courant)
- `workflowInstanceId` -> table `WorkflowInstance` qui stocke le snapshot d'etat
  complet (JSONB) et l'historique des transitions
- Liste de `WorkflowStep` (une ligne par transition franchie)
- Liste de `Signature` (une ligne par signature collectee)

Les machines a etats peuvent etre versionnees : `WorkflowInstance.definitionVersion`
fige la version du schema utilisee pour ce dossier (permet d'evoluer les workflows
sans casser les dossiers en cours).

## 3. Consequences

### Positives

- **Auditabilite** : tout est tracable (qui, quand, depuis ou, pourquoi).
- **Conformite** : les regles "STOP" du cadre sont des gardes du code, pas de la doc.
- **Evolutivite** : ajouter une etape = modifier la definition + migration de version.
- **Configurabilite** : les seuils sont en base, modifiables par le DFG sans deploiement.
- **Reusabilite** : meme moteur pour tous les types de dossiers.

### Negatives

- **Complexite** : un moteur custom = bugs possibles dans les transitions. Tests
  unitaires obligatoires (couverture > 90% pour le package `workflow-engine`).
- **Aucun outil graphique** type Camunda pour visualiser les flux : a compenser
  par des diagrammes Mermaid generes a partir des definitions.
- **Locking** : deux validateurs cliquant simultanement sur "Approuver" peuvent
  creer deux signatures. Mitigation : verrou pessimiste sur le dossier au moment
  de la transition + index unique sur `Signature(workflowInstanceId, stepId, actorId)`.

### Neutres

- Le moteur ne couvre pas les notifications a J+N (rappels). Un job de cron
  separe (`packages/jobs`, future session) lira les workflows en attente et
  produira des reminders.

## 4. Alternatives considerees

1. **XState** : voir §2.1. Rejete pour poids et serialisation.
2. **Camunda 8 / Zeebe** : trop lourd pour ce volume, dependance JVM.
3. **Workflow en base de donnees pure (triggers PG + state machine SQL)** :
   illisible, intestable, impossible a versionner. Rejete.
4. **n8n / Temporal** : outils generaux non specialises finance, ajoutent un
   service a operer (Temporal). Rejete.
5. **Aucun moteur, juste des if/else dans les Server Actions** : route de la dette
   technique garantie a moyen terme. Rejete.

## 5. Ouvertures / chantiers ulterieurs

- **WebAuthn / FIDO2** pour signature : passe a P1 (session M9). Pour P0, mot de
  passe + capture IP/UA suffisent.
- **Visualisation Mermaid des workflows** : generateur a partir des definitions
  (script `pnpm workflow:diagrams`).
- **Workflow editor visuel pour DFG** : explicite hors scope P0. Si demande,
  evaluer ReactFlow + serialisation JSON.
- **Multi-langue des messages "blocked"** : pour l'instant FR uniquement
  (audience interne RWA). i18n a evaluer si besoin EN/ZH (cf. `reliancewestafrica-website` trilingue).
