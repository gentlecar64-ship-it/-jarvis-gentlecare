# Dossier de transmission MAVIK / GentleCarE

**Document de référence du projet**  
Version documentaire : 1.1
Date de référence : 20 juillet 2026  
Branche de référence : `main` · version produit `0.33.0`
Dépôt : `gentlecar64-ship-it/-jarvis-gentlecare`

## 1. Objet et règle d’autorité

Ce dossier permet à une nouvelle conversation, un développeur ou un futur responsable technique de reprendre MAVIK sans repartir de zéro. Il consolide les décisions métier, l’architecture réellement présente dans le dépôt, les règles de développement et la trajectoire de livraison.

En cas de divergence, l’ordre d’autorité est le suivant : décision récente datée et validée ; ADR ou politique produit ; présent dossier ; spécifications détaillées ; code et tests de la branche de référence. Une contradiction doit être signalée et arbitrée, jamais masquée par une supposition.

## 2. Résumé exécutif

MAVIK est le système d’exploitation métier de GentleCarE. Le nom du logiciel et de la future offre est MAVIK ; Jarvis est le nom choisi par David pour son interface et sa voix. La V1 doit permettre l’exploitation complète de l’atelier, depuis la demande client jusqu’au suivi après restitution, sans tableau parallèle.

La priorité absolue est une V1 stable, testable et réversible. La vision IA, l’assistant vocal complet, l’application mobile native, la simulation avancée, l’apprentissage automatique et la maintenance prédictive sont exclus de la V1 initiale.

Le dépôt contient deux générations techniques. `src/core/` porte un noyau historique déjà doté d’un audit, de notifications, de tâches, de stockage et d’un registre de modules. `core/` porte la nouvelle orchestration métier : Rule Engine, Workflow Engine, Graph Workflow Engine, Event Bus, Intervention Engine, Resource Manager et Decision Engine. La façade `WorkshopOrchestrator` relie désormais cette orchestration à l’interface Atelier publique ; le serveur relie les mêmes règles à la persistance partagée et à Airtable.

État au 20 juillet 2026 : la façade `WorkshopOrchestrator` est intégrée à l’Atelier public. Chaque intervention possède une procédure versionnée, des étapes et preuves, puis une tâche de rapport avant restitution. Le serveur reprend la même chaîne et conserve les rapports versionnés. Un propriétaire MAVIK unique pilote les horaires de mise à jour automatique ; l’installation attend un atelier inactif et crée une sauvegarde préalable.

## 3. Identité et vocabulaire

- GentleCarE : société exploitante et premier terrain de validation.
- MAVIK : produit logiciel et système d’exploitation métier.
- GCOS : désignation historique « GentleCarE Operating System », encore présente dans le code.
- Jarvis : personnalité, interface et voix choisies par David dans MAVIK.
- Bénédicte : utilisatrice Direction / Commercial.
- Intervention : agrégat métier reliant client, véhicule, tâches, documents, consommations, contrôles et restitution.
- Tâche : unité de travail atomique du graphe, avec dépendances, ressources, compétences, durée, statut et historique.
- Ressource : machine, compresseur, zone, opérateur ou consommable nécessaire.

Règle de migration terminologique : ne pas effectuer un renommage global risqué. Les nouveaux textes produit utilisent MAVIK. Les identifiants techniques historiques `gcos` et `jarvis` restent compatibles jusqu’à une migration versionnée et testée.

## 4. Finalité métier de la V1

La V1 est prête lorsque David peut réaliser un cycle complet sans revenir à un suivi parallèle : créer ou retrouver un client ; créer ou retrouver un véhicule ; ouvrir une intervention ; planifier ; affecter les ressources ; exécuter les tâches ; tracer les blocages, photos, consommations et contrôles ; produire les documents de sortie ; clôturer ; retrouver l’historique.

La V1 doit être utilisable sur ordinateur et tablette à l’atelier. La compatibilité iPhone est souhaitée pour les actions terrain, mais ne justifie pas une application native avant stabilisation du parcours web.

## 5. Principes non négociables

