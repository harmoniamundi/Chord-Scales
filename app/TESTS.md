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

1. **Son** : lancer une jam (swing, bossa, tango) ; vérifier que l'intro, le métronome, la basse, la batterie et le piano sonnent et restent réguliers, y compris avec l'onglet en arrière-plan.
2. **Changements en cours de lecture** : changer d'orchestre, de tempo, activer/désactiver le métronome.
3. **Portée** : en Entraînement (mode Portée), vérifier les notes, altérations, couleurs (rouge = à éviter, orange = caractéristique, bleu = cible) et les gammes descendantes (clic droit sur une carte).
4. **Safari / iPhone** : le son démarre après un premier toucher ; l'affichage reste lisible.
5. **Impression** : bouton d'impression de la grille (reprises, voltas, parties).
6. **Sauvegarde / import** de grilles.
7. **Hors ligne, sur l'appareil réel** : ouvrir l'appli publiée avec du réseau, attendre `✓ Prêt hors ligne`, passer en mode avion, fermer puis rouvrir l'appli : elle doit se charger et jouer (piano, basse, cuivres, tango). Sur iPhone / iPad : « Partager → Sur l'écran d'accueil » puis tester depuis l'icône.
