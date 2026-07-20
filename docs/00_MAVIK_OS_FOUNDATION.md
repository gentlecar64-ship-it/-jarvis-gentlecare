# MAVIK OS — Document fondateur

## 1. Raison d’être

MAVIK est le système d’exploitation intelligent de GentleCarE. Il relie les clients, les véhicules, les interventions, les documents, les communications, les décisions et les connaissances dans un même modèle de données.

Positionnement de référence :

> **MAVIK est le système d’exploitation intelligent du patrimoine automobile.**

Jarvis est l’assistant contextuel de MAVIK. Il assiste les utilisateurs, recherche, compare, explique, prépare et contrôle, sans remplacer la décision humaine.

## 2. Les dix lois de MAVIK

1. Une donnée n’existe qu’une seule fois.
2. Toute donnée possède un propriétaire et une source clairement identifiés.
3. Chaque action importante est traçable.
4. L’intelligence artificielle assiste ; elle ne décide jamais à la place de l’humain.
5. Le contexte de travail est prioritaire sur la navigation par menus.
6. Toute ressaisie inutile doit être supprimée.
7. Chaque document est relié automatiquement aux objets métier concernés.
8. L’entreprise conserve sa mémoire lorsque les personnes, les outils ou l’organisation changent.
9. Chaque intervention enrichit les connaissances du système.
10. Toute fonctionnalité doit faire gagner du temps, réduire les erreurs ou créer de la valeur.

## 3. Principes d’architecture

### 3.1 Source unique de vérité

Chaque information possède un enregistrement de référence. Les écrans, rapports, statistiques et automatismes réutilisent cette donnée sans la dupliquer.

### 3.2 Modèle relationnel métier

Les objets principaux sont :

- personne et organisation ;
- client, prospect, fournisseur, partenaire et collaborateur ;
- véhicule ;
- pré-diagnostic ;
- devis ;
- rendez-vous ;
- intervention ;
- observation technique ;
- média et document ;
- produit et consommation ;
- contrôle qualité ;
- rapport et Passeport Patrimoine ;
- tâche, notification, décision et événement ;
- connaissance technique.

### 3.3 Moteur de contexte

Chaque écran définit un contexte actif : client, véhicule, intervention, fournisseur ou projet. Jarvis utilise ce contexte pour comprendre les demandes successives sans imposer à l’utilisateur de répéter les mêmes informations.

### 3.4 Traçabilité native

Les changements d’état, validations, corrections, signatures et actions sensibles enregistrent au minimum :

- la date et l’heure ;
- l’utilisateur ou le service ;
- l’action ;
- l’objet concerné ;
- la valeur précédente et la nouvelle valeur lorsque cela est pertinent.

### 3.5 Validation humaine

Les actions sensibles restent soumises à une validation explicite : envoi externe, engagement financier, clôture d’intervention, publication, suppression, partage de données ou modification irréversible.

## 4. Modules fonctionnels

### 4.1 CRM

Clients, prospects, entreprises, fournisseurs, partenaires, clubs, prescripteurs et historique relationnel.

### 4.2 Atelier

Pré-diagnostic, devis, planning, réception, préparation, cryonettoyage, inspection, traitement Dinitrol, contrôle qualité, rapport, livraison et archivage.

### 4.3 Dossier et Passeport Patrimoine

Identité du véhicule, déclarations du propriétaire, constats GentleCarE, anomalies, photos, traitements, contrôles, chronologie et documents de preuve.

### 4.4 Mission Control

Vue quotidienne des priorités, rendez-vous, véhicules présents, devis, relances, stocks, documents, alertes et indicateurs opérationnels.

### 4.5 Jarvis

Assistant contextuel, recherche universelle, contrôle de cohérence, préparation documentaire, briefing, suggestions explicables et orchestration des tâches.

### 4.6 Mémoire de l’entreprise

Journal des décisions, événements, procédures, réunions, incidents, achats, recrutements, partenariats et évolutions du produit.

### 4.7 Bibliothèque technique

Observations réutilisables, zones sensibles, cas similaires, protocoles, produits, temps moyens, niveaux de difficulté et retours d’expérience validés.

### 4.8 Gestion documentaire

Indexation, classement, versioning, rattachement, recherche et conservation des PDF, photos, devis, factures, certificats, contrats, notices et rapports.

### 4.9 Jumeau numérique du véhicule

Représentation évolutive de l’identité, des zones, des observations, des interventions, des médias et de l’état documenté du véhicule dans le temps.

### 4.10 Réseau GentleCarE

À terme : partage technique anonymisé, gouvernance multi-ateliers, indicateurs réseau, assistance entre ateliers et base de connaissances collective.

## 5. Parcours atelier de référence

`Pré-diagnostic → Devis → Planifiée → Réceptionnée → Préparation → Cryonettoyage → Inspection → Dinitrol → Contrôle qualité → Rapport → Livrée → Archivée`

Chaque transition est historisée. La clôture est bloquée lorsqu’un élément obligatoire manque. Jarvis explique précisément les données ou validations restantes.

## 6. Règles du pré-diagnostic

Le pré-diagnostic est obligatoire avant l’établissement du devis lorsqu’il est pertinent pour la prestation. Il peut inclure :

- problèmes connus ;
- historique du véhicule ;
- usage ;
- conditions de stockage ;
- priorités du propriétaire ;
- photos ;
- commentaires libres.

Jarvis prépare ensuite la checklist d’inspection, identifie les zones sensibles et compare les déclarations avec les constats du technicien.

## 7. Qualité et responsabilité

Les suggestions de Jarvis doivent être :

- explicables ;
- associées à leur source ;
- accompagnées d’un niveau de confiance ;
- présentées comme des aides à vérifier ;
- révocables par un utilisateur autorisé.

MAVIK ne produit pas de diagnostic réglementaire automatique et ne remplace pas l’expertise du professionnel.

## 8. Sécurité et confidentialité

Principes obligatoires :

- accès selon les rôles ;
- moindre privilège ;
- données privées par défaut ;
- journalisation des actions sensibles ;
- sauvegardes vérifiables ;
- consentements et règles de partage explicites ;
- anonymisation avant tout partage réseau.

## 9. Feuille de route de référence

- **v0.30** — Passeport Patrimoine
- **v0.31** — Pré-diagnostic client
- **v0.32** — Dossier Patrimoine
- **v0.33** — Workflow et traçabilité atelier
- **v0.34** — Base de connaissances Jarvis
- **v0.35** — Assistant décisionnel
- **v0.36** — Mission Control
- **v0.37** — Mémoire de l’entreprise
- **v0.38** — Jumeau numérique du véhicule
- **v0.39** — Réseau intelligent GentleCarE
- **v0.40** — Bêta Atelier exploitable
- **v1.0** — Plateforme d’exploitation GentleCarE
- **v2.x** — Multi-sites et réseau
- **v10.x** — OS d’entreprise extensible

## 10. Gouvernance du développement

Toute évolution suit ce cycle :

1. validation du besoin ;
2. vérification de sa conformité au présent document ;
3. mise à jour de la spécification ;
4. entrée dans le changelog et la roadmap ;
5. conception technique ;
6. implémentation ;
7. tests et critères d’acceptation ;
8. vérification du commit et de la documentation.

En cas de contradiction entre une fonctionnalité et ce document, la décision doit être consignée dans la mémoire du projet avant modification de la règle fondatrice.
