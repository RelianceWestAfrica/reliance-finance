# Matrice RBAC

Source : [Cadre normatif §3, §12](./cadre-normatif.md) + [ADR 0001 §2.2](./adr/0001-data-model.md)

## Roles

| Code                  | Libelle                                           | Niveau   | Rattachement       |
| --------------------- | ------------------------------------------------- | -------- | ------------------ |
| `ADMIN`               | Administrateur technique                          | Systeme  | Equipe IT          |
| `DEMANDEUR`           | Demandeur (Projet / Departement)                  | Filiale  | Operationnel       |
| `CHEF_PROJET`         | Chef de projet / Responsable chantier             | Filiale  | Operationnel       |
| `TECHNIQUE`           | Validateur technique (pour PV reception)          | Filiale  | Operationnel       |
| `DAF_PAYS`            | DAF Pays / Finance Manager Pays                   | Filiale  | Finance locale     |
| `COMPTABLE_PAYS`      | Comptable Pays (GL Accountant)                    | Filiale  | Finance locale     |
| `AP_OFFICER`          | Gestionnaire Fournisseurs & Paiements             | Filiale  | Finance locale     |
| `PAYROLL`             | Gestionnaire Paie / Admin Finance RH              | Filiale  | Finance locale     |
| `CAISSIER`            | Caissier (caisse plafonnee)                       | Filiale  | Finance locale     |
| `FINANCE_FIL_N1`      | Visa Finance Filiale niveau 1                     | Filiale  | Finance locale     |
| `FINANCE_FIL_N2`      | Visa Finance Filiale niveau 2                     | Filiale  | Finance locale     |
| `FINANCE_GROUPE`      | Visa Finance Groupe (Holding)                     | Holding  | Finance Groupe     |
| `TRESORIER_GROUPE`    | Responsable Tresorerie Groupe                     | Holding  | Tresorerie         |
| `CONTROLEUR_GROUPE`   | Controleur Financier Groupe                       | Holding  | Finance Groupe     |
| `CHIEF_ACCOUNTANT`    | Responsable Comptabilite Groupe                   | Holding  | Comptabilite       |
| `FP_AND_A`            | Responsable Budget & Cash Forecast (FP&A)         | Holding  | Pilotage           |
| `TAX_COMPLIANCE`      | Responsable Fiscalite & Conformite                | Holding  | Conformite         |
| `CONTROLEUR_INTERNE`  | Responsable Controle Interne Finance              | Holding  | Audit / Controle   |
| `DFG`                 | Directeur Financier Groupe (CFO Groupe)           | Holding  | Direction          |
| `AG`                  | Administrateur General / Comite                   | Holding  | Direction          |
| `AUDITEUR`            | Auditeur externe (lecture seule + export)         | Tout     | Externe            |

Les SPV/projets reutilisent les memes roles avec un scope `Entity` = SPV.

## Permissions (par module et par role)

Legende : `C`=Create, `R`=Read (scope filiale sauf indication), `U`=Update,
`A`=Approve (signature), `X`=Execute (paiement/cloture).

| Module                       | DEMANDEUR | DAF_PAYS | FIN_GROUPE | TRESORIER | DFG  | AG   | CTRL_INT | AUDITEUR |
| ---------------------------- | --------- | -------- | ---------- | --------- | ---- | ---- | -------- | -------- |
| M1 Users / Roles             | -         | -        | -          | -         | RU   | -    | R        | R        |
| M2 Referentiel (Entites...)  | R         | RU       | RU         | R         | CRUD | R    | R        | R        |
| M2 Plan comptable SYSCOHADA  | -         | R        | R          | R         | CRUD | R    | R        | R        |
| M2 Seuils                    | -         | R        | RU         | R         | CRUD | A    | R        | R        |
| M3 Fournisseurs              | R         | CRUD     | RU         | R         | CRUD | R    | R        | R        |
| M3 RIB / IBAN                | R         | CR       | RA         | R         | A    | -    | R        | R        |
| M3 Changement RIB            | -         | A (1/2)  | A (2/2)    | R         | R    | -    | R        | R        |
| M4 ExpenseRequest (FDA/FD)   | CRU       | RA       | RA         | R         | A    | A    | R        | R        |
| M5 OfferComparison           | CRU       | RA       | RA         | R         | A    | A    | R        | R        |
| M5 SoleSourceJustification   | CRU       | RA       | RA         | R         | A    | A    | R        | R        |
| M6 PurchaseOrder / Contract  | CRU       | RA       | RA         | R         | A    | A    | R        | R        |
| M7 Reception (PV)            | CRA       | RA       | R          | R         | R    | R    | R        | R        |
| M8 Invoice + 3-way match     | R         | CRUA     | RA         | R         | A    | -    | R        | R        |
| M9 Workflow validation       | R (own)   | R+A      | R+A        | R+A       | R+A  | R+A  | R        | R        |
| M10 Payment                  | -         | R        | RA         | CRUX      | A    | A    | R        | R        |
| M10 Anti-fraude RIB          | -         | R        | A (2/2)    | A (1/2)   | A    | -    | R        | R        |
| M11 Cash forecast 13s        | -         | CR       | RU         | RU        | RU   | R    | R        | R        |
| M12 JournalEntry             | -         | R        | R          | R         | R    | -    | R        | R        |
| M12 Comptabilisation         | -         | CR       | RU         | -         | RU   | -    | R        | R        |
| M12 Export SYSCOHADA / FEC   | -         | R        | RX         | -         | RX   | -    | RX       | RX       |
| M12 Archivage 10 ans         | -         | R        | R          | R         | R    | -    | RX       | RX       |
| M13 Controle interne         | -         | R        | R          | R         | R    | -    | CRUDX    | R        |
| M13 KPIs                     | -         | R        | R          | R         | R    | R    | R        | R        |
| M14 Reporting                | R (own)   | R        | R          | R         | R    | R    | R        | R        |
| Audit log                    | R (own)   | R (fil)  | R          | R         | R    | R    | R        | R        |

`R (fil)` = filiale uniquement. `R (own)` = uniquement les dossiers ou
l'utilisateur est le demandeur. Le role `AG` voit les dossiers Holding +
filiales agreges.

## Separation des fonctions (regles dures)

Un meme utilisateur ne peut pas, sur le **meme dossier** :

1. Etre Demandeur ET Validateur (n'importe quel niveau)
2. Etre Validateur ET Executeur paiement (Tresorerie)
3. Etre Executeur paiement ET Comptable
4. Etre Comptable ET Controleur interne

Le moteur de workflow (cf. ADR 0002 §2.4) refuse une signature qui violerait
ces regles. La verification est dupliquee en base via un index unique
conditionnel sur `Signature(entityType, entityId, actorId)` avec une matrice
d'exclusion.

## Permissions transverses (transverses a tout module)

| Action                              | Roles autorises                                    |
| ----------------------------------- | -------------------------------------------------- |
| Changer son propre mot de passe     | Tous (sauf AUDITEUR si compte externe)             |
| Inviter un utilisateur dans une entite | DFG, AG, ADMIN                                  |
| Revoquer un utilisateur             | DFG, AG, ADMIN                                     |
| Voir l'audit log d'un dossier       | Acteurs du dossier + CONTROLEUR_INTERNE + AUDITEUR |
| Verifier l'integrite chainage audit | CONTROLEUR_INTERNE, AUDITEUR, ADMIN                |
| Exporter en CSV / PDF               | Tout role avec `R` sur la donnee                   |
| Acceder a Prisma Studio (dev)       | ADMIN (et uniquement en `NODE_ENV != production`)  |
