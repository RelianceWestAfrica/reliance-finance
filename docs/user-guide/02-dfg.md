# Guide DFG (Directeur Financier Groupe)

> Le **DFG** est le validateur ultime au niveau Groupe. Visibilite totale
> sur toutes les filiales / SPV. Decisionnaire sur les dossiers depassant
> les seuils Filiale.

## Vue d'ensemble

A votre arrivee sur le **tableau de bord**, vous voyez :

- Les dossiers en attente de votre signature (validation Groupe)
- Les anomalies CRITICAL et HIGH non resolues
- Le top 5 KPIs (taux conformite, delai moyen FD-paiement, urgences hors
  delai)
- L'horizon de cash sur 13 semaines avec alerte rouge si rupture < J+30

## Actions quotidiennes

### 1. Valider les dossiers Groupe en attente

**Demandes de fonds > Filtre "Validation Groupe en attente"**

Pour chaque dossier :

1. Cliquer pour ouvrir
2. Verifier :
   - Justification metier (description + justification)
   - Cadrage budgetaire (OPEX/CAPEX, ligne budgetaire)
   - Niveau urgence et motif
   - Lignes de depense detaillees
   - **Conformite procedure** (FD_URGENCE : 4 conditions cumulatives ?)
3. Bouton **Valider** (avec commentaire optionnel) ou **Rejeter** (motif
   obligatoire)
4. Votre signature est ajoutee a la chaine cryptographique
5. Le dossier continue son workflow (validation AG si > seuil AG, sinon BC)

> **Garde anti-fraude** : vous ne pouvez pas valider un dossier que vous
> avez vous-meme cree. Tentez-le : message "Action refusee : separation
> des fonctions".

### 2. Traiter les anomalies CRITICAL

**Anomalies > Filtre Severite = CRITICAL**

Categories courantes (cf. M13) :

| Type | Action |
| ---- | ------ |
| `CASH_RUPTURE_PROJECTED` | Verifier le cash forecast 13 semaines, mobiliser cash / arbitrer paiements |
| `BANK_ACCOUNT_CHANGE_SUSPICIOUS` | Coordonner avec CONTROLEUR_INTERNE pour investigation |
| `INVOICE_DUPLICATE_SUSPECTED` | Verifier 3-way match avec fournisseur, bloquer le paiement si confirme |
| `PAYMENT_FRACTIONING_SUSPECTED` | Investiguer le pattern (fraude potentielle) |
| `REPEATED_URGENCY` | Demander a controleur interne d'auditer le demandeur |

Workflow par anomalie : **ACK** (vu) -> **IN_PROGRESS** (en cours
d'investigation) -> **RESOLVED** (avec note de cloture obligatoire).

### 3. Suivre le cash forecast

**Cash forecast** -> vue 13 semaines par entite ou agregee Groupe :

- Courbe cash position previsionnelle
- Heatmap entrees / sorties par semaine
- Alertes rupture proactives (cron quotidien 06h30, vous recevez une
  notification + email)
- Snapshots hebdo (clic droit sur une semaine passee pour comparer
  previsionnel vs realise)

## Actions hebdomadaires

### KPIs et reporting

**Reporting > Tableau de bord DFG**

- Taux dossiers conformes (% sans anomalie cloturee)
- Delai moyen FDA / FD -> paiement effectif
- Top 5 anomalies de la semaine
- Top 10 fournisseurs en volume de paiement
- Ratios OPEX / CAPEX par entite

Export PDF du tableau de bord via le bouton **Export**.

### Audit ponctuel

**Audit > Filtres avances**

- Verifier la chaine d'un dossier "sensible" : ouvrir le dossier, bouton
  **Verifier integrite** dans la sidebar
- Toutes les actions des 30 derniers jours par utilisateur : filtre par
  actorId
- Export CSV ou PDF de l'audit

## Validations specifiques

### Changement de RIB fournisseur (double validation N2)

Quand un fournisseur change son RIB, la procedure exige une **double
validation** :

1. Le DAF Pays valide en N1 -> statut DUAL_VALIDATION_PENDING
2. **Vous (ou un Tresorier Groupe)** validez en N2 -> le nouveau RIB
   passe en **QUARANTAINE 24h** avant d'etre utilisable
3. Pendant ces 24h, toute tentative de paiement vers ce RIB est **bloquee**
4. Le cron `activate-quarantines` (toutes les 15 min) active automatiquement
   le RIB une fois les 24h ecoulees

> **Garde de separation des fonctions** : vous ne pouvez pas valider en
> N2 si vous etes le demandeur du changement OU le validateur N1.

### Paiement double validation (anti-fraude beneficiaire)

Tout paiement passe par une **double validation** :

1. Le Tresorier prepare le paiement (snapshot beneficiaire + RIB)
2. La 2eme personne (vous OU un autre Tresorier) valide
3. L'execution declenche un check anti-fraude :
   - Beneficiaire == fournisseur du BC ?
   - RIB hors quarantaine ?
   - PV present ?
4. Si OK : le paiement passe en EXECUTED, preuve bancaire obligatoire
   (SWIFT, avis de debit)

## Documents PDF

A tout moment, vous pouvez exporter un PDF (avec QR de verification de
chaine audit) :

- Dossier FDA / FD : bouton **Exporter PDF** sur la fiche
- Bon de commande : idem
- PV de reception : idem
- Facture / Avoir : idem
- Recu de paiement : idem

Le QR code sur chaque PDF ouvre une page publique de verification de
l'integrite de la chaine. Si quelqu'un modifie un PDF, le QR detecte
l'incoherence.

## Acces special : tous les SPV / Filiales

En tant que DFG, vous avez un **role Groupe** : la tenancy applicative
est etendue automatiquement a TOUTES les entites du Groupe, y compris les
nouveaux SPV crees ensuite. Pas de demarche supplementaire.
