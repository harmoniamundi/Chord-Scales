// band/cumbia-plan.js — orchestre de la cumbia colombienne de la jam : accordéon (mélodie question / réponse, contre-temps
// d'accords), basse électrique, et percussions de cumbia (guacharaca, llamador, tambora, tambor alegre, maracas).
// Chargé par index.html via <script src="band/cumbia-plan.js"> (après band-helpers.js) et testé par band/cumbia-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm         tempo courant
//   env.state       mémoire entre deux mesures, modifiée en place : { cumbiaVoice, cumbiaMel }
//                   (renversement de l'accordéon et dernière note de la mélodie)
// buildCumbiaPlan renvoie { piano, bass, drums, accordion: true } (« piano » = l'accordéon, comme pour les Balkans).

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof popRun === 'undefined' && typeof require === 'function') {
    var { popRun, popScaleNotes, popBassApproach, latBassTones } = require('./band-helpers.js');
}

// ===================== Orchestration CUMBIA =====================
// La cumbia colombienne se sent en 4/4 (écrite en 2/4 ou 2/2) à 85-110 à la noire. Son squelette :
//  - guacharaca (râpe en bois) : « chu-chucu-chu » continu : un coup sur chaque temps, puis deux petits coups sur le « et » et le
//    « a » (doubles croches), le tout légèrement accentué sur les temps 1 et 3 ;
//  - llamador (le tambour « qui appelle ») : étouffé sur les temps 1 et 3, ouvert sur les temps 2 et 4 (le contretemps de la danse) ;
//  - tambora (grosse caisse à deux peaux) : coup grave sur 1 et 3, claquements de baguettes sur le bois (« palos ») aux contretemps ;
//  - tambor alegre (le tambour qui « parle ») : réponses syncopées, plus denses quand l'énergie monte ; maracas en croches ;
//  - basse : fondamentale sur 1 et 3, quinte anticipée sur le « et » de 2 et de 4 (aussi tierce, octave et quinte grave), notes
//    courtes ; une note d'approche annonce l'accord suivant ;
//  - accordéon : mélodie en phrases de deux mesures (la question se pose sur la tierce ou la quinte, la réponse retombe sur la
//    fondamentale), souvent doublée à la tierce inférieure comme dans la cumbia et le vallenato ; les accords tombent en
//    contretemps (« ta-ka ») sous les silences de la mélodie ;
//  - la fin d'une phrase qui change d'accord est annoncée par une petite gamme rapide de l'accordéon et un roulement d'alegre.
// Tout est écrit en positions de temps (noire = 1) : la grille tient en 4 temps, et se tronque pour 2/4 et 3/4. Les mesures
// composées (6/8, 9/8, 12/8) reçoivent une version simplifiée (pulsation = noire pointée).

// Voicing de l'accordéon (main droite) : triade (quatre sons pour une dominante), renversement le plus proche du précédent.
function cumbiaVoicing(env, cs, prev) {
    const off = env.transOffset;
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    const third = t[1] !== undefined ? t[1] - r0 : 4;
    let fifth = t[2] !== undefined ? t[2] - r0 : 7;
    if (third === 3 && t.includes(r0 + 6)) fifth = 6;
    const rel = [0, third, fifth];
    if (t.length >= 4 && (t[3] - r0 === 10 || t[3] - r0 === 11 || t[3] - r0 === 9)) rel.push(t[3] - r0);
    const pcs = rel.map(x => (((cs.rootIndex + r0 + x) % 12) + 12) % 12);
    const n = pcs.length;
    const LO = 5 - off, HI = 21 - off, centre = 12 - off;   // fa3 à la4 réels environ
    let best = null, bestCost = Infinity;
    for (let r = 0; r < n; r++) {
        const order = pcs.slice(r).concat(pcs.slice(0, r));
        for (let oct = 0; oct <= 12; oct += 12) {
            let cur = LO + ((((order[0] - LO) % 12) + 12) % 12) + oct;
            const v = [cur];
            for (let k = 1; k < n; k++) { cur += ((((order[k] - cur) % 12) + 12) % 12) || 12; v.push(cur); }
            if (v[n - 1] > HI + 3) continue;
            let c = 0.35 * Math.abs(v.reduce((a, x) => a + x, 0) / n - centre) + Math.max(0, v[n - 1] - HI) * 2;
            if (prev && prev.length) for (let j = 0; j < Math.min(n, prev.length); j++) c += Math.abs(v[n - 1 - j] - prev[prev.length - 1 - j]);
            if (c < bestCost - 1e-9) { bestCost = c; best = v; }
        }
    }
    return best || [LO, LO + 4, LO + 7];
}

