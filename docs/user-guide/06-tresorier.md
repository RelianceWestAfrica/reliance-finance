# Guide Tresorier (operations paiements)

> Vous executez les **paiements** au quotidien. Vous travaillez en
> **binome obligatoire** avec un autre tresorier ou avec le DFG : un
> seul tresorier ne peut pas executer un paiement seul (double validation
> anti-fraude).

## Mission

- Preparer les paiements depuis les factures approuvees
- Verifier le **3-way match** (BC <-> PV <-> Facture)
- Executer apres double validation
- Uploader les preuves bancaires (SWIFT, avis debit)
- Suivre les anomalies trésorerie

## Workflow paiement standard

### Etape 1 - Selection de la facture

**Tresorerie > Factures payables**

Filtres recommandes :

- Statut = APPROVED
- 3-way match = OK
- PV present
- Echeance < 7 jours

Cliquer sur une facture -> page de detail.

### Etape 2 - Preparation du paiement

Bouton **Preparer un paiement** sur la fiche facture.

| Champ | Auto / Manuel | Detail |
| ----- | ------------- | ------ |
| Montant | auto | egal au reste a payer (TTC - amountPaid) |
| Methode | manuel | BANK_TRANSFER / CHECK / CASH |
| Date programmee | manuel | quand le paiement doit partir |
| Beneficiaire | auto | snapshot du fournisseur a date du BC |
| RIB | auto | snapshot du RIB approuve a date du BC |
| Compte bancaire emetteur | manuel | choisir le compte de l'entite |

Le snapshot du beneficiaire/RIB est **fige** au moment du BC pour
prevenir tout changement de RIB en cours de processus (anti-fraude).

### Etape 3 - Anti-fraude check (automatique)

Avant l'enregistrement du paiement, le systeme verifie :

1. **Beneficiaire == fournisseur du BC** -> sinon ERREUR BLOQUANTE
2. **RIB hors quarantaine** -> sinon ERREUR BLOQUANTE
3. **PV present pour la facture** -> sinon ERREUR BLOQUANTE
4. **Tolerance 3-way match** : prix ligne BC vs facture < 5%, total < 1%
5. Pas de double paiement de la meme facture
6. Rate limiting 5 paiements / minute par utilisateur (anti-spam)

Si tout OK, paiement passe en statut **PROPOSED** -> en attente double
validation.

### Etape 4 - Double validation

Un **autre** tresorier OU le DFG doit valider le paiement :

1. **Tresorerie > A valider**
2. Verifications recommandees :
   - Coherence montant facture
   - Beneficiaire/RIB du BC, pas d'un RIB plus recent
   - Periode comptable ouverte
   - Cash position suffisante
3. Cliquer **Valider l'execution** ou **Rejeter**

> **Garde** : vous ne pouvez pas valider votre propre paiement. Le
> systeme vous bloquera.

### Etape 5 - Execution + Preuve bancaire

Apres double validation :

1. Le paiement passe en **EXECUTED**
2. **Vous executez le virement reel** dans votre banking online
3. **Vous uploadez la preuve** : avis de debit / SWIFT MT103 / recu
   virement instantane (M-Pesa, ...)
4. Le paiement est cloture, journalEntry SYSCOHADA auto-genere

Sans preuve uploadee, le paiement reste en EXECUTED mais "non confirme".
Le controleur interne aura une vue sur ces "execu_tions non prouvees".

## 3-way match : comment lire l'ecart

Sur la fiche facture, encart **3-way match** :

| Status | Detail |
| ------ | ------ |
| `OK` | Pas d'ecart, pretes a payer |
| `MISMATCH_PRICE_LINE` | Une ligne BC vs facture > 5% d'ecart |
| `MISMATCH_TOTAL` | Total BC vs facture > 1% d'ecart |
| `MISSING_PV` | Pas de PV associe -> facture non payable |
| `DISPUTED` | Le DAF a marque la facture en litige manuellement |

Pour MISMATCH : ouvrir le detail, comparer ligne a ligne, **contacter le
fournisseur** pour un avoir ou une refacturation. Ne pas payer tant que
l'ecart n'est pas resolu (procedure §M8).

## Operations specifiques

### Paiement de la TVA / impots

Cas particulier : pas de fournisseur ni de PV. **A faire** :

1. Creer un **fournisseur fictif** "TVA Etat Togo" (entite : Etat,
   sensibilite STANDARD, RIB du Tresor public)
2. Saisir une FDA / FD pour la TVA a payer
3. Apres validation, generer un BC + facture (interne, sans PV)
4. Payer comme un fournisseur normal

L'application supporte ce cas, mais consultez votre DFG pour la
configuration initiale.

### Paiement en lots (PaymentBatch)

Pour gagner du temps sur de multiples paiements similaires (paie,
fournisseurs petits montants) :

1. **Tresorerie > Nouveau lot**
2. Selectionner toutes les factures concernees
3. Le lot herite des conditions de paiement (compte bancaire, date)
4. Chaque paiement du lot est cree independamment mais lie au batch
5. Double validation sur le **lot complet**

### Paiement en devise etrangere

Si le BC est en EUR ou USD et que vous payez depuis un compte XOF :

- Le taux de change est applique automatiquement (taux du jour seede
  + override manuel possible)
- Le journalEntry SYSCOHADA inclut le compte "Ecart de change"
- Verifier que votre banking online accepte le change automatique

## Anomalies tresorerie

**Anomalies > Filtre Tresorerie**

Types courants :

| Type | Action |
| ---- | ------ |
| `PAYMENT_FRACTIONING_SUSPECTED` | Multiple paiements meme fournisseur sur 7 jours -> verifier si contournement de seuil |
| `BANK_ACCOUNT_CHANGE_SUSPICIOUS` | RIB recemment change avec patterns suspects -> bloquer ce paiement |
| `INVOICE_DUPLICATE_SUSPECTED` | 2 factures fournisseur de meme montant <5j -> verifier qu'il n'y a pas duplicate |
| `PAYMENT_EXEC_WITHOUT_PROOF` | Paiement EXECUTED mais sans preuve uploadee 24h apres |

## Recus de paiement PDF

Pour chaque paiement EXECUTED, vous pouvez exporter un PDF :

- Bouton **Exporter Recu** sur la fiche paiement
- Inclut les signatures double validation + QR de verification audit
- A archiver dans votre dossier comptable + envoyer au fournisseur si
  reclamation

## Conseils du Tresorier expert

- **Toujours appeler** le fournisseur avant un gros paiement (> 5 MFCFA)
  pour confirmer le RIB
- **Verifier les SWIFT** : un SWIFT MT103 doit mentionner le motif (ref
  facture) -> tracabilite
- **Cloturer les batchs** dans les 48h pour eviter les retours bancaires
- **Surveiller le cash forecast** au moins une fois par jour
