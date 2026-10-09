# Tests de Chord Scales Machine

Les commandes se lancent depuis le dossier `app/` (`cd app`).

## Automatiques

| Commande | Ce qu'elle vérifie | Prérequis |
|---|---|---|
| `npm test` (ou `node --test`) | tests unitaires de tous les modules + cohérence du projet (`tools/project-check.test.js`) | Node 20+ |
| `npm run test:e2e` | l'appli complète dans un vrai navigateur (`e2e/app.e2e.js`) : chargement, Entraînement, portée, tous les styles de la Jam, lecture/arrêt, changement d'orchestre, plage sélectionnée | `npm install` puis `npx playwright install chromium` |

Si Playwright n'est pas installé, les tests du navigateur sont simplement ignorés.

### Ce que `tools/project-check.test.js` empêche
- un `<script src>` qui pointe vers un fichier absent, ou un module oublié dans `index.html` ;
- un nom global déclaré deux fois (`const`/`let`/`class` en double entre deux scripts = page blanche) ;
- un module sans fichier de test ;
- un `onclick="app.xxx()"` ou `app.jam.xxx()` du HTML qui ne correspond plus à une méthode.

### Ce que les tests ne peuvent pas vérifier (à faire à l'oreille / à l'œil)
Les tests tournent sans vrai son, avec une version minimale de VexFlow et sans réseau.

1. **Son** : lancer une jam (swing, bossa, tango) ; vérifier que l'intro, le métronome, la basse, la batterie et le piano sonnent et restent réguliers, y compris avec l'onglet en arrière-plan.
2. **Changements en cours de lecture** : changer d'orchestre, de tempo, activer/désactiver le métronome.
3. **Portée** : en Entraînement (mode Portée), vérifier les notes, altérations, couleurs (rouge = à éviter, orange = caractéristique, bleu = cible) et les gammes descendantes (clic droit sur une carte).
4. **Safari / iPhone** : le son démarre après un premier toucher ; l'affichage reste lisible.
5. **Impression** : bouton d'impression de la grille (reprises, voltas, parties).
6. **Sauvegarde / import** de grilles.