// Cellules de rythme de la mélodie sur un demi-mesure (2 temps) : positions en temps depuis le début de la demi-mesure.
// d = densité à laquelle la cellule convient le mieux (0 clairsemé, 1 chargé).
const CUMBIA_MEL_CELLS = [
    { c: [0, 1],            w: 1.6, d: 0.2 },    // deux noires
    { c: [0, 0.5, 1],       w: 2.2, d: 0.4 },    // croche, croche, noire
    { c: [0, 1, 1.5],       w: 2.0, d: 0.5 },    // noire, croche, croche
    { c: [0, 0.5, 1, 1.5],  w: 1.6, d: 0.6 },    // quatre croches
    { c: [0, 1.5],          w: 1.2, d: 0.3 },    // noire pointée, croche
    { c: [0.5, 1, 1.5],     w: 1.4, d: 0.55 },   // part sur le contretemps
    { c: [0, 0.5, 0.75, 1], w: 1.0, d: 0.8 },    // avec deux doubles croches
    { c: [0, 0.75, 1.5],    w: 1.0, d: 0.6 },    // 3 + 3 + 2 doubles croches : l'appui qui boite
    { c: [0],               w: 0.8, d: 0.1 },    // une note longue
    { c: [1.5],             w: 0.7, d: 0.2 }     // levée
];
// Cadences de demi-mesure (la mélodie se pose) : peu de notes, la dernière dure.
const CUMBIA_MEL_CADENCE = [
    { c: [0, 1],      w: 2.4, d: 0.3 },
    { c: [0, 0.5, 1], w: 2.0, d: 0.5 },
    { c: [0],         w: 1.4, d: 0.1 },
    { c: [0, 1.5],    w: 1.4, d: 0.4 },
    { c: [0.5, 1],    w: 0.8, d: 0.4 }
];

// Basse : [temps, degré, durée, vélocité]. R fondamentale, F quinte, f quinte grave (sous la fondamentale), T tierce, O octave.
const CUMBIA_BASS = [
    { d: 0.2, hits: [[0, 'R', 0.9, 0.9], [1, 'F', 0.9, 0.74], [2, 'R', 0.9, 0.86], [3, 'F', 0.9, 0.74]] },                                          // noires R - F
    { d: 0.4, hits: [[0, 'R', 1.0, 0.9], [1.5, 'F', 0.5, 0.72], [2, 'R', 1.0, 0.88], [3.5, 'F', 0.5, 0.74]] },                                     // tumbao : quinte anticipée sur le « et »
    { d: 0.5, hits: [[0, 'R', 0.9, 0.9], [1, 'T', 0.45, 0.58], [1.5, 'F', 0.45, 0.72], [2, 'R', 0.9, 0.86], [3, 'T', 0.45, 0.58], [3.5, 'F', 0.45, 0.74]] },  // R - T - F
    { d: 0.55, hits: [[0, 'R', 0.9, 0.9], [1.5, 'f', 0.5, 0.74], [2, 'R', 0.9, 0.86], [3, 'O', 0.45, 0.62], [3.5, 'F', 0.45, 0.72]] },            // quinte grave, octave
    { d: 0.75, hits: [[0, 'R', 0.5, 0.9], [0.5, 'R', 0.4, 0.52], [1.5, 'F', 0.5, 0.74], [2, 'R', 0.9, 0.86], [3, 'T', 0.45, 0.6], [3.5, 'F', 0.45, 0.72]] }, // avec croche répétée
    { d: 0.9, hits: [[0, 'R', 0.5, 0.9], [0.5, 'R', 0.4, 0.5], [1, 'O', 0.4, 0.6], [1.5, 'F', 0.45, 0.74], [2, 'R', 0.5, 0.86], [3, 'f', 0.45, 0.66], [3.5, 'F', 0.45, 0.74]] }
];

