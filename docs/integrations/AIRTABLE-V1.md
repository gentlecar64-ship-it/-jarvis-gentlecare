# Airtable V1 — Connexion MAVIK / GentleCarE

Statut : passerelle logicielle prête, jeton réel à installer sur le serveur MAVIK.

## Décision de référence

Airtable est la base centrale partagée. MAVIK conserve un stockage local de continuité, mais ne doit jamais écraser Airtable sans avoir d’abord importé l’état distant.

Politique V1 : `AIRTABLE_WINS_THEN_PUSH_LOCAL`.

1. sauvegarder les données locales ;
2. tester la connexion Airtable ;
3. contrôler les tables et les champs ;
4. importer Airtable dans l’ordre des dépendances ;
5. rapprocher les fiches par identifiant Airtable puis par clé métier ;
6. arrêter la synchronisation si l’import contient une erreur ;
7. publier les données locales seulement après un import complet réussi ;
8. journaliser le résultat et conserver les erreurs par fiche.

## Secrets

Le jeton ne doit apparaître ni dans GitHub, ni dans GitHub Pages, ni dans le navigateur, ni dans un export utilisateur.

Il est installé uniquement dans `server/.env` :

```text
AIRTABLE_BASE_ID=app6i45G4WG2nmQff
AIRTABLE_TOKEN=pat_...
```

Scopes minimaux recommandés :

- `data.records:read` ;
- `data.records:write` ;
- `schema.bases:read` ;
- accès limité à la base GentleCarE.

## Ordre de synchronisation

1. Clients ;
2. Véhicules ;
3. Dossiers et devis ;
4. Interventions ;
5. Tâches Jarvis ;
6. Stocks et consommables ;
7. Centre documentaire.

Cet ordre garantit que les relations parent existent avant les véhicules, devis et interventions.

## Rapprochement anti-doublon

MAVIK recherche d’abord `airtableId`. À défaut :

- client : email, téléphone, puis nom ;
- véhicule : VIN, immatriculation, puis libellé ;
- devis et intervention : numéro ;
- tâche : titre et échéance ;
- stock : référence, puis désignation ;
- document : titre et date d’ajout.

Une correspondance naturelle n’est acceptée que si elle est unique.

## Procédure de première connexion

1. Créer un jeton personnel Airtable avec les scopes minimaux.
2. Limiter ce jeton à la base GentleCarE.
3. Copier `server/.env.example` vers `server/.env` sur le poste serveur.
4. Installer le jeton réel dans `AIRTABLE_TOKEN`.
5. Redémarrer MAVIK.
6. Ouvrir `/airtable` avec un compte administrateur.
7. Cliquer sur **Tester**.
8. Cliquer sur **Contrôler le schéma**.
9. Corriger toute table ou tout champ manquant.
10. Effectuer une sauvegarde complète.
11. Cliquer sur **Importer Airtable** et vérifier les compteurs.
12. Lancer la **Synchronisation complète**.

## Reprise et incident

Si un import échoue, MAVIK bloque l’export. Corriger les champs ou relations manquants, relancer le contrôle du schéma, puis refaire l’import. Ne jamais supprimer la base locale avant d’avoir vérifié la sauvegarde et l’état Airtable.

Les routes d’administration sont :

- `GET /api/sync/status` ;
- `POST /api/sync/test` ;
- `GET /api/sync/schema` ;
- `POST /api/sync/pull-all` ;
- `POST /api/sync/push-all` ;
- `POST /api/sync/run`.

Les opérations d’import, d’export global et de synchronisation complète exigent le rôle administrateur.
