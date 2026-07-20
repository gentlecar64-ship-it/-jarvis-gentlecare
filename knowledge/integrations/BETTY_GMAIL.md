# Intégration Gmail de Betty

## Identité et compte autorisé

- Assistante GentleCarE : **Betty**.
- Compte Gmail professionnel cible unique : **benedicte@gentlecare.fr**.
- Toute autre boîte est hors périmètre tant qu’une décision explicite ne l’ajoute pas.

## Première version livrée

Le Centre de messagerie Betty fournit :

- une interface de boîte de réception ;
- des filtres clients, fournisseurs, finance, priorités et réponses attendues ;
- une explication visible du classement ;
- des indicateurs pour les non-lus, priorités, réponses et brouillons ;
- une recherche locale ;
- l’interdiction d’envoyer automatiquement un e-mail.

## Limite technique actuelle

L’application est publiée sur GitHub Pages. Elle ne doit jamais contenir de secret OAuth, mot de passe Gmail ou jeton d’accès dans le dépôt ou dans le navigateur.

La connexion Gmail utilisée dans ChatGPT ne peut pas être réemployée directement par MAVIK. La synchronisation réelle devra passer par un service sécurisé côté serveur utilisant OAuth Google pour le compte autorisé.

## Règles obligatoires

1. Lecture seule par défaut.
2. Moindre privilège OAuth.
3. Aucun secret dans GitHub Pages ou localStorage.
4. Toute réponse est d’abord préparée comme brouillon.
5. L’envoi exige une validation humaine explicite.
6. Toute action sensible est journalisée.
7. Les e-mails ne sont pas tous copiés dans Airtable : seuls les éléments utiles sont rattachés selon une règle métier validée.
8. L’identité Betty est affichée dans les nouvelles interfaces ; les anciennes références Jarvis sont considérées comme héritées jusqu’à migration contrôlée.

## Étape suivante

Créer le service backend MAVIK Gmail avec :

- OAuth Google Workspace ;
- stockage chiffré des jetons ;
- récupération incrémentale des messages ;
- API interne normalisée ;
- création de brouillons ;
- journal d’audit ;
- révocation de la connexion.