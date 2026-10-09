// ui/chord-display.js — l'accord affiché sous la grille de la Jam (accord en cours et accord suivant), sans DOM :
// quel accord afficher, lequel est « le suivant » (en lecture ou à l'arrêt, mesure à deux accords, boucle), et les notes
// de l'accord avec l'intervalle que joue chaque pastille. Le moteur (JamEngine.updateJamDisplay / updateNextJamChordDisplay)
// écrit les textes, crée les pastilles et branche les clics.
// Chargé par index.html via <script src="ui/chord-display.js"> et testé par ui/chord-display.test.js.

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const CD_T = (typeof getSpelledChordNotes !== 'undefined') ? { getSpelledChordNotes, stackIntervalsUp } : require('../theory.js');

// Classe d'une pastille de note d'accord.
const CHORD_BADGE_CLASS = 'px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-mono font-bold rounded cursor-pointer select-none transition';

// Accord montré pour un bloc : half = 1 sur une mesure à deux accords affiche le second accord (temps 3-4).
// Renvoie { chord, half } où half vaut 1 seulement si la seconde moitié est réellement affichée.
function displayedChordOf(step, half, splitStep) {
    const second = half === 1 && splitStep;
    return { chord: second ? step.split : step, half: second ? 1 : 0 };
}

// Accord qui suit celui affiché, ou null (rien à afficher).
//   p = { playing, grid, step, half, currentStepIndex, displayedStepIndex, displayedHalf, isSplit(step), peekNext(idx) }
// En lecture : suit le bloc en cours (le second accord d'une mesure à deux accords si on est sur le premier, sinon le bloc
// suivant, boucle comprise). À l'arrêt : part de l'accord réellement sélectionné, y compris la moitié d'une mesure à deux accords.
function nextChordOf(p) {
    const pick = (s) => ({ rootIndex: s.rootIndex, chordId: s.chordId });
    if (!p.playing) {
        const selectedIdx = Number.isInteger(p.displayedStepIndex) ? p.displayedStepIndex : -1;
        const selectedStep = selectedIdx >= 0 ? p.grid[selectedIdx] : null;
        if (!selectedStep || !p.grid.length) return null;
        if (p.isSplit(selectedStep) && p.displayedHalf === 0) return pick(selectedStep.split);
        const nextIdx = p.peekNext(selectedIdx);
        const nextStep = nextIdx >= 0 ? p.grid[nextIdx] : null;
        return nextStep ? pick(nextStep) : null;
    }
    if (!p.step || p.grid.length === 0) return null;
    if (p.isSplit(p.step) && p.half === 0) return pick(p.step.split);
    const nextIdx = p.peekNext(p.currentStepIndex);
    const nextStep = nextIdx >= 0 ? p.grid[nextIdx] : null;
    return nextStep ? pick(nextStep) : null;
}

// Pastilles des notes d'un accord : nom de la note et intervalle joué au clic (accord empilé vers le haut).
function chordBadges(rootName, chordObj) {
    const spelled = CD_T.getSpelledChordNotes(rootName, chordObj);
    const stacked = CD_T.stackIntervalsUp(chordObj.notes);
    return spelled.map((label, idx) => ({ label, interval: stacked[idx] }));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CHORD_BADGE_CLASS, displayedChordOf, nextChordOf, chordBadges };
}
