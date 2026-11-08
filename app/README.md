# Chord Scales Machine

Application web d'entraînement et de jam autour des accords et des gammes : un mode **Entraînement** (accord → gammes à jouer, intervalles, notes, portée, écoute) et un mode **Jam** (grille d'accords, orchestre qui accompagne, styles, reprises, impression).

Pas de serveur ni de compilation : ouvrir `index.html` (à la racine) dans le navigateur suffit. **Plus aucune connexion Internet n'est nécessaire** : les deux bibliothèques (**Soundfont-player** pour le son, **VexFlow** pour la portée), la police Kalam et les échantillons d'instruments sont dans le dossier `app/`. Publiée sur un site (GitHub Pages), l'appli s'installe et marche **hors ligne** (voir la section « Mode hors ligne »).

---

## 1. Comment le projet est organisé

```
racine/
├── index.html            ← la seule page, à la racine
├── sw.js                 ← service worker (mode hors ligne) : doit rester à la racine
├── manifest.webmanifest  ← nom, icônes et couleurs de l'appli installée
└── app/                  ← tout le reste (modules, styles, sons, tests, README, package.json)
```

Les commandes `npm` se lancent **depuis le dossier `app/`** (`cd app`). Dans `index.html`, les chemins commencent par `app/` (exemple : `<script src="app/grid/transport.js">`). Dans la suite de ce document, les chemins de modules (`grid/transport.js`…) sont donnés **relativement à `app/`**.

`index.html` contient la page (HTML) et les deux « moteurs » qui font le lien entre l'écran et la logique. Toute la logique qui se calcule sans écran ni son est dans des **modules** (un fichier = une responsabilité), chacun avec son fichier de test.

