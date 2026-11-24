# ADR-0002 — Consolidation du noyau et de l’orchestration MAVIK

- Statut : accepté
- Date : 2026-07-20
- Décideur métier : David Bourasseau
- Pilotage technique : MAVIK

## Contexte

Le dépôt contient deux générations complémentaires :

- `src/core/`, noyau historique fournissant stockage, audit, notifications, tâches, registre de modules et services Jarvis ;
- `core/`, nouvelle orchestration atelier fournissant règles, graphe de tâches, événements métier, agrégat d’intervention, ressources et décisions.

Une fusion physique immédiate augmenterait le risque de régression et rendrait le retour arrière difficile. Une coexistence non gouvernée créerait toutefois des doublons durables, notamment pour les événements, workflows, notifications et audits.

## Décision

1. `core/` devient la référence pour le **domaine et l’orchestration atelier**.
2. `src/core/` reste la référence transitoire pour les **services de plateforme** : stockage, audit, notifications, registre de modules et cycle de démarrage.
3. Une façade applicative unique, nommée provisoirement `WorkshopOrchestrator`, reliera les deux ensembles. L’interface atelier ne dépendra directement ni du stockage ni des moteurs isolés.
4. Le Graph Workflow Engine remplace progressivement le workflow linéaire dans l’interface Alpha. L’ancien parcours reste disponible dans les branches de sauvegarde jusqu’à validation terrain.
5. La convention canonique des nouveaux événements est `domaine.entite.action`, en minuscules. Les événements historiques à deux-points restent acceptés par un adaptateur pendant la migration.
6. Aucun module historique n’est supprimé avant couverture fonctionnelle équivalente, tests de migration et validation de restauration.

## Responsabilités cibles

### Domaine `core/`

- règles métier GentleCarE ;
- états et dépendances des tâches ;
- intervention et contrôles ;
- ressources et consommations ;
- recommandation de prochaine action ;
- planification métier à venir.

### Plateforme `src/core/`

- persistance abstraite ;
- audit ;
- notifications ;
- registre et cycle de vie des modules ;
- exposition stable aux interfaces ;
- intégration progressive des connecteurs.

### Façade applicative

- commandes : créer une intervention, démarrer, bloquer, reprendre et terminer une tâche, réserver une ressource, enregistrer une consommation, valider un contrôle et clôturer ;
- requêtes : intervention, tâches prêtes, prochaine décision, tableau atelier, conflits, timeline et état de synchronisation ;
- traduction des événements du domaine vers audit, notifications, persistance et projections.

## Séquence de mise en œuvre

1. Ajouter des tests unitaires aux moteurs `core/`.
2. Créer la façade sans modifier l’interface existante.
3. Ajouter la persistance et la reprise d’une intervention sérialisée.
4. Connecter une tâche de l’Alpha au graphe derrière un mécanisme de compatibilité.
5. Étendre au parcours complet puis exécuter les scénarios d’acceptation.
6. Retirer l’ancien parcours uniquement après validation et création d’un nouveau point de restauration.

## Critères d’acceptation

- Une intervention créée par la façade peut être sérialisée puis rechargée.
- Une tâche peut être démarrée et terminée depuis la façade.
- Un blocage de ressource ou de règle est visible et audité.
- Les événements alimentent audit et notifications sans dépendance DOM.
- Les tests existants restent réussis.
- Le retour arrière vers les branches du 20 juillet 2026 reste documenté.

## Conséquences

Cette décision évite une nouvelle réécriture complète. La V1 progresse par adaptation contrôlée : le domaine moderne est conservé, les services de plateforme utiles sont réemployés et l’interface reçoit un point d’entrée unique testable.