1. Une donnée métier est saisie une seule fois et réutilisée.
2. Toute action sensible exige une validation humaine explicite.
3. Toute refonte majeure est précédée d’une branche de sauvegarde.
4. Les historiques importants sont non destructifs.
5. Aucune clé secrète n’est inscrite dans le dépôt.
6. Toute décision structurante est datée dans un ADR, le changelog ou ce dossier.
7. La V1 reste prioritaire sur toute idée V2.
8. Toute nouvelle fonction doit avoir un critère d’acceptation vérifiable.
9. Une migration de données doit prévoir contrôle, sauvegarde et retour arrière.
10. MAVIK ne doit jamais inventer un prix, un stock, une disponibilité ou une donnée client.

## 6. Workflow GentleCarE de référence

Chaîne commerciale et opérationnelle : Demande → Inspection → Devis → Validation → Planification → Prise en charge → Cryonettoyage → Contrôle qualité intermédiaire → DINITROL → Séchage → Contrôle final → Restitution → Facturation → Suivi client.

Le graphe autorise des tâches parallèles lorsque leurs dépendances sont satisfaites. Par exemple, la préparation documentaire et certaines vérifications de ressources peuvent progresser sans attendre une autre branche. La validation finale, elle, dépend obligatoirement des contrôles et preuves nécessaires.

### 6.1 Statuts de tâche du graphe

- `WAITING` : dépendance non terminée.
- `READY` : dépendances satisfaites et aucune règle bloquante.
- `RUNNING` : tâche démarrée par un opérateur identifié.
- `BLOCKED` : règle ou blocage manuel empêchant l’exécution.
- `DONE` : tâche terminée et historisée.
- `CANCELLED` : tâche annulée selon une règle à formaliser.

### 6.2 Contrôles métier obligatoires

- Devis validé avant engagement atelier.
- Ressources disponibles avant confirmation du créneau.
- Photos et contrôle d’entrée avant intervention.
- Traçabilité de la glace et des produits DINITROL.
- Contrôle qualité et validation Direction avant restitution.
- Rapport final, facturation et archivage avant clôture complète.

## 7. Architecture logique validée

La cible est une architecture modulaire pilotée par événements et graphe de tâches.

- Graph Workflow Engine : calcule les tâches prêtes et les dépendances.
- Rule Engine : applique les règles métier et produit actions ou blocages.
- Event Bus : diffuse et conserve les événements récents.
- Intervention Engine : agrège workflow, diagnostic, photos, documents, consommations, réservations, contrôles et livraison.
- Resource Manager : représente disponibilité, quantité et statut des ressources.
- Decision Engine : classe les prochaines tâches selon priorité, délai, ressources, compétences et durée.
- Planner Engine : futur calcul des créneaux et réservations.
- Dashboard State : future projection de l’état opérationnel.
- Notification Engine : existe dans `src/core/`, à raccorder ou consolider.
- Audit Engine : existe dans `src/core/`, à raccorder au nouveau bus.
- KPI Engine : à développer.
- Timeline : à développer comme projection de l’historique d’intervention.

## 8. Architecture physique actuelle

### 8.1 Répertoire `core/`

Nouvelle orchestration métier, modules ES :

- `core/workflow/graph-workflow-engine.js`
- `core/workflow/workflow-engine.js`
- `core/rules/rule-engine.js`
- `core/rules/gentlecare-rules.js`
- `core/events/event-bus.js`
- `core/interventions/intervention-engine.js`
- `core/resources/resource-manager.js`
- `core/decision/decision-engine.js`

### 8.2 Répertoire `src/core/`

Noyau historique modulaire : bus, registre, stockage, audit, tâches, notifications et workflow. `createGCOSCore()` expose une façade en version interne 0.4.0 et initialise le module atelier ainsi que les moteurs de mémoire et d’intelligence Jarvis.

### 8.3 Répertoire `server/`

Serveur Node CommonJS, stockage local, authentification, procédures atelier, planification, devis, Airtable, calendrier, sauvegardes, réputation et plusieurs services métier. Les tests de fumée sont placés dans `server/tests/`.

### 8.4 Interfaces

