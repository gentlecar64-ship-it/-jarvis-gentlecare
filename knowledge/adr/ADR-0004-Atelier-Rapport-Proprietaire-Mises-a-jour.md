# ADR-0004 — Atelier, rapport, propriétaire et mises à jour

Date : 20 juillet 2026
Statut : accepté

## Contexte

MAVIK possédait séparément un graphe atelier, des procédures par catégorie, un générateur de rapport et un planificateur de mises à jour. Leur séparation empêchait de vérifier qu’un rapport provenait bien d’une procédure exécutée et laissait le calendrier technique dépendre arbitrairement du premier administrateur.

## Décision

1. Chaque intervention conserve un instantané de sa procédure et de sa version.
2. Chaque étape obligatoire conserve statut, note, opérateur, horodatage et preuves.
3. Une étape demandant une preuve doit avoir une photographie ou une note de traçabilité.
4. Le contrôle final de direction est obligatoire avant la génération du rapport serveur.
5. Le rapport intègre la procédure exécutée et reste un brouillon tant que sa complétude n’est pas totale.
6. Le rôle fonctionnel de propriétaire MAVIK est unique, réservé à un administrateur actif et distinct de la propriété des véhicules.
7. Le premier administrateur devient propriétaire initial. Seul le propriétaire courant peut transférer cette responsabilité.
8. Les horaires, jours, fuseau et activation de l’installation automatique proviennent du profil du propriétaire.
9. Le transfert conserve le calendrier existant afin d’éviter un changement technique silencieux.
10. L’installation attend un atelier inactif et crée une sauvegarde locale avant modification.

## Conséquences

- L’Atelier devient le point d’entrée opérationnel du rapport.
- Jarvis peut expliquer le prochain blocage au lieu de seulement ouvrir une page.
- Un administrateur non propriétaire conserve ses droits métier, mais ne peut ni transférer la propriété ni modifier le créneau technique.
- Une nouvelle version du rapport est créée à chaque validation ; aucune version validée n’est modifiée silencieusement.
