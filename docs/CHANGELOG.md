# Changelog MAVIK GCOS

Toutes les évolutions fonctionnelles, architecturales et documentaires significatives sont consignées ici.

## 2026-07-20 — Version 0.31.0 · Atelier V1 testable

### Ajouté
- Façade applicative `WorkshopOrchestrator` reliant le Graph Workflow Engine, l’Intervention Engine, le Resource Manager, le Decision Engine et l’Event Bus.
- Interface Atelier V1 testable sur ordinateur, tablette et téléphone.
- Sélection de l’opérateur actif.
- Affichage des tâches en attente, prêtes, en cours, bloquées et terminées.
- Blocage et déblocage manuel avec motif.
- Contrôle de disponibilité des machines, zones et consommables.
- Consommation automatique de 20 kg de glace pour le cryonettoyage et 1 L de DINITROL pour le traitement.
- Blocage automatique du DINITROL lorsque l’humidité dépasse 80 %.
- Recommandation de prochaine action calculée par le Decision Engine.
- Sauvegarde locale automatique, export JSON et restauration des essais.
- Tests unitaires de persistance, transitions, blocages et restauration.

### Modifié
- Le système linéaire `step` de l’Alpha Atelier est remplacé par le vrai graphe de tâches.
- Le tableau de bord principal donne un accès direct à l’Atelier V1 test.
- La version produit et serveur passe à `0.31.0`.

### Limites connues
- Les données de cette version en ligne restent propres à chaque navigateur.
- Airtable, comptes partagés et documents de production ne sont pas encore connectés à l’Atelier V1.
- Cette version est destinée aux essais fonctionnels, pas encore à une intervention client réelle sans suivi de secours.

## 2026-07-20 — Fondation MAVIK OS

### Ajouté
- Document fondateur `00_MAVIK_OS_FOUNDATION.md`.
- Formalisation des dix lois de MAVIK.
- Définition du modèle relationnel métier et du moteur de contexte.
- Définition des règles de traçabilité, validation humaine, sécurité et confidentialité.
- Consolidation des modules CRM, Atelier, Mission Control, Jarvis, Mémoire, Bibliothèque technique, Gestion documentaire, Jumeau numérique et Réseau GentleCarE.
- Roadmap consolidée de v0.30 à v10.x.

### Décisions
- MAVIK est défini comme le système d’exploitation intelligent du patrimoine automobile.
- Jarvis assiste, explique et contrôle ; la décision finale reste humaine.
- Le pré-diagnostic devient une étape structurante avant devis lorsqu’il est pertinent.
- Une information métier doit avoir une source de vérité unique et être réutilisée sans duplication.
- Toute nouvelle fonctionnalité doit faire gagner du temps, réduire les erreurs ou créer de la valeur, sous réserve des exigences de sécurité et d’intégrité.

### Documentation antérieure intégrée à la vision
- Passeport Patrimoine.
- Pré-diagnostic client et déclarations du propriétaire.
- Dossier Patrimoine.
- Workflow atelier et verrouillage qualité.
- Base de connaissances Jarvis.
- Assistant décisionnel.
- Mission Control et briefing du matin.
- Mémoire de l’entreprise.
- Jumeau numérique du véhicule.
- Réseau intelligent GentleCarE.
- Bêta Atelier et plateforme v1.0.