Le dépôt contient des pages historiques à la racine, des pages servies dans `server/public/` et une Alpha atelier dans `alpha/workshop/`. La branche courante doit faire évoluer l’Alpha vers le graphe sans supprimer l’ancien système avant validation.

## 9. État réel des modules

### 9.1 Implémentés dans la nouvelle orchestration

Le Graph Workflow Engine valide l’unicité des tâches, les dépendances inconnues, l’auto-dépendance et les cycles. Il crée les interventions, recalcule les statuts, démarre, bloque et termine les tâches, calcule la durée réelle, enregistre notes et photos et publie des événements.

Le Rule Engine gère priorité, activation, filtrage par événement, conditions `all`, `any`, `not`, comparateurs, présence, actions de mutation, incrément, ajout, notification, blocage et déblocage logique.

Les règles GentleCarE codées couvrent les alertes de stock, l’indisponibilité machine et compresseur, l’insuffisance de glace, l’humidité DINITROL, l’extension du séchage et l’état d’attente de Jarvis.

L’Event Bus gère abonnements directs et joker, désabonnement, normalisation des événements et historique borné.

L’Intervention Engine enrichit le workflow avec diagnostic, documents, photos, consommations, réservations, factures, contrôles qualité et livraison.

Le Resource Manager suit ressources consommables et non consommables, disponibilité, réservation, consommation et changement de statut.

Le Decision Engine classe les tâches disponibles. Son score prend en compte priorité, échéance, ressources, compétences, temps disponible et durée estimée.

### 9.2 Présents mais à intégrer

- Audit Engine historique dans `src/core/audit-engine.js`.
- Notification Engine historique dans `src/core/notification-engine.js`.
- Storage Adapter et Module Registry historiques.
- Services serveur de planning, devis, calendrier, réputation et rapports.
- Connecteur Airtable en poussée locale vers Airtable.
- Sauvegardes locales automatiques JSON.

### 9.3 À développer ou finaliser pour la V1

- Planner Engine unifié.
- Projection centrale Dashboard State.
- KPI Engine.
- Timeline d’intervention.
- Façade unique reliant `core/`, persistance et interface.
- Interface atelier connectée au graphe.
- Sélection et contrôle de l’opérateur actif.
- Synchronisation Airtable robuste avec stratégie de conflits.
- Gestion documentaire et génération des rapports de sortie.
- Tests unitaires dédiés aux nouveaux moteurs et tests d’intégration du cycle complet.

## 10. Dette technique et risques de continuité

Le risque principal est la coexistence de plusieurs implémentations portant des noms proches. Il ne faut pas supprimer arbitrairement `src/core/` ni `core/`. Une ADR doit choisir : consolidation progressive autour de `core/`, adaptation des anciens moteurs, ou façade transitoire.

Les événements utilisent actuellement deux conventions, avec points (`task.started`) et deux-points (`core:started`). Une convention canonique doit être adoptée avant le Dashboard State.

Le stockage mélange navigateur, JSON serveur et Airtable. La source de vérité doit être définie par type de donnée et par phase de fonctionnement hors ligne.

Les interfaces sont nombreuses. Il faut désigner une interface atelier canonique et placer les autres en compatibilité ou archive, sans suppression prématurée.

La branche analysée contient des fonctionnalités au-delà du noyau atelier. Elles ne doivent pas distraire de l’acceptation V1.

## 11. Décisions validées

### D-001 — MAVIK et Jarvis

MAVIK est le nom du logiciel. Jarvis est le nom de l’interface et de la voix choisies par David. Statut : validé.

### D-002 — V1 avant V2

La V1 atelier doit être complète, testée et stabilisée avant l’ouverture des chantiers IA avancés. Statut : validé et non négociable.

### D-003 — Remplacement du moteur linéaire

Le remplacement du système `step` par un graphe est autorisé. L’ancien fonctionnement reste conservé dans les branches de sauvegarde jusqu’à validation. Statut : autorisé, migration en cours.

### D-004 — Affectation dynamique

Les tâches ne sont pas figées dans une chaîne linéaire ; le moteur calcule les tâches prêtes et propose la meilleure prochaine action. Statut : validé.

### D-005 — Airtable

