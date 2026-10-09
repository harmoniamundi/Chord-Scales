// audio/practice-notes.js — notes jouées par le mode Entraînement (accord, arpège, gamme, note isolée), sans Web Audio ni DOM.
// Le moteur (ChordScaleApp.playChord / scheduleArpeggioCycle / toggleScalePlayback / playSingleNote) joue ensuite ces notes sur
// le piano, avec la destination (réverbération) qu'il connaît. Chaque note : { noteStr, when, opts }.
// Chargé par index.html via <script src="audio/practice-notes.js"> (après audio/note-events.js) et testé par audio/practice-notes.test.js.

if (typeof playNoteName === 'undefined' && typeof require === 'function') {
    var { playNoteName } = require('./note-events.js');
}
const PRACTICE_OCT = (typeof PLAY_BASE_OCTAVE !== 'undefined') ? PLAY_BASE_OCTAVE : require('../audio-config.js').PLAY_BASE_OCTAVE;

// Accord plaqué : toutes les notes (déjà empilées vers le haut) ensemble à l'instant `now`.
function practiceChordNotes(instrumentKey, rootIndex, stacked, now, gain) {
    return stacked.map(interval => ({
        noteStr: playNoteName(instrumentKey, rootIndex, interval, PRACTICE_OCT),
        when: now,
        opts: { duration: 2.5, gain }
    }));
}

// Séquence d'indices de notes de l'arpège. En boucle : montée puis descente
// (sans répéter la note la plus haute ni la fondamentale, qui ouvre le cycle suivant).
function arpeggioSequence(noteCount, pingPong) {
    const seq = Array.from({ length: noteCount }, (_, i) => i);
    if (pingPong) {
        for (let i = noteCount - 2; i >= 1; i--) seq.push(i);
    }
    return seq;
}

// Un cycle d'arpège commençant à l'instant `start` (vitesse constante). Renvoie { notes, duration (secondes) }.
function arpeggioCycle(instrumentKey, rootIndex, stacked, start, pingPong, gain, spacing = 0.3) {
    const seq = arpeggioSequence(stacked.length, pingPong);
    return {
        notes: seq.map((noteIdx, step) => ({
            noteStr: playNoteName(instrumentKey, rootIndex, stacked[noteIdx], PRACTICE_OCT),
            when: start + step * spacing,
            opts: { duration: 1.5, gain }
        })),
        duration: seq.length * spacing
    };
}

// Onglet mis en veille : on se recale sur l'horloge audio plutôt que de rattraper les cycles manqués.
function arpeggioCycleStart(nextStart, currentTime) {
    return nextStart < currentTime - 0.05 ? currentTime : nextStart;
}

// Lecture d'une gamme, note après note : jusqu'à la tonique de l'octave supérieure (l'intervalle 12, comme la portée),
// à l'envers si isDesc. Renvoie { steps: [{ interval, delayMs }], endDelayMs }.
function scalePlaybackPlan(intervals, isDesc, stepSec = 0.28) {
    const playbackIntervals = [...intervals, 12];
    const active = isDesc ? playbackIntervals.reverse() : playbackIntervals;
    return {
        steps: active.map((interval, idx) => ({ interval, delayMs: idx * stepSec * 1000 })),
        endDelayMs: active.length * stepSec * 1000 + 300
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { practiceChordNotes, arpeggioSequence, arpeggioCycle, arpeggioCycleStart, scalePlaybackPlan };
}
