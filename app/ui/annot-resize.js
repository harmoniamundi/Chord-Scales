// ui/annot-resize.js — hauteur des zones d'annotation, sans DOM.
// Onglet Annotations, écran large, jam lancée ou non : la grille d'accords et les annotations se partagent toute la hauteur de la fenêtre :
//  - par défaut, la grille garde sa taille et les annotations prennent toute la place restante jusqu'au bas de la fenêtre ;
//  - la poignée posée en haut des annotations les tire vers le haut : la grille rétrécit d'autant (elle défile, et suit la lecture pendant la jam),
//    sans descendre sous une ligne de dominos. Ce « tirage » (pull, en px) est gardé dans localStorage (« jamAnnotPull »).
// Le moteur (index.html) mesure la place (total, hauteur du contenu de la grille), appelle arzLayout et pose le résultat sur les
// variables CSS « --jam-row1-h » et « --jam-annot-play-h » de #view-jam (voir style.css).
// Chargé par index.html via <script src="app/ui/annot-resize.js"> et testé par ui/annot-resize.test.js.

const ARZ_MIN = 120;          // hauteur minimale des zones d'annotation (px)
const ARZ_GRID_MIN = 84;      // hauteur minimale de la grille d'accords quand on tire les annotations vers le haut (une ligne de dominos)
const ARZ_STEP = 10;          // pas des flèches du clavier (× 5 avec Maj)
const ARZ_STORAGE_KEY = 'jamAnnotPull';

// Tirage mémorisé : entier positif ou nul (0 = annotations sous la grille, à sa taille normale).
function arzParsePull(stored) {
    const n = Math.round(Number(stored));
    return Number.isFinite(n) && n > 0 && n <= 5000 ? n : 0;
}

// Partage de la hauteur. total = hauteur de la grille + hauteur des zones d'annotation + place libre sous la carte ;
// gridContent = hauteur du contenu de la grille (toutes ses lignes) ; pull = tirage voulu.
// Renvoie { grid, annot, pull, maxPull } : hauteur de la grille, des zones, tirage retenu (borné) et tirage maximal.
function arzLayout({ total, gridContent, pull }) {
    const T = Math.max(0, Math.round(Number(total) || 0));
    const G = Math.max(0, Math.round(Number(gridContent) || 0));
    const gridNat = Math.max(0, Math.min(G, T - ARZ_MIN));        // la grille entière, si les annotations gardent au moins ARZ_MIN
    const gridMin = Math.min(gridNat, ARZ_GRID_MIN);
    const maxPull = Math.max(0, gridNat - gridMin);
    const p = Math.max(0, Math.min(maxPull, Math.round(Number(pull) || 0)));
    const grid = gridNat - p;
    return { grid, annot: Math.max(ARZ_MIN, T - grid), pull: p, maxPull };
}

// Tirage pendant un glisser : la poignée est en haut des annotations, monter (y plus petit) les agrandit.
function arzDragPull(startPull, startY, y) {
    return Math.round(Number(startPull) + (Number(startY) - Number(y)));
}

// Touche du clavier sur la poignée : nouveau tirage (non borné : arzLayout le borne), ou null si la touche ne le concerne pas.
// ↑ agrandit les annotations, ↓ les réduit, Maj = pas de 50 ; Début = tout en haut (maximum), Fin = position normale.
function arzKeyPull(pull, key, shift, maxPull) {
    const step = ARZ_STEP * (shift ? 5 : 1);
    if (key === 'ArrowUp') return pull + step;
    if (key === 'ArrowDown') return Math.max(0, pull - step);
    if (key === 'Home') return Math.max(0, Math.round(Number(maxPull) || 0));
    if (key === 'End') return 0;
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARZ_MIN, ARZ_GRID_MIN, ARZ_STEP, ARZ_STORAGE_KEY, arzParsePull, arzLayout, arzDragPull, arzKeyPull };
}
