// audio/note-events.js — calcul des notes jouées par chaque instrument de l'orchestre, sans Web Audio ni DOM.
// Le moteur (JamEngine.play*Hit) reste responsable de l'appel `instrument.play(...)` (soundfont-player) et du suivi des
// nœuds ; ici on décide quoi jouer : nom de note, instant, durée, gain, attaque / release, désaccord en cents, avec
// l'humanisation aléatoire habituelle. Chaque fonction renvoie des « notes » { noteStr, when, opts } à jouer telles quelles.
// Le tirage aléatoire (env.rand, Math.random par défaut) est consommé dans le même ordre que dans l'ancien code.
//
// env commun : { instrumentKey ('C' | 'Bb' | 'Eb'), currentTime (horloge audio), rand? }
//   piano     env.perfTier, env.viaBus, env.outGain (volume × master, quand le piano n'est pas branché sur le bus)
//   guitare   env.transOffset
//   cuivres   env.has(nom) : l'instrument de ce nom est chargé
//   basse     env.bassVolume
// Chargé par index.html via <script src="audio/note-events.js"> et testé par audio/note-events.test.js.

const NE_CONST = (typeof AUDIO_ROOT_NAMES !== 'undefined')
    ? { AUDIO_ROOT_NAMES, PLAY_BASE_OCTAVE }
    : { AUDIO_ROOT_NAMES: require('../theory.js').AUDIO_ROOT_NAMES, PLAY_BASE_OCTAVE: require('../audio-config.js').PLAY_BASE_OCTAVE };
if (typeof brassParts === 'undefined' && typeof require === 'function') {
    var { brassParts } = require('../band/band-helpers.js');
}

const NE_TRANSPOSE = { C: 0, Bb: -2, Eb: -9 };

// Nom de note (« C#4 ») d'une fondamentale + intervalle, en tenant compte de la transposition de l'instrument.
function playNoteName(instrumentKey, rootIndex, interval, baseOctave = NE_CONST.PLAY_BASE_OCTAVE) {
    const absSemis = rootIndex + interval + (NE_TRANSPOSE[instrumentKey] || 0);
    const normalizedSemi = ((absSemis % 12) + 12) % 12;
    const octave = baseOctave + Math.floor(absSemis / 12);
    return NE_CONST.AUDIO_ROOT_NAMES[normalizedSemi] + octave;
}

const OCT = NE_CONST.PLAY_BASE_OCTAVE;
const randOf = (env) => env.rand || Math.random;

// Basse (une note). time est utilisé tel quel.
function bassNote(env, absSemi, time, duration, vel = 0.85, wide = false) {
    return {
        noteStr: playNoteName(env.instrumentKey, absSemi, 0, OCT - 1),
        when: time,
        opts: {
            duration,
            gain: (wide ? Math.min(1.05, 0.35 + 0.75 * vel) : Math.min(1.05, 0.6 + 0.45 * vel)) * env.bassVolume
        }
    };
}

// Piano : accord éventuellement « roulé » ; au niveau de performance minimal, au plus 3 voix par accord.
// opts = { duration, gain } ; quand env.viaBus, le moteur ajoute { destination } (bus du piano).
function pianoNotes(env, e, time, beatSec) {
    const rand = randOf(env);
    const vel = e.vel * (0.94 + rand() * 0.12);
    const baseGain = e.wide ? Math.min(1.05, 0.28 + 0.8 * vel) : Math.min(1.05, 0.5 + 0.6 * vel);
    const gain = baseGain * (env.viaBus ? 1 : env.outGain) * (e.gainMul || 1);
    const dur = Math.max(0.12, env.perfTier >= 2 ? Math.min(1.6, e.dur * beatSec) : e.dur * beatSec);
    const roll = e.roll !== undefined ? e.roll : 0.006;
    let order = e.intervals.map((_, i) => i);
    if (env.perfTier >= 2 && order.length > 3) order = [order[0]].concat(order.slice(-2));
    return order.map((idx, n) => {
        const interval = e.intervals[idx];
        const g = e.noteVels ? Math.min(env.viaBus ? 1.0 : 1.05, gain * e.noteVels[idx]) : gain;
        return {
            noteStr: playNoteName(env.instrumentKey, e.rootIndex, interval, OCT),
            when: Math.max(env.currentTime, time + n * roll),
            opts: { duration: dur, gain: g }
        };
    });
}

