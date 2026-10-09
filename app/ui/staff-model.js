// ui/staff-model.js — ce que la portée d'une gamme doit afficher, sans VexFlow ni DOM : clé de cache, notes à dessiner
// (touche VexFlow, sens de la hampe, altération à poser, couleur) et dimensions. Le moteur (ChordScaleApp.renderVexFlowStaff)
// construit ensuite les objets VexFlow à partir de ce modèle.
// Chargé par index.html via <script src="ui/staff-model.js"> et testé par ui/staff-model.test.js.

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const STAFF_T = (typeof getStrictSpelledNotes !== 'undefined') ? { getStrictSpelledNotes, getTargetIntervals } : require('../theory.js');

const STAFF_LETTER = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
const STAFF_AVOID = '#e11d48';          // à éviter (rouge)
const STAFF_CHARACTERISTIC = '#d97706'; // caractéristique (ambre)
const STAFF_TARGET = '#2563eb';         // note cible (bleu)

// Clé de cache d'une portée : une même gamme (mêmes notes, mêmes couleurs) n'est dessinée qu'une fois.
function staffCacheKey(p) {
    return [p.rootName, p.intervals.join(','), p.isDesc ? 1 : 0, p.avoidNotes.join(','), p.characteristicInterval,
        p.chordObj ? STAFF_T.getTargetIntervals(p.chordObj).join(',') : '-', p.twoOctaves ? 1 : 0, p.showTargetNotes ? 1 : 0, p.isJam ? 1 : 0].join('|');
}

// Modèle de la portée.
//   p : rootName, intervals, isDesc, twoOctaves, chordObj (ou null), avoidNotes, characteristicInterval, showTargetNotes
// Renvoie { scaleIntervals, width, height, notes: [{ interval, vexKey, stemDown, accidental (ou null), color (ou null) }] }.
function staffModel(p) {
    const { rootName, intervals, isDesc, twoOctaves, chordObj, avoidNotes, characteristicInterval, showTargetNotes } = p;
    let scaleIntervals = twoOctaves
        ? [...intervals, ...intervals.map(i => i + 12), 24]
        : [...intervals, 12];

    const baseSpelled = STAFF_T.getStrictSpelledNotes(rootName, intervals, isDesc);
    const baseRootNote = STAFF_T.getStrictSpelledNotes(rootName, [12])[0];

    let spelledNotes = twoOctaves
        ? [...baseSpelled, ...baseSpelled, baseRootNote]
        : [...baseSpelled, baseRootNote];

    if (isDesc) {
        scaleIntervals = scaleIntervals.reverse();
        spelledNotes = spelledNotes.reverse();
    }

    const numNotes = scaleIntervals.length;
    const width = Math.max(twoOctaves ? 620 : 450, numNotes * (twoOctaves ? 38 : 42) + 60);
    const height = 120;

    // Altérations déjà posées dans la « mesure » (la gamme tient sur une seule mesure) : lettre+octave → altération.
    // Une note qui change d'altération sur la même ligne (Mib puis Mi, Fa# puis Fa) reçoit son altération ou un bécarre.
    const accState = {};
    const notes = scaleIntervals.map((interval, i) => {
        const noteName = spelledNotes[i];
        const noteLetter = noteName[0].toLowerCase();
        const accidental = noteName.slice(1);

        // L'octave est déterminée par l'orthographe diatonique de la note, et non par son seul intervalle chromatique
        // (évite que C/C#/B# soient placés une octave trop bas quand la gamme franchit le Do).
        const rootDiatonic = STAFF_LETTER[rootName[0].toLowerCase()];
        const noteDiatonic = STAFF_LETTER[noteLetter];
        // Octave = octave de départ + octaves déjà franchies (intervalle ÷ 12) ; une note dont la lettre précède
        // celle de la tonique appartient déjà à l'octave suivante (Do d'une gamme de Sol, etc.).
        let octave = 4 + Math.floor(interval / 12);
        if (noteDiatonic < rootDiatonic) octave++;

        const vexKey = `${noteLetter}${accidental}/${octave}`;

        // Règle classique des hampes : vers le haut sous la ligne médiane (Si4), vers le bas au-dessus ; jamais selon le sens de la gamme.
        const pitchPosition = octave * 7 + STAFF_LETTER[noteLetter];
        const middleLinePosition = 4 * 7 + STAFF_LETTER.b;
        const stemDown = pitchPosition > middleLinePosition;

        const accSymbol = accidental ? (accidental.includes('##') ? '##' : accidental.includes('bb') ? 'bb' : accidental.includes('#') ? '#' : 'b') : 'n';
        const stateKey = `${noteLetter}/${octave}`;
        const previousAcc = accState[stateKey] || 'n';
        let toAdd = null;
        if (accSymbol !== previousAcc) {
            toAdd = accSymbol;
            accState[stateKey] = accSymbol;
        }

        const checkInterval = interval >= 12 ? interval % 12 : interval;
        const isTarget = !!chordObj && STAFF_T.getTargetIntervals(chordObj).includes(checkInterval);
        // Priorité des couleurs : à éviter (rouge) > caractéristique (ambre) > cible (bleu)
        let color = null;
        if (avoidNotes.includes(checkInterval)) color = STAFF_AVOID;
        else if (characteristicInterval === checkInterval) color = STAFF_CHARACTERISTIC;
        else if (showTargetNotes && isTarget) color = STAFF_TARGET;

        return { interval, vexKey, stemDown, accidental: toAdd, color };
    });
    return { scaleIntervals, width, height, notes };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { staffCacheKey, staffModel };
}
