# GentleCarE — collaboration David / Bénédicte et reprise des dossiers (20/11/2026)

## Démarrage des deux ChatGPT
1. Créer dans ChatGPT un projet partagé intitulé **GentleCarE — Jarvis / Direction** et inviter le compte ChatGPT de Bénédicte via **Partager**. L'invitation doit être acceptée sur son compte ; aucun accès n'est créé par le simple fait d'écrire ce document.
2. Dans les instructions du projet, coller : « Pour MAVIK/Jarvis, lire `MEMORY.md`, `knowledge/INDEX.md` et `docs/DOSSIER_TRANSMISSION_MAVIK.md` dans le dépôt `gentlecar64-ship-it/-jarvis-gentlecare`. La base Airtable GentleCarE est la source des dossiers métier ; vérifier l'état réel avant toute modification. Ne pas inventer des données, ne jamais publier de données clients ni de secrets sur GitHub. »
3. Chacun connecte GitHub et Airtable dans son propre ChatGPT avec ses autorisations propres. Vérifier que Bénédicte peut lire le dépôt et accéder à la base « GentlecarE ». Ne pas partager de mots de passe.
4. Centraliser les décisions communes dans `MEMORY.md` et les procédures dans `knowledge/`. Les conversations ChatGPT ne constituent **pas** une base de données client synchronisée.

## Flux iPhone → bureau (spécification à implémenter / tester)
- Le mobile affiche **clients, véhicules ET pièces détachées** avec les dossiers ouverts et leur état, sans duplication.
- Chaque pièce démontée possède ID stable, client, dossier, désignation, catégorie, référence, photos avant/après originales, temps, glace (kg), produit (L), observations et montant validé.
- Les ajouts et modifications sont enregistrés côté serveur et synchronisés vers Airtable, puis relus sur le PC de Bénédicte. En cas d'échec réseau, avertir et conserver une reprise explicite, jamais « envoyé » par défaut.
- Bouton **Transmettre à Bénédicte** : vérifier les champs obligatoires, enregistrer un événement horodaté, attribuer « À facturer », notifier la Direction. Sans confirmation serveur, conserver « Transmission en attente ».
- Bénédicte vérifie quantités, tarifs, remises, photos et commande puis émet la facture via le système de facturation retenu, sous validation humaine. La facture et sa référence sont liées au même dossier.
- Tester sur un dossier fictif puis sur Workshop (quatre pièces) sans modifier les photos validées.

## Incident de mise à jour — procédure sûre
- Sur le PC hôte : sauvegarder `C:\Mavik-GCOS\server\data` et `server\.env` hors du dossier avant toute réinstallation. Ne jamais supprimer `data`, `.env`, `users.json` ou les sauvegardes.
- Ouvrir MAVIK > Mon profil / Autodiagnostic ; relever l'erreur exacte, la version, la branche, le dernier commit et le canal (stable/development).
- Fermer les sessions actives, sauvegarder puis exécuter `C:\Mavik-GCOS\REPARER-MAVIK.cmd` si présent. Si l'outil indique « déjà installé », vérifier d'abord si le commit Git local est réellement le même que le distant. Ce texte seul ne prouve pas que la version affichée est à jour.
- Le code actuel vérifie les mises à jour dans `server/updater.js` et génère `server/public/alpha.html` via `server/design-installer.js` : **ne jamais copier à la main un vieux alpha.html**. Il est normal que `server/public/alpha.html` ne soit pas versionné.
- Si l'erreur persiste, collecter le contenu non sensible de `server/data/updates/state.json` (masquer tokens, chemins personnels) et le message `UPDATE_ROLLBACK` éventuel ; corriger le mécanisme de mise à jour sur une branche de correctif, tester Node et la reprise serveur, puis déployer. Ne pas forcer `git reset --hard` manuellement sans sauvegarde et vérification.
- L'installation automatique actuelle est paramétrée par défaut sur 18:00–07:30, et reportée si une intervention est en cours. Vérifier le paramétrage propriétaire et le service Windows.

## Acceptation
1. Une fiche pièce créée sur iPhone est retrouvée sur PC avec les mêmes photos et valeurs.
2. Après déconnexion/reconnexion, aucun ajout n'est perdu.
3. Bénédicte voit « À facturer », contrôle le dossier et valide la facturation.
4. L'outil de mise à jour distingue « aucune modification à installer », « installation déjà faite » et « installation échouée », affiche la cause, conserve les données et confirme la version après redémarrage.
