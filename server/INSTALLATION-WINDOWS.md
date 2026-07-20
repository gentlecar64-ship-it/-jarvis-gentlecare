# Installation du serveur GCOS sous Windows 11

## Prérequis

- PC Windows 11 connecté à Internet.
- Node.js LTS installé.
- Dépôt GCOS téléchargé sur le PC.
- Jeton personnel Airtable autorisé sur la base GentleCarE.

## 1. Préparer la configuration

Dans le dossier `server` :

1. Copier `.env.example`.
2. Renommer la copie en `.env`.
3. Créer un jeton limité à la base GentleCarE avec `data.records:read`, `data.records:write` et `schema.bases:read`.
4. Remplacer `pat_VOTRE_JETON_AIRTABLE` par le jeton Airtable réel.

Le fichier `.env` ne doit jamais être publié sur GitHub ni transmis par message.

## 2. Premier démarrage

Double-cliquer sur :

`server\start-gcos.cmd`

Le serveur doit afficher :

- `GCOS Server started on http://127.0.0.1:4782`
- `Airtable: configured`

Tester ensuite dans un navigateur :

`http://127.0.0.1:4782/health`

La réponse doit contenir `airtableConfigured: true`.

Ouvrir ensuite `http://127.0.0.1:4782/airtable` avec le compte administrateur pour contrôler les tables avant la première importation.

## 3. Démarrage automatique avec Windows

Ouvrir PowerShell dans le dossier `server`, puis exécuter :

`powershell -ExecutionPolicy Bypass -File .\install-startup.ps1`

GCOS démarrera ensuite automatiquement à chaque ouverture de session Windows.

## 4. Utilisation depuis d'autres appareils

Par défaut, le serveur écoute uniquement sur le PC local (`127.0.0.1`). Pour autoriser les appareils du réseau local :

1. Modifier `.env` : `GCOS_HOST=0.0.0.0`.
2. Redémarrer le serveur.
3. Autoriser le port TCP 4782 dans le pare-feu Windows uniquement sur le réseau privé.
4. Dans Jarvis, définir l'adresse du serveur sous la forme `http://ADRESSE_IP_DU_PC:4782`.

Ne pas exposer directement le port 4782 sur Internet.

## 5. Migration future

Pour déplacer GCOS vers un autre PC, copier :

- le dépôt GCOS ;
- le fichier privé `server\.env` ;
- les futurs dossiers locaux de sauvegarde.

Les données métier principales restent dans Airtable et les services Google.
