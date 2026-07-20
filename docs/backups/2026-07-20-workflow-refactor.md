# Point de restauration — refonte Workflow MAVIK

Date : 20 juillet 2026

## Branches protégées

- `backup/2026-07-20-workflow-v1` : copie intégrale de `release/1.0-workshop` après ajout du Rule Engine et du Workflow Engine collaboratif.
- `backup/2026-07-20-alpha-ui` : copie intégrale de l'interface Alpha avant remplacement du système linéaire `step`.
- `feature/graph-workflow-ui` : branche de développement de la nouvelle interface pilotée par graphe.

## Éléments à ne pas perdre

- `core/rules/rule-engine.js`
- `core/rules/gentlecare-rules.js`
- `core/workflow/workflow-engine.js`
- `alpha/workshop/index.html`
- la mémoire et la documentation métier chargées par MAVIK

## Politique de remplacement

1. Aucun ancien module n'est supprimé des branches de sauvegarde.
2. La nouvelle architecture est développée sur `feature/graph-workflow-ui`.
3. Le système `step` ne sera supprimé de la branche de release qu'après validation du graphe de tâches.
4. Toute migration doit conserver clients, véhicules, historique, ressources et journal.
5. Un retour arrière reste possible en repartant de l'une des deux branches `backup/...`.