Airtable est la base opérationnelle centrale visée. La synchronisation actuelle est partielle et ne constitue pas encore une garantie de source de vérité. Statut : cible validée, réalisation incomplète.

### D-006 — Validation humaine

Envoi, paiement, suppression, modification juridique et autres actions sensibles nécessitent une validation explicite. Statut : validé.

### D-007 — Sauvegardes

Une branche de sauvegarde est obligatoire avant chaque refonte majeure. Les données doivent être sauvegardées avant migration. Statut : validé.

### D-008 — Distribution DINITROL

Ne jamais présenter GentleCarE comme distributeur officiel avant signature de l’accord. Statut : règle métier permanente jusqu’à nouvelle décision.

## 12. Autorisations de développement

Sont autorisés dans le périmètre actuel : poursuivre l’architecture validée ; créer les moteurs V1 manquants ; connecter l’interface atelier au graphe ; ajouter tests, documentation et migrations réversibles ; refactoriser par étapes derrière une façade ; enrichir les règles GentleCarE ; préparer les modèles Airtable et documentaires.

Ne sont pas autorisés sans nouvelle validation : supprimer définitivement les anciens moteurs ; fusionner une refonte non testée dans la branche de release ; démarrer des fonctionnalités V2 au détriment de la V1 ; envoyer des communications externes ; engager des dépenses ; stocker des secrets ; modifier les règles métier structurantes sans trace.

## 13. Conventions de nommage

### 13.1 Code

- Classes : `PascalCase`, par exemple `GraphWorkflowEngine`.
- Fonctions et variables : `camelCase`.
- Constantes globales : `UPPER_SNAKE_CASE`.
- Fichiers JavaScript : `kebab-case.js`.
- Identifiants métier : chaîne stable, jamais dérivée d’un libellé modifiable.
- Dates : ISO 8601 UTC dans la persistance et les événements.
- Quantités : suffixe explicite d’unité (`dryIceKg`, `dinitrolLiters`, `estimatedDurationMinutes`).

### 13.2 Événements

Convention cible proposée : `domaine.entite.action`, en minuscules, par exemple `workshop.task.started`, `stock.resource.consumed`, `document.report.generated`. La transition depuis les événements à deux-points doit être documentée et compatible.

### 13.3 Branches

- `main` : branche stable publiée.
- `release/<version-ou-scope>` : stabilisation d’une livraison.
- `feature/<sujet>` : développement isolé.
- `hotfix/<sujet>` : correctif urgent limité.
- `backup/YYYY-MM-DD-<motif>` : point de restauration avant refonte.
- `chore/<sujet>` : maintenance sans nouvelle fonction métier.

### 13.4 Commits

Format recommandé : `type(scope): résumé impératif`. Types : `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`. Un commit doit rester cohérent et réversible.

## 14. Règles de développement

1. Lire `MEMORY.md`, `knowledge/INDEX.md`, ce dossier et les ADR applicables.
2. Vérifier la branche courante et l’état du dépôt.
3. Créer un point de restauration avant une refonte.
4. Écrire ou actualiser le critère d’acceptation.
5. Modifier le plus petit périmètre cohérent.
6. Ajouter les tests proportionnés au risque.
7. Exécuter les tests existants pertinents.
8. Tester le parcours utilisateur, pas seulement les fonctions isolées.
9. Mettre à jour documentation et changelog.
10. Ne fusionner qu’après validation fonctionnelle.

## 15. Standard de qualité du code

Le code doit privilégier des modules à responsabilité unique, des dépendances injectées, des erreurs explicites, des objets sérialisables et des effets de bord centralisés. Les moteurs doivent accepter une horloge injectée pour rendre les tests déterministes.

Chaque module critique doit couvrir : scénario nominal ; donnée manquante ; état interdit ; dépendance inconnue ; indisponibilité de ressource ; répétition de commande ; persistance et reprise ; compatibilité de migration.

Le code métier ne doit pas dépendre directement du DOM. Les interfaces appellent une façade applicative. Les secrets restent dans l’environnement serveur. Les appels externes ont délai d’expiration, remontée d’erreur et état de santé visible.

## 16. Stratégie de tests

### 16.1 Tests unitaires prioritaires

