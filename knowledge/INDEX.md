# Index de la base de connaissances MAVIK

## Point d’entrée obligatoire

0. [`../MEMORY.md`](../MEMORY.md) — mémoire partagée et synthèse opérationnelle.
1. `MAVIK_BRAIN.md`
2. `VERSION.md`
3. `architecture/`
4. `business/`
5. `integrations/`
6. `modules/`
7. `adr/`
8. `roadmap/`

## Règle de chargement

Au démarrage, MAVIK charge tous les fichiers Markdown présents dans ce dossier et ses sous-dossiers. Le contexte complet n’est pas injecté dans chaque réponse : le Knowledge Manager sélectionne d’abord les documents pertinents selon les mots-clés de la demande.

Pour un assistant ChatGPT connecté au dépôt, commencer par lire `MEMORY.md`, puis cet index et les documents détaillés nécessaires à la demande.

## Règle de maintenance

Toute évolution significative doit mettre à jour, selon le cas :

- `MEMORY.md` lorsqu’elle modifie une règle opérationnelle ou une décision structurante ;
- le code ;
- la documentation du module ;
- une décision ADR ;
- la feuille de route ;
- la version de la base de connaissances.