// Guitare classique (style Brasil) : cordes grattées du grave à l'aigu (ou l'inverse si e.dir < 0), notes aiguës adoucies.
function guitarNotes(env, e, time, beatSec) {
    const rand = randOf(env);
    const vel = e.vel * (0.94 + rand() * 0.12);
    const gain = Math.min(1.2, 0.34 + 0.85 * vel);
    const dur = Math.max(0.1, e.dur * beatSec);
    const roll = e.roll !== undefined ? e.roll : 0.012;
    const n = e.intervals.length;
    const off = env.transOffset;
    const release = 0.18 + 0.2 * Math.min(1, dur);
    return e.intervals.map((interval, idx) => {
        const order = e.dir < 0 ? (n - 1 - idx) : idx;
        const tilt = 1 - 0.022 * Math.min(14, Math.max(0, interval + off - 7));
        const g = (e.noteVels ? Math.min(1.25, gain * e.noteVels[idx]) : gain) * tilt;
        return {
            noteStr: playNoteName(env.instrumentKey, e.rootIndex, interval, OCT),
            when: Math.max(env.currentTime, time + order * roll),
            opts: { duration: dur, gain: g, attack: 0.004, release }
        };
    });
}

// Brass band : chaque pupitre (cornets, cors, trombones) joue sa note avec ses propres retards, attaques et désaccords.
const BRASS_ART = {
    marc:  { attack: 0.016, decay: 0.24, sustain: 0.76, release: 0.15, gain: 1.08, max: 1.3 },
    stac:  { attack: 0.011, decay: 0.07, sustain: 0.35, release: 0.07, gain: 1.00, max: 0.22 },
    ten:   { attack: 0.042, decay: 0.30, sustain: 0.84, release: 0.22, gain: 0.95, max: 99 },
    swell: { attack: 0.16,  decay: 0.30, sustain: 0.92, release: 0.30, gain: 0.85, max: 99 },
    pad:   { attack: 0.09,  decay: 0.35, sustain: 0.88, release: 0.30, gain: 0.90, max: 99 },   // harmonie tenue, discrète
    hold:  { attack: 0.022, decay: 0.40, sustain: 0.80, release: 0.26, gain: 1.00, max: 99 }    // accent puis tenue
};
// [instrument, transposition (demi-tons), gain, retard d'entrée (s), facteur d'attaque, facteur de release, accord (cents)]
const BRASS_SLOT = {
    c1: ['trumpet',      12, 0.80, 0.000, 0.90, 0.85,  2],
    c2: ['trumpet2',     12, 0.70, 0.004, 1.00, 0.90, -4],
    h1: ['french_horn',   0, 1.05, 0.008, 1.15, 1.00, -3],
    h2: ['french_horn2',  0, 1.00, 0.006, 1.10, 1.00,  4],
    t1: ['trombone',      0, 0.95, 0.013, 1.40, 1.20,  3],
    t2: ['trombone2',     0, 0.95, 0.019, 1.70, 1.35, -2]
};
// Renvoie { notes: [{ inst (nom de l'instrument), noteStr, when, opts }], breath: niveau du souffle ou null }.
function brassNotes(env, e, time, beatSec) {
    const rand = randOf(env);
    const a = BRASS_ART[e.art] || BRASS_ART.ten;
    const dur = Math.max(0.1, Math.min(e.dur * beatSec, a.max));
    const base = Math.min(1.1, 0.3 + 0.95 * e.vel * (0.94 + rand() * 0.12)) * a.gain * (e.gainMul || 1);
    const parts = e.parts || brassParts(e.intervals);
    const stac = e.art === 'stac';
    let top = false;
    const notes = [];
    parts.forEach(p => {
        const sp = BRASS_SLOT[p.slot];
        if (!sp) return;
        const alt = sp[0].replace(/2$/, '');
        const inst = env.has(sp[0]) ? sp[0] : (env.has(alt) ? alt : null);
        if (!inst) return;
        const noteStr = playNoteName(env.instrumentKey, e.rootIndex || 0, p.iv + sp[1], OCT);
        const when = Math.max(env.currentTime, time + sp[3] * (stac ? 0.4 : 1) + rand() * 0.012);
        const attack = e.art === 'swell'
            ? Math.max(0.05, Math.min(0.3, dur * 0.4)) * (0.85 + rand() * 0.3)
            : a.attack * sp[4] * (0.85 + rand() * 0.3);
        // chaque joueur respire à son idée : la fin des notes tenues n'est pas parfaitement alignée
        const d = stac ? dur : Math.max(0.1, dur - rand() * 0.03);
        notes.push({
            inst, noteStr, when,
            opts: {
                duration: d, gain: base * sp[2] * (0.93 + rand() * 0.14) * (p.gm || 1),
                attack, decay: a.decay, sustain: a.sustain, release: a.release * sp[5],
                cents: sp[6] + (rand() - 0.5) * 4
            }
        });
        if (p.slot === 'c1') top = true;
    });
    return { notes, breath: (top && !stac && e.art !== 'pad') ? 0.014 + 0.03 * e.vel : null };
}

