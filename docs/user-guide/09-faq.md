# FAQ et resolution de problemes

## Authentification

### Je n'arrive plus a me connecter

- **Mot de passe oublie** : page de login > "Mot de passe oublie" envoie
  un nouveau lien magique par email
- **5 tentatives loupees** : compte verrouille 15 min. Attendre OU
  contacter l'Administrateur pour deverrouillage manuel
- **Aucun email recu** : verifier dossier spam, sinon contacter
  l'Administrateur (le LOGIN_FAILURE est dans l'audit log)

### Session expire trop vite

C'est volontaire : `AUTH_SESSION_MAX_AGE_SECONDS = 900` (15 min). Apres
15 min d'inactivite, deconnexion automatique. Procedure §2.4.

Pour augmenter : contacter l'Administrateur. La valeur peut etre modifiee
dans `.env.production` mais ce serait une derogation a la procedure.

### Mes memberships ne sont pas a jour

Apres modification par l'Administrateur, deconnectez-vous et reconnectez-
vous : les memberships sont chargees au login.

## Action refusee

### "Privilege insuffisant"

Votre role actuel n'a pas les permissions pour cette action. Consultez la
[matrice RBAC](../rbac-matrix.md) ou demandez a votre DAF Pays / DFG.

### "Separation des fonctions"

Vous tentez de valider un dossier que vous avez vous-meme cree OU sur
lequel vous avez deja signe a un autre niveau. La procedure §3.2 interdit
ce cumul de roles. Un collegue doit prendre le relais.

### "Ressource hors scope"

Vous tentez d'acceder a une ressource d'une entite a laquelle vous n'avez
pas de membership actif. Si c'est legitime, demandez un membership a votre
DAF Pays / DFG.

## Fournisseurs et RIB

### Un fournisseur a change son RIB hier mais je ne peux pas payer

C'est normal : tout nouveau RIB passe en **quarantaine 24h** apres
double validation. Verifiez :

- Fournisseurs > Fiche > RIBs : le nouveau RIB est en QUARANTINE avec une
  date d'activation visible
- A l'echeance, le cron `activate-quarantines` (toutes les 15 min)
  l'active automatiquement

### Le 3-way match echoue alors que ca devrait passer

Comparer ligne a ligne :

- BC > details
- PV > items recus
- Facture > lines

Si l'ecart est < 5% sur le prix unitaire et < 1% sur le total, le match
devrait passer. Si non :

- Verifier les arrondis (decimal Decimal(18,4) precision dans la DB)
- Verifier que la facture est bien en TTC ou HT comme attendu
- Verifier la devise (le change peut creer un faux ecart)

Pour debloquer en cas de probleme reel : contacter le DFG pour
**autoriser manuellement** le paiement (procedure §M8 derogation).

### Le RIB du fournisseur n'apparait pas comme verifie

A l'onboarding, le RIB initial n'est **pas** automatiquement verifie.
Procedure :

1. Le DAF Pays appelle le fournisseur sur numero officiel
2. Coche **Marquer comme verifie** + note (date appel, interlocuteur)
3. Le RIB devient utilisable

## Paiements

### Le paiement reste en PROPOSED, jamais valide

Il faut **un deuxieme tresorier** (different du demandeur) pour valider.
Verifiez :

- Tresorerie > A valider : le paiement y est-il ?
- Si oui, demander a un autre tresorier
- Si non, regarder le statut detaillee de la fiche : le check anti-
  fraude est-il OK ?

### Le paiement echoue avec "RIB en quarantaine"

Le RIB du fournisseur a change recemment et est encore en periode de 24h.
Attendre OU - en cas d'urgence reelle - faire une derogation via le DFG
(qui peut activer manuellement le RIB en derogation, c'est trace).

### J'ai execute le virement reel mais comment uploader la preuve ?

Tresorerie > Fiche paiement > Onglet Preuves > Bouton **+ Ajouter
preuve** :

- Format accepte : PDF, JPG (avis de debit, SWIFT MT103, capture banking
  online)
- Taille max : 10 MB
- Le statut passe a "Preuve fournie", l'audit log enregistre l'upload

## Comptabilite

### L'ecriture comptable n'est pas dans le bon compte SYSCOHADA

Verifier :

1. Le **mapping comptable** dans Reglages > Plan comptable
2. Le **type de paiement** (compte 5 vs 6) et son rattachement OPEX/CAPEX
3. La **classe** SYSCOHADA (411 / 401 / 6XX / 5XX selon le cas)

Si le mapping est faux : modifier dans le plan comptable + relancer la
generation des ecritures (DFG / Comptable Groupe peut le faire en
**Reprocesser**).

### L'export FEC est rejete par le validateur DGFiP

Verifier :

- L'encoding (UTF-8 BOM)
- Le separateur (pipe `|`)
- Les 18 colonnes exactes
- Les dates au format YYYYMMDD
- Les montants avec decimale point + 2 chiffres apres virgule

Le module FEC respecte la norme officielle, donc tout rejet est
generalement du a une donnee mal saisie en amont (libelle compte vide,
date invalide, ...). Examiner ligne par ligne et corriger a la source.

## Audit et chaine

### "HASH_MISMATCH" sur la verification chaine

**Incident grave**. La donnee dans la table audit_log a ete modifiee hors
application. Procedure :

1. Ne paniquez pas, c'est detecte
2. Alerter immediatement DFG + DSI
3. Snapshot complet de la DB (image disque + dump)
4. Investigation a froid pour retrouver le moment de la modification
5. Si donnee compromise : restauration depuis backup chiffre GPG (les
   backups quotidiens sont a J-30 + J-365 conserves)
6. Notification CNIL si donnees personnelles + AG + Conseil d'Administration

### Comment savoir qui a fait quoi sur un dossier ?

**Fiche dossier > Onglet Audit** : toutes les actions chronologiques avec
acteur, timestamp, et payload.

OU plus precis : **Audit > entityType = ExpenseRequest + entityId =
[id]** -> meme info avec verification de chaine cryptographique.

## Performance

### Une page met trop de temps a charger

- Verifier le statut `/api/health` (devrait repondre en < 200 ms)
- Verifier `/api/ready` (postgres + smtp + s3 OK ?)
- Si tout est OK cote infra, c'est sans doute une **page complexe**
  (reporting Groupe avec aggregation). Augmenter le seuil ou paginater.

### Le PDF met longtemps a se generer

Normal pour les dossiers avec beaucoup de pieces jointes ou de
signatures. La generation est cote serveur (~1-3s) puis le download
peut etre lent selon la connexion. Si > 30s : contacter DSI.

## Contacts

| Probleme | Contact |
| -------- | ------- |
| Compte / role | Administrateur RWA |
| Workflow / procedure | DFG |
| Anomalie suspecte | Controleur Interne |
| Bug applicatif | DSI / dev RWA |
| Securite | DSI + DFG en CC |
