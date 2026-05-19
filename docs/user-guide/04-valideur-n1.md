# Guide Validateur N1 (DAF Pays / Finance Filiale)

> Vous etes **DAF Pays** ou **Finance Filiale**. Vous etes le premier
> niveau de validation sur les dossiers de votre entite. Vous validez OU
> rejetez. Vous **ne pouvez pas** valider un dossier que vous avez
> initie (separation des fonctions).

## Vos responsabilites

- Valider en N1 les FDA / FD / FD_URGENCE de votre Filiale ou SPV
- Verifier les RIBs initiaux a l'onboarding fournisseur
- Valider en N1 les changements de RIB (avant escalade Groupe N2)
- Maintenir le referentiel fournisseur (ajout / archivage local)
- Assurer la qualite des dossiers avant escalade au Groupe

## Vos actions courantes

### 1. Valider une FDA / FD en N1

**Demandes de fonds > Filtre "En attente de moi"**

Pour chaque dossier :

1. Ouvrir la fiche
2. Verifier :
   - **Coherence** entre intitule, description, lignes
   - **Existence du fournisseur** dans le referentiel
   - **Pertinence du budget** : ligne budgetaire correcte ?
     OPEX/CAPEX correct ?
   - **Niveau urgence justifie** : pas d'abus de FD_URGENCE
   - **Pieces jointes** : devis, photos, justificatifs presents
3. Cliquer **Valider N1** (commentaire optionnel) ou **Rejeter** (motif
   obligatoire)
4. Le dossier passe au niveau suivant (N2 ou Groupe selon le montant)

### 2. Verifier un nouveau RIB fournisseur

A l'onboarding d'un nouveau fournisseur, son RIB doit etre verifie avant
d'etre utilisable :

**Fournisseurs > Fiche > Onglet RIBs**

1. Ouvrir le RIB en attente de verification
2. **Appeler le fournisseur** sur un numero officiel (jamais celui
   indique dans l'email) pour confirmer le RIB
3. Cliquer **Marquer comme verifie** + ajouter une note (date appel,
   numero appele, interlocuteur)
4. Le RIB devient utilisable

### 3. Valider un changement de RIB en N1

Si un fournisseur change son RIB :

**Fournisseurs > Fiche > RIB Changes pending**

1. Ouvrir la demande de changement
2. Verifier les **justifications** + pieces jointes (lettre officielle,
   nouvel RIB scanne)
3. **Appeler le fournisseur** sur numero officiel pour confirmer la
   demande
4. Cliquer **Valider N1** (commentaire avec date appel + interlocuteur)
5. Statut passe a DUAL_VALIDATION_PENDING -> escalade au DFG / Tresorier
   Groupe pour validation N2
6. Apres validation N2, le nouveau RIB passe en **QUARANTAINE 24h** avant
   d'etre utilisable

> **Garde** : vous ne pouvez pas etre le demandeur ET le validateur. Si
> vous avez initie la demande, c'est un autre DAF Pays ou Finance Filiale
> qui doit valider en N1.

### 4. Ajouter un fournisseur

**Fournisseurs > + Nouveau fournisseur**

| Champ | Obligation |
| ----- | ---------- |
| Code | unique dans l'entite (ex. FRN-2026-001) |
| Nom | raison sociale exacte |
| Sensibilite | STANDARD / SENSITIVE (pour fournisseurs strategiques) |
| Adresse | siege |
| Pays | Togo / Cote d'Ivoire / ... |
| Telephone | numero officiel - servira aux verifications |
| Email | officiel |
| RIB initial (optionnel) | RCCM, IBAN/RIB, titulaire |

Si vous saisissez un RIB initial, il sera marque **non verifie** et
devra etre confirme par un appel telephonique (cf. point 2).

## Anti-fraude RIB

La procedure RWA impose un **circuit anti-fraude** strict pour tout
nouveau RIB ou changement de RIB :

```
Demande de changement (DAF Pays ou autre)
  -> Validation N1 (DAF Pays / Finance Filiale)
     -> Statut DUAL_VALIDATION_PENDING
        -> Validation N2 (DFG / Tresorier Groupe)
           -> RIB cree en QUARANTAINE
              -> Apres 24h (cron) -> ACTIVE
                 -> RIB utilisable pour paiements
```

3 gardes critiques :

1. **N1 != N2 != demandeur** (separation des fonctions)
2. **24h de quarantaine** avant utilisation (delai de retractation /
   detection de fraude)
3. **Detection automatique** de patterns suspects (changements recurrents,
   changement post-creation, fournisseur sensible) -> Anomaly automatique

## Audit de votre activite

**Audit > Filtre actorId = moi**

Vous voyez toutes vos actions journalisees. Chaque ligne est dans la
chaine cryptographique : impossible de modifier ou supprimer une action
apres coup.

## Si vous etes absent

Designez un suppleant via votre **Administrateur** : il vous ajoutera un
**Acting** sur le poste DAF Pays pendant votre absence. Vos validations
en cours peuvent etre prises par ce suppleant.

> Important : votre suppleant doit avoir **un membership different** sur
> la meme entite pour eviter la collision. L'admin peut le configurer.
