# MAVIK / Jarvis — Alerte technique bloquante et attente client

Décision métier GentleCarE : 20/11/2026

## Cas déclencheur
Au cours de la réception, de l'inspection ou du travail d'atelier, un technicien constate une anomalie inattendue qui remet en question la sécurité, la conservation d'une pièce ou le périmètre de l'intervention. Exemple réel : Harley de Didier, corrosion débutante aux jantes, rayons et moyeux, absence de protection adaptée après décapage ; **ne pas toucher** ces éléments. Bras à vérifier ; selle cuir à examiner avec une méthode adaptée avant tout essai.

## Scénario exigé
1. Depuis l'intervention, bouton prioritaire **« Signaler un problème technique »**, accessible au technicien sur PC/tablette/iPhone. Choix de la zone, description du problème, risques possibles, photos obligatoires, consigne de protection, actions conseillées.
2. **Immédiatement au signalement, bloquer l'exécution de la procédure** : statut `EN_ATTENTE_ACCORD_CLIENT`, horodatage, auteur et journal d'audit. Interdire démarrage, étapes suivantes, validation finale et clôture tant que statut bloquant actif. Le technicien arrête la zone risquée sans attendre l'envoi d'un message. Permettre uniquement les mesures de mise en sécurité/conservation.
3. Préparer automatiquement un message client avec les photos, la zone concernée, la découverte, les risques, les options possibles (ne pas traiter / traitement supplémentaire sur devis / demander expertise) et demande **d'accord écrit explicite** ; canal selon choix client (e-mail ou SMS avec lien sécurisé vers les photos). Ne pas envoyer de galerie photo dans un SMS brut ; préférer lien protégé et expirant.
4. **Envoi automatisé uniquement** si coordonnées valides, canal choisi et prestataire de messagerie réellement configuré. Vérifier retour et journaliser IDs d'envoi. En cas d'échec, maintenir le blocage, afficher alerte direction + action renvoyer/changer canal. Jamais d'état « message envoyé » sans preuve.
5. Planning : retirer la tâche du créneau actif de production, la faire figurer dans une **file d'attente client**, couleur dédiée (orange/ambre par ex.), libellé « En attente de réponse client » visible dans l'agenda et sur les postes. **Ne pas attribuer automatiquement une nouvelle date ferme** : on ignore quand le client répondra. Conserver l'ancien créneau et son motif dans l'historique, alerter si véhicule immobilisé sur place, ne pas effacer l'indisponibilité physique.
6. Réponse client : consentement écrit daté avec identité, choix clair et éventuel supplément chiffré à accepter. Les réponses reçues par e-mail/SMS doivent être rattachées au dossier, l'absence de réponse ne vaut jamais accord.
7. Après réponse valide : proposition de reprise à la direction, validation du nouveau périmètre puis **replanification dans un créneau disponible**. Statuts `AUTORISE_A_REPLANIFIER` puis `PLANIFIE`; conserver les zones exclues et les réserves techniques. Un simple message ambigu ne débloque pas la machine.
8. Si aucun retour, intervention maintenue dans `EN_ATTENTE_ACCORD_CLIENT`, sans clôture et sans reprise automatique. Afficher ancienneté de l'attente et suivi relances. Les délais de relance commerciaux restent à paramétrer.

## Modèle de données attendu
`technicalAlerts[]` par intervention : id, interventionId, clientId, vehicleId, createdAt, createdBy, zone, observation, risk, photoRefs[], exclusions[], recommendations[], clientChoice, channel, sendStatus, sentAt, providerMessageId, customerReply, customerReplyAt, consentEvidence, decisionValidatedBy, previousSchedule, nextSchedule, status, auditTrail[].
Photos clients stockées dans espace protégé, pas dans URL publique libre.
Statut de production : `EN_ATTENTE_ACCORD_CLIENT`; filtre et couleur dans planning, cockpit atelier, accueil et fiche dossier. Prendre en compte ateliers multitechniciens.

## Règles de sécurité, synchronisation et limites
- Backend doit imposer le blocage ; une simple couleur côté navigateur serait insuffisante.
- Contrôle d'accès : technicien signale, direction valide reprise/modification de devis ; le client ne signe que sa propre décision.
- Actions idempotentes (ne pas dupliquer SMS et emails si le bouton est recliqué).
- Journal immuable de qui a signalé, envoyé, accepté/refusé et relancé, avec dates et pièces jointes ; pas d'édition silencieuse.
- Une urgence avec risque pour le véhicule nécessite mesures de sécurité et alerte interne immédiate.
- **Pour la Harley de Didier** : jantes, rayons, moyeux exclus sans projection ni décapage ; si cette exclusion est validée par client et ne requiert pas de décision ultérieure, consigner la réserve ; sinon bloquer et demander instruction.
- **Ne pas promettre de notification instantanée** en cas de réseau indisponible ; synchroniser/enregistrer localement de manière sûre avant nouvelle tentative.

## Critères de réception
- Photos + constat -> intervention bloquée à l'instant T, planning orange et visible en attente.
- Aucun envoi SMS/e-mail fictif ; vérification de délivrance ou erreur explicite.
- Aucune étape technique ni clôture autorisée sur dossier bloqué.
- Réponse claire -> direction débloque et replanifie ; aucune réponse -> reste en attente.
- Plusieurs alertes possibles pour un même véhicule ; chacune doit être résolue pour terminer.
- Tests sur dossiers fictifs, puis contrôle d'accès, livraison de message, mode hors ligne.
- Ne pas déployer par `git reset --hard` sur le PC MAVIK 0.40.104, qui comporte des changements locaux et des données non suivies ; portage après sauvegarde/validation.
