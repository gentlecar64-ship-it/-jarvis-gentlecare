# GentleCarE — Plan de livraison majeure MAVIK/Jarvis
Établi le 20 novembre 2026 — **préparation, pas installation**.

## Barrière de sécurité production
Le PC local utilise MAVIK 0.40.104 ; `C:\Mavik-GCOS` est sur `main`, SHA local `fe593ddd6e96070b79b0cb436c82b231829f0468`, avec ~20 fichiers suivis modifiés et de nombreux fichiers non suivis (photos atelier, sauvegardes .env, fonctions récentes). **Interdiction de `git reset --hard`, `git clean -fd`, `git pull` non préparé et du bouton Installer la mise à jour tant que migration validée non disponible**. Une copie complète devait être effectuée, mais l'existence d'une sauvegarde récente *n'a pas été confirmée*.

Priorité technique :
1. Vérifier sauvegarde exploitable hors dossier source (code, `server/data`, photos, .env et configurations protégées), inventaire et récupération.
2. Extraire un état non sensible de la version locale 0.40.104 et comparer aux fichiers GitHub **sans publier secrets, données clients, .env, photos**. La branche GitHub historique affiche `server/package.json` version 0.35.0, donc source non compatible présumée avec le PC actuel.
3. Reconstituer une branche d'intégration à partir du **code réellement installé**, tests de régression (devis, planning, atelier, appairage, iPhone, données).
4. Implémenter les changements listés et migrer sans pertes, journal et retour arrière testé.
5. Tester sur copie d'essai, pas sur serveur actif ; déploiement uniquement après validation explicite.

## Inventaire fonctionnel et statuts honnêtes
| Fonction | État au 20/11 | À faire |
|---|---|---|
| Pièces iPhone vers bureau, photos et file d'attente | Code GitHub fusionné via PR #34 ; **pas vérifié sur PC** | Portage, essais iPhone/PC hors ligne, audit des photos et synchronisation |
| Simulateur glace au curseur dans Devis | Code développé PR #35, **non fusionné / non installé** | Réconcilier interface locale 0.40.104, tester tarifs et stockage partagé |
| Geladoc : coût glace, transport, caisses, pertes | Facture FA/2026/01764 vérifiée ; référentiel GitHub | Centraliser paramètres tarifaires sur serveur, historiser sources et dates ; synchronisation email après vérification |
| Tarifs Workshop pièces déposées | Consignes documentées : lot 4 pièces 270 € HT exceptionnel (carters + 2 turbines) | Ajouter référence dossier non réutilisable comme tarif catalogue, deux lignes/devis |
| Alerte technique bloquante + photos, email/SMS, attente client | Spécification PR #36 ; **pas de code fonctionnel déployé** | Développer API, gestion photos protégées, consentement, reprise et planning orange ; tester envois |
| Harley Didier corrosion rayons/jantes/moyeux | Décision atelier documentée | Fiche réserve photo dans véhicule et compte rendu ; zones exclues |
| Dépôt véhicule la veille, accord et signature | Spécification GitHub publiée `specs/DEPOT_VEHICULE_AVANT_TRAVAUX.md` | Ajouter dates distinctes, case explicite, signature horodatée, PDF et contrôle agenda |
| CGV nouvelles : acompte, retard de dépôt, commandes de glace, reports, risques et réserves | Besoin défini ; **texte complet final, contrôle juridique et site : non confirmés** | Rédaction finale, revue, validation direction, PDF versionné, lien depuis devis et site |
| Site gentlecare.fr | Site public vérifié : politique annulation 72h et mentions qui nécessitent audit | Mettre en cohérence CGV et site, publier page CGV + pied de page et garder preuve de version |
| Devis PDF, signature et pièces jointes | Demandes anciennes ; état local non vérifié | Tests de génération PDF, devis à deux options, acceptation, acompte, RIB et logo validé |
| Mécanisme mises à jour | « Déjà installé » et « signal timed out » sur PC | Réparer détection version, packaging et installer atomique ; ne jamais écraser modifications locales |
| Sauvegarde / restauration et traçabilité | Procédure à vérifier | Sauvegarde contrôlée, journal de versions, récupération testée |

## Conditions commerciales à valider
- Dépôt véhicule **au plus tard le jour ouvré précédent le début des travaux** ; aucun dépôt le jour J ; date et créneau distincts dans devis/agenda ; cas lundi : vendredi précédent si atelier fermé le week-end.
- Un retard de dépôt ou accord manquant ne vaut pas annulation implicite ; la gestion des acomptes et frais doit suivre des CGV validées.
- Arrêt immédiat des travaux susceptibles d'endommager le véhicule, client averti avec preuve photographique, attente de réponse écrite ; aucune réponse ne vaut jamais accord.
- Pièces mécaniques regroupées avec véhicule : délai indicatif 7 à 15 jours ; commande urgente de glace séparée et chiffrée.
- Commande glace : facture Geladoc FA/2026/01764, 120 kg à 1,28 €/kg, caisses 3 × 18,80 €, livraison 111,80 € HT, soit 321,80 € HT (2,68 €/kg commandé), et projections 40-240 kg sous hypothèses constantes.
- Compresseur : 7 L/h × 2,50 €/L = 17,50 €/h ; glace 40/60/80 kg/h ; 1 h masquage, 1 h antirouille si requis ; 50 m alu / 3 voitures.
- Workshop Arbonne : 270 € HT **pour les 4 pièces**, à titre d'essai et partenariat, non tarif standard ; répartition proposée 170 HT lot deux carters + 50 HT chacune des deux turbines (sous réserve validation).

## Publication CGV : parcours de livraison
1. Produire CGV versionnées précisant identité légale exacte, devis, inspection, acomptes, délais, dépôt, glaces commandées, découvertes imprévues et autorisation, moyens de paiement, garanties, réclamation, droit de la consommation applicable.
2. Obtenir validation direction et vérification juridique, y compris conditions d'annulation à 72 heures déjà affichées sur le site.
3. Publier sur gentlecare.fr (Wix) via une page « Conditions générales de vente » facilement accessible, lien permanent en pied de page et dans parcours de demande de devis.
4. Injecter le numéro de version et l'URL CGV dans devis PDF, acceptation client non précochée et signature ; conserver copie de la version acceptée par dossier.
5. Faire des essais ordinateur/mobile et vérifier liens, confidentialité, mentions légales et e-mails.

## Critères de validation du lot majeur
- Sauvegarde vérifiée et possibilité de restauration.
- Fichiers clients et photos inchangés.
- Mise à jour sur copie sans `reset --hard`.
- Pièces iPhone créées, envoyées et visibles au bureau même après reprise réseau.
- Curseur devis avec tarifs Geladoc actualisés et historiques, sans faux envoi de mails.
- Alerte technique : dossier bloqué serveur, planning orange, photos client protégées, demande de validation et reprise tracée.
- Dépôt la veille : dates distinctes, accord et signature, PDF et agenda.
- CGV publiées et accessibles, version acceptée traçable.
- Validation utilisateur après tests avant bascule en production.

## Liens
PR #34 pièces iPhone (fusionnée), PR #35 simulateur (ouverte), PR #36 alertes techniques (ouverte).
Référentiel `knowledge/COUTS_PRODUCTION_2026-11-20.md`.
Spécification `specs/DEPOT_VEHICULE_AVANT_TRAVAUX.md`.
