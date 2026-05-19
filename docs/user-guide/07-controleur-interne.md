# Guide Controleur Interne / Auditeur

> Vous etes **Controleur Interne** ou **Auditeur**. Vous avez une vue
> **lecture seule etendue** sur toutes les filiales / SPV. Vous ne signez
> aucun document metier (separation des fonctions) mais vous **detectez,
> investiguez, et signalez** les anomalies.

## Mission

- Examiner les anomalies detectees automatiquement par le systeme
- Realiser des controles a posteriori (audit log, chaine cryptographique)
- Investiguer les patterns suspects (fraude, contournement)
- Reporter au DFG / AG les incidents materiels

## Vue d'ensemble

**Anomalies** est votre vue principale. Filtres recommandes :

- Severite CRITICAL + HIGH non resolues
- Type = `BANK_ACCOUNT_CHANGE_SUSPICIOUS`
- Entite = mon perimetre
- Periode = 7 derniers jours

## Anomalies automatiques

Le systeme detecte automatiquement les patterns suivants (cron horaire) :

| Type | Severite par defaut | Description |
| ---- | -------------------- | ----------- |
| `BANK_ACCOUNT_CHANGE_SUSPICIOUS` | CRITICAL si fournisseur sensible | Changement RIB recurrent (>2 en 30j) OU changement < 7j apres creation OU fournisseur strategique |
| `INVOICE_DUPLICATE_SUSPECTED` | HIGH | Meme fournisseur, montant proche +-1%, dates proches < 5j |
| `PAYMENT_FRACTIONING_SUSPECTED` | HIGH | >= 3 paiements meme fournisseur 7j sous seuils Filiale |
| `MISSING_PV` | MEDIUM | BC livre > 14j sans PV associe |
| `STALE_DRAFT` | LOW | FDA / FD en DRAFT > 30j |
| `REPEATED_URGENCY` | HIGH | Meme demandeur > 5 urgences en 30j |
| `EMERGENCY_OVERDUE` | HIGH | FD_URGENCE non regularisee a J+3 |
| `CASH_RUPTURE_PROJECTED` | CRITICAL si J+14 | Rupture cash detectee au cash forecast 13s |
| `INVOICE_3WAY_MISMATCH` | MEDIUM | Ecart prix > 5% ou total > 1% BC vs facture |
| `PAYMENT_EXEC_WITHOUT_PROOF` | LOW | Paiement EXECUTED sans preuve bancaire 24h apres |

## Workflow d'investigation

Pour chaque anomalie a traiter :

### 1. Accuser reception (ACK)

- Cliquer **Prendre en charge** sur l'anomalie
- Statut passe de DETECTED a IN_PROGRESS, vous etes assigne
- Vous avez 48h pour la traiter (sinon escalade automatique au DFG)

### 2. Investigation

Selon le type :

**BANK_ACCOUNT_CHANGE_SUSPICIOUS** :
- Verifier le historique des RIBs du fournisseur (Fournisseurs > Fiche
  > onglet RIBs + Historique)
- Verifier les paiements recents vers cet ancien et nouveau RIB
- Appeler le fournisseur sur le **numero officiel pre-existant** (pas le
  numero qui a accompagne le changement) pour confirmer
- Si suspect : alerter immediatement DFG + Tresorier pour bloquer les
  paiements en cours

**INVOICE_DUPLICATE_SUSPECTED** :
- Comparer les deux factures (mention "DUPLICATA" ? numeros sequentiels ?)
- Verifier le BC source et les PV associes
- Verifier les paiements deja effectues
- Si confirme duplicate : marquer une des factures en DISPUTED + alerter
  fournisseur + DFG

**PAYMENT_FRACTIONING_SUSPECTED** :
- Calculer le montant total : aurait-il du passer en validation Groupe ?
- Examiner si meme projet / meme demandeur
- Si fractionnement avere : creer un rapport, escalade DFG + AG

**REPEATED_URGENCY** :
- Examiner les 5 urgences du demandeur
- Verifier si les 4 conditions cumulatives etaient toutes verifiees
- Si abus : rapport circonstancie + entretien demandeur

### 3. Resolution

- Cliquer **Marquer comme resolu** + note de cloture obligatoire
- La note est ajoutee a la chaine audit
- L'anomalie reste consultable mais sortie des filtres "actifs"

### 4. Escalade (si necessaire)

- Bouton **Escalader au DFG** ou **Escalader a l'AG** selon la gravite
- Le destinataire recoit une notification + l'anomalie passe en attente
  de sa decision

## Verification de la chaine audit

A tout moment vous pouvez verifier l'**integrite** d'un dossier :

**Audit > Selection entityType + entityId > Verifier la chaine**

Reponses possibles :

| Reponse | Detail |
| ------- | ------ |
| OK | La chaine SHA-256 est intacte, aucune modification post-hoc |
| HASH_MISMATCH | Un event a ete altere : son hash recalcule ne correspond pas |
| PREV_HASH_MISMATCH | La sequence des events est corrompue (un event a ete retire ou insere) |
| EMPTY | Aucun event sur cette entite (normal pour entite jamais touchee) |

Toute reponse autre que OK / EMPTY est un **incident grave** : la base
de donnees a ete manipulee hors application. Escalade immediate au DFG +
DSI.

## Export pour audit externe

Vous pouvez exporter :

- **Audit log d'une entite** : Audit > Filtre + Bouton Export CSV
- **Historique RIB d'un fournisseur** : Fournisseurs > Fiche > Historique
  RIB > Export CSV (format Excel FR avec separateur ;)
- **FEC SYSCOHADA d'une periode** : Comptabilite > Periode > Export FEC
- **PDF d'un dossier complet** : sur chaque fiche, bouton Export PDF
  (avec QR de verification)

Tous les exports gardent une trace dans l'audit log (`*_EXPORTED`).

## Acces lecture seule (role AUDITEUR)

Si vous etes **AUDITEUR** (pas Controleur Interne), vous avez exactement
les memes vues mais en **lecture seule** :

- Pas de prise en charge d'anomalie
- Pas de modification de quoi que ce soit
- Mais acces a tous les exports + verification chaine
- Toutes vos consultations sont journalisees (`*_VIEWED`)

C'est le mode adapte aux audits externes (cabinet comptable) ou Comite
d'Audit du Conseil d'Administration.

## Rapport hebdomadaire au DFG

Une fois par semaine, exportez un **rapport** :

**Reporting > Tableau de bord Controle Interne** :

- Volume d'anomalies par type / severite
- Top 10 fournisseurs avec anomalies
- Top 5 demandeurs en abus FD_URGENCE
- Taux de resolution anomalies < 48h
- Patterns observes pendant la semaine

Export PDF + envoi par email au DFG.
