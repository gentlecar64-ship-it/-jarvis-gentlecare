# MAVIK 0.40.105 — livraison atelier, pièces, messagerie et showroom

Date : 20 novembre 2026. Statut : candidate de publication, sous réserve des tests d'installation et de synchronisation sur le PC atelier.

## Parcours pièces détachées

- Sur ordinateur et iPhone (même serveur GCOS) : ouvrir `/pieces` depuis la navigation.
- Créer une fiche avec client/entreprise, dossier, catégorie, référence, photos avant/après ; ne jamais créer plusieurs pièces sous le même identifiant.
- Retrouver les fiches côté bureau ; ajouter des photographies, le temps réel, les kg de glace et le montant HT proposé.
- « Transmettre à Bénédicte » : la fiche passe à « À facturer » après contrôle des photos et de son rattachement client/dossier. La messagerie interne notifie Bénédicte si un compte actif portant ce nom est présent ; sinon avertissement explicite.
- Stockage primaire local : `server/data/incoming-parts.json`, conservé en cas de panne réseau. Sauvegarde automatique dans `server/backups/parts-*.json`.
- Miroir Airtable : base GentlecarE, table **Pièces détachées** ; connexion via le jeton `AIRTABLE_TOKEN` déjà prévu dans l'environnement serveur. En cas de coupure Internet, nouvelle tentative automatique. Les photos de la fiche sont envoyées via l'API d'upload des pièces jointes, les originaux restent localement.
- Les anciens brouillons iPhone sont à rechercher **sur le téléphone où ils ont été saisis**. Ouvrir `/pieces`, section « Diagnostic — anciens brouillons », puis exporter. Ne pas vider Safari/Chrome avant récupération.

## Rapports, fin de véhicule et planning

1. La réception et les étapes de cryogénie / protection sont validées individuellement, avec horodatage, nom de l'opérateur, note et preuves. Un historique de compte rendu est consultable sur la fiche.
2. Une fois toutes les étapes obligatoires effectuées : demander contrôle final de direction, puis valider. Le rapport client reste un document distinct, soumis à validation.
3. Planifier et valider **Lavage extérieur**.
4. Planifier et valider **Mise en valeur** (uniquement après lavage).
5. Le bouton **« Véhicule fini → Showroom »** n'est actif que lorsque les étapes précédentes sont achevées. Le poste atelier est alors libéré, le véhicule passe « En showroom — attente restitution » et son occupation apparaît au planning.
6. Planifier **Rendez-vous restitution client** (date et heure), distinct des travaux. Le rendez-vous n'est pas un constat de livraison ; remise effective, facturation et règlement restent soumis aux validations habituelles.

La planification est limitée aux jours ouvrés, sans générer artificiellement une seconde occupation du poste atelier pour la même voiture.

## E-mails depuis Jarvis

- Interface `/mail` accessible depuis Jarvis ; l'envoi exige une validation humaine explicite et est confirmé par l'identifiant du message Gmail.
- La session ChatGPT/Gmail du développeur n'accorde pas automatiquement au serveur local le droit d'envoyer. Le serveur doit disposer d'un consentement OAuth Gmail correspondant au compte expéditeur.
- Variables à fournir exclusivement dans `C:\Mavik-GCOS\server\.env`, jamais dans GitHub : `GCOS_MAIL_FROM`, `GCOS_GMAIL_CLIENT_ID`, `GCOS_GMAIL_CLIENT_SECRET`, `GCOS_GMAIL_REFRESH_TOKEN`.
- Le refresh token doit posséder l'autorisation Gmail `gmail.send` et le compte Google doit autoriser l'adresse d'expédition. **Ne pas transmettre les identifiants secrets par e-mail ou dans ChatGPT.** Sans configuration, l'écran affiche « non configuré » et n'autorise pas l'envoi.
- Le journal (sans corps de message ni secret) est conservé dans `server/data/outgoing-mail-log.json`.

## Vérifications à exécuter sur le PC avant confirmation finale

1. Copie de sauvegarde sécurisée de `server/data`, de `server/.env` et de `server/public/generated` vers D: ; arrêt propre du serveur.
2. Installer la mise à jour avec le mécanisme MAVIK après contrôle de Git, sans supprimer les modifications locales ni `server/data`.
3. Dans `server` : `npm run check` et `npm test`. Vérifier `/health` (version attendue : 0.40.105) et `/alpha`, `/iphone`, `/pieces`, `/mail`.
4. Essai depuis iPhone : enregistrer une pièce fictive + photo Avant ; vérifier sur PC ; ajouter photo Après ; contrôler présence en Airtable et absence de doublons ; passer « À facturer » et vérifier la notification de Bénédicte.
5. Essai dossier véhicule fictif : marquer les étapes, valider le rapport, planifier lavage puis mise en valeur, refuser showroom prématuré, valider le bouton « Véhicule fini », vérifier l'entrée showroom et la restitution au planning.
6. Envoyer un e-mail de test **uniquement après** validation de la connexion Gmail et de l'adresse destinataire.

## Limitations honnêtes

Le code et la validation syntaxique ne constituent pas un essai réel sur le PC de l'atelier. Les anciens fichiers pièce non transmis ne peuvent pas être reconstitués à distance ; la récupération depuis l'appareil d'origine reste nécessaire. La synchronisation Airtable et l'envoi Gmail doivent être vérifiés avec les identifiants privés du serveur.
