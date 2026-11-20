# Règle GentleCarE — Dépôt préalable des véhicules et acceptation sur devis
Décision : 20 novembre 2026 — à intégrer à toutes les nouvelles propositions de devis, confirmations de réservation, bons de prise en charge et CGV après validation juridique.

## Règle métier impérative
- **Dépose du véhicule au plus tard la veille de la date de début des travaux** ; aucune dépose le jour même du début de l'intervention.
- La dépose doit avoir lieu **sur rendez-vous confirmé, pendant les horaires d'accueil convenus**. Pour un début de travaux le lundi, la dépose est à prévoir le **vendredi précédent** ou un jour ouvré antérieur ; même logique si la veille civile est un jour de fermeture ou férié.
- **Date et créneau de dépôt précis** à indiquer sur chaque devis accepté/confirmation : `dropOffDate`, `dropOffTime`, `workStartDate`. La règle doit être vérifiée dans l'agenda et lors de la validation.
- Aucun lancement de prestation ni mobilisation planifiée de glace sans dépose préalable conforme, sauf décision expresse et documentée de la direction pour réorganiser le planning.
- Une dépose tardive ne vaut pas annulation automatique du devis : prise de contact, nouveau créneau confirmé en fonction des disponibilités ; les conséquences financières éventuelles doivent être prévues dans les CGV validées, non inventées par l'application.

## Mention proposée dans le devis — case obligatoire + signature
**Conditions de dépôt du véhicule**
« Le véhicule doit être déposé chez GentleCarE, sur rendez-vous confirmé, **au plus tard le jour ouvré précédant le début des travaux**, dans le créneau de dépôt communiqué. **Aucune dépose le jour du démarrage de l'intervention n'est acceptée.** Si la date ou l'horaire de dépôt ne peut pas être respecté, le client s'engage à prévenir GentleCarE dès que possible afin de convenir d'une nouvelle organisation. Le démarrage prévu pourra être reporté selon les disponibilités de l'atelier. »

Case non pré-cochée :
☐ « Je reconnais avoir pris connaissance des conditions de dépôt de mon véhicule, notamment de l'obligation de le déposer au plus tard le jour ouvré précédent, et je les accepte. »

La case doit être **cochée avant signature**, puis enregistrer version du texte, date et heure, identité, devis, signature et preuve d'acceptation. Dans le PDF signé afficher visiblement la mention, l'acceptation et les deux dates (dépôt, travaux).
- Décliner cette obligation pour les devis envoyés par e-mail : réponse explicite reprenant l'acceptation de la condition, ou lien de signature validé. Une simple réponse « OK » ne doit pas être interprétée comme acceptation spécifique si la clause n'est pas présentée.

## Contrôles Jarvis / MAVIK à réaliser
1. Champs distincts **date/heure de dépôt** et **date de début des travaux** dans les devis et les réservations.
2. Validation automatique du jour ouvré précédent selon heures d'ouverture et jours fériés/fermetures.
3. Blocage de validation finale du devis si aucune acceptation explicite de la condition n'a été obtenue.
4. Agenda : affichage du rendez-vous de dépôt et du début de prestation distincts, alerte si date de dépôt absente ou impossible.
5. Rappels de dépôt : seulement après canal client autorisé et messagerie réellement connectée ; journaliser envois et erreurs.
6. Lors de report : rééditer les dates et faire confirmer le nouveau rendez-vous ; préserver devis, acompte et traçabilité.
7. Conserver la preuve d'acceptation dans le dossier client et le PDF signé.
8. Règle appliquée aux **nouveaux devis** : ne pas réécrire rétroactivement les accords déjà signés.

## Point de prudence
Faire relire la rédaction définitive et les éventuelles pénalités par le conseil juridique/comptable avant publication comme CGV. Distinguer date de dépôt et date d'exécution, ne pas assimiler automatiquement le retard à une faute permettant de garder un acompte.
