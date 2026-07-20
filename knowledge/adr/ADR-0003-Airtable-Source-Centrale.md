# ADR-0003 — Airtable comme source centrale contrôlée

Date : 20 juillet 2026
Statut : accepté

## Contexte

MAVIK fonctionne en ligne pour les essais et possède également un serveur local capable d’assurer la continuité de l’atelier. Plusieurs interfaces peuvent modifier clients, véhicules, devis, interventions, tâches, stocks et documents.

## Décision

Airtable demeure la source de vérité centrale pour les données métier partagées. Le stockage local est un cache de continuité et un journal de travail, pas une seconde base centrale concurrente.

Une synchronisation complète applique la politique `AIRTABLE_WINS_THEN_PUSH_LOCAL` :

1. import complet et paginé d’Airtable ;
2. rapprochement par identifiant puis clé métier unique ;
3. arrêt si une fiche distante ne peut pas être importée ;
4. publication locale uniquement après import réussi.

## Sécurité

Le jeton Airtable est un secret serveur. Il n’est jamais inclus dans GitHub Pages, le JavaScript public, les exports de test ou les journaux affichés.

## Conséquences

- les conflits V1 sont tranchés en faveur d’Airtable ;
- les relations sont importées dans un ordre déterministe ;
- un échec distant empêche un export potentiellement destructeur ;
- le mode local reste utilisable lorsque la connexion est absente ;
- l’activation réelle exige l’installation d’un jeton privé sur le serveur MAVIK.
