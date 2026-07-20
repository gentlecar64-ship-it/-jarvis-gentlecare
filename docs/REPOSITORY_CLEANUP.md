# Nettoyage du dépôt MAVIK

## Objectif

Séparer clairement :

- le code et les configurations de référence, qui doivent être versionnés ;
- les sauvegardes, sessions, journaux et états locaux, qui doivent rester sur chaque poste.

## Fichiers conservés dans Git

Les fichiers de code, les pages HTML, les scripts JavaScript, les feuilles de style, les fichiers de configuration de référence et `package-lock.json` restent versionnés.

## Fichiers exclus

Les éléments suivants sont générés pendant l'utilisation de MAVIK et ne doivent plus polluer les commits :

- `server/backups/` ;
- les sessions locales ;
- les diagnostics et journaux d'erreur ;
- les états Jarvis et MAVIK générés ;
- les données locales d'utilisateurs et de réputation ;
- les secrets `.env`.

## Nettoyage initial sur un poste déjà utilisé

Depuis la racine du dépôt, exécuter :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/cleanup-generated-files.ps1
```

Le script retire uniquement ces fichiers de l'index Git. Il ne les supprime pas du disque.

Après contrôle du résultat dans GitHub Desktop, créer un commit distinct intitulé par exemple :

```text
chore: stop tracking generated runtime data
```

## Précaution

Ne pas supprimer ni annuler automatiquement les modifications de `server/public/`, des fichiers JavaScript ou de `package-lock.json` : elles peuvent contenir de vraies évolutions du programme et doivent être examinées séparément.
