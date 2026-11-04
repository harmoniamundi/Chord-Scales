# Tests de Chord Scales Machine

Les commandes se lancent depuis le dossier `app/` (`cd app`).

## Automatiques

| Commande | Ce qu'elle vérifie | Prérequis |
|---|---|---|
| `npm test` (ou `node --test`) | tests unitaires de tous les modules + cohérence du projet (`tools/project-check.test.js`) | Node 20+ |
| `npm run test:e2e` | l'appli complète dans un vrai navigateur (`e2e/app.e2e.js`) : chargement, Entraînement, portée, tous les styles de la Jam, lecture/arrêt, changement d'orchestre, plage sélectionnée | `npm install` puis `npx playwright install chromium` |

| `npm run test:offline` | le mode hors ligne dans un vrai navigateur (`e2e/offline.e2e.js`) : visite en ligne, réseau coupé, rechargement, 13 instruments décodés, portée et police, aucune requête externe | `npm install` puis `npx playwright install chromium` |

Si Playwright n'est pas installé, les tests du navigateur sont simplement ignorés.

### Ce que `tools/project-check.test.js` empêche
- un `<script src>` qui pointe vers un fichier absent, ou un module oublié dans `index.html` ;
- un nom global déclaré deux fois (`const`/`let`/`class` en double entre deux scripts = page blanche) ;
- un module sans fichier de test ;
- un `onclick="app.xxx()"` ou `app.jam.xxx()` du HTML qui ne correspond plus à une méthode.

