# MAVIK GCOS 1.0 — Atelier

## Objectif

Livrer une version cohérente et exploitable permettant à GentleCarE de gérer une intervention complète, depuis la demande client jusqu’à la restitution du véhicule.

## Périmètre figé de la version 1.0

1. Tableau de bord atelier.
2. Planning atelier hebdomadaire.
3. Planning équipe.
4. Planning des ressources.
5. Dossier d’intervention unique.
6. Cycle devis accepté → acompte → réception → traitement → contrôle → restitution.
7. Rapports et brouillons de facturation.
8. Commandes texte et vocales MAVIK liées à l’atelier.
9. Navigation unifiée sur ordinateur et mobile.
10. Traçabilité des validations David/Bénédicte.

## Hors périmètre

Les fonctions suivantes restent prévues pour les versions ultérieures :

- gestion avancée des stocks ;
- CRM commercial complet ;
- comptabilité ;
- distribution DINITROL ;
- optimisation décisionnelle avancée par IA.

## Écrans de référence

- `/` : tableau de bord ;
- `/planning` : planning général et atelier ;
- `/generated/workshop/index.html` : dossiers et procédures atelier ;
- `/quotes` : demandes et devis ;
- fiche intervention : vue consolidée à créer dans cette branche.

## Règles non négociables

- aucune donnée manquante n’est inventée ;
- aucune action externe sensible n’est exécutée sans validation humaine ;
- la direction conserve les décisions de prix, report, annulation et clôture ;
- le travail atelier reste verrouillé tant que l’acompte requis n’est pas reçu ;
- chaque étape importante conserve auteur, date, heure, notes et preuves ;
- les interfaces doivent rester utilisables sur PC et iPhone.

## Stratégie de livraison

La branche `release/1.0-workshop` regroupe uniquement les changements nécessaires à la version 1.0. La fusion dans `main` aura lieu après validation fonctionnelle, contrôle des migrations locales et réussite des tests.
