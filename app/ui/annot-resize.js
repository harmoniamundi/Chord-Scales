// ui/annot-resize.js — poignée qui règle la hauteur des zones d'annotation pendant la jam, sans DOM : bornes, glisser, clavier,
// lecture de la valeur mémorisée et HTML de la poignée. Le moteur (index.html) applique la hauteur à la variable CSS
// « --jam-annot-play-h » de #view-jam et la garde dans localStorage (« jamAnnotPlayHeight »).
// Chargé par index.html via <script src="app/ui/annot-resize.js"> et testé par ui/annot-resize.test.js.

const ARZ_MIN = 120;          // hauteur minimale des zones (px)
const ARZ_DEFAULT = 220;      // hauteur d'origine en lecture (style.css)
const ARZ_STEP = 10;          // pas des flèches du clavier (× 5 avec Maj)
const ARZ_STORAGE_KEY = 'jamAnnotPlayHeight';

// Hauteur ramenée entre ARZ_MIN et maxH (la place disponible) ; Infinity donne le maximum, une valeur illisible ARZ_DEFAULT (borné aussi).
function arzClamp(h, maxH) {
    const max = Math.max(ARZ_MIN, Math.round(Number.isFinite(Number(maxH)) && Number(maxH) > 0 ? Number(maxH) : Infinity));
    const n = Number(h);
    const v = (n === Infinity) ? max : (Number.isFinite(n) ? Math.round(n) : ARZ_DEFAULT); // Infinity = le maximum
    return Math.max(ARZ_MIN, Math.min(max, v));
}

// Valeur mémorisée : un nombre entier d'au moins ARZ_MIN, sinon null (= hauteur d'origine).
function arzParse(stored) {
    if (stored === null || stored === undefined || stored === '') return null;
    const n = Math.round(Number(stored));
    return Number.isFinite(n) && n >= ARZ_MIN && n <= 5000 ? n : null;
}

// Hauteur pendant un glisser : celle du départ plus le déplacement vertical du pointeur (vers le bas = plus haut).
function arzDragHeight(startH, startY, y, maxH) {
    return arzClamp(Number(startH) + (Number(y) - Number(startY)), maxH);
}

// Touche du clavier sur la poignée : nouvelle hauteur, ou null si la touche ne la concerne pas.
// ↓ agrandit, ↑ réduit (la poignée est sous les zones), Maj = pas de 50 ; Début = minimum, Fin = maximum.
function arzKeyHeight(h, key, shift, maxH) {
    const step = ARZ_STEP * (shift ? 5 : 1);
    if (key === 'ArrowDown') return arzClamp(h + step, maxH);
    if (key === 'ArrowUp') return arzClamp(h - step, maxH);
    if (key === 'Home') return arzClamp(ARZ_MIN, maxH);
    if (key === 'End') return arzClamp(Infinity, maxH);
    return null;
}

// Valeurs ARIA de la poignée (séparateur accessible) : hauteur actuelle, minimum et maximum, bornés.
function arzAria(h, maxH) {
    return { now: arzClamp(h, maxH), min: ARZ_MIN, max: arzClamp(Infinity, maxH) };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARZ_MIN, ARZ_DEFAULT, ARZ_STEP, ARZ_STORAGE_KEY, arzClamp, arzParse, arzDragHeight, arzKeyHeight, arzAria };
}