- Validation d’un graphe valide, dépendance absente et cycle.
- Transition de chaque statut de tâche.
- Règles de stock, machine, compresseur et humidité.
- Réservation et consommation de ressource.
- Classement des décisions et stabilité du score.
- Idempotence des événements et commandes à définir.

### 16.2 Tests d’intégration

- Création client + véhicule + intervention.
- Exécution du workflow complet.
- Blocage par glace insuffisante puis reprise après réapprovisionnement.
- Conflit de ressource entre deux interventions.
- Conservation après redémarrage.
- Poussée Airtable et gestion d’échec.
- Génération du rapport final.

### 16.3 Validation terrain

Le premier essai réel doit être précédé d’un véhicule fictif. David doit pouvoir identifier la prochaine action, démarrer et terminer une tâche, joindre une preuve, comprendre un blocage et retrouver l’historique sans assistance technique.

## 17. Spécification Airtable

Le connecteur actuel supporte : clients, véhicules, interventions, tâches, stocks, devis et documents. Le jeton est fourni par `AIRTABLE_TOKEN` et l’identifiant de base par `AIRTABLE_BASE_ID`.

### 17.1 Tables et champs actuels

- Clients : Nom complet, Email, Téléphone, Notes client, Statut client, Origine du contact, Type de client.
- Véhicules : Véhicule, Marque, Modèle, Année, Kilométrage, Immatriculation, VIN, Historique / état, lien Client.
- Interventions : Intervention, Date prévue, Statut, Technicien, Compte rendu, Glace réelle utilisée kg, Dinitrol utilisé L, liens Client, Véhicule et Dossier / devis.
- Tâches Jarvis : Tâche, Statut, Priorité, Responsable, Échéance, Instructions, Résultat / suivi.
- Stocks et consommables : Article, Catégorie, Référence, Quantité en stock, Unité, Seuil d’alerte, Prix unitaire HT, Emplacement, Notes.
- Dossiers et devis : Dossier, Statut, Montant TTC, Date de demande, Date du devis, Prochaine action, Échéance de suivi, Notes, liens Client et Véhicule.
- Centre documentaire : Document, Catégorie, Sous-catégorie, Résumé Jarvis, Date d’ajout.

### 17.2 Extensions V1 recommandées

Ajouter des tables ou objets pour InterventionTasks, Resources, Reservations, StockMovements, QualityChecks, Photos, DocumentVersions, AuditLog et SyncQueue. Chaque ligne synchronisée possède un identifiant local stable, un identifiant Airtable, `createdAt`, `updatedAt`, `syncedAt`, une version et l’auteur de la dernière modification.

### 17.3 Règle de synchronisation

La V1 doit documenter qui gagne en cas de conflit. Recommandation : commandes écrites localement dans une file persistante, accusé de réception Airtable, comparaison par version et horodatage, conflit visible soumis à arbitrage pour les données sensibles. Ne jamais écraser silencieusement un devis validé, un contrôle qualité ou un historique.

## 18. Modèle de données cible

Entités principales : Company, Site, User, Role, Permission, Client, Vehicle, Quote, Appointment, Intervention, WorkflowTemplate, InterventionTask, Resource, Reservation, Consumption, Photo, QualityCheck, Document, DocumentVersion, Invoice, Payment, Task, Notification, AuditLog, ConnectorHealth et SyncOperation.

Toutes les entités ont un identifiant stable, un numéro de version, des dates de création et modification, et l’auteur lorsque pertinent. Les documents et médias sont référencés par identifiant et métadonnées ; les pièces volumineuses ne sont pas dupliquées dans chaque module.

## 19. Interfaces prévues

### Direction

Vue synthétique des véhicules, blocages, validations, devis, facturation, trésorerie opérationnelle et alertes. Toute alerte ouvre directement le dossier concerné.

### Atelier

Écran tactile lisible : opérateur actif, véhicule, tâche recommandée, tâches prêtes, en cours et bloquées, bouton démarrer/terminer, notes, photos, consommations et contrôle. Aucun état ambigu.

### Planning