| Dossier / fichier | Rôle |
|---|---|
| `index.html` | La page, la classe `JamEngine` (mode Jam) et la classe `ChordScaleApp` (Entraînement + application) : création des éléments, clics, son, horloge |
| `theory.js` | Théorie musicale : noms de notes, orthographe, accords, gammes, notes à éviter / cibles |
| `band-patterns.js` | Données des motifs rythmiques de l'orchestre |
| `audio-config.js` | Constantes audio (octave de lecture, niveau master…) |
| `band/` | Orchestre de la Jam : un fichier par famille de styles (`swing-plan`, `pop-plan`, `rock-plan` pour les couches et styles rock, `latin-plan`, `cuban-plan`, `salsa-plan` pour la salsa, `brass-plan`, `balkan-plan`, `cumbia-plan`, `piazzolla-plan`, `classic-plan`, `guitar-plan` pour la guitare classique seule, `flamenco-plan` pour le toque flamenco de cette même guitare, mesures 2/3 temps et ternaires), lignes de basse, choix par phrase (`phrase-plan`), états de départ (`band-state`), utilitaires (`band-helpers`) |
| `grid/` | La grille d'accords : ordre de lecture et reprises (`play-order`), mécanique de lecture (`transport`), édition (`edit-ops`, dont `setMeasureNote` : annotation d'une mesure, portée par son bloc comme une fonction tonale), génération (`generation`), lecture harmonique (`harmony`), sauvegarde/import/export (`grid-format` : l'export d'une grille en .json se choisit en « Complète », « Grille seule » ou « Personnalisée », avec cases pour l'analyse fonctionnelle, les annotations, les parties, les gammes, la tonalité, le tempo, l'orchestre et le mixage ; accords, reprises et signature rythmique sont toujours exportés ; il lit aussi les annotations : `note` par bloc et `notes` pour toute la grille ; `sanitizeNoteHtml` ne garde que le texte, le gras / italique / souligné / barré, la taille, la police (liste fermée `NOTE_FONTS`), la couleur, le surlignage, l'alignement, les puces et les portées éditables (`NOTE_MAX_STAVES` = 8 par annotation, avec leur décalage `data-pos`), jusqu'à 2000 caractères par mesure et 8000 pour la grille ; tout le reste, y compris le code, est supprimé) |
| `audio/` | Calcul des notes jouées (`note-events`, `practice-notes`), synthèse des percussions (`drum-synths`, dont le kit rock), synthèse de l'ampli de guitare, de l'orgue et des cordes (`rock-synths`), fichier WAV de l'export du son (`wav-export`), adresses locales des sons (`local-soundfonts`) et lecteur des cuivres Virtual Playing Orchestra (`vpo-brass`) |
| `styles/` | Les styles musicaux : métadonnées (`style-meta`), outils (`toolkit`), un générateur de grille par style (`style-builders`) |
| `ui/` | Ce qu'il faut afficher, sans DOM : grille (`grid-view`), cartes de gammes (`scale-cards`), éditeur de mesure (`measure-editor`), pastilles (`pastilles`), portée (`staff-model`), notation des mélodies courtes des annotations (`staff-notes` : format texte (`clé,mesure,armure[,taille %];notes`), rythme, découpage en mesures, hauteurs, lecture ; `staff-editor` : dessin VexFlow (plein format en édition, cadre resserré au repos) et édition souris / clavier / tactile, crayon ✎ pour entrer / sortir de l'édition, tracé « Real Book », bloc posé à sa place sur le canevas de la zone (`data-at="x,y"`, cadre caché par `data-border="0"`), copier / couper / coller ; marqueur de presse-papiers `[portée@x,y!:…]` (place, et `!` si le cadre est caché) ; `staff-notes` donne aussi le format `L,E` des cadres de texte), canevas des annotations (`annot-canvas` : chaque zone est un canevas où les blocs ont chacun leur place, indépendants et pouvant se recouvrir ; sélection de plusieurs blocs par clic, Maj / ⌘ / Ctrl, rectangle ou ⌘A, déplacement de groupe, repères d'alignement et aimant léger, zoom de la zone (50 à 300 %, en lecture comme en édition : les places restent celles du canevas à 100 %, la conversion se fait dans `pointOf` / `placeAt`) — fonctions pures testées sans navigateur : `acSnap`, `acFreeSpot`, `acZoomStep`, `acZoomWheel`, `acZoomOffset`, `acZoomScroll`, `acZoomOf`… ; chaque zone a un crayon « mode édition » à côté de son titre : hors édition les blocs sont figés et la zone se lit avec zoom, en édition ils se déplacent, avec crayons et outils visibles), cadres de texte des annotations (`text-frame` : bloc `annot-frame` où l'on écrit — on n'écrit jamais hors d'un cadre —, redimensionnable en tirant sur ses bords et ses coins — le contenu suit, car tirer change l'échelle d'affichage `E` de 25 à 400 % sans changer la mise en page du texte, de largeur `L`), barre de mise en forme des annotations et boutons de disposition des blocs — aimant, cadre visible / caché, premier plan, arrière-plan (`annot-bar`), accords affichés (`chord-display`), écran Entraînement (`training-view`) |
| `tools/` | Contrôles de cohérence du projet (`project-check.test.js`) et du mode hors ligne (`sw-check.test.js`) |
| `e2e/` | Tests dans un vrai navigateur : appli complète (`app.e2e.js`) et mode hors ligne (`offline.e2e.js`) |
| `vendor/` | Bibliothèques tierces, copiées telles quelles : `soundfont-player.min.js` 0.12.0, `vexflow-petaluma.js` 4.2.2 |
| `sounds/` | Échantillons d'instruments (~35 Mo) : banques FluidR3_GM et MusyngKite, lues par `audio/local-soundfonts.js` ; dossier `sounds/VPO/` : cuivres du Brass band (trompette, cor, trombone, tuba) et cordes frottées du quinteto de tango (violon tenu et spiccato, contrebasse à l'archet) (~2,6 Mo), lus par `audio/vpo-brass.js` (voir `sounds/VPO/LISEZMOI.txt`) |
| `fonts/`, `icons/`, `licenses/` | Police Kalam (sous-ensemble latin), icônes de l'appli installée, licences des éléments tiers |
| `offline.js` | Enregistre le service worker et affiche la petite pastille « Sons hors ligne : x/13 » |
| `style.css`, `tailwind-built.css` | Styles de la page |
| `TESTS.md` | Commandes de test et liste de contrôle manuelle |

---

## 2. La règle d'or

> **La logique va dans un module testable. Le moteur d'`index.html` ne fait que « coller » : lire l'état, appeler le module, écrire dans le DOM, jouer le son.**

Un module ne touche jamais au DOM, à Web Audio ni à `this` du moteur. Il reçoit ce dont il a besoin en paramètres et renvoie des données (texte HTML, liste de notes, nouvelle position, etc.). Le moteur applique le résultat.

Exemples :
- `ui/staff-model.js` calcule *quelles notes dessiner* ; `renderVexFlowStaff` les dessine avec VexFlow.
- `grid/transport.js` décide *où en est la lecture après un temps* ; `tick()` programme le son et l'affichage.
- `audio/note-events.js` renvoie des « notes à jouer » (`{noteStr, when, opts}`) ; le moteur appelle `instrument.play(...)`.

---

## 3. Comment modifier quelque chose

1. **Trouver où ça vit.** Le comportement musical ou le calcul est presque toujours dans un module (voir le tableau). Le clic, le DOM, le son sont dans `index.html`.
2. **Modifier le module** et son test (`xxx.test.js` à côté). Écrire d'abord le test qui échoue si vous corrigez un bug, puis la correction.
3. **Lancer `npm test`** (depuis `app/`). Tout doit rester vert (`fail 0`).
4. **Ouvrir l'appli** et essayer à l'écran / à l'oreille ce qui a changé.
5. **Avant de considérer que c'est fini :** `npm run test:e2e` (si installé) et la liste de `TESTS.md`.

### Ajouter un nouveau module

1. Créer `app/dossier/mon-module.js` avec cette forme (modèle utilisé partout dans le projet) :

   ```js
   // dossier/mon-module.js — ce que fait le module, en une phrase, sans DOM.
   // Chargé par index.html via <script src="app/dossier/mon-module.js"> et testé par dossier/mon-module.test.js.

   // Dépendances : globales dans le navigateur, require sous Node.
   if (typeof uneFonction === 'undefined' && typeof require === 'function') {
       var { uneFonction } = require('../autre-module.js');
   }

   function maFonction(parametres) {
       // calcul pur : renvoie des données
   }

   if (typeof module !== 'undefined' && module.exports) {
       module.exports = { maFonction };
   }
   ```

2. Ajouter `<script src="app/dossier/mon-module.js"></script>` dans `index.html`, **après** les modules dont il dépend.
3. Créer `app/dossier/mon-module.test.js` (voir n'importe quel `*.test.js` comme exemple).
4. Dans `index.html`, appeler `maFonction(...)` depuis le moteur.
5. `npm test` : le contrôle de cohérence vérifie que le fichier est bien chargé par la page, qu'il a son test et qu'aucun nom n'est en double.

---

## 4. Les pièges de ce projet

- **Scripts classiques, pas de modules ES.** Tous les fichiers partagent les mêmes noms globaux. Deux `const`, `let` ou `class` de même nom dans deux fichiers = erreur de syntaxe = **page blanche**. Pour importer une constante d'un autre fichier, lui donner un nom propre au module (exemples : `STAFF_T`, `PAST_T`, `PRACTICE_OCT`). Les fonctions importées utilisent le schéma `if (typeof f === 'undefined' && typeof require === 'function') { var { f } = require(...) }`. Le test `tools/project-check.test.js` signale ce problème.
- **L'ordre des `<script>` compte.** Un module doit être chargé après ceux dont il dépend.
- **Le hasard est consommé dans un ordre précis.** Les générateurs d'orchestre appellent `Math.random` dans un ordre donné ; changer cet ordre change la musique produite pour une même graine. Si vous réorganisez du code qui utilise le hasard, vérifiez que l'ordre des appels est le même.
- **Les blancs dans les gabarits HTML comptent.** Les chaînes HTML (gabarits entre accents graves) sont comparées telles quelles par les tests ; ne réindentez pas leur contenu sans raison.
- **`tailwind-built.css` est déjà compilé.** Une classe Tailwind qui n'y figure pas n'aura aucun effet à l'écran. Pour une couleur ou une taille nouvelle, utilisez un style en ligne (`style="..."`) comme le font déjà les pastilles, ou régénérez le CSS.
- **Les dossiers du projet** ne doivent pas contenir de « : » dans leur nom (le Finder les affiche comme « / »).
- **Le son démarre après un premier clic** (règle des navigateurs). Un test automatique ne peut pas juger la qualité du son : c'est à vous de l'écouter.
- **Après une modification, rechargez la page en vidant le cache** (`Cmd + Maj + R`), sinon le navigateur peut garder d'anciens fichiers `.js`.

---

## 5. Tests

| Commande | Contrôle |
|---|---|
| `npm test` | Tous les tests unitaires (plus de 1 700) + cohérence du projet. Quelques secondes. |
| `npm run test:e2e` | L'appli entière dans un navigateur : chargement, Entraînement, portée, tous les styles de la Jam, lecture/arrêt, changement d'orchestre, plage sélectionnée ; et (`e2e/annotations.e2e.js`) les blocs des annotations : police, création de cadres (double-clic), mode édition (crayon) et blocs figés en lecture, zoom (aussi en édition), blocs indépendants qui se recouvrent, cadre visible / caché, repères et aimant, sélection multiple (rectangle, Maj / ⌘ / Ctrl, ⌘A), déplacement de groupe, copier-coller entre zones, migration des anciennes annotations, portée (cadre resserré, crayon, point, redimensionnement) ; le faux plein écran de la zone d'annotation et celui de la grille. |
| `npm run test:offline` | Le mode hors ligne pour de vrai : visite en ligne, puis réseau coupé ; la page se recharge, les 13 instruments se décodent, la portée et la police s'affichent, aucune requête ne part vers un autre site. |

Installation du test navigateur (une fois) : `npm install` puis `npx playwright install chromium`. Sans cela, ses scénarios sont simplement ignorés.

Les tests n'écoutent pas le son et ne voient pas la vraie portée : la liste de contrôle manuelle de `TESTS.md` complète le tout.

Si un test échoue après votre modification, regardez la ligne `not ok` et le message d'erreur juste en dessous : ils indiquent le fichier et ce qui a changé.

---

## 5 bis. Le style Flamenco (orchestre Guitare)

Trois styles de grille du menu « Flamenco » (`flamencosolea`, `flamencobulerias`, `flamencotangos`, écrits dans `styles/style-builders.js`) proposent l'orchestre **Guitare** et imposent un rythme (`f-solea`, `f-bulerias`, `f-tangos`, voir `styles/style-meta.js`). Ce rythme fait passer la guitare de `band/guitar-plan.js` (arpèges classiques) à `band/flamenco-plan.js` :

- **Formes d'accords réelles** (La m 002210, Mi 022100, Sol 320003, Fa en barré…, cejilla quand la fondamentale n'est pas celle d'une forme ouverte), pas de renversements de piano ; les cordes à vide sonnent comme sur une guitare.
- **Compás de 12 temps** en 12/8 (soleá, bulerías) : la mesure commence sur le temps 12, accents sur 12-3-6-8-10 ; 4/4 pour la rumba / tangos. Gestes : coups de pouce, coups montants d'index, abanicos (rasgueos en éventail), pouce sur la basse, arpèges, **golpes** (la percussion `golpe` de `audio/drum-synths.js`, envoyée sur le bus de la guitare : elle suit son curseur de volume).
- **Percussions** (`flaPercussion` dans `band/flamenco-plan.js`, sons `cajonb`, `cajont`, `palma`, `sorda`, `pito` de `audio/drum-synths.js`) : cajón (grave au centre, claqué au bord), palmas claires et sourdes, pitos. Chaque palo a son cycle : soleá très discrète (palmas sourdes sur les accents, le cajón et les palmas claires arrivent avec l'intensité de la phrase), bulerías plus fournie (palmas claires sur les accents, sourdes en contretemps, pitos), rumba / tangos (grave – claqué – grave – claqué, palmas sur 2 et 4). Elles s'effacent pendant une falseta, font un petit roulement à la fin d'une phrase (remate) et s'arrêtent avec le golpe sur l'accord final. Elles passent par le bus de la batterie : en Flamenco, le curseur « Percus. » du pop-up Orchestre les règle (à 0, elles disparaissent) ; le golpe reste sur le curseur de la guitare. Leur tirage au hasard est à part (`flaHashRng`) : la guitare écrit exactement les mêmes mesures qu'avant.
- **Falsetas** (phrase à une voix qui retombe sur les accents, dans la gamme de l'accord : phrygien dominant sur le Mi), **remate** en fin de phrase, **adelanto** (le dernier coup montant annonce l'accord suivant), abanico et golpe sur l'accord final.
- Harmonie : cadence andalouse La m - Sol - Fa - Mi en triades, un ou deux accords par compás, tonalité par défaut La (voir `BRASS_KEYS` dans `changeStyle`). Aucune réharmonisation au bouton « Générer » (la couleur est dans le mode).
- Les autres signatures (2/4, 3/4, 6/8, 9/8) gardent un cycle générique sur les temps.


---

## 5 ter. Le style Salsa (orchestre Cuba)

Le style de grille « Salsa (4/4) » (`salsa`, écrit dans `styles/style-builders.js`) propose l'orchestre **Cuba** avec le rythme `salsa` (tempo 180, 4/4 ; voir `styles/style-meta.js`). Ce rythme fait passer l'orchestre de `band/cuban-plan.js` (afro-cubain) à `band/salsa-plan.js`. Tout est calé sur la **clave de son** (deux mesures : côté « trois » = temps 1, 2& et 4 ; côté « deux » = temps 2 et 3). Son sens, 3-2 ou 2-3, est fixé par la graine de la lecture et ne change pas en cours de morceau.

- **Piano** : montuno en octaves, une cellule par côté de la clave et par densité ; les coups de clave portent les voix hautes de l'arpège, les voix intérieures remplissent entre eux. Il passe au nouvel accord en même temps que la basse (anticipation).
- **Basse** : tumbao. Quinte sur le « et » du 2, puis fondamentale de l'accord suivant sur le temps 4 (ou le « et » du 4), tenue par-dessus la barre de mesure : le 1 n'est presque jamais joué.
- **Percussions** : clave en continu ; conga (claque sur le 2, tons ouverts sur le « et » du 2 et sur le 4) ; deux ambiances alternent par groupes de deux phrases : **son** (cáscara au flanc du timbal, bongos en martillo, güiro) puis **montuno** (cloche, maracas, piano plus dense) ; roulement de doubles croches au dernier temps d'une phrase.
- Nouveaux sons de `audio/drum-synths.js` : `shell` (cáscara), `guiro` et `guirot` (coup long et court), `bongoh` et `bongol` (bongó aigu et grave). Au niveau de performance minimal, güiro court et bongos sont supprimés.
- Harmonie : le plus souvent en mineur (i - iv - V7 - i, vamp i - V7, cadence andalouse, i - ♭VI - iiø - V7), plus rarement en majeur (I - IV - V7 - IV, I - vi - ii - V7) ; 16 mesures en quatre phrases de quatre.
- Choisir un autre orchestre ou une autre signature rythmique ramène l'orchestration habituelle : `salsa` n'est valable que pour l'orchestre Cuba en 4/4.
---

## 5 ter. Le style Cumbia (orchestre Cumbia)

Le style de grille **Cumbia colombienne (4/4)** du menu « Amérique Latine » (`cumbia`, écrit dans `styles/style-builders.js`) propose l'orchestre **Cumbia** (`band/cumbia-plan.js`, entrée factice `BAND_PATTERNS.cumbia` dans `band-patterns.js`). Même plomberie que les Balkans : l'accordéon prend la place du « piano » (curseur « Accordéon »), les percussions celle de la batterie (curseur « Percus. »).

- **Harmonie** : 16 mesures, A (8) puis B, le refrain (8), en triades et dominante V7, un accord par mesure ou par deux mesures. Référence en majeur (I - IV - V7, Sol par défaut, voir `BRASS_KEYS`) ; « Générer » propose parfois (40 %) une version mineure (i - iv - V7, ou i - ♭VII - ♭VI - V7). Chaque cellule de quatre mesures part de l'accord appelé par la précédente. Aucune réharmonisation.
- **Tempo** : 98 à la noire (la cumbia colombienne se danse entre 85 et 110) ; tout le plan est écrit en croches droites (swing 50 % par défaut, réglable comme les autres orchestres).
- **Percussions** (sons `guacd`, `guacu`, `llam`, `llamo`, `tamb`, `palo` de `audio/drum-synths.js`) : guacharaca (un coup descendant sur chaque temps, deux petits coups ascendants sur le « et » et le « a » : le « chu-chucu-chu »), llamador (étouffé sur 1 et 3, ouvert sur 2 et 4), tambora (coup grave sur 1 et 3, baguettes sur le bois aux contretemps), tambor alegre (réponses syncopées sur les congas, plus denses quand l'énergie monte), maracas en croches. Fin de phrase : roulement d'alegre.
- **Basse** (basse électrique aux doigts, comme le Pop) : fondamentale sur 1 et 3, quinte anticipée sur le « et » de 2 et 4 (tumbao), variantes avec tierce, octave et quinte grave ; une note d'approche annonce l'accord suivant en fin de phrase.
- **Accordéon** : mélodie en phrases de deux mesures, reprises à l'identique une phrase sur deux (carrure de quatre mesures) ; la question se pose sur la tierce ou la quinte, la réponse retombe sur la fondamentale ; doublure à la tierce inférieure une fois sur deux ; accords en contretemps (« ta-ka »), allégés sous la mélodie ; petite gamme rapide vers l'accord suivant en fin de phrase.
- Les autres signatures (2/4, 3/4 : cellules tronquées ; 6/8, 9/8, 12/8 : version simplifiée en tiers de temps) restent jouables.

---

## 5 quinquies. Pop-Rock enrichi et styles Rock (orchestre Pop-Rock)

L'orchestre **Pop-Rock** ne se limite plus à piano, basse et batterie. `band/rock-plan.js` (appelé par `band/pop-plan.js`) ajoute des **couches** et sept **rythmes rock** ; `audio/rock-synths.js` fournit les sons.

- **Couches du Pop-Rock ordinaire** (aucun rythme imposé, `popLayerExtras`, selon l'énergie de la phrase) : guitare électrique (arpèges clairs, accords grattés, contretemps étouffés, tronçonnage), orgue (nappe ou crescendo), cordes (nappe), tambourin. Les événements des instruments mélodiques sont rangés dans `plan.piano` avec un champ `inst` (`piano`, `gtr`, `organ`, `strings`) ; `plan.rock = true` les signale, `plan.tone` règle l'ampli, `plan.leslie` la vitesse du haut-parleur tournant. Le moteur les aiguille dans `playRockHit` (index.html) vers trois bus (curseurs « Guit. élec. », « Orgue », « Cordes » du pop-up Orchestre, visibles en Pop-Rock) ; le calcul des notes est `rockNotes` dans `audio/note-events.js`.
- **Sept styles de grille** (jukebox, groupe « Rock » ; formes dans `styles/style-builders.js`) qui imposent chacun un rythme : `rockroll` → `r-roll` (12 mesures, 160, swing 62 %), `rockclassic` → `r-classic` (118), `hardrock` → `r-hard` (132, mi mineur), `punk` → `r-punk` (145), `rockballad` → `r-ballad` (68), `bluesrock` → `r-blues` (12 mesures, 100, shuffle 67 %), `indierock` → `r-indie` (124). Les mêmes rythmes sont dans le menu Orchestre (« Rock : … », table `ROCK_BAND_GROOVES` de `styles/style-meta.js`) ; choisir « Pop-Rock » efface le rythme. Le swing propre à un rythme est `GROOVE_SWING_DEFAULTS` (`band/band-helpers.js`) : le réglage manuel l'emporte.
- **Chaque rythme** (table `ROCK` de `rock-plan.js`) décrit en motifs de 16 doubles croches : charleston ou ride, grosse caisse, caisse claire (légèrement en retard sur le temps), notes fantômes, charleston ouvert, basse, guitare (accords de puissance, boogie, étouffé, arpèges, jangle), claviers, et l'**arc d'énergie** de quatre phrases (couplet, couplet, refrain, refrain) qui choisit les motifs « bas » ou « haut ». Roulements et breaks de fin de phrase : sept formules sur les toms rock.
- **Quatre rythmes ont un jeu « vivant »** (réglé dans la table `ROCK`) :
  - `r-roll` (années 50) n'a **pas de guitare électrique** (`guitar: null`) ; la **contrebasse mène** (`bassLead`) : lignes qui marchent (tierce, quinte, sixte, septième), accents sur les temps 2 et 4, course de quatre notes vers l'accord suivant en fin de phrase, notes avec `gainMul` 1,18 (le moteur le passe à `playBassAbs` → `bassNote`) et vrai son de contrebasse (`plan.upright`) même dans l'orchestre Pop-Rock ; batterie légèrement en retrait (`mix`). Le piano garde son boogie d'origine (main gauche qui marche, accords de main droite sur les contretemps).
  - `r-classic` (années 70), `r-hard` et `r-punk` : la guitare porte `vary` (`'classic'`, `'hard'`, `'punk'`) ; chaque phrase enchaîne plusieurs motifs (`gtrSeq`, `guitarLife`) que `varyGuitar` détend d'une mesure à l'autre (coups manqués, grattés sourds, paumes étouffées, relances en doubles croches, accords tenus, retombée sus4 → tierce, mesure d'arpège, arrêt sous les roulements), avec accents, retards (`lay`) et délais entre cordes irréguliers.
  - `r-hard` : peu de notes, longues (accords de puissance d'un temps à la mesure entière, riffs « 3 + 3 + 2 », quelques croches étouffées seulement pour lancer un accord, jamais de raccourcissement) ; un accord peut durer six temps (`hold`, mémoire `rockGtrHold` du moteur) sans ré-attaque au début de la mesure suivante.
  - `r-punk` (d'après « Antisocial » de Trust, 145) : batterie binaire droite (grosse caisse sur 1 et 3, caisse claire sur 2 et 4 pile sur le temps, charleston en croches, entrouvert sur les contretemps) ; guitare = chug de croches étouffées à la paume sur la fondamentale (symbole `m`) et, à chaque mesure, accord de puissance ouvert accentué sur le contretemps du premier temps (symbole `C`) ; le couplet joue le riff de base, le refrain claque davantage de contretemps ; la basse double les croches et glisse vers l'accord suivant au quatrième temps. Seul un roulement de batterie interrompt le chug (dès le troisième temps).
  - `r-blues` : en plus des dyades de boogie, des phrases de guitare solo (gamme pentatonique mineure et note bleue, `BLUES_LICKS`) sur les deux derniers temps de certaines mesures.
- **Kit rock** (`audio/drum-synths.js`) : `rkick`, `rsnare`, `rghost`, `rtom1` à `rtom4`, `tmb` et `tmbs` (tambourin), `clap`. Les toms sont des membranes à plusieurs modes avec attaque, résonance et petite chute de hauteur (plus de sinus pur de boîte à rythmes) ; l'ancien kit (`kick`, `snare`, `tom1` à `tom3`) reste utilisé par les autres orchestres.
- **Sons** : tout est synthétisé ou réutilise des échantillons déjà dans l'application (aucune nouvelle banque). La guitare joue l'échantillon `electric_guitar_clean` dans un ampli simulé (propre, crunch, saturé, lourd, surf : préampli, saturation à lampes, haut-parleur, écho). L'orgue est additif (neuf tirettes, claquement de touche, percussion, Leslie lent ou rapide), les cordes sont une « string machine » (scies désaccordées, chœur d'ensemble). Aux niveaux de performance allégés, ces synthés simplifient leur chaîne.
- Si le volume d'un instrument rock paraît déséquilibré, régler d'abord `AMP_TONES[...].level` (guitare), puis les valeurs par défaut de `bandVolumes` dans `index.html`.

---

## 5 quater. Les styles Balkans (orchestre Balkans)

L'orchestre **Balkans** (`band/balkan-plan.js`, entrée factice `BAND_PATTERNS.balkan`) joue accordéon, basse et percussions (tapan, daire, darbuka). Quatre styles de grille du menu « Balkans » l'utilisent ; trois « couleurs » de jeu se partagent le même fichier, choisies par le rythme imposé du style de grille (`STYLE_GROOVE` dans `styles/style-meta.js`, lu par `getEffectiveGroove('balkan')`) :

| Style de grille | Rythme imposé | Couleur | Signature, tempo, tonalité |
|---|---|---|---|
| `balkan` : kolo / čoček | aucun | danse | 2/4, 128, ré mineur |
| `balkan98` : aksak | aucun | danse | 9/8 (2+2+2+3), 100, la mineur |
| `balkansevdah` : ballade lente | `bk-sevdah` | sevdah | 4/4, 60, la mineur |
| `balkantsifte` : tsifteteli / čoček | `bk-tsifte` | tsifte | 4/4, 100, ré mineur |

- **La ligne chantée de l'accordéon** (art `lin`) n'est plus tirée mesure par mesure : une phrase de 4 mesures est écrite **A B A C** (question, réponse, question, conclusion). Chaque rôle a son rythme (cellules par groupe de croches, ou mesures écrites à la main pour la ballade et le tsifteteli : `BK_BAR8`) et son contour (`balkanContour`), identiques à chaque retour du rôle, donc reconnaissables même quand l'accord change. La ligne est liée (jeu au soufflet), surtout conjointe, pose les notes longues des temps forts sur des notes de l'accord, prépare le changement d'accord par un degré conjoint, évite de répéter la note précédente et se pose en fin de phrase (fondamentale, ou quinte / tierce sur une dominante). `mel = 0` : la phrase commence par l'accompagnement seul (entrée).
- **Ornements** (art `orn`, supprimés au niveau de performance « Minimal » et quand le tempo dépasse 5 croches/s) : petite note sur le temps (kvaka), mordant, mélisme avant une note longue.
- **Fin de phrase** : la petite phrase rapide vers l'accord suivant part de la dernière note de la ligne.
- **Sevdah** : notes longues et ornées, main gauche en nappe tenue ou en arpège doux (arts `pad` / `arp`), basse en notes longues, percussions presque absentes (aucune pendant la 1re phrase).
- **Tsifteteli** : darbuka « maqsum » (dum tek . tek dum . tek .), basse calée sur les dum, contretemps de l'accordéon sur les tek, ligne syncopée et ornée.
- Les autres signatures restent jouables avec toutes les couleurs (accompagnement de danse, ligne et ornements propres à la couleur).

## 6. Mode hors ligne (service worker)

**Principe.** À la première visite en ligne, `sw.js` garde dans le navigateur la page, le code, la police, les bibliothèques et les icônes (« cache appli », téléchargé d'un coup). Quatre secondes après le chargement, il télécharge aussi en arrière-plan les 21 fichiers de sons (« cache sons », ~35 Mo) ; une pastille en bas à gauche indique `Sons hors ligne : x/21`, puis `✓ Prêt hors ligne`. Ensuite l'appli s'ouvre et joue sans réseau. Les grilles sauvegardées restent dans l'appareil (`localStorage`).

**Mises à jour.** En ligne, `sw.js` va toujours chercher la dernière version des fichiers de l'appli (réseau d'abord, 3 secondes maximum) et met la copie à jour ; hors ligne ou réseau trop lent, il sert la copie gardée. Il n'y a **pas de numéro de version à changer** : un `git push` suffit, la nouvelle version apparaît à l'ouverture suivante avec du réseau. Les sons, eux, ne changent jamais : ils restent en cache.

**Quand modifier `sw.js`.**
- Ajout ou suppression d'un fichier chargé par `index.html` (module `.js`, feuille de style, police, icône) → ajouter ou retirer la ligne dans `SHELL_FILES`. Le test `tools/sw-check.test.js` échoue tant que la liste n'est pas à jour.
- Ajout d'un instrument → ajouter `[banque, nom]` dans `LOCAL_SOUNDFONT_INSTRUMENTS` (`audio/local-soundfonts.js`) et copier son fichier `<nom>-mp3.js` dans `sounds/<banque>/`. Les fichiers viennent de https://github.com/gleitz/midi-js-soundfonts (branche `gh-pages`). Le test `audio/local-soundfonts.test.js` vérifie que tout instrument demandé par `index.html` est dans la liste et que son fichier existe.
- Cuivres du Brass band et cordes frottées de l'orchestre Piazzolla (Virtual Playing Orchestra) → les huit fichiers de `sounds/VPO/` sont déjà dans la liste des sons à garder (`VPO_ALL_FILES`, `audio/vpo-brass.js`). Si un de ces fichiers manque, l'appli retombe toute seule sur les anciens sons MusyngKite (qui restent dans `sounds/MusyngKite/` pour cela).
- Forcer tous les appareils à repartir de zéro (rare) → changer `SHELL_CACHE` / `SOUNDS_CACHE` (`-v1` → `-v2`) dans `sw.js`.

**À savoir.**
- Le service worker ne marche pas quand on ouvre `index.html` par double-clic (`file://`) : l'appli fonctionne alors avec ses fichiers locaux, sans mise en cache. Dans ce cas les navigateurs interdisent à Soundfont-player de lire les fichiers de sons par `XMLHttpRequest` ; `audio/local-soundfonts.js` les charge donc comme des `<script>` (testé par `npm run test:offline`). Pour essayer aussi le mode hors ligne en local : `npx serve` ou `python3 -m http.server` depuis la racine, puis `http://localhost:8000`.
- Tous les chemins sont relatifs : l'appli marche à la racine d'un site comme dans un sous-dossier (`https://…github.io/Chord-Scales/`).
- Pour mettre à jour VexFlow ou Soundfont-player : remplacer le fichier dans `vendor/` (et son numéro de version dans ce README). Ne pas recharger depuis un CDN.
- Les iPhone et iPad peuvent vider la mémoire d'un site non ouvert depuis plusieurs semaines : rouvrir l'appli une fois avec du réseau suffit à tout retélécharger.

---

## 7. Où en est le code

- `index.html` est passé d'environ 16 000 à environ 6 100 lignes ; la logique pure est dans 39 modules testés.
- Il reste dans `index.html` des méthodes surtout liées à l'écran et au son : câblage des événements, Web Audio (réverbération, bus des cuivres et du tango), création des éléments.
- Pistes possibles, par ordre d'intérêt :
  1. Découper `JamEngine` (une seule classe de plus de 4 000 lignes) en plusieurs fichiers par responsabilité (lecture, édition de grille, orchestre, rendu), sans changer la logique.
  2. Ne retoucher le reste (Web Audio, câblage DOM) que lorsqu'une fonctionnalité l'exige : le gain de les extraire est faible.

---

## 8. Travailler avec Claude sur ce projet

Pour une modification, donnez-lui :
- ce que vous voulez changer, **et** le comportement à conserver (« ne rien changer d'autre ») ;
- le message d'erreur ou les lignes `not ok` si un test échoue ;
- les fichiers concernés (`index.html` et le module touché, avec son dossier `app/…`), ou le projet entier : zip de la racine, `zip -r projet.zip . -x "*/node_modules/*" "node_modules/*" ".git/*" "*.DS_Store" "*.zip"`.

Demandez-lui aussi de lancer `npm test` (et `npm run test:e2e`) avant de vous renvoyer des fichiers, et de vous dire ce qu'il faut tester à l'oreille.

---

## Crédits des sons

Les cuivres de l'orchestre Brass band (trompette, cor, trombone, tuba), ainsi que le violon (tenu et spiccato) et la contrebasse à l'archet de l'orchestre Piazzolla, utilisent des échantillons de la bibliothèque libre **Virtual Playing Orchestra** de Paul Battersby (https://virtualplaying.com), elle-même assemblée à partir d'enregistrements de l'Université d'Iowa (Electronic Music Studios) et de Sonatina Symphonic Orchestra (Mattias Westlund) pour les cuivres, de **No Budget Orchestra** (CC BY-SA 4.0) pour le violon et de **VSCO 2 Community Edition** (CC0) pour la contrebasse. Détails et licences : `licenses/VPO-LICENSE.txt`.
