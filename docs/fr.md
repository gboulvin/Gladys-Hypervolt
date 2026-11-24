# Hypervolt

Pilotez vos bornes de recharge [Hypervolt](https://www.hypervolt.co.uk)
(Home 2.0, Home 3.0, Home 3 Pro) depuis Gladys Assistant : lancer et arrêter
une charge, choisir le mode de charge, limiter le courant, verrouiller la
borne, et suivre en direct la puissance de charge et l'énergie de chaque
session.

Gladys héberge cette page et la relie depuis l'écran **Configuration** de
l'intégration.

## Fonctionnement

Les bornes Hypervolt n'ont pas d'API locale : l'intégration dialogue avec
elles via le **cloud Hypervolt**, exactement comme l'application mobile
Hypervolt. Gladys a donc besoin d'une connexion Internet, et la borne doit être
en ligne (Wi-Fi ou Ethernet configuré dans l'application Hypervolt). Les
cartes des appareils affichent un badge **Cloud**, rouge quand la borne est
injoignable.

L'intégration garde une connexion en direct par borne : les changements
apparaissent dans Gladys en quelques secondes, sans interrogation périodique.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**e-mail** et le **mot de passe** de votre compte Hypervolt
   (ceux de l'application Hypervolt). Le mot de passe est stocké comme un
   secret.
3. Enregistrez, puis cliquez sur **Tester la connexion** : le message indique
   le nombre de bornes trouvées.
4. Ouvrez l'onglet **Découverte** et ajoutez vos bornes.

## Ce que vous obtenez, par borne

| Fonctionnalité      | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| Charge              | Lance (on) ou arrête (off) la charge                                 |
| Véhicule branché    | Un véhicule est-il connecté                                          |
| Puissance de charge | Puissance délivrée au véhicule, en W                                 |
| Courant de charge   | Courant délivré au véhicule, en A                                    |
| Tension             | Tension d'alimentation, en V                                         |
| Énergie de session  | Énergie délivrée pendant la session en cours (ou la dernière), kWh   |
| Courant max         | Limite de courant, de 6 à 32 A                                       |
| Verrouillage        | Une borne verrouillée refuse de démarrer une nouvelle charge         |
| Mode de charge      | Boost (pleine puissance), Eco ou Super Eco (suivent le surplus PV)   |
| Luminosité LED      | Luminosité de l'anneau lumineux, en %                                |
| Puissance maison    | Consommation de la maison (borne équipée d'une pince ampèremétrique) |
| Puissance réseau    | Soutirage réseau, négatif en injection (pince ampèremétrique)        |
| Production solaire  | Production photovoltaïque (pince ampèremétrique)                     |

Les mesures maison, réseau et solaire ne sont mises à jour que sur une borne
équipée des pinces ampèremétriques optionnelles.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent), dans la catégorie **Intégrations**.

Déclencheurs — restreignables à une borne :

- **Véhicule branché** ;
- **Véhicule débranché** — `{{triggerEvent.data.session_energy_kwh}}` contient
  l'énergie de la session ;
- **Charge démarrée** — `{{triggerEvent.data.charge_mode}}` contient le mode
  (`boost`, `eco`, `super_eco`) ;
- **Charge arrêtée** (terminée, arrêtée ou en pause) —
  `{{triggerEvent.data.session_energy_kwh}}` contient l'énergie de la session.

Actions — chacune renvoie `success`, pour conditionner les actions suivantes :

- **Lancer la charge** / **Arrêter la charge** ;
- **Changer le mode de charge** (Boost, Eco, Super Eco) — par exemple Boost en
  heures creuses, Eco le reste de la journée ;
- **Régler le courant max** (6 à 32 A) — par exemple pour rester sous votre
  puissance souscrite quand la maison consomme beaucoup ;
- **Verrouiller ou déverrouiller la borne**.

Les fonctionnalités de l'appareil marchent aussi avec les déclencheurs et
actions standards de Gladys (« état d'un appareil », « contrôler un
appareil »).

## Tableau de bord

Ajoutez le widget **Borne Hypervolt** à un tableau de bord : puissance de
charge, énergie de session et courant max en direct, état du véhicule, de la
charge, mode de charge, verrouillage et connexion cloud, avec les boutons
**Lancer/Arrêter la charge**, **Boost** et **Eco**. Avec plusieurs bornes,
choisissez-en une dans les réglages du widget.

## Dépannage

- **« Hypervolt a refusé l'e-mail ou le mot de passe »** — vérifiez-les dans
  l'application Hypervolt, puis enregistrez à nouveau la configuration.
- **« Le cloud Hypervolt est injoignable »** — l'intégration réessaie chaque
  minute ; vérifiez la connexion Internet de Gladys.
- **Badge rouge « injoignable »** — la borne n'est plus connectée au cloud
  Hypervolt : vérifiez sa connexion dans l'application Hypervolt.
- **Super Eco « battery safe »** — cette variante s'affiche comme Super Eco.

Consultez les logs de l'intégration depuis l'interface de Gladys pour le
détail (les mots de passe et jetons ne sont jamais journalisés).

Cette intégration n'est ni affiliée à Hypervolt Ltd ni approuvée par elle.
