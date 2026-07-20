# MAVIK GCOS 1.0 Atelier — Alpha 1

## Accès

Depuis la racine du dépôt, lancer :

```bash
python3 -m http.server 4173
```

Puis ouvrir :

```text
http://localhost:4173/alpha/workshop/
```

La branche à utiliser est `release/1.0-workshop`.

## Fonctions testables

- tableau de bord des véhicules actifs ;
- création d’une intervention ;
- sélection d’un véhicule ;
- parcours des 14 étapes métier ;
- score de priorité déterministe ;
- recommandation de la prochaine action ;
- signalement d’un retard ;
- suivi simplifié des stocks de glace et de DINITROL ;
- disponibilité de la machine cryo, du compresseur et des zones de séchage ;
- alertes de stock et de restitution ;
- journal automatique ;
- conservation locale des données dans le navigateur ;
- affichage adapté au téléphone.

## Scénario d’essai conseillé

1. Ouvrir la Ford Mustang de démonstration.
2. Valider l’étape Cryonettoyage.
3. Avancer jusqu’au Séchage et vérifier la recommandation de MAVIK.
4. Consommer de la glace jusqu’à passer sous 100 kg et vérifier l’alerte.
5. Créer une nouvelle intervention urgente avec une restitution proche.
6. Vérifier que la recommandation et le score de priorité changent.
7. Recharger la page et vérifier que les données sont conservées.

## Limites connues

- moteur de règles local, sans Airtable ni Google Agenda ;
- pas encore de photos, pièces jointes ou rapport PDF ;
- pas encore d’authentification propre à cette page Alpha ;
- les recommandations sont explicables et déterministes, pas issues d’un modèle d’IA ;
- cette Alpha est isolée de l’application principale afin de ne pas perturber les données existantes.

## Critère de validation

L’Alpha 1 est validée lorsque David peut créer plusieurs interventions, les faire avancer dans le workflow et comprendre immédiatement, depuis un téléphone ou un ordinateur, quelle action MAVIK recommande et pourquoi.
