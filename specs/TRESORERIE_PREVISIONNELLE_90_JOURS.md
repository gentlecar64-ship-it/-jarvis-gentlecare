# GentleCarE — Administratif / Tableau de trésorerie glissante 90 jours
20/11/2026 — module prototype sur branche de développement, **non installé sur le PC 0.40.104**.

## Version codée
- Menu **Gestion → Administratif · Trésorerie**, page protégée `/finance`, réservée aux rôles direction (`admin` et `associate`).
- Solde bancaire de départ (date, montant), encaissements/décaissements avec libellé, échéance, nature, catégorie, certitude et fréquence mensuelle/ponctuelle. Persistés **sur le serveur** dans `server/data/finance-treasury.json`, pas seulement dans le navigateur ; historique des actions de base.
- Courbe sur 90 jours, trois scénarios prudent/central/optimiste, indicateur de trésorerie basse, sortie CSV.
- Les montants représentent des **mouvements bancaires prévus TTC**, non le compte de résultat HT ; les devis non encaissés ne sont pas des rentrées confirmées.
- Aucune donnée client réelle ou banque n'a été importée ; impossible d'afficher solde actuel certifié sans pointage.
- Frontend SVG et endpoints API : `GET /api/finance/forecast`, `GET /api/finance/entries`, `POST /api/finance/entries`, `POST /api/finance/settings`, `DELETE /api/finance/entries/:id`.
- L'API limite l'accès aux rôles direction ; HTTPS et protections additionnelles dépendront de la configuration réelle sur PC.

## Reste à réaliser pour « inclut tout »
1. **Connecteur bancaire/PennyLane** : autorisation explicite, import relevé ou API si disponible, transactions et soldes réels, rapprochement, doublons, multi-comptes, gestion secrets. Ne pas supposer qu'un plugin PennyLane existe ou que les accès sont configurés.
2. **Données commerciales MAVIK** : encaissements acomptes effectivement reçus et datés, factures clients émises/échues, échéances crédibles devis acceptés, distinction des devis en négociation. Tracer la source de chaque entrée.
3. **Fournisseurs et exploitation** : Geladoc (glace, caisses, transport), produits, carburant compresseur, loyers, salaires, URSSAF, assurances, abonnements, crédits, taxes/TVA, investissements, sous-traitance, immobilisations. Pour achats à venir, projeter une date de paiement distincte de la date de prestation.
4. **TVA et décalage fiscal** : mouvements TTC sur banque, décaissement TVA déclaré et échéance ; ne pas additionner HT et TTC, éviter double comptage.
5. **Prévisionnel commercial** : taux de probabilité propre à chaque dossier, dates d'encaissement basées sur acomptes et délais réels, calendrier intervention et disponibilité glace.
6. **Scénarios paramétrables** : retard de paiement 7/15/30 jours, volume d'interventions, coûts glace 40/60/80 kg/h, pertes, renouvellement matériel, financement, charges.
7. **Reconciler cashflows** : éviter doubles comptages entre imports bancaires et saisies/estimations de factures ; marquer payés, reportés, annulés, dates réelles. Ajouter pièces justificatives et audit robuste.
8. **Alertes** : seuil de trésorerie défini, date de passage négatif, besoin de financement court terme, rappels des créances ; consentements et droits.
9. **Tests** : contraintes de droits, dates glissantes 90j, fin de mois, écritures récurrentes et retards, import/export, simultanéité, sauvegarde, reprise et rapprochement de soldes.
10. **Portage de la version locale 0.40.104** sur branche indépendante ; ne jamais forcer `git reset --hard` pour installer le prototype.

### Choix d'intégration UX
Version MVP dans un écran autonome relié au menu Administratif, afin de ne pas modifier les fonctionnalités de devis sur le PC existant. Le tableau doit afficher d'abord **solde actuel, cash à J+30/J+60/J+90, plus bas prévisionnel et alertes**, puis la liste détaillée des mouvements et la courbe. Les références doivent être sourcées.

### Règles de scénario codées
- Prudent : entrées confirmées, toutes les sorties enregistrées.
- Central : entrées et sorties confirmées ou prévues.
- Optimiste : toutes les entrées, uniquement sorties confirmées.
Il s'agit de règles simplifiées ; un véritable scénario optimiste doit tenir compte des sorties probables pour ne pas induire en erreur.