### Ce que `tools/sw-check.test.js` empêche
- un fichier chargé par `index.html` (script, style, police, icône) absent de la liste `SHELL_FILES` de `sw.js` : il ne serait pas disponible hors ligne ;
- une ressource chargée depuis Internet (CDN, police Google, serveur de sons) qui réapparaîtrait dans `index.html` ou `style.css` ;
- un manifeste ou des icônes invalides (l'appli ne serait plus installable).

### Ce que les tests ne peuvent pas vérifier (à faire à l'oreille / à l'œil)
Les tests tournent sans vrai son, avec une version minimale de VexFlow et sans réseau.

1. **Son** : lancer une jam (swing, bossa, tango, orchestre Guitare : guitare classique à cordes nylon, arpèges et accords) ; vérifier que l'intro, le métronome, la basse, la batterie et le piano sonnent et restent réguliers, y compris avec l'onglet en arrière-plan.
2. **Changements en cours de lecture** : changer d'orchestre, de tempo, activer/désactiver le métronome.
3. **Portée** : en Entraînement (mode Portée), vérifier les notes, altérations, couleurs (rouge = à éviter, orange = caractéristique, bleu = cible) et les gammes descendantes (clic droit sur une carte).
4. **Safari / iPhone** : le son démarre après un premier toucher ; l'affichage reste lisible.
5. **Impression** : bouton d'impression de la grille (reprises, voltas, parties).
6. **Sauvegarde / import** de grilles.
7. **Hors ligne, sur l'appareil réel** : ouvrir l'appli publiée avec du réseau, attendre `✓ Prêt hors ligne`, passer en mode avion, fermer puis rouvrir l'appli : elle doit se charger et jouer (piano, basse, cuivres, tango). Sur iPhone / iPad : « Partager → Sur l'écran d'accueil » puis tester depuis l'icône.
8. **Édition d'une mesure (mode Jam, crayon ✎)** : le pop-up s'ouvre avec la section « Gamme » repliée (flèche ▸, le nom de la gamme reste visible) ; les choix d'accords tiennent sur 2 lignes ; le bouton « + » de la grille ajoute une mesure à chaque clic, sans limite ; après avoir choisi un accord (ex. Db7alt) puis une autre mesure, choisir la même fondamentale (Db) propose Db7alt en premier (bouton en pointillés) ; Copier puis Coller insère après la mesure sélectionnée (aussi avec ⌘C / ⌘V pop-up ouvert) ; dans l'éditeur de fonction tonale, le bouton « ⇣ N » à droite de chaque lecture l'applique aussi aux N occurrences suivantes du même accord (cliquer sur la ligne seule ne change que cette mesure), en une seule annulation.
9. **Flamenco (menu Jukebox → Flamenco)** : pour chaque palo, lancer la jam. *Soleá* (12/8, 52) : compás lent, rasgueos sur les accents 12-3-6-8-10, golpe sur le temps 12, falseta à une voix une phrase sur deux environ, abanicos en fin de phrase. *Bulerías* (12/8, 88) : même cycle, plus serré, contretemps et abanicos. *Rumba / tangos* (4/4, 108) : rasgueo « bas – bas-haut – haut-bas-haut », golpes. Écouter : les accords sonnent comme des formes de guitare à cordes à vide (pas de renversements de piano), le golpe n'est ni trop fort ni trop sec, l'accord final se conclut par un abanico et un golpe ; le curseur « Guitare » règle aussi le golpe ; le bouton affiche « Orchestre Flamenco ». Percussions : le curseur « Batterie » devient « Percus. » (actif) ; on entend un cajón (grave sur le 12, claqués sur 3-8-10 en bulerías), des palmas (sourdes et discrètes en soleá, claires sur les accents en bulerías, sur 2 et 4 en rumba) et des pitos en bulerías ; elles se calment pendant une falseta, font un petit roulement avant la fin d'une phrase et tombent avec le golpe sur l'accord final ; à 0 elles disparaissent. Avec le mode de transposition Bb ou Eb, l'accord sonne à la hauteur réelle (La écrit = Sol réel en Bb) : pour entendre La mineur, passer en Ut.
10. **Analyse fonctionnelle (mode Jam, fonctions tonales affichées)** : quel que soit le style choisi (Blues, Bossa, Flamenco, Baroque…), les degrés s'affichent en chiffrage **Classique** (en mineur : III, VI, VII) ; dans le pop-up « Fonction tonale » ou Harmonisation, le bouton **Jazz** passe en ♭III, ♭VI, ♭VII, et ce choix tient jusqu'au prochain changement de style.
11. **Cumbia (menu Jukebox → Amérique Latine → Cumbia colombienne)** : lancer la jam à 98. Écouter la guacharaca (« chu-chucu-chu » régulier, légèrement accentué sur 1 et 3), le llamador (sourd sur 1 et 3, ouvert sur 2 et 4), la tambora sur 1 et 3 avec ses petits coups de baguette, la basse (fondamentale sur 1 et 3, quinte avant le temps 3 et le temps 1), et l'accordéon : phrases de deux mesures qui posent une question puis y répondent, accords en contretemps. Vérifier qu'aucune percussion n'écrase l'accordéon (curseur « Percus. »), qu'une grille mineure (bouton « Générer » plusieurs fois) sonne aussi juste, et que 2/4, 3/4 et 6/8 restent musicaux.
12. **Balkans (menu Jukebox → Balkans)** : écouter les quatre styles. *Kolo / čoček* (2/4, 128) et *aksak* (9/8, 100) : l'accordéon chante en continu, en phrases de quatre mesures qui se répondent (question, réponse, question, conclusion), notes liées, jamais de mesure vide au hasard, petite phrase rapide qui amène l'accord suivant ; le tapan / la darbuka restent réguliers, avec de légères variantes d'une mesure à l'autre. *Sevdah* (4/4, 60) : notes longues et ornées (petite note sur le temps, mordant), main gauche douce, basse en notes longues, presque pas de percussions (aucune pendant la 1re phrase). *Tsifteteli* (4/4, 100) : darbuka « dum tek . tek dum . tek . », basse sur les dum, contretemps de l'accordéon sur les tek. Vérifier qu'en changeant d'orchestre (Jazz, Brass…) la couleur ne suit pas, et que 2/4, 3/4 et 6/8 restent musicaux avec le sevdah et le tsifteteli.
