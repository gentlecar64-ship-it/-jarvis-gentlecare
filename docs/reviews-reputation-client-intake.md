# MAVIK — Avis, réputation et complétude client

## Objectifs

1. Obtenir davantage d’avis authentiques sans influencer artificiellement la note.
2. Réduire au maximum l’effort demandé au client.
3. Permettre à chaque utilisateur MAVIK de régler la fréquence et le ton des sollicitations.
4. Ouvrir immédiatement la fiche d’un client nommé ou identifié lors d’un appel et signaler les champs manquants dès le devis.

## Règles de conformité verrouillées

- Ne jamais présélectionner cinq étoiles.
- Ne jamais rédiger ou publier l’avis à la place du client.
- Ne jamais offrir de remise, cadeau ou avantage en échange d’un avis ou d’une meilleure note.
- Ne jamais réserver le lien Google aux seuls clients satisfaits.
- Ne jamais empêcher, décourager ou retarder un avis négatif.
- Ne jamais imposer un texte, des mots-clés ou le nom d’un salarié dans l’avis.
- Le client choisit librement la note, le texte et la plateforme.
- Toute sollicitation doit proposer : « Plus tard » et « Ne plus me demander ».

## Priorité des plateformes

1. Google Business Profile — priorité principale pour la visibilité locale, Maps et Search.
2. Avis interne MAVIK — mesure de satisfaction et amélioration du produit, non présenté comme un avis public.
3. Facebook ou plateforme sectorielle — uniquement selon la stratégie choisie par l’entreprise.

## Parcours client GentleCarE

### Déclencheur recommandé

Après restitution du véhicule et confirmation que le dossier est clôturé :

- J+1 : message de remerciement et lien Google direct.
- J+5 : rappel unique si aucun clic ou retour enregistré.
- J+14 : dernier rappel léger, puis arrêt automatique.

Le même lien et la même possibilité de retour privé sont proposés à tous les clients, sans filtrage selon leur niveau de satisfaction.

### Formulation

Le message ne demande pas une « bonne note ». Il demande un avis honnête et facilite l’accès :

> Merci de nous avoir confié votre véhicule. Votre retour, positif comme critique, nous aide à progresser. Vous pouvez partager votre expérience en quelques secondes sur Google.

Boutons :

- Donner mon avis sur Google
- Envoyer un retour privé à GentleCarE
- Plus tard
- Ne plus me demander

## Parcours utilisateur MAVIK

Les demandes de notation du logiciel sont différentes des avis clients GentleCarE.

### Réglages de profil

- `feedbackPromptsEnabled`
- `feedbackTone`: professionnel, chaleureux, humoristique
- `feedbackFrequency`: modérée, normale, soutenue
- `feedbackSnoozedUntil`
- `feedbackNeverAskAgain`
- `lastFeedbackPromptAt`
- `feedbackPromptCount`
- `softwareRatingSubmittedAt`

### Fréquence maximale recommandée

- premier rappel après 30 jours d’utilisation réelle ;
- deuxième rappel au moins 30 jours plus tard ;
- troisième rappel au moins 30 jours plus tard ;
- ensuite, aucun rappel pendant 90 jours ;
- arrêt immédiat après notation, refus définitif ou désactivation dans le profil.

On ne relance pas tous les quinze jours indéfiniment : ce serait intrusif et dégraderait la relation avec l’utilisateur.

### Variantes de ton

Professionnel :
> Votre expérience avec MAVIK nous aide à améliorer les prochaines versions. Souhaitez-vous laisser une note ou signaler une amélioration ?

Chaleureux :
> Nous travaillons ensemble depuis quelque temps. Un petit retour aiderait l’équipe à rendre MAVIK encore plus utile pour vous.

Humoristique :
> On forme une bonne équipe, {{surnom}}. Je mérite une petite évaluation, ou au moins la liste de mes défauts avant ma prochaine mise à jour ?

Les formulations tournent, mais la demande reste neutre : jamais « mettez cinq étoiles ».

## Appels et identification client

Quand un appel est connecté ou que l’utilisateur prononce le nom, l’e-mail, le téléphone ou l’immatriculation d’un client :

1. rechercher la fiche client ;
2. afficher immédiatement la fiche complète ;
3. afficher tous les véhicules rattachés, sans limite de quantité ;
4. proposer « Utiliser ce véhicule » ou « Ajouter un véhicule » ;
5. afficher les champs manquants par ordre de priorité ;
6. fournir à l’utilisateur les questions exactes à poser au client ;
7. mettre à jour la fiche pendant l’appel ;
8. utiliser ces données dans le devis vocal ou manuel.

## Champs prioritaires à demander dès le devis

Client :
- nom et prénom ;
- e-mail ;
- téléphone portable ;
- canal de contact préféré ;
- autorisation SMS/e-mail ;
- adresse si nécessaire.

Véhicule :
- immatriculation ;
- marque, modèle, version ;
- année ;
- kilométrage ;
- couleur ;
- motorisation et boîte ;
- état avant travaux ;
- photos ;
- historique connu ;
- estimation personnelle du client ;
- éventuelle rareté ou valeur élevée.

## Alertes Jarvis

Jarvis doit signaler :

- doublon client probable ;
- véhicule déjà connu ;
- coordonnées manquantes ;
- consentement de contact absent ;
- véhicule estimé à plus de 50 000 € ;
- véhicule rare ou de collection ;
- besoin d’expertise avant de proposer une date ferme.

## Données de suivi réputation

- demande d’avis envoyée ;
- date et canal ;
- clic sur le lien Google ;
- retour privé reçu ;
- rappel programmé ;
- désinscription ;
- avis public détecté ou confirmé manuellement ;
- réponse de l’entreprise préparée et validée.

Aucune donnée ne doit prétendre qu’un avis a été publié si MAVIK ne peut pas le vérifier.
