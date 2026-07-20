# ADR-001 — Profils MAVIK et assistantes

## Décision

MAVIK repose sur un moteur unique avec plusieurs profils configurables.

### Profil Production
- Société : GentleCarE
- Produit : MAVIK / Jarvis
- Assistant IA : Jarvis
- Données : production

### Profil Démonstration
- Société : Avenor
- Produit : MAVIK / Betty
- Assistant IA : Betty
- Données : démonstration uniquement

## Principes
- Une seule base de code.
- Aucune donnée GentleCarE dans la démonstration.
- Betty est l'assistante officielle des démonstrations Avenor.
- Les évolutions du moteur bénéficient aux deux profils via leur configuration.
