# ADR-0001 — Knowledge Manager MAVIK

- Statut : accepté
- Date : 2026-07-20
- Décideurs : David Bourasseau, Bénédicte et équipe MAVIK

## Contexte

Les connaissances de GentleCarE et les décisions de développement étaient dispersées entre le code, les conversations et plusieurs services externes. Une nouvelle instance de MAVIK ou une autre IA ne pouvait pas reconstruire automatiquement le contexte complet.

## Décision

MAVIK possède une base de connaissances versionnée dans le dossier racine `knowledge/`. Le service `server/knowledge-manager.js` la charge automatiquement, indexe les fichiers Markdown et fournit une recherche ainsi qu’un contexte ciblé.

## Principes

- Les données opérationnelles restent dans les bases métier.
- La connaissance stable, les règles, l’architecture et les décisions restent dans Git.
- Le chargement ne doit pas empêcher le serveur de démarrer si un document isolé est invalide.
- Les réponses de Jarvis peuvent combiner la connaissance structurée historique et les documents Markdown.
- Toute évolution majeure doit actualiser la base de connaissances.

## Conséquences

MAVIK devient capable de relire sa mémoire officielle à chaque lancement. Les prochains travaux devront ajouter l’exposition de l’état du Knowledge Manager dans le diagnostic serveur et injecter le contexte pertinent dans les appels IA.
