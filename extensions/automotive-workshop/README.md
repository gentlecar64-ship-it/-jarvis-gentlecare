# Extension Poste Atelier GentleCarE

Cette extension transforme un PC Windows en poste opérateur MAVIK limité à l’activité Atelier.

## Interface

- horloge et date grand format ;
- caméra Logitech USB ;
- intervention en cours et suivante ;
- planning horizontal avec ligne jaune de l’heure actuelle ;
- photos avant, pendant et après ;
- rapport d’intervention ;
- stock en lecture seule ;
- assistance vocale Jarvis.

## Sécurité

Le profil `workshop` n’hérite d’aucun droit Direction. Les menus et moteurs relatifs à l’administration, aux paramètres système, à la comptabilité, aux banques, aux utilisateurs, au développement et à GitHub ne sont pas chargés.

## Stockage et synchronisation

La version actuelle utilise les dossiers locaux compatibles avec `mavik.workshop.orchestrator.v1`. Les événements à synchroniser sont placés dans les files locales :

- `mavik-workshop-notifications` ;
- `mavik-internal-calls` ;
- `mavik-workshop-sync-outbox`.

Le futur serveur MAVIK pourra consommer ces événements sans modifier l’interface du poste.

## Installation Windows

Voir `windows/atelier/INSTALLATION.md` et utiliser `windows/atelier/lancer-mavik-atelier.cmd` au démarrage du compte Windows Atelier.
