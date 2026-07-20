# MAVIK — Politique de versions et de livraison

## Principe général

MAVIK est développé par étapes successives afin de garantir une version utilisable, stable et réversible à chaque phase.

## Cycle de versions

### V1 — Exploitation atelier

La V1 couvre uniquement les fonctions nécessaires au fonctionnement quotidien de GentleCarE :

- clients ;
- véhicules ;
- interventions ;
- workflow atelier ;
- ressources ;
- stock ;
- planning ;
- devis, rapports et documents ;
- tableau de bord opérationnel ;
- historique et audit.

La V1 est enrichie progressivement tant que les ajouts ne compromettent pas sa stabilité.

### V1.x — Améliorations progressives

Les versions V1.1, V1.2, etc. servent à intégrer :

- corrections ;
- améliorations ergonomiques ;
- simplification des parcours ;
- automatisations ;
- optimisations de performance ;
- fonctionnalités validées après usage réel.

### V2 — Intelligence avancée

La V2 ne sera ouverte qu'une fois la V1 complète, testée et stabilisée. Elle pourra inclure :

- vision IA ;
- assistant vocal ;
- application mobile ;
- simulation d'atelier ;
- apprentissage automatique ;
- maintenance prédictive ;
- optimisation avancée ;
- exploitation multi-sites ou multi-ateliers.

## Règle de classement des nouvelles idées

Chaque nouvelle demande doit être classée dans l'une de ces catégories :

1. **Bloquant V1** — empêche l'utilisation réelle.
2. **Important V1** — améliore fortement l'exploitation quotidienne.
3. **Amélioration V1.x** — utile mais non indispensable au lancement.
4. **Candidat V2** — intelligence avancée, automatisation lourde ou changement majeur d'architecture.

## Règles de sécurité

- aucune suppression définitive sans sauvegarde ;
- une branche de sauvegarde avant chaque refonte majeure ;
- aucun remplacement de composant stable sans solution de retour arrière ;
- aucune fusion dans la branche de référence sans validation fonctionnelle ;
- chaque évolution importante doit être documentée.

## Critères de passage en V2

La V2 ne peut commencer que lorsque :

- la V1 est utilisable en atelier ;
- les parcours critiques sont testés ;
- les blocages majeurs sont corrigés ;
- les données sont conservées correctement ;
- les sauvegardes et restaurations sont vérifiées ;
- les retours terrain ont été intégrés ;
- la dette technique critique est résorbée.
