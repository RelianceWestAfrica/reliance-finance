# Guide Demandeur

> Vous etes **chef de chantier**, **manager operationnel**, **acheteur**, ou
> tout utilisateur amene a **demander des fonds** ou un **bon de commande**.
> Ce guide vous explique comment soumettre vos demandes correctement.

## Quand faire une FDA, une FD, ou une FD_URGENCE ?

| Type | Quand l'utiliser |
| ---- | ---------------- |
| **FDA** (Fonds d'Avance) | Vous avez besoin de cash pour payer un fournisseur **avant** la livraison ou pour les frais courants chantier (transports, petits achats). |
| **FD** (Demande de Fonds standard) | Le fournisseur est identifie, le BC peut etre etabli normalement avec workflow complet (devis -> comparatif -> BC -> livraison -> facture -> paiement). |
| **FD_URGENCE** | Cas exceptionnel : 4 conditions cumulatives obligatoires (cf. ci-dessous). Sous SLA 72h de regularisation. |

## Les 4 conditions cumulatives pour une FD_URGENCE

Avant de cliquer sur "FD_URGENCE", **lisez** :

1. **Impact financier** : non-paiement immediat = perte > XX MFCFA (a
   chiffrer)
2. **Impact operationnel** : arret de chantier ou blocage activite
   critique
3. **Aucune alternative** : pas de fournisseur de substitution
   disponible
4. **Validation hierarchique** : votre N+1 metier est informe en
   parallele (par email / message)

Si **une seule condition manque**, faites une FD standard. L'application
ne peut pas verifier ces 4 conditions automatiquement, vous engagez votre
responsabilite professionnelle.

### Le SLA 72h

Apres approbation d'une FD_URGENCE, vous avez **72h pour regulariser** :

- Fournir les pieces justificatives completes (factures, PV, devis
  comparatifs si applicables)
- Documenter la justification a posteriori

Sans regularisation a J+3, le systeme cree automatiquement une **Anomaly
REPEATED_URGENCY** assignee au Controleur Interne. Vous pouvez vous
attendre a etre questionne.

## Creer une demande pas a pas

**Demandes de fonds > + Nouvelle demande**

### Etape 1 - Informations generales

| Champ | Detail |
| ----- | ------ |
| Type | FDA / FD / FD_URGENCE |
| Intitule | Court, descriptif (ex. "Achat materiel coffrage Chantier Akodessewa") |
| Description | Detaillee : contexte, finalite metier |
| Justification | Pourquoi cette depense est necessaire |
| Projet | Selectionnez le projet (si applicable) |
| Centre de cout | Selectionnez le CC |
| Fournisseur | Selectionnez le fournisseur (si deja connu) |
| OPEX / CAPEX | OPEX pour les frais courants, CAPEX pour investissement |
| Ligne budgetaire | Reference dans votre budget (si applicable) |
| Hors budget | Cocher si la depense n'est pas dans votre budget vote |
| Date souhaitee | Quand vous avez besoin de l'argent / livraison |
| Lieu | Adresse de livraison ou chantier |

### Etape 2 - Lignes de depense

Cliquez **+ Ajouter une ligne** pour chaque article :

- Designation
- Quantite
- Unite (kg, m, lot, jour, ...)
- Prix unitaire estime
- Total ligne (calcule auto)

Le **total dossier** est calcule automatiquement et determinera quel(s)
niveau(x) de validation seront appliques (resolveThreshold).

### Etape 3 - Pieces jointes

Glisser-deposer ou **+ Ajouter** :

- Devis fournisseur si vous en avez deja
- Photos chantier si applicable
- Tout document utile a la validation

Formats acceptes : PDF, JPG, PNG, XLSX, DOCX. Limite 25 MB par fichier.

### Etape 4 - Verification + Soumission

- Verifiez tout (vous ne pourrez plus modifier apres soumission)
- Cliquez **Soumettre**
- Statut passe de DRAFT a SUBMITTED
- Notification envoyee au premier validateur (DAF Pays)

## Suivre votre dossier

**Demandes de fonds > Mes dossiers** ou **Demandes de fonds > Filtre par
moi-meme** :

Statuts possibles :

- `DRAFT` : brouillon (vous pouvez modifier)
- `SUBMITTED` : soumis, en attente validation N1
- `APPROVAL_N1` : en attente DAF Pays
- `APPROVAL_N2` : en attente Tresorier / Finance Filiale
- `APPROVAL_GROUP` : en attente DFG
- `APPROVAL_AG` : en attente AG
- `APPROVED` : approuve, prochaine etape = generation BC
- `REJECTED` : refuse (voir le motif)
- `ARCHIVED` : cloture (refuse / annule / regularise et termine)

## Documents PDF generes

A tout moment apres soumission, vous pouvez :

- **Exporter le dossier en PDF** (bouton dans la fiche)
- Partager le lien public de verification (QR code dans le PDF)

Le PDF inclut **toutes les signatures** deja apposees + un footer avec
empreinte de la chaine audit.

## Pieges courants

- **Ne signez pas comme validateur si vous etes le demandeur** : le
  systeme vous rejettera ("separation des fonctions")
- **Ne creez pas une FD_URGENCE pour eviter le workflow normal** : les
  urgences repetees declenchent une anomalie automatique surveillee par
  le controle interne
- **N'oubliez pas les pieces** : sans devis ni justificatif, votre
  validateur N1 peut rejeter pour pieces manquantes
- **RIB du fournisseur** : si c'est un nouveau fournisseur, son RIB doit
  d'abord etre **double valide** avant d'etre utilisable (procedure
  M3 + 24h quarantaine)
