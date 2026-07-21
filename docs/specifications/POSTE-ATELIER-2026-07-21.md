# Spécifications — Poste Atelier MAVIK

**Version : 21/07/2026**  
**Instance : GentleCarE**  
**Statut : validé pour implantation**

## 1. Rôle du poste

Le PC Atelier est un **poste opérateur client**. Il n’est pas le serveur MAVIK.

Au démarrage de Windows :

1. Windows ouvre automatiquement le compte local `Atelier`, sans mot de passe ;
2. Microsoft Edge démarre en mode kiosque plein écran ;
3. MAVIK ouvre l’interface Poste Atelier ;
4. le poste utilise automatiquement le profil applicatif `Atelier`, sans code ;
5. le son de démarrage Jarvis est joué ;
6. Jarvis annonce le programme de la journée ;
7. l’interface affiche le planning, la caméra et l’intervention en cours.

## 2. Interface obligatoire

- grande horloge et date ;
- caméra Logitech USB HD 1080p en direct ;
- intervention en cours ;
- intervention suivante avec heure prévue ;
- planning journalier horizontal ;
- barre verticale jaune représentant l’heure actuelle, actualisée en temps réel ;
- codes couleur : vert terminé, bleu en cours, blanc à venir, rouge retard.

## 3. Menus autorisés

- Tableau de bord ;
- Intervention ;
- Photos Avant / Pendant / Après ;
- Rapport ;
- Stock en lecture seule ;
- Assistance vocale MAVIK.

## 4. Fonctions interdites

Le profil Atelier ne doit ni afficher ni charger :

- administration ;
- paramètres système ;
- comptabilité ;
- banque ;
- gestion des utilisateurs ;
- développement ;
- GitHub ;
- configuration système.

## 5. Commandes vocales

- « Mavik, démarre l’intervention » ;
- « Mavik, photo avant » ;
- « Mavik, photo pendant » ;
- « Mavik, photo après » ;
- « Mavik, intervention terminée » ;
- « Mavik, prochaine intervention » ;
- « Mavik, ouvre la fiche véhicule » ;
- « Mavik, appelle David ».

Chaque commande est soumise aux droits du profil Atelier et inscrite dans la traçabilité locale puis serveur.

## 6. Architecture cible

Le serveur MAVIK centralisera les données. Le Poste Atelier restera un client connecté. Les iPhone de David, Bénédicte et des futurs employés seront synchronisés pour :

- planning ;
- notifications ;
- rapports ;
- photos ;
- appels internes.

Tant que le serveur central n’est pas connecté, le Poste Atelier utilise un stockage local compatible avec une future synchronisation.

## 7. Notifications

- fin d’intervention ;
- arrivée client ;
- prochaine intervention ;
- livraisons ;
- rappels.

## 8. Matériel

- PC Atelier ;
- caméra Logitech USB HD 1080p ;
- microphone et haut-parleurs ;
- réseau Ethernet ;
- futurs périphériques, dont imprimante d’étiquettes.

## 9. Profils

- **Atelier** : connexion automatique sans code, droits opérateur strictement limités ;
- **David** : administration complète ;
- **Bénédicte** : gestion commerciale et administrative.

## 10. Limites techniques actuelles

Un navigateur ne peut pas accorder silencieusement l’autorisation caméra au premier usage. Une validation initiale de la caméra Logitech est nécessaire sur le PC Atelier. Le plein écran sans interaction est obtenu par le lancement Windows d’Edge en mode kiosque.