Vue semaine lundi-vendredi, 08:30–12:00 et 13:30–17:00. Ressources, immobilisation, séchage et livraison visibles. Les conflits empêchent la confirmation.

### CRM et véhicule

Fiche 360°, historique, offres, devis, interventions, documents et consentements. Recherche avant création pour limiter les doublons.

### Stocks et maintenance

Niveaux, seuils, mouvements, lots, emplacements, échéances, indisponibilités et coûts.

### Jarvis

Synthèse et recommandations fondées sur les données réelles. Jarvis prépare et explique ; il ne valide pas à la place de la Direction.

## 20. API interne et API futures

La V1 doit exposer une façade applicative indépendante de l’interface : clients, véhicules, interventions, tâches, ressources, planning, documents, notifications et audit.

Exemples de commandes internes : `createIntervention`, `startTask`, `completeTask`, `blockTask`, `reserveResource`, `recordConsumption`, `runQualityCheck`, `generateReport`, `closeIntervention`.

Exemples de requêtes : `getIntervention`, `listReadyTasks`, `getNextDecision`, `getWorkshopDashboard`, `listResourceConflicts`, `getTimeline`, `getConnectorHealth`.

Connecteurs futurs, dans l’ordre : Airtable, calendriers GentleCarE, Gmail pour brouillons validés, stockage documentaire, outils comptables et paiements. Toute API externe passe par le serveur, jamais directement avec une clé secrète depuis le navigateur.

## 21. Planning Engine — spécification de reprise

Le Planner Engine reçoit interventions, tâches prêtes, durées, fenêtres horaires, opérateurs, compétences, ressources, réservations, séchage, livraison et priorité. Il retourne des propositions explicables, jamais une confirmation irréversible.

Contraintes dures : horaires, chevauchement de ressource exclusive, indisponibilité opérateur, dépendances, durée minimale, stock critique. Contraintes souples : priorité, délai, réduction des temps morts, regroupement logistique et préférence client.

La première version peut être déterministe et gloutonne. Elle doit privilégier l’explicabilité et les tests avant une optimisation avancée.

## 22. Dashboard State — spécification de reprise

Le Dashboard State est une projection reconstruisible à partir des entités et événements. Il présente : véhicules attendus, présents, en cours, bloqués, terminés et à restituer ; tâches du jour ; validations ; alertes stock et maintenance ; retards ; prochaines décisions MAVIK ; état des connecteurs.

Il ne doit pas devenir une seconde base de vérité. Toute tuile contient l’identifiant du dossier source et l’horodatage de calcul.

## 23. KPI Engine — périmètre V1

Indicateurs initiaux : interventions par statut ; respect des délais ; durée prévue/réelle ; taux de blocage ; temps par étape ; consommation de glace par véhicule ; consommation DINITROL ; utilisation des ressources ; devis en attente ; dossiers à facturer ; complétude documentaire.

Les marges et chiffres financiers ne sont affichés que si les données sources sont complètes. Un KPI doit exposer sa formule, sa période et la date de dernière actualisation.

## 24. Notification Engine — règles

Niveaux : information, attention, critique. Une notification possède destinataire, dossier lié, action suggérée, date, état lu/non lu et origine. Les doublons répétitifs doivent être regroupés. Une notification critique n’est jamais considérée résolue par simple lecture ; la condition métier doit disparaître ou être arbitrée.

## 25. Timeline et Audit

La timeline est la lecture métier de l’intervention : création, décisions, tâches, photos, consommations, validations, documents et restitution. L’audit est la trace technique et réglementaire : acteur, action, entité, ancienne/nouvelle valeur lorsque nécessaire, gravité et horodatage.

La timeline peut être lisible par le client dans une version filtrée. L’audit complet reste réservé aux rôles autorisés.

## 26. Gestion documentaire

Documents V1 : devis, bon de prise en charge, rapport d’intervention, certificat ou étiquette de contrôle, facture, photos et pièces jointes. Chaque modèle est versionné. Un document généré conserve le modèle, les données sources, l’auteur, la date et son statut brouillon/validé/envoyé.

Les devis PDF peuvent être conservés. Airtable conserve les informations structurées et références ; il ne reçoit pas automatiquement tous les e-mails ou toutes les factures sans règle explicite.

