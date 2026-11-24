# GCOS — État permanent du développement

Dernière mise à jour : 18 juillet 2026
Version de travail : **0.12.0-beta.1**
Projet : **GCOS / Jarvis GentleCarE**

## Objectif

Construire le système d’exploitation métier de GentleCarE : gestion clients, véhicules, devis, interventions, stocks, planning, rapports, automatisations et commandes vocales Jarvis.

## Architecture validée

- **GitHub** : code source, versions, historique et documentation.
- **GCOS local** : interface principale et fonctionnement hors ligne.
- **Airtable** : base opérationnelle partagée et synchronisée.
- **Jarvis** : couche d’assistance et d’exécution des actions métier.
- **Synchronisation** : GCOS local ↔ Airtable avec conservation des identifiants Airtable.

## Terminé

- Serveur local GCOS.
- Authentification et gestion des utilisateurs.
- Sauvegardes automatiques.
- Structure Airtable GentleCarE.
- Journal Jarvis dans Airtable.
- Moteur de synchronisation Airtable dans `server/airtable-sync.js`.
- Synchronisation prévue pour :
  - clients ;
  - véhicules ;
  - interventions ;
  - tâches ;
  - stocks et consommables ;
  - devis ;
  - documents.
- Persistance des identifiants Airtable pour éviter les doublons.
- Route de synchronisation globale et consultation du statut.
- Version du projet portée à `0.12.0-beta.1`.

## État actuel

Le socle technique est en place. La priorité n’est plus l’architecture, mais la livraison d’une **alpha métier utilisable**.

## Travail en cours — Alpha 0.13

### 1. Centre de commande

Écran d’accueil unique affichant :

- interventions du jour ;
- véhicules présents ;
- tâches en attente ;
- alertes de stock ;
- relances clients ;
- indicateurs essentiels.

### 2. Clients et véhicules

- recherche par nom, téléphone, immatriculation ou VIN ;
- création rapide d’un client ;
- création et rattachement d’un véhicule ;
- historique des interventions ;
- synchronisation Airtable automatique.

### 3. Intervention atelier

- ouverture d’une intervention ;
- statut et progression ;
- checklist ;
- temps passé ;
- glace carbonique consommée ;
- Dinitrol consommé ;
- observations ;
- photos avant et après.

### 4. Journal intelligent

Chaque action importante doit être tracée :

- création ou modification ;
- utilisateur ;
- date et heure ;
- objet concerné ;
- origine locale ou Airtable ;
- résultat de synchronisation.

## Étapes suivantes

### Version 0.14

- photos avant/après ;
- signature client ;
- génération du rapport PDF ;
- blocage de clôture si les éléments obligatoires manquent ;
- gestion détaillée des consommables.

### Version 0.15

- mode vocal Jarvis ;
- commandes naturelles ;
- lecture des tâches du jour ;
- création d’un client, véhicule, devis ou intervention à la voix ;
- assistance atelier en temps réel.

### Version bêta

- planning atelier ;
- devis visuels ;
- facturation ;
- rapports ;
- tableaux de bord de gestion ;
- fonctionnement multi-activité et multi-site.

## Règles de reprise du développement

Avant toute nouvelle session :

1. lire ce fichier ;
2. vérifier la version dans `server/package.json` ;
3. consulter les derniers commits GitHub ;
4. vérifier le statut de la synchronisation Airtable ;
5. reprendre uniquement la première tâche non terminée de la section « Travail en cours » ;
6. mettre à jour ce fichier après chaque jalon significatif.

## Prochaine action précise

Créer le premier écran opérationnel de l’alpha avec :

1. tableau de bord ;
2. recherche universelle ;
3. accès Clients et Véhicules ;
4. ouverture d’une intervention ;
5. retour visible du statut de synchronisation Airtable.

## Définition d’une alpha testable

L’alpha est testable lorsque l’utilisateur peut, depuis PC ou iPhone :

1. rechercher ou créer un client ;
2. ajouter un véhicule ;
3. ouvrir une intervention ;
4. enregistrer les informations atelier ;
5. synchroniser les données avec Airtable ;
6. retrouver les données après fermeture et redémarrage.
