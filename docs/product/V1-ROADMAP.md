# MAVIK V1 — Feuille de route opérationnelle

## Objectif

Livrer une version réellement testable et utilisable dans l'atelier GentleCarE avant d'ouvrir le chantier V2.

## Socle déjà engagé

- [x] Rule Engine
- [x] Workflow Engine
- [x] Graph Workflow Engine
- [x] Event Bus
- [x] Intervention Engine
- [x] Resource Manager
- [x] Decision Engine
- [x] Branches de sauvegarde avant refonte

## Bloc A — Orchestration

- [ ] Planner Engine
- [ ] Dashboard State central
- [ ] Notification Engine
- [ ] KPI Engine
- [ ] Timeline d'intervention
- [ ] Audit Engine

## Bloc B — Interface atelier testable

- [ ] remplacer définitivement la logique `step` ;
- [ ] connecter l'interface au graphe de tâches ;
- [ ] choisir l'opérateur actif ;
- [ ] démarrer, bloquer et terminer une tâche ;
- [ ] afficher les tâches prêtes, en cours et bloquées ;
- [ ] afficher les recommandations MAVIK ;
- [ ] rendre l'interface utilisable sur ordinateur et tablette.

## Bloc C — Données métier

- [ ] clients ;
- [ ] véhicules ;
- [ ] interventions ;
- [ ] ressources atelier ;
- [ ] stocks glace et DINITROL ;
- [ ] documents et photos ;
- [ ] historique complet.

## Bloc D — Connexions externes

- [ ] Airtable comme base opérationnelle ;
- [ ] synchronisation avec les calendriers GentleCarE ;
- [ ] génération de devis ;
- [ ] génération de rapports ;
- [ ] exports et sauvegardes.

## Bloc E — Validation terrain

- [ ] scénario complet sur véhicule fictif ;
- [ ] scénario avec tâche bloquée ;
- [ ] scénario avec ressource indisponible ;
- [ ] scénario multi-opérateurs ;
- [ ] test de conservation des données ;
- [ ] test de restauration ;
- [ ] premier essai réel par David ;
- [ ] corrections issues du premier essai.

## Définition de « V1 prête »

La V1 est considérée comme prête lorsque David peut réaliser un cycle complet sans revenir à un suivi parallèle :

1. créer ou retrouver un client ;
2. créer ou retrouver un véhicule ;
3. ouvrir une intervention ;
4. suivre toutes les tâches ;
5. voir les ressources et blocages ;
6. terminer les contrôles ;
7. produire les documents de sortie ;
8. retrouver l'historique complet.

## Hors périmètre V1 initiale

Ces éléments restent enregistrés pour la V2 :

- vision IA ;
- assistant vocal complet ;
- apprentissage automatique ;
- simulation avancée ;
- maintenance prédictive ;
- application mobile native ;
- plateforme commerciale multi-ateliers.
