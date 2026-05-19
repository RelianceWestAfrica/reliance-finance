# Guide utilisateur Reliance Finance

Guide pratique organise par role. Si vous endossez plusieurs roles
(ex. DAF Pays + DFG), consultez chacun des guides correspondants.

## Premiere fois ?

1. [Premier login et activation du compte](./00-premier-login.md)
2. Identifiez votre role dans la matrice ci-dessous
3. Allez directement au guide du role concerne

## Roles et guides

| Role | Sigle | Guide |
| ---- | ----- | ----- |
| Administrateur systeme | ADMIN | [01 - Administrateur](./01-admin.md) |
| Directeur Financier Groupe | DFG | [02 - DFG](./02-dfg.md) |
| Demandeur (chef de chantier, manager, ...) | - | [03 - Demandeur](./03-demandeur.md) |
| Validateur niveau 1 (DAF Pays / Finance Filiale) | DAF_PAYS, FINANCE_FILIALE | [04 - Validateur N1](./04-valideur-n1.md) |
| Validateur niveau 2 (Tresorier, Finance Groupe) | TRESORIER_GROUPE, FINANCE_GROUPE | [05 - Validateur N2](./05-valideur-n2.md) |
| Tresorier (execution paiements) | TRESORIER_GROUPE | [06 - Tresorier](./06-tresorier.md) |
| Controleur interne | CONTROLEUR_INTERNE | [07 - Controleur interne](./07-controleur-interne.md) |
| Auditeur | AUDITEUR | Acces lecture seule - voir [07](./07-controleur-interne.md) §audit |
| Administrateur General | AG | [08 - AG](./08-ag.md) |

## Concepts cles a connaitre

| Concept | Explication courte |
| ------- | ------------------ |
| **FDA** | Demande de Fonds d'Avance |
| **FD** | Demande de Fonds normale |
| **FD_URGENCE** | FD en urgence, sous garde de 4 conditions cumulatives + SLA 72h de regularisation |
| **BC** | Bon de Commande |
| **PV** | Proces-Verbal de reception (biens, service fait, attachement chantier) |
| **3-way match** | Verification automatique BC / PV / Facture avant paiement |
| **Quarantaine RIB** | Periode de 24h imposee sur tout nouveau RIB fournisseur avant utilisation |
| **Anomalie** | Detection automatique d'un comportement suspect ou d'un ecart procedure |
| **Chaine audit** | Toutes les actions sont chainees cryptographiquement (SHA-256) : impossible de modifier l'historique sans le detecter |

## Aide rapide

- **Mot de passe oublie** : page de login -> "Mot de passe oublie ?" envoie un lien magique
- **Ne vois pas un dossier** : verifier votre rattachement entite (memberships)
- **Action refusee** : separation des fonctions interdit que la meme personne demande + valide
- **Bug ou anomalie produit** : [Glossaire et FAQ](./09-faq.md)
