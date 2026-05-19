# Guide Validateur N2 (Tresorier Groupe / Finance Groupe)

> Vous etes **Tresorier Groupe** ou **Finance Groupe**. Vous etes le deuxieme
> niveau de validation pour les dossiers depassant le seuil Filiale.
> Vous etes aussi le validateur N2 des changements de RIB.

## Vos responsabilites

- Valider en N2 les dossiers ayant deja passe la validation N1
- Valider en N2 les changements de RIB (apres validation DAF Pays)
- Surveiller la **position de cash** et arbitrer les paiements
- Participer a la **double validation** des paiements (anti-fraude)

## Workflow de validation

### Validation N2 sur dossier FDA / FD

**Demandes de fonds > Filtre "En attente N2"**

Pour chaque dossier ayant deja la validation N1 :

1. Verifier la **trace de validation N1** (qui, quand, commentaire)
2. Verifier la **coherence finale** :
   - Le montant declare correspond au cumul des lignes
   - La justification est solide
   - Les pieces jointes sont completes
   - L'absence d'**anomalies** liees au demandeur ou au fournisseur
3. **Verifier l'impact cash** : la sortie ne creera-t-elle pas une
   rupture sous J+15 ?
4. Cliquer **Valider N2** ou **Rejeter** (motif obligatoire)
5. Le dossier passe au niveau Groupe (DFG) ou AG selon le montant final

> **Garde** : vous ne pouvez pas etre demandeur, validateur N1, ET
> validateur N2 du meme dossier. Si vous avez participe a une etape
> precedente, un autre validateur N2 doit prendre le relais.

### Validation N2 sur changement de RIB

**Fournisseurs > Fiche > RIB Changes DUAL_VALIDATION_PENDING**

1. Verifier la trace de validation N1 (DAF Pays a deja approuve)
2. **Appeler vous aussi** le fournisseur sur le numero officiel (jamais
   le numero du document de demande) -> double verification
3. Cliquer **Valider N2** + commentaire (date appel + interlocuteur + ce
   qui a ete confirme)
4. Le nouveau RIB est cree en **QUARANTAINE 24h**
5. L'ancien RIB est desactive **immediatement**
6. Apres 24h (cron auto), le nouveau RIB devient utilisable

Si vous detectez un **comportement suspect** pendant l'appel (voix qui
ne correspond pas, hesitation sur les details connus, ...), **rejetez**
et alertez le Controleur Interne en parallele.

## Double validation des paiements

Tout paiement passe par une double validation **avant execution** :

1. Le **Tresorier 1** prepare le paiement :
   - Choix de la facture
   - Snapshot du beneficiaire + RIB
   - Verification automatique anti-fraude
   - Statut PROPOSED
2. Le **Tresorier 2** (vous OU un collegue) valide :
   - Verification de la coherence beneficiaire / fournisseur du BC
   - Verification que le RIB est hors quarantaine
   - Verification que la facture a bien son PV
3. **Execution** : virement passe en EXECUTED
4. Upload de la **preuve bancaire** (SWIFT, avis de debit, recu virement
   instantane) -> obligatoire pour cloturer

### Verifications manuelles avant validation N2 paiement

- Le montant correspond exactement a la facture (et a la part non encore
  payee)
- Le RIB est celui du **BC** (pas un RIB plus recent du fournisseur,
  sauf si BC a ete amendu)
- La facture est dans le bon **periode comptable** (pas avant cloture)

## Surveillance cash

**Cash forecast** -> vue 13 semaines :

Avant de valider tout paiement important (> 10% du cash en banque), un
coup d'oeil rapide au forecast :

- Vue par entite + cumul Groupe
- Heatmap rouge / orange / vert par semaine
- Top 10 sorties projetees + ajustables (vous pouvez "retarder" un
  paiement en deplacant son scheduledAt)

Si une rupture est detectee a J+15 ou moins, le DFG est notifie auto-
matiquement. Mais c'est aussi votre role d'**anticiper** : si vous voyez
une situation tendue, alertez DFG et CFO avant qu'elle ne devienne
critique.

## Reporting hebdo

**Reporting > Tableau de bord Tresorerie** vous donne :

- Volume de paiements executes / programmes / en retard
- Top 10 fournisseurs en volume paiement
- Position de cash actuelle par entite + Groupe
- Anomalies anti-fraude detectees sur la semaine

A presenter au DFG en weekly meeting.
