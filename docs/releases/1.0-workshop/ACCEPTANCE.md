# Critères d’acceptation — MAVIK GCOS 1.0 Atelier

## Parcours principal

La version est acceptable lorsque le scénario suivant fonctionne sans rupture :

1. Une demande client est enregistrée.
2. Le client et son véhicule sont identifiés.
3. Le devis est préparé puis validé par la direction.
4. L’acceptation et l’acompte sont enregistrés.
5. Le dossier atelier est créé automatiquement.
6. Un créneau compatible est proposé dans le planning.
7. Les ressources et opérateurs nécessaires sont affectés.
8. La réception du véhicule est tracée avec kilométrage, état et photos.
9. Les étapes cryogéniques et DINITROL sont exécutées et documentées.
10. Le contrôle final est soumis à David ou Bénédicte.
11. Les brouillons de rapport, facture et message de restitution sont générés.
12. La restitution et la clôture sont historisées.

## Tableau de bord

- [ ] Affiche les véhicules présents, en attente, en cours, terminés et à restituer.
- [ ] Signale les blocages : acompte, stock, ressource, validation ou retard.
- [ ] Présente les tâches du jour et les alertes importantes.
- [ ] Permet d’ouvrir directement le dossier concerné.

## Planning atelier

- [ ] Vue semaine du lundi au vendredi.
- [ ] Horaires 08:30–12:00 et 13:30–17:00.
- [ ] Conflits de capacité détectés.
- [ ] Immobilisation, séchage et livraison visibles.
- [ ] Report et annulation réservés à la direction.

## Planning équipe et ressources

- [ ] Affectations visibles par personne.
- [ ] Livraisons, congés et indisponibilités distingués.
- [ ] Machine cryo, compresseur, zones de travail et véhicule de livraison contrôlés.
- [ ] Une ressource indisponible bloque la confirmation du créneau.

## Fiche intervention

- [ ] Client, véhicule, devis, planning et statut réunis.
- [ ] Étapes, photos, notes, opérateurs et horodatages accessibles.
- [ ] Produits et lots DINITROL enregistrables.
- [ ] Contrôle qualité et validation direction obligatoires.
- [ ] Historique non destructif des modifications.

## MAVIK / Jarvis

- [ ] Peut ouvrir un dossier ou un planning par commande texte.
- [ ] Peut résumer l’état réel d’une intervention.
- [ ] Peut proposer un créneau sans le confirmer à la place de la direction.
- [ ] N’invente ni stock, ni disponibilité, ni prix, ni donnée client.

## Compatibilité et sécurité

- [ ] Utilisable sur ordinateur et iPhone.
- [ ] Sessions et données locales existantes migrées sans perte.
- [ ] Aucun secret ou fichier d’exécution ajouté au dépôt.
- [ ] Tous les tests existants restent réussis.
- [ ] La version affichée correspond réellement à la version chargée.