## 27. Sauvegarde et restauration

### 27.1 Code

Avant refonte : branche `backup/YYYY-MM-DD-motif`, vérification du SHA et note dans `docs/backups/`. Le retour arrière se fait depuis un commit ou une branche identifiée, jamais par suppression improvisée.

### 27.2 Données

Le serveur crée actuellement des copies de `server/data/gcos-local.json` dans `server/backups/`, avec une rétention par défaut de 30 sauvegardes et un intervalle configurable, minimum 15 minutes.

Pour la production V1, ajouter : sauvegarde chiffrée hors machine ; contrôle d’intégrité ; journal des sauvegardes ; exercice de restauration ; export Airtable ; politique de rétention quotidienne, hebdomadaire et mensuelle.

### 27.3 Procédure de restauration

1. Geler les écritures.
2. Identifier l’incident et le point sain.
3. Copier les données endommagées pour analyse.
4. Restaurer dans un environnement isolé.
5. Exécuter contrôles de structure et scénarios critiques.
6. Faire valider par la Direction.
7. Remettre en service.
8. Documenter l’incident et les données potentiellement perdues.

## 28. Sécurité et permissions

Rôles initiaux : Direction, Direction / Commercial, Opérations, Technicien. Principe du moindre privilège. Les suppressions, exports massifs, finances, configuration, connecteurs et validations finales sont limités selon rôle.

Production : HTTPS, secrets côté serveur, sessions sécurisées, 2FA Direction si disponible, journalisation des actions critiques, sauvegardes chiffrées, politique de conservation, droit d’accès et suppression des données personnelles.

## 29. Structure GitHub au 20 juillet 2026

Branche par défaut : `main`. Branche analysée : `feature/graph-workflow-ui`. Branches de restauration : `backup/2026-07-20-workflow-v1` et `backup/2026-07-20-alpha-ui`. Branche de release : `release/1.0-workshop`.

Le dépôt contient également des branches de fonctionnalités historiques. Elles doivent être inventoriées avant nettoyage ; une branche non fusionnée ne doit pas être supprimée sans vérification de son contenu utile.

Derniers jalons de la branche analysée : règles atelier exécutables ; moteur collaboratif ; graphe ; bus ; agrégat d’intervention ; ressources ; décision ; politique de versions ; roadmap V1 ; modèle de retour terrain.

## 30. Roadmap V1 → V1.1 → V2 → V3

### V1 — Exploitation atelier

Consolider la façade d’orchestration ; connecter l’interface au graphe ; compléter Planner, Dashboard, KPI et Timeline ; fiabiliser Airtable ; produire documents ; tester sauvegarde/restauration ; réaliser scénario fictif puis essai réel ; corriger ; geler `1.0.0`.

### V1.1 — Retour terrain

Ergonomie, raccourcis, vues personnalisées, meilleure gestion hors ligne, automatisations sûres, performance, rapports enrichis, simplification des parcours et correction des irritants mesurés.

### V2 — Intelligence avancée

Vision IA, assistant vocal complet, application mobile, simulation atelier, apprentissage, maintenance prédictive, optimisation avancée et capacités multi-sites préparatoires.

### V3 — Plateforme Avenor

Industrialisation multi-entreprises : isolation des tenants, catalogue de modules, personnalisation du nom et de la voix, administration commerciale, déploiements gérés, observabilité, contrats de service, marketplace de connecteurs et gouvernance des modèles IA. Cette vision reste prospective et ne doit pas infléchir la V1 GentleCarE avant validation.

## 31. Séquence de développement recommandée

1. ADR de consolidation `core/` / `src/core/` et convention d’événements.
2. Tests unitaires des sept moteurs validés.
3. Façade `WorkshopOrchestrator` ou équivalent.
4. Persistance sérialisable des interventions et ressources.
5. Connexion de l’Alpha atelier au graphe.
6. Dashboard State et Timeline par projection.
7. Planner Engine minimal explicable.
8. Synchronisation Airtable avec file et conflits.
9. Documents et rapports.
10. Scénarios d’acceptation, restauration et essai terrain.

## 32. Définition de terminé

