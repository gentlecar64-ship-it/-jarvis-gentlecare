# Mise à jour GCOS

## Principe retenu

GCOS ne conserve pas une accumulation d'anciennes versions sur le disque.

Pendant une mise à jour, le système utilise uniquement :

1. la version actuellement installée ;
2. la nouvelle version téléchargée dans un dossier temporaire ;
3. une seule copie temporaire de retour arrière.

Dès que la nouvelle version est validée, la copie précédente et les fichiers temporaires sont supprimés automatiquement.

## Données utilisateur

Les données métier ne doivent jamais être stockées dans le dossier de l'application.

Le dossier de données prévu est :

```text
%LOCALAPPDATA%\GCOS-Data
```

Il peut contenir les paramètres, journaux et futures sauvegardes de données. Une mise à jour de l'application ne supprime pas ce dossier.

## Script Windows

Le script se trouve ici :

```text
scripts/update-gcos.ps1
```

Exécution standard :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-gcos.ps1
```

Installation dans un dossier différent :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-gcos.ps1 -InstallDir "C:\GCOS"
```

## Déroulement

1. Téléchargement de la branche `main` dans le dossier temporaire Windows.
2. Extraction du paquet.
3. Suppression d'une éventuelle ancienne sauvegarde de retour arrière.
4. Déplacement de la version active vers `GCOS.rollback`.
5. Installation de la nouvelle version.
6. Vérification de la présence de `index.html`.
7. Suppression de `GCOS.rollback` et des fichiers temporaires si la vérification réussit.
8. Restauration automatique de la version précédente si une erreur survient.

## Occupation du disque

En fonctionnement normal, une seule version de GCOS reste installée.

La copie de retour arrière existe uniquement pendant la mise à jour. Elle n'est pas conservée après validation.

## Journal

Les opérations sont consignées dans :

```text
%LOCALAPPDATA%\GCOS-Data\logs\update.log
```

## Améliorations prévues

- vérifier la version avant téléchargement ;
- vérifier l'intégrité du paquet ;
- bloquer une mise à jour incompatible ;
- afficher la progression dans GCOS ;
- permettre le lancement depuis un bouton « Mettre à jour » ;
- effectuer un test de démarrage avant suppression de la copie de retour arrière.
