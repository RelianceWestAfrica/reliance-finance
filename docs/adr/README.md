# Architecture Decision Records (ADR)

Les ADR documentent les decisions structurantes du projet `reliance-finance`.

## Format

Format Michael Nygard, en francais :

1. **Titre** : `NNNN-slug-court.md`
2. **Statut** : `Proposed | Accepted | Deprecated | Superseded by NNNN`
3. **Contexte** : pourquoi cette decision est necessaire
4. **Decision** : ce qui a ete decide
5. **Consequences** : impacts positifs, negatifs, neutres
6. **Alternatives considerees** : autres options et raisons du rejet

## Index

| #    | Titre                            | Statut   |
| ---- | -------------------------------- | -------- |
| 0001 | Modele de donnees                | Accepted |
| 0002 | Moteur de workflow               | Accepted |
| 0003 | Pont financier inter-plateformes | Accepted |

## Quand ecrire un ADR ?

Toute decision qui :

- Cree, modifie ou supprime un contrat structurant (schema DB, API publique, format de fichier)
- Change le choix d'une bibliotheque ou d'un framework
- Modifie une regle de securite, de conformite ou de tenancy
- Introduit ou retire une dependance externe (banque, ERP, fiscalite)
- Touche au moteur de workflow ou aux machines a etats des dossiers

Une decision = un ADR. Pas de modification retroactive : si on change d'avis,
on cree un nouvel ADR qui `Supersedes` le precedent.
