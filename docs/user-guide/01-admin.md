# Guide Administrateur systeme

> Le role **ADMIN** a tous les privileges. A reserver a une seule ou deux
> personnes (DSI / IT) au sein du Groupe.

## Ce que vous pouvez faire

- Inviter, suspendre, supprimer des utilisateurs
- Modifier les memberships (entite + role) de n'importe qui
- Creer / archiver des entites, projets, centres de cout
- Configurer le plan comptable SYSCOHADA
- Gerer les seuils de validation
- Voir l'audit log integral + verifier la chaine cryptographique
- Acces toutes filiales / SPV sans restriction de tenancy

## Premieres actions a faire en arrivant sur la plateforme

### 1. Changer le mot de passe par defaut

Si vous etes connecte avec `admin@reliancewestafrica.com / ChangeMe123!`,
**changez ce mot de passe maintenant** :

1. Profil (haut a droite) > **Securite**
2. Saisir l'ancien `ChangeMe123!` + nouveau mot de passe
3. Sauvegarder

### 2. Inviter votre premiere equipe

Allez sur **Reglages > Utilisateurs** :

1. Bouton **+ Inviter un utilisateur**
2. Renseigner Email, Nom, Role initial, Entite de rattachement
3. Envoyer l'invitation : un email avec lien magique est envoye

> Astuce : invitez d'abord le **DFG** et le **DAF Pays Togo** pour qu'ils
> puissent prendre la main sur leur perimetre.

### 3. Configurer les seuils de validation

Allez sur **Reglages > Seuils** :

- Le seed initial pose des seuils par defaut (montants Filiale N1, N2,
  Groupe, AG) en XOF
- Adaptez-les a la realite RWA (cf. la procedure Fevrier 2026 §6.3)
- Chaque modification est versionnee (effectiveFrom / effectiveTo)
- Les dossiers en cours ne sont pas impactes (ils gardent leur version)

### 4. Etendre le plan comptable SYSCOHADA si besoin

Allez sur **Reglages > Plan comptable** :

- Le plan minimal de base (~50 comptes courants) est seede
- Ajoutez les comptes specifiques RWA (sous-comptes par chantier,
  comptes auxiliaires fournisseurs, ...)
- Format : code numerique + libelle + classe (1 a 7) + statut

## Operations courantes

### Inviter un utilisateur

**Reglages > Utilisateurs > + Inviter**

| Champ | Detail |
| ----- | ------ |
| Email | unique dans la plateforme |
| Nom | affiche dans signatures et audit |
| Entite rattachement | la filiale ou le SPV principal (peut etre etendu plus tard) |
| Role initial | un seul role par membership, plusieurs memberships possibles |

L'utilisateur recoit un email avec lien magique. S'il ne le recoit pas :
verifier dans **Audit > Filtre USER_INVITED** que l'event est bien
journalise. Si oui, le probleme est cote SMTP / spam.

### Ajouter un role supplementaire a un utilisateur

**Reglages > Memberships** (plus fin que l'invitation initiale) :

1. Selectionner l'utilisateur
2. Bouton **+ Ajouter un membership**
3. Choisir entite + role
4. Sauver

Exemple : un DAF Pays peut avoir un membership DAF_PAYS sur Filiale Togo
ET un membership FINANCE_FILIALE sur SPV Lome.

### Revoker un access

**Reglages > Memberships** > ligne concernee > **Revoquer**.

L'audit log enregistre MEMBERSHIP_REVOKED. L'utilisateur perd l'access
**immediatement** (la prochaine requete est rejetee).

### Verifier l'integrite de la chaine audit

Allez sur **Audit** :

- Filtres par entityType / entityId / action
- Pour chaque ligne, lien **Verifier la chaine** -> appelle
  `/api/audit/verify/[entityType]/[entityId]`
- Reponse OK : les hashes s'enchainent correctement
- Reponse HASH_MISMATCH ou PREV_HASH_MISMATCH : **incident grave**, le
  contenu de la chaine a ete modifie hors application

## Operations sensibles

| Action | Procedure |
| ------ | --------- |
| Archiver une entite | Verifier qu'elle n'a plus d'enfants actifs ni de dossiers en cours |
| Reset mot de passe d'un autre user | Plutot utiliser la **reinvitation** : revoque le mot de passe actuel + envoie un nouveau lien magique |
| Modifier un seuil retroactif | Impossible. Creer un nouveau seuil avec effectiveFrom = maintenant. L'historique reste intact. |
| Acces a la donnee brute Postgres | Reserve aux interventions critiques. Toute lecture / ecriture directe SHOULD etre journalisee manuellement dans la chaine audit. |

## Ce que vous **ne pouvez pas** faire (par design)

- Supprimer une entree d'audit log (immutabilite totale)
- Signer un dossier (les ADMIN ne sont pas dans la chaine de validation
  metier - separation des fonctions)
- Acceder aux mots de passe en clair (hashs argon2id stockes)

## Documentation technique

- [Architecture data model](../adr/0001-data-model.md)
- [Workflow engine](../adr/0002-workflow-engine.md)
- [Matrice RBAC complete](../rbac-matrix.md)
- [Deploiement et exploitation](../deployment.md)
