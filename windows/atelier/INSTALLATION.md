# Installation du PC Atelier

## 1. Compte Windows

Créer un compte local Windows nommé `Atelier`. Le compte est dédié au poste opérateur et ne doit pas être administrateur local.

Configurer la connexion automatique Windows uniquement sur ce PC physiquement sécurisé. Le compte ne contient aucune donnée bancaire ni accès Direction.

## 2. Caméra Logitech

1. connecter la caméra Logitech USB HD 1080p ;
2. ouvrir une première fois le Poste Atelier ;
3. autoriser définitivement la caméra et le microphone pour le site MAVIK dans Edge ;
4. sélectionner la caméra Logitech si plusieurs caméras sont présentes ;
5. vérifier l’aperçu et le cadrage.

## 3. Lancement automatique

Copier `lancer-mavik-atelier.cmd` sur le PC, puis créer un raccourci dans :

```text
shell:startup
```

Le raccourci lance Microsoft Edge en mode kiosque plein écran sur :

```text
https://gentlecar64-ship-it.github.io/-jarvis-gentlecare/alpha/workshop/index.html?station=atelier
```

## 4. Son et voix

- sélectionner les haut-parleurs du poste comme sortie Windows par défaut ;
- sélectionner le microphone atelier comme entrée par défaut ;
- conserver le volume audible sans gêner le travail ;
- tester le son de démarrage et l’annonce de la journée.

## 5. Réseau

Utiliser en priorité une connexion Ethernet. Le futur serveur MAVIK devra être configuré comme source centrale dès qu’il sera disponible.

## 6. Sécurité

- ne pas enregistrer de compte Direction dans Edge sur ce poste ;
- ne pas ouvrir Gmail, GitHub, la banque ou la comptabilité sur le compte Windows Atelier ;
- ne pas donner les droits administrateur local au compte Atelier ;
- verrouiller physiquement l’accès au PC hors horaires d’ouverture ;
- installer les mises à jour Windows et Edge ;
- vérifier régulièrement le journal Sécurité MAVIK depuis un compte Direction.

## 7. Sortie du mode kiosque

Utiliser `Ctrl + Alt + Suppr`, puis fermer la session Atelier depuis Windows. La sortie du kiosque ne donne aucun droit supplémentaire dans MAVIK.