// Contretemps d'accords de l'accordéon : [temps, vélocité, durée].
const CUMBIA_CHOP = [
    [[0.5, 0.6, 0.3], [1.5, 0.7, 0.3], [2.5, 0.6, 0.3], [3.5, 0.72, 0.3]],                                                                          // « ta-ka » sur tous les contretemps
    [[0, 0.62, 0.4], [0.5, 0.5, 0.25], [1.5, 0.7, 0.3], [2, 0.58, 0.4], [2.5, 0.5, 0.25], [3.5, 0.72, 0.3]],                                       // appuis + contretemps
    [[0.5, 0.58, 0.25], [1, 0.46, 0.2], [1.5, 0.66, 0.3], [2.5, 0.58, 0.25], [3, 0.46, 0.2], [3.5, 0.68, 0.3]]                                      // « tac-ta-ka »
];
// Mêmes contretemps allégés (sous la mélodie) : seuls restent le « et » de 2 et de 4.
const CUMBIA_CHOP_SPARSE = [[1.5, 0.66, 0.3], [3.5, 0.7, 0.3]];

// Tambora : coups graves ('tamb') et baguettes sur le bois ('palo').
const CUMBIA_TAMB = [
    [[0, 'tamb', 0.95], [1.5, 'palo', 0.5], [2, 'tamb', 0.8], [3.5, 'palo', 0.52]],
    [[0, 'tamb', 0.95], [0.5, 'palo', 0.34], [1.5, 'palo', 0.5], [2, 'tamb', 0.8], [2.5, 'palo', 0.34], [3.5, 'palo', 0.55]],
    [[0, 'tamb', 0.95], [1.5, 'tamb', 0.5], [2, 'tamb', 0.8], [3.5, 'palo', 0.55], [3.75, 'palo', 0.34]]
];
// Tambor alegre (réponses sur conga1 / conga2 / slap).
const CUMBIA_ALEGRE = [
    [[1.5, 'conga1', 0.55], [3.5, 'slap', 0.5]],
    [[0.5, 'conga1', 0.3], [1.5, 'conga2', 0.55], [2.5, 'conga1', 0.3], [3.5, 'slap', 0.5]],
    [[1.5, 'conga1', 0.55], [2.5, 'slap', 0.5], [3, 'conga1', 0.45], [3.5, 'conga1', 0.6]],
    [[0, 'conga2', 0.5], [0.5, 'slap', 0.45], [1, 'conga2', 0.5], [1.5, 'conga1', 0.6], [2, 'conga2', 0.5], [2.5, 'slap', 0.45], [3, 'conga2', 0.5], [3.5, 'conga1', 0.6]]
];

function cumbiaPhraseExtras(rng, prev, index) {
    const pl = (prev && prev.style === 'cumbia') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.42 + rng() * 0.15 : prevI + (0.66 - prevI) * 0.25 + (rng() - 0.5) * 0.4;
    I = Math.max(0.28, Math.min(0.98, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs((c.d !== undefined ? c.d : k / Math.max(1, list.length - 1)) - I) * 2)]));
    return {
        intensity: I,
        bassIdx: byDensity(CUMBIA_BASS),
        bassAlt: Math.floor(rng() * CUMBIA_BASS.length),
        chopIdx: pickW(I < 0.45 ? [[0, 3], [1, 1], [2, 1]] : [[0, 2], [1, 2], [2, 2]]),
        tambIdx: Math.floor(rng() * CUMBIA_TAMB.length),
        alegIdx: byDensity(CUMBIA_ALEGRE.map((c, k) => ({ d: [0.25, 0.45, 0.65, 0.9][k] }))),
        alegre: I > 0.38 && rng() < 0.85,
        guacGhost: rng() < 0.3 + 0.35 * I,       // petite note fantôme sur la 2e double croche de certains temps
        maracas: rng() < 0.6,
        // mélodie de l'accordéon : 0 = accords seuls, 1 = une mesure sur deux, 2 = presque partout
        mel: pickW(I < 0.45 ? [[0, 1], [1, 3], [2, 1.5]] : [[0, 0.4], [1, 2], [2, 3.2]]),
        melSeed: rng(),
        melSteps: Array.from({ length: 8 }, () => pickW([[0, 3.2], [1, 3], [-1, 3], [2, 1.2], [-2, 1.2], [3, 0.3], [-3, 0.3]])),
        thirds: rng() < 0.55,                     // mélodie doublée à la tierce inférieure
        fill: rng() < 0.75,
        run: rng() < 0.6                          // petite gamme rapide de l'accordéon avant un changement d'accord
    };
}

function buildCumbiaPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const eps = 1e-6;
    const par = i % 2;                                            // 0 = question, 1 = réponse
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const csAt = (pos) => segs[segAt(pos)].cs;
    const prog = L > 1 ? i / (L - 1) : 0;
    const dyn = (0.76 + 0.26 * I) * (0.93 + 0.07 * prog);
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    const piano = [], bass = [], drums = [];
    const pulse = ternary ? 3 : 2;                                // croches par temps
    // Positions : le plan est écrit en temps « de noire » ; en mesure composée, le « et » (0,5) devient le dernier tiers du temps.
    const P = (pos) => {
        if (!ternary) return pos;
        const b = Math.floor(pos + eps), f = pos - b;
        if (Math.abs(f) < eps || Math.abs(f - 1 / 3) < 1e-4 || Math.abs(f - 2 / 3) < 1e-4) return pos;   // déjà sur une croche du temps
        return b + (f < 0.4 ? 1 / 6 : f < 0.62 ? 2 / 3 : 5 / 6);
    };
    const inBar = (pos) => pos < bpb - eps;

    // ---- conduite des voix de l'accordéon ----
    const cache = {};
    let lastV = env.state.cumbiaVoice ? env.state.cumbiaVoice.v : null;
    let lastKey = env.state.cumbiaVoice ? env.state.cumbiaVoice.key : null;
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        const v = (env.state.cumbiaVoice && env.state.cumbiaVoice.key === key) ? env.state.cumbiaVoice.v : cumbiaVoicing(env, cs, lastV);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const Vs = segs.map(sg => voiceFor(sg.cs));
    const nextV = changeNext ? voiceFor(nextStep) : null;
    env.state.cumbiaVoice = lastKey ? { key: lastKey, v: lastV } : null;

    // ---- petite gamme rapide de fin de phrase (vers l'accord suivant) ----
    const runFrom = bpb - 1;
    const nRun = ternary ? 3 : 4;
    let runNotes = [];
    if (isTurn && L > 1 && changeNext && ph.run && nextV) {
        const lv = Vs[Vs.length - 1];
        runNotes = popRun(env, lastSeg.cs, lv[lv.length - 1], nextV[nextV.length - 1], nRun);
    }
    const run = runNotes.length === nRun;
    runNotes.forEach((x, k) => piano.push({
        pos: runFrom + k / nRun, dur: 0.85 / nRun, vel: clampV((0.5 + 0.32 * k / (nRun - 1)) * dyn),
        rootIndex: 0, intervals: [x], art: 'run'
    }));

    // ---- accordéon : mélodie (question / réponse) ----
    // mode 1 : la phrase de deux mesures (question + réponse) joue une fois sur deux ; entre-temps l'accordéon n'accompagne que par ses accords
    const melBar = ph.mel === 2 || (ph.mel === 1 && Math.floor(i / 2) % 2 === 0);
    const melOn = [];                                              // temps d'attaque de la mélodie (pour alléger les accords)
    if (melBar) {
        // Le tirage de la mélodie est rejoué à l'identique pour les mêmes mesures de la phrase : une phrase de deux mesures
        // revient telle quelle, et change toutes les deux phrases (carrure de 4 mesures).
        let sd = (Math.floor(ph.melSeed * 1e9) + par * 7919 + (Math.floor(i / 2) % 2) * 1013) >>> 0;
        const mr = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        const pickCell = (list) => {
            const ws = list.map(c => c.w * (0.35 + 1.4 * Math.max(0, 1 - Math.abs(c.d - I) * 2)));
            const tot = ws.reduce((a, x) => a + x, 0);
            let r = mr() * tot;
            for (let k = 0; k < list.length; k++) { r -= ws[k]; if (r <= 0) return list[k].c; }
            return list[list.length - 1].c;
        };
        // demi-mesures : [début, longueur]
        const halvesOfBar = [];
        for (let b = 0; b < bpb; b += 2) halvesOfBar.push([b, Math.min(2, bpb - b)]);
        // la question est tirée avec la graine de la mesure paire : la réponse la reprend (une fois sur deux) puis cadence
        const qRng = (sd0) => { let s = sd0 >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
        const qCell = (k) => { // k-ième cellule de la question, rejouée à l'identique
            const sq = qRng((Math.floor(ph.melSeed * 1e9) + (Math.floor(i / 2) % 2) * 1013 + 31 * (k + 1)) >>> 0);
            const ws = CUMBIA_MEL_CELLS.map(c => c.w * (0.35 + 1.4 * Math.max(0, 1 - Math.abs(c.d - I) * 2)));
            const tot = ws.reduce((a, x) => a + x, 0);
            let r = sq() * tot;
            for (let z = 0; z < CUMBIA_MEL_CELLS.length; z++) { r -= ws[z]; if (r <= 0) return CUMBIA_MEL_CELLS[z].c; }
            return CUMBIA_MEL_CELLS[CUMBIA_MEL_CELLS.length - 1].c;
        };
        const repeatQ = mr() < 0.55;                               // la réponse reprend d'abord le motif de la question
        const onsets = [];                                         // { pos, strong, last }
        halvesOfBar.forEach(([h0, len], hi) => {
            const lastHalf = hi === halvesOfBar.length - 1;
            let cell;
            if (par === 0) cell = lastHalf && hi > 0 && mr() < 0.35 ? qCell(0) : qCell(hi);
            else cell = lastHalf ? pickCell(CUMBIA_MEL_CADENCE) : (repeatQ ? qCell(hi) : pickCell(CUMBIA_MEL_CELLS));
            cell.filter(c => c < len - eps).forEach((c, k, arr) => {
                const pos = h0 + c;
                onsets.push({ pos, strong: Number.isInteger(pos) && pos % 2 === 0, last: lastHalf && k === arr.length - 1 });
            });
        });
        const off = env.transOffset;
        const lo = 12 - off, hi = 26 - off;                        // do4 à ré5 réels environ
        let prevX = env.state.cumbiaMel;
        const notes = [];
        onsets.forEach((o, k) => {
            if (run && o.pos >= runFrom - eps) return;
            const cs = csAt(o.pos);
            const S = popScaleNotes(cs, lo, hi);
            if (S.length < 4) return;
            const t = env.findChordObj(cs.chordId).notes;
            const r0 = t[0] || 0;
            const tones = [0, t[1] !== undefined ? t[1] - r0 : 4, (t[1] !== undefined && t[1] - r0 === 3 && t.includes(r0 + 6)) ? 6 : (t[2] !== undefined ? t[2] - r0 : 7)]
                .map(x => (((cs.rootIndex + r0 + x) % 12) + 12) % 12);
            const isCT = (x) => tones.includes(((x % 12) + 12) % 12);
            const near = (x) => S.reduce((b, n, j) => Math.abs(n - x) < Math.abs(S[b] - x) ? j : b, 0);
            let idx;
            if (prevX === null || prevX === undefined) idx = near(19 - off);
            else {
                let st = ph.melSteps[(k + (par && !repeatQ ? 3 : 0)) % ph.melSteps.length];
                if (prevX > hi - 3 && st > 0) st = -st;
                if (prevX < lo + 3 && st < 0) st = -st;
                idx = near(prevX) + st;
            }
            idx = Math.max(0, Math.min(S.length - 1, idx));
            if (o.last) {
                // la question se pose sur la tierce ou la quinte, la réponse retombe sur la fondamentale
                const want = par === 0 ? [tones[1], tones[2]] : [tones[0]];
                let bj = -1;
                S.forEach((n, j) => { if (want.includes(((n % 12) + 12) % 12) && (bj < 0 || Math.abs(j - idx) < Math.abs(bj - idx))) bj = j; });
                if (bj >= 0) idx = bj;
            } else if (o.strong && !isCT(S[idx])) {
                for (const d of [1, -1, 2, -2]) { const j = idx + d; if (S[j] !== undefined && isCT(S[j])) { idx = j; break; } }
            }
            prevX = S[idx];
            notes.push({ pos: o.pos, S, idx, strong: o.strong, last: o.last });
        });
        env.state.cumbiaMel = prevX;
        notes.forEach((n, k) => {
            const nextPos = k + 1 < notes.length ? notes[k + 1].pos : bpb;
            let dur = Math.min(1.0, (nextPos - n.pos) * 0.82);
            if (n.last) dur = Math.min(1.5, bpb - n.pos - 0.08);
            dur = Math.max(0.12, dur);
            const low = ph.thirds ? n.S[n.idx - 2] : undefined;
            const iv = (low !== undefined && n.S[n.idx] - low >= 2 && n.S[n.idx] - low <= 5) ? [low, n.S[n.idx]] : [n.S[n.idx]];
            piano.push({ pos: P(n.pos), dur: ternary ? dur * 0.9 : dur, vel: clampV(((n.strong ? 0.8 : 0.66) + 0.1 * I) * dyn), rootIndex: 0, intervals: iv, art: 'mel', oct: false });
            melOn.push(n.pos);
        });
    }

    // ---- accordéon : contretemps d'accords ----
    const chopCell = melBar ? CUMBIA_CHOP_SPARSE : CUMBIA_CHOP[ph.chopIdx % CUMBIA_CHOP.length];
    const hitsAtChop = (ternary ? chopCell.filter(h => Number.isInteger(h[0] - 0.5)) : chopCell).filter(h => inBar(h[0]));
    hitsAtChop.forEach(([pos, vel, dur]) => {
        if (run && pos >= runFrom - eps) return;
        if (melOn.some(x => Math.abs(x - pos) < 0.2)) return;       // pas d'accord sur une attaque de la mélodie
        piano.push({ pos: P(pos), dur: ternary ? 0.28 : dur, vel: clampV(vel * dyn * (melBar ? 0.9 : 1)), rootIndex: 0, intervals: Vs[segAt(pos)], art: 'pah' });
    });
    // un accord à l'entrée de chaque moitié de mesure scindée, si rien n'y sonne
    if (halves && !piano.some(e => e.pos >= splitAt - eps && e.pos < splitAt + 0.5)) {
        piano.push({ pos: splitAt, dur: 0.4, vel: clampV(0.62 * dyn), rootIndex: 0, intervals: Vs[1], art: 'pah' });
    }

    // ---- basse ----
    {
        const cell = CUMBIA_BASS[((par === 1 && rng() < 0.5) ? ph.bassAlt : ph.bassIdx) % CUMBIA_BASS.length].hits;
        const tonesFor = segs.map(sg => latBassTones(env, sg.cs));
        const lowFifth = (T) => (T.root + env.transOffset - 5 >= -12) ? T.root - 5 : T.fifth;
        const aprPos = bpb - 0.5;
        const doApproach = changeNext && (isTurn ? 0.8 : 0.35) > rng();
        const hits = cell.filter(h => inBar(h[0]) && !(doApproach && h[0] >= aprPos - eps));
        segs.forEach(sg => {
            if (!hits.some(h => h[0] >= sg.s - eps && h[0] < Math.min(sg.e, sg.s + 0.75))) hits.push([sg.s, 'R', 0.9, 0.84]);
        });
        hits.sort((a, b) => a[0] - b[0]);
        hits.forEach(([pos, tok, d, v]) => {
            const T = tonesFor[segAt(pos)];
            const abs = tok === 'F' ? T.fifth : tok === 'T' ? T.third : tok === 'O' ? T.octave : tok === 'f' ? lowFifth(T) : T.root;
            bass.push({ pos: P(pos), abs, dur: d * (ternary ? 0.9 : 1), vel: clampV(v * (0.84 + 0.2 * I) * (0.92 + 0.08 * prog)), wide: true });
        });
        if (doApproach) {
            const T = tonesFor[tonesFor.length - 1];
            bass.push({ pos: P(aprPos), abs: popBassApproach(env, T.root, nextStep, rng), dur: 0.45, vel: clampV(0.7 * (0.85 + 0.2 * I)), wide: true });
        }
        bass.sort((a, b) => a.pos - b.pos);
        bass.forEach((b, k) => {
            const nx = bass[k + 1];
            const limit = nx ? nx.pos - b.pos + 0.02 : bpb - b.pos - 0.03;
            b.dur = Math.max(0.12, Math.min(b.dur, limit));
        });
    }

    // ---- percussions ----
    const dr = (pos, drum, vel) => {
        if (!inBar(pos)) return;
        drums.push({ pos: P(pos), drum, vel: Math.max(0.05, Math.min(1, vel * (0.85 + 0.2 * I))) });
    };
    const strongBeat = (b) => b % 2 === 0;
    // guacharaca : un coup descendant sur le temps, deux petits coups ascendants sur le « et » et le « a »
    for (let b = 0; b < bpb; b++) {
        dr(b, 'guacd', strongBeat(b) ? 0.62 : 0.5);
        if (ternary) {
            dr(b + 1 / 3, 'guacu', 0.26); dr(b + 2 / 3, 'guacu', 0.34);
            continue;
        }
        dr(b + 0.5, 'guacu', 0.3);
        dr(b + 0.75, 'guacu', strongBeat(b) ? 0.38 : 0.34);
        if (ph.guacGhost && (b === 1 || b === 3) && I > 0.45) dr(b + 0.25, 'guacu', 0.18);
    }
    // llamador : étouffé sur 1 et 3, ouvert sur 2 et 4
    for (let b = 0; b < bpb; b++) dr(b, strongBeat(b) ? 'llam' : 'llamo', strongBeat(b) ? 0.46 : 0.7);
    if (!ternary && bpb === 4 && I > 0.55 && par === 1) dr(3.5, 'llam', 0.3);
    // tambora
    if (ternary) {
        for (let b = 0; b < bpb; b += 2) dr(b, 'tamb', b === 0 ? 0.95 : 0.78);
        for (let b = 1; b < bpb; b += 2) dr(b + 2 / 3, 'palo', 0.5);
    } else {
        CUMBIA_TAMB[ph.tambIdx % CUMBIA_TAMB.length].forEach(([pos, d, v]) => dr(pos, d, v));
    }
    // tambor alegre et maracas
    if (!ternary && ph.alegre) CUMBIA_ALEGRE[ph.alegIdx % CUMBIA_ALEGRE.length].forEach(([pos, d, v]) => dr(pos, d, v * 0.9));
    if (ph.maracas) for (let e = 0; e < bpb * pulse; e++) dr(e / pulse, 'shaker', (e % pulse === 0 ? 0.26 : 0.17) * (0.8 + 0.3 * I));
    // roulement avant l'accord suivant
    if (isTurn && L > 1 && ph.fill) {
        const keep = drums.filter(d => d.pos < runFrom - eps || d.drum === 'guacd' || d.drum === 'guacu' || d.drum === 'shaker' || d.drum === 'llam' || d.drum === 'llamo' || d.drum === 'tamb');
        drums.length = 0; keep.forEach(d => drums.push(d));
        const seq = par === 0 ? ['conga1', 'conga2', 'slap', 'conga1'] : ['slap', 'conga1', 'conga2', 'slap'];
        for (let k = 0; k < nRun; k++) drums.push({ pos: runFrom + k / nRun, drum: seq[k % seq.length], vel: Math.min(1, 0.4 + 0.5 * k / (nRun - 1)) });
    }

    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums, accordion: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cumbiaVoicing, cumbiaPhraseExtras, buildCumbiaPlan, CUMBIA_MEL_CELLS, CUMBIA_BASS, CUMBIA_CHOP, CUMBIA_TAMB, CUMBIA_ALEGRE };
}
