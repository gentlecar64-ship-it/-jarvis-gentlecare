# Intégration Gmail de Betty

## Compte autorisé

- Assistante GentleCarE : **Betty**.
- Compte professionnel cible unique : **benedicte@gentlecare.fr**.
- Toute autre boîte est hors périmètre sans décision explicite.

## Version livrée

- Centre de messagerie Betty.
- Filtres clients, fournisseurs, finance, priorités et réponses attendues.
- Explication du classement.
- Indicateurs et recherche locale.
- Bouton Betty Mail accessible dans MAVIK.
- Aucun envoi automatique.

## Sécurité

L’application étant publiée sur GitHub Pages, aucun mot de passe, secret OAuth ou jeton Gmail ne doit être placé dans le dépôt, le JavaScript client ou localStorage.

La connexion Gmail utilisée dans ChatGPT n’est pas réutilisable directement par MAVIK. La synchronisation réelle devra passer par un backend sécurisé avec OAuth Google Workspace.

Règles obligatoires : lecture seule par défaut, moindre privilège, brouillons soumis à validation humaine, journalisation des actions sensibles et rattachement sélectif des e-mails utiles aux dossiers métier.

## Étape suivante

Créer un backend MAVIK Gmail avec OAuth, stockage chiffré des jetons, récupération incrémentale, création de brouillons, journal d’audit et révocation de connexion.