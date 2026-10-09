# Chord Scales Machine

Application web d'entraînement et de jam autour des accords et des gammes : un mode **Entraînement** (accord → gammes à jouer, intervalles, notes, portée, écoute) et un mode **Jam** (grille d'accords, orchestre qui accompagne, styles, reprises, impression).

Pas de serveur ni de compilation : ouvrir `index.html` (à la racine) dans le navigateur suffit. Une connexion Internet est nécessaire pour deux bibliothèques chargées depuis des CDN : **Soundfont** (sons de piano, etc.) et **VexFlow** (dessin de la portée).

---

## 1. Comment le projet est organisé

```
racine/
├── index.html      ← la seule page, à la racine
└── app/            ← tout le reste (modules, styles, tests, README, package.json)
```

Les commandes `npm` se lancent **depuis le dossier `app/`** (`cd app`). Dans `index.html`, les chemins commencent par `app/` (exemple : `<script src="app/grid/transport.js">`). Dans la suite de ce document, les chemins de modules (`grid/transport.js`…) sont donnés **relativement à `app/`**.

`index.html` contient la page (HTML) et les deux « moteurs » qui font le lien entre l'écran et la logique. Toute la logique qui se calcule sans écran ni son est dans des **modules** (un fichier = une responsabilité), chacun avec son fichier de test.

| Dossier / fichier | Rôle |
|---|---|
| `index.html` | La page, la classe `JamEngine` (mode Jam) et la classe `ChordScaleApp` (Entraînement + application) : création des éléments, clics, son, horloge |
| `theory.js` | Théorie musicale : noms de notes, orthographe, accords, gammes, notes à éviter / cibles |
| `band-patterns.js` | Données des motifs rythmiques de l'orchestre |
| `audio-config.js` | Constantes audio (octave de lecture, niveau master…) |
| `band/` | Orchestre de la Jam : un fichier par famille de styles (`swing-plan`, `pop-plan`, `latin-plan`, `cuban-plan`, `brass-plan`, `balkan-plan`, `piazzolla-plan`, `classic-plan`, mesures 2/3 temps et ternaires), lignes de basse, choix par phrase (`phrase-plan`), états de départ (`band-state`), utilitaires (`band-helpers`) |
| `grid/` | La grille d'accords : ordre de lecture et reprises (`play-order`), mécanique de lecture (`transport`), édition (`edit-ops`), génération (`generation`), lecture harmonique (`harmony`), sauvegarde/import (`grid-format`) |
| `audio/` | Calcul des notes jouées (`note-events`, `practice-notes`) et synthèse des percussions (`drum-synths`) |
| `styles/` | Les styles musicaux : métadonnées (`style-meta`), outils (`toolkit`), un générateur de grille par style (`style-builders`) |
| `ui/` | Ce qu'il faut afficher, sans DOM : grille (`grid-view`), cartes de gammes (`scale-cards`), éditeur de mesure (`measure-editor`), pastilles (`pastilles`), portée (`staff-model`), accords affichés (`chord-display`), écran Entraînement (`training-view`) |
| `tools/` | Contrôles de cohérence du projet (`project-check.test.js`) |
| `e2e/` | Test de l'appli complète dans un navigateur (`app.e2e.js`) |
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
| `npm test` | Tous les tests unitaires (plus de 900) + cohérence du projet. Quelques secondes. |
| `npm run test:e2e` | L'appli entière dans un navigateur : chargement, Entraînement, portée, tous les styles de la Jam, lecture/arrêt, changement d'orchestre, plage sélectionnée. |

Installation du test navigateur (une fois) : `npm install` puis `npx playwright install chromium`. Sans cela, ses scénarios sont simplement ignorés.

Les tests n'écoutent pas le son et ne voient pas la vraie portée : la liste de contrôle manuelle de `TESTS.md` complète le tout.

Si un test échoue après votre modification, regardez la ligne `not ok` et le message d'erreur juste en dessous : ils indiquent le fichier et ce qui a changé.

---

## 6. Où en est le code

- `index.html` est passé d'environ 16 000 à environ 6 100 lignes ; la logique pure est dans 36 modules testés.
- Il reste dans `index.html` des méthodes surtout liées à l'écran et au son : câblage des événements, Web Audio (réverbération, bus des cuivres et du tango), création des éléments.
- Pistes possibles, par ordre d'intérêt :
  1. Découper `JamEngine` (une seule classe de plus de 4 000 lignes) en plusieurs fichiers par responsabilité (lecture, édition de grille, orchestre, rendu), sans changer la logique.
  2. Ne retoucher le reste (Web Audio, câblage DOM) que lorsqu'une fonctionnalité l'exige : le gain de les extraire est faible.

---

## 7. Travailler avec Claude sur ce projet

Pour une modification, donnez-lui :
- ce que vous voulez changer, **et** le comportement à conserver (« ne rien changer d'autre ») ;
- le message d'erreur ou les lignes `not ok` si un test échoue ;
- les fichiers concernés (`index.html` et le module touché, avec son dossier `app/…`), ou le projet entier : zip de la racine, `zip -r projet.zip . -x "*/node_modules/*" "node_modules/*" ".git/*" "*.DS_Store" "*.zip"`.

Demandez-lui aussi de lancer `npm test` (et `npm run test:e2e`) avant de vous renvoyer des fichiers, et de vous dire ce qu'il faut tester à l'oreille.
