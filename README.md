# GCOS — GentleCarE Operating System

MVP opérationnel de MAVIK pour GentleCarE, développé et versionné directement dans GitHub.

## Mémoire partagée — à lire en premier

La mémoire commune de David, Bénédicte, ChatGPT et MAVIK se trouve ici :

- **[`MEMORY.md`](./MEMORY.md)** — synthèse opérationnelle et règles validées ;
- [`knowledge/INDEX.md`](./knowledge/INDEX.md) — index des documents détaillés ;
- [`knowledge/MAVIK_BRAIN.md`](./knowledge/MAVIK_BRAIN.md) — contexte central de MAVIK.

Instruction à donner à ChatGPT depuis tout compte ayant accès au dépôt :

> Lis le fichier `MEMORY.md` du dépôt `gentlecar64-ship-it/-jarvis-gentlecare`, puis consulte `knowledge/INDEX.md` et les documents qu’il référence. Utilise-les comme source de vérité pour cette conversation. Signale toute information absente, contradictoire ou ancienne au lieu de l’inventer.

## Référence produit

La vision, les règles d’architecture et la gouvernance du projet sont définies dans :

- [`docs/00_MAVIK_OS_FOUNDATION.md`](./docs/00_MAVIK_OS_FOUNDATION.md)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md)
- [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)
- [`docs/README.md`](./docs/README.md)

Toute évolution importante doit rester conforme au document fondateur ou faire l’objet d’une décision explicitement tracée.

## Fonctionnalités disponibles

- Tableau de bord Direction
- Tâches prioritaires avec validation
- Devis Audi S5 V8 à valider ou corriger
- Suivi des commandes Intelblast, France Air et Dinitrol
- Mode Atelier pour la Mini blanche 2005
- Checklist, chronomètre, notes et photos depuis un iPhone
- Recherche globale
- Commande vocale MAVIK lorsque le navigateur la prend en charge
- Journal automatique des actions
- Sauvegarde locale dans le navigateur

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie automatiquement l’application à chaque modification de la branche `main`.

Dans GitHub :

1. Ouvrir **Settings**.
2. Ouvrir **Pages**.
3. Dans **Build and deployment**, sélectionner **GitHub Actions**.
4. Ouvrir l’onglet **Actions** et relancer le workflow `Deploy GCOS to GitHub Pages` si nécessaire.

L’adresse générée sera affichée dans le workflow et dans la section **Deployments** du dépôt.

## Test local

Dans GitHub Codespaces :

```bash
python3 -m http.server 4173
```

Puis ouvrir le port `4173` dans le navigateur.

Sur un ordinateur après clonage :

```bash
git clone https://github.com/gentlecar64-ship-it/-jarvis-gentlecare.git
cd -jarvis-gentlecare
python3 -m http.server 4173
```

Ouvrir ensuite `http://localhost:4173`.

## État technique

Cette première version ne transmet aucune donnée sensible à un serveur. Les données sont conservées dans `localStorage` sur l’appareil utilisé.

## Prochains blocs

1. Authentification David / Bénédicte.
2. Connexion Airtable en lecture et écriture.
3. Connexion Gmail avec préparation de brouillons.
4. Stockage centralisé des photos et documents.
5. Validation humaine avant toute action sensible.
6. Installation de GCOS comme application sur iPhone.