// Tuba : note de basse (hauteur écrite relative à do2) ramenée dans le registre du tuba (sol1 à sol2 réels).
function tubaNote(env, abs, time, duration, vel = 0.85, art) {
    const off = env.transOffset;
    let s = abs + off;
    while (s > 7) s -= 12;
    while (s < -5) s += 12;
    const noteStr = playNoteName(env.instrumentKey, s - off, 0, OCT - 1);
    const stac = art === 'stac';
    const puls = art === 'puls';   // basse pulsée : note articulée mais assez longue, qui retombe avant la suivante
    return {
        noteStr,
        when: Math.max(env.currentTime, time),
        opts: {
            duration: stac ? Math.min(duration, 0.28) : duration,
            gain: Math.min(1.2, 0.45 + 0.8 * vel) * 1.1,
            attack: stac ? 0.012 : (puls ? 0.017 : 0.025),
            decay: puls ? 0.16 : 0.12,
            sustain: stac ? 0.45 : (puls ? 0.62 : 0.85),
            release: stac ? 0.08 : (puls ? 0.11 : 0.16)
        }
    };
}

// Accordéon des Balkans : deux jeux d'anches désaccordés ; la ligne (art 'mel') peut être doublée à l'octave inférieure.
function accordionNotes(env, e, time, beatSec) {
    const rand = randOf(env);
    const run = e.art === 'run' || e.art === 'mel';
    const vel = e.vel * (0.94 + rand() * 0.12);
    const base = Math.min(1.15, 0.3 + 0.9 * vel);
    const dur = Math.max(0.05, e.dur * beatSec);
    const n = e.intervals.length;
    const ivs = (e.art === 'mel' && e.oct) ? e.intervals.concat(e.intervals.map(x => x - 12)) : e.intervals;
    const notes = [];
    [-9, 9].forEach((cents, k) => {
        ivs.forEach((iv, idx) => {
            const noteStr = playNoteName(env.instrumentKey, e.rootIndex || 0, iv, OCT);
            const tilt = idx >= n ? 0.5 : ((n > 1 && idx === n - 1) ? 1.08 : (e.art === 'mel' ? 1.1 : 0.94));   // la voix aiguë chante un peu plus
            const when = Math.max(env.currentTime, time + idx * 0.004 + k * 0.002 + rand() * 0.004);
            notes.push({
                noteStr, when,
                opts: {
                    duration: dur, gain: base * tilt * 0.6, attack: run ? 0.006 : 0.012, release: run ? 0.05 : 0.07,
                    cents: cents + (rand() - 0.5) * 3
                }
            });
        });
    });
    return notes;
}

// Tango nuevo : bandonéon, violon, guitare électrique (attaque / release selon l'articulation).
const PZ_ART = {
    bandoneon: { stab: [0.008, 0.05], line: [0.03, 0.09], sus: [0.07, 0.16], grace: [0.004, 0.03], lyr: [0.11, 0.24] },
    violin:    { stab: [0.01, 0.06],  line: [0.045, 0.12], sus: [0.1, 0.22], grace: [0.01, 0.04], lyr: [0.14, 0.3] },
    guitar:    { stab: [0.002, 0.1],  line: [0.003, 0.18], sus: [0.004, 0.45], grace: [0.002, 0.05], lyr: [0.01, 0.55] }
};
const PZ_SCALE = { bandoneon: 0.8, violin: 0.85, guitar: 0.85 };
function piazzollaNotes(env, e, time, beatSec, who) {
    const rand = randOf(env);
    const [att, rel] = PZ_ART[who][e.art] || PZ_ART[who].line;
    const SCALE = PZ_SCALE[who];
    const vel = e.vel * (0.94 + rand() * 0.12);
    const base = Math.min(1.15, 0.3 + 0.9 * vel) * SCALE;
    const dur = Math.max(0.06, e.dur * beatSec);
    const n = e.intervals.length;
    const layers = who === 'bandoneon' ? [-8, 8] : [0];          // bandonéon : deux jeux d'anches légèrement désaccordés
    const notes = [];
    layers.forEach((cents, k) => {
        e.intervals.forEach((iv, idx) => {
            const noteStr = playNoteName(env.instrumentKey, e.rootIndex || 0, iv, OCT);
            const tilt = (n > 1 && idx === n - 1) ? 1.08 : (n > 1 ? 0.92 : 1);   // la voix aiguë chante un peu plus
            const when = Math.max(env.currentTime, time + idx * 0.004 + k * 0.002 + rand() * 0.004);
            notes.push({
                noteStr, when,
                opts: {
                    duration: dur, gain: base * tilt * (layers.length > 1 ? 0.75 : 1), attack: att, release: rel,
                    cents: cents + (rand() - 0.5) * 4
                }
            });
        });
    });
    return notes;
}

// Contrebasse à l'archet (tango) ; dur et vel sont déjà calculés par le moteur.
function arcoNote(env, abs, time, dur, vel) {
    return {
        noteStr: playNoteName(env.instrumentKey, abs, 0, OCT - 1),
        when: Math.max(env.currentTime, time),
        opts: { duration: dur, attack: 0.07, release: 0.25, gain: Math.min(1.05, 0.5 + 0.5 * vel) * env.bassVolume }
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { playNoteName, bassNote, pianoNotes, guitarNotes, brassNotes, tubaNote, accordionNotes, piazzollaNotes, arcoNote };
}