Une fonctionnalité est terminée si le besoin et le rôle sont identifiés, le comportement nominal et les erreurs sont codés, les permissions sont appliquées, les événements et l’audit sont produits, la persistance est testée, l’interface est utilisable, les tests passent, la documentation est mise à jour et le critère d’acceptation est validé.

## 33. Checklist de reprise immédiate

### Lecture

- [ ] Lire `MEMORY.md`.
- [ ] Lire `knowledge/INDEX.md` et les ADR pertinents.
- [ ] Lire ce dossier.
- [ ] Lire `docs/product/V1-ROADMAP.md` et la politique de versions.
- [ ] Lire le point de restauration de la refonte workflow.

### Vérification du dépôt

- [ ] Confirmer le dépôt `gentlecar64-ship-it/-jarvis-gentlecare`.
- [ ] Confirmer la branche `feature/graph-workflow-ui` ou sa successeure.
- [ ] Examiner les derniers commits et l’état non commité.
- [ ] Vérifier que les deux branches de sauvegarde existent.
- [ ] Ne pas repartir de `main` sans comparer les écarts.

### Vérification technique

- [ ] Exécuter les tests de fumée existants.
- [ ] Identifier l’interface atelier canonique.
- [ ] Vérifier les imports et le mode ES/CommonJS.
- [ ] Cartographier la persistance utilisée par le parcours choisi.
- [ ] Vérifier l’état Airtable sans exposer le jeton.

### Action suivante par défaut

- [ ] Rédiger l’ADR de consolidation des noyaux.
- [ ] Ajouter les tests des moteurs `core/`.
- [ ] Créer la façade d’orchestration.
- [ ] Connecter une première tâche réelle de l’Alpha au graphe.
- [ ] Tester démarrage, blocage, reprise et fin.

## 34. Prompt de transmission à une nouvelle conversation

> Travaille sur le dépôt GitHub `gentlecar64-ship-it/-jarvis-gentlecare`. Lis d’abord `MEMORY.md`, `knowledge/INDEX.md`, `docs/DOSSIER_TRANSMISSION_MAVIK.md`, `docs/product/V1-ROADMAP.md` et `docs/backups/2026-07-20-workflow-refactor.md`. Continue depuis la branche active issue de `feature/graph-workflow-ui`. Ne repars pas de zéro. Préserve les branches de sauvegarde. Distingue ce qui est implémenté, partiel et prévu. Finalise la V1 atelier avant toute V2. Avant de modifier, indique le prochain incrément, son critère d’acceptation et le plan de retour arrière.

## 35. Procédure de mise à jour du présent dossier

Mettre à jour le dossier après toute décision structurante, ajout ou retrait de module, migration, modification Airtable, changement de branche de référence, évolution de roadmap ou retour terrain important.

Chaque mise à jour indique : date ; auteur ou validateur ; sections touchées ; décision ; effet sur le code ; effet sur les données ; migration ; sauvegarde ; test ; prochaine action. Le document suit le versionnement du dépôt et reste lisible sans outil spécialisé.

## 36. Registre des questions ouvertes

1. Quelle façade devient le noyau canonique entre `core/` et `src/core/` ?
2. Quelle interface atelier est la référence après l’Alpha ?
3. Airtable est-il immédiatement maître ou maître après stabilisation locale ?
4. Quelle stratégie exacte de résolution des conflits ?
5. Où sont stockés les médias en production ?
6. Quelle politique d’annulation des tâches du graphe ?
7. Quelle granularité de permissions pour Bénédicte, Séverine et les techniciens ?
8. Quel environnement d’hébergement remplace GitHub Pages pour les fonctions serveur ?
9. Quels critères chiffrés déclenchent le passage V1.1 puis V2 ?

## 37. Conclusion de transmission

MAVIK ne doit pas être recréé. Le socle utile existe. La reprise correcte consiste à consolider les deux générations de noyau, protéger la persistance, connecter l’interface atelier au graphe, compléter les projections et la planification, puis valider un cycle complet sur le terrain. Le premier objectif mesurable reste une intervention GentleCarE complète, traçable et restaurable dans MAVIK V1.
