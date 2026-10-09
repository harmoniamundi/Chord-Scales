// band/balkan-plan.js — orchestre des Balkans de la jam : accordéon (accords en triades, ligne détachée),
// basse, tapan / daire / darbuka (kolo 2/4, čoček et aksak 9/8). Chargé par index.html via
// <script src="band/balkan-plan.js"> (après band-helpers.js) et testé par band/balkan-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm         tempo courant
//   env.state       mémoire entre deux mesures, modifiée en place : { balkanVoice, balkanMel }
//                   (renversement de l'accordéon et dernière note de la ligne détachée)

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band-helpers.js).
if (typeof popRun === 'undefined' && typeof require === 'function') {
    var { popRun, popScaleNotes, popBassTones, popBassApproach } = require('./band-helpers.js');
}

// ===================== Orchestration BALKANS =====================
// Un petit ensemble de danse des Balkans : accordéon (accords en triades, jeu « musette » à anches légèrement désaccordées),
// basse, et percussions : tapan et daire pour le kolo (2/4), darbuka pour le čoček / l'aksak (9/8, 2+2+2+3).
// Tout part des groupes de croches de la mesure : 2/4 = 2+2, 9/8 = 2+2+2+3, 6/8 = 3+3, 12/8 = 3+3+3+3, 3/4 et 4/4 = 2+2…
//  - « oom-pah » (binaire) : la basse sur les temps forts, l'accord sur les temps faibles, comme une polka lente ;
//  - « drive » : la basse sur chaque début de groupe, l'accord sur les croches qui suivent (contretemps) ;
// la dernière mesure d'une cellule annonce l'accord suivant par une note d'approche à la basse, une petite phrase rapide de
// l'accordéon (dans la gamme de l'accord, donc hijaz sur la dominante) et un roulement de percussions.

// Voicing de l'accordéon (main droite) : triade, hauteurs écrites, renversement le plus proche du précédent.
function balkanVoicing(env, cs, prev) {
    const off = env.transOffset;
    const t = env.findChordObj(cs.chordId).notes;
    const third = t[1] !== undefined ? t[1] : 4;
    const fifth = (third === 3 && t.includes(6)) ? 6 : 7;
    const pcs = [0, third, fifth].map(x => (((cs.rootIndex + x) % 12) + 12) % 12);
    const LO = 5 - off, HI = 21 - off, centre = 12 - off;   // fa3 à la4 réels environ
    let best = null, bestCost = Infinity;
    for (let r = 0; r < 3; r++) {
        const order = pcs.slice(r).concat(pcs.slice(0, r));
        for (let oct = 0; oct <= 12; oct += 12) {
            let cur = LO + ((((order[0] - LO) % 12) + 12) % 12) + oct;
            const v = [cur];
            for (let k = 1; k < 3; k++) { cur += ((((order[k] - cur) % 12) + 12) % 12) || 12; v.push(cur); }
            if (v[2] > HI + 3) continue;
            let c = 0.35 * Math.abs((v[0] + v[1] + v[2]) / 3 - centre) + Math.max(0, v[2] - HI) * 2;
            if (prev && prev.length) for (let j = 0; j < 3; j++) c += Math.abs(v[2 - j] - prev[prev.length - 1 - j]);
            if (c < bestCost - 1e-9) { bestCost = c; best = v; }
        }
    }
    return best || [LO, LO + 4, LO + 7];
}

function balkanPhraseExtras(rng, prev, index) {
    const pl = (prev && prev.style === 'balkan') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.4 + rng() * 0.15 : prevI + (0.7 - prevI) * 0.22 + (rng() - 0.5) * 0.45;
    I = Math.max(0.28, Math.min(0.98, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    return {
        intensity: I,
        feel: rng() < (I < 0.55 ? 0.4 : 0.12) ? 'oompah' : 'drive',   // oom-pah (binaire seulement) ou contretemps
        percIdx: Math.floor(rng() * 3),
        darIdx: Math.floor(rng() * 2),
        bassIdx: Math.floor(rng() * 3),
        fill: rng() < 0.75,
        run: rng() < 0.6,        // phrase rapide de l'accordéon en fin de cellule
        daire: rng() < 0.55,
        // ligne détachée de l'accordéon : 0 = accords seuls, 1 = une mesure sur deux (rythmes clairsemés), 2 = presque partout
        mel: pickW(I < 0.45 ? [[0, 1], [1, 3], [2, 1.5]] : [[0, 0.5], [1, 2], [2, 3]]),
        melSeed: rng(),
        melSteps: Array.from({ length: 8 }, () => pickW([[0, 2], [1, 3], [-1, 3], [2, 1.4], [-2, 1.4], [3, 0.4], [-3, 0.4]])),  // contour (degrés de la gamme)
        orn: rng() < 0.45,       // petites notes d'agrément (appoggiatures) sur les débuts de groupe
        oct: rng() < 0.4         // notes doublées à l'octave inférieure
    };
}

function buildBalkanPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const eps = 1e-6;
    const spe = ternary ? 3 : 2;                                  // croches par pulsation
    const E = bpb * spe;                                          // croches dans la mesure
    const aksak = ternary && bpb === 3;                           // 9/8 : 2+2+2+3
    const groups = ternary ? (aksak ? [2, 2, 2, 3] : Array(bpb).fill(3)) : Array(bpb).fill(2);
    const gs = []; { let a = 0; groups.forEach(g => { gs.push(a); a += g; }); }
    const P = (e) => e / spe;                                     // position (en pulsations) de la croche e
    const kolo = !ternary && bpb === 2;
    const feel = (!ternary && ph.feel === 'oompah') ? 'oompah' : 'drive';
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const prog = L > 1 ? i / (L - 1) : 0;
    const dyn = (0.74 + 0.28 * I) * (0.92 + 0.08 * prog);
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    const piano = [], bass = [], drums = [];

    // ---- allègement de l'accordéon quand le tempo monte (lisibilité à l'oreille) ----
    // Vitesse = croches par seconde (le BPM compte la noire en binaire, la noire pointée en ternaire / 9/8). Au tempo habituel
    // (kolo 2/4 ≈ 128 : 4,3 croches/s ; 9/8 ≈ 100 : 5 croches/s) rien ne change ; au-delà de 5 croches/s l'accordéon se dépouille
    // progressivement (thin 0 → 1 entre 5 et 8 croches/s) : plus de doubles croches dans la ligne, phrase de fin plus courte puis
    // supprimée, plus d'appoggiatures ni de doublage à l'octave, contretemps réduits, ligne détachée moins présente.
    const eighthsPerSec = (env.bpm || 120) * spe / 60;
    const thin = Math.max(0, Math.min(1, (eighthsPerSec - 5) / 3));
    const melMode = (thin > 0.85 && ph.mel === 2) ? 1 : ph.mel;

    // ---- conduite des voix de l'accordéon ----
    const cache = {};
    let lastV = env.state.balkanVoice ? env.state.balkanVoice.v : null;
    let lastKey = env.state.balkanVoice ? env.state.balkanVoice.key : null;
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        const v = (env.state.balkanVoice && env.state.balkanVoice.key === key) ? env.state.balkanVoice.v : balkanVoicing(env, cs, lastV);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const Vs = segs.map(sg => voiceFor(sg.cs));
    const nextV = changeNext ? voiceFor(nextStep) : null;
    env.state.balkanVoice = lastKey ? { key: lastKey, v: lastV } : null;

    // ---- phrase rapide de fin de cellule (dans la gamme du dernier accord, vers l'accord suivant) ----
    const runFrom = bpb - 1;
    const nRun = thin > 0.35 ? spe : (ternary ? 6 : 4);          // très rapide : croches au lieu de doubles croches
    let runNotes = [];
    if (isTurn && L > 1 && changeNext && ph.run && thin < 0.8 && nextV) {
        const lv = Vs[Vs.length - 1];
        runNotes = popRun(env, lastSeg.cs, lv[lv.length - 1], nextV[nextV.length - 1], nRun);
    }
    const run = runNotes.length === nRun;
    runNotes.forEach((x, k) => piano.push({
        pos: runFrom + k / nRun, dur: 0.85 / nRun, vel: clampV((0.5 + 0.32 * k / (nRun - 1)) * dyn),
        rootIndex: 0, intervals: [x], art: 'run'
    }));

    // ---- accordéon : ligne détachée (staccato) dans la gamme de l'accord ----
    // Le rythme est tiré par groupe de croches (une cellule pour les mesures paires, une autre pour les impaires : question /
    // réponse) ; la hauteur suit le contour de la phrase par degrés de la gamme (hijaz sur la dominante), toujours sur une note
    // d'accord au début d'un groupe, avec parfois une appoggiature et un doublage à l'octave.
    const csAt = (pos) => segs[segAt(pos)].cs;
    const melBar = melMode === 2 || (melMode === 1 && (i % 2 === 1 || rng() < 0.3));
    const melAt = new Set();
    if (melBar) {
        let sd = (Math.floor(ph.melSeed * 1e9) + (i % 2) * 7919) >>> 0;
        const mr = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        const pickR = (opts) => {
            const tot = opts.reduce((a, o) => a + o[1], 0);
            let r = mr() * tot;
            for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
            return opts[opts.length - 1][0];
        };
        const full = (melMode === 2 ? 1 : 0.45) * (1 - 0.4 * thin), sparse = (melMode === 2 ? 0.7 : 2.2) * (1 + 1.5 * thin);
        const fast = (I > 0.6 ? 1.4 : 0.8) * Math.max(0, 1 - 1.25 * thin);    // poids des cellules à contretemps de croche (0,5 / 1,5)
        const OPT2 = [[[0, 1], 3 * full], [[0, 0.5, 1], 1.5 * fast * full], [[0, 1, 1.5], 1.3 * fast * full], [[0], 1.5 * sparse], [[1], 0.8 * sparse]];
        const OPT3 = [[[0, 1, 2], 3 * full], [[0, 0.5, 1, 2], 1.4 * fast * full], [[0, 1, 1.5, 2], 1.4 * fast * full], [[0, 2], 1.6 * sparse],
            [[0, 1], 1 * sparse], [[0, 0.5, 1, 1.5, 2], 0.8 * fast * full]];
        const cells = [];
        groups.forEach((g, gi) => pickR(g === 3 ? OPT3 : OPT2).forEach(o => cells.push(gs[gi] + o)));
        const off = env.transOffset;
        const lo = 12 - off, hi = 26 - off;                       // do4 à ré5 réels environ
        let prevX = env.state.balkanMel;
        const list = cells.sort((a, b) => a - b).filter(e => !(run && P(e) >= runFrom - eps));
        const notes = [];
        list.forEach((e, k) => {
            const pos = P(e);
            const cs = csAt(pos);
            const S = popScaleNotes(cs, lo, hi);
            if (S.length < 4) return;
            const t = env.findChordObj(cs.chordId).notes;
            const ct = new Set([0, t[1] !== undefined ? t[1] : 4, (t[1] === 3 && t.includes(6)) ? 6 : 7].map(x => (((cs.rootIndex + x) % 12) + 12) % 12));
            const isCT = (x) => ct.has(((x % 12) + 12) % 12);
            const near = (x) => S.reduce((b, n, j) => Math.abs(n - x) < Math.abs(S[b] - x) ? j : b, 0);
            let idx;
            if (prevX === null || prevX === undefined) idx = near(19 - off);
            else {
                let st = ph.melSteps[(k + (i % 2) * 3) % ph.melSteps.length];
                if (prevX > hi - 4 && st > 0) st = -st;
                if (prevX < lo + 4 && st < 0) st = -st;
                idx = near(prevX) + st;
            }
            idx = Math.max(0, Math.min(S.length - 1, idx));
            const strong = Number.isInteger(e) && gs.includes(e);
            if (strong && !isCT(S[idx])) for (const d of [1, -1, 2, -2]) { const j = idx + d; if (S[j] !== undefined && isCT(S[j])) { idx = j; break; } }
            prevX = S[idx];
            notes.push({ pos, x: S[idx], S, idx, strong });
        });
        env.state.balkanMel = prevX;
        notes.forEach((n, k) => {
            const nextPos = k + 1 < notes.length ? notes[k + 1].pos : bpb;
            const dur = Math.max(0.12 / spe, Math.min(0.5 / spe, (nextPos - n.pos) * 0.62));   // détaché
            piano.push({ pos: n.pos, dur, vel: clampV(((n.strong ? 0.78 : 0.64) + 0.1 * I) * dyn), rootIndex: 0, intervals: [n.x], art: 'mel', oct: ph.oct && thin < 0.6 });
            melAt.add(Math.round(n.pos * 1000));
            if (ph.orn && thin < 0.3 && n.strong && n.pos > 0.2 && mr() < 0.5 && n.S[n.idx + 1] !== undefined) {
                piano.push({ pos: n.pos - 0.16 / spe, dur: 0.12 / spe, vel: clampV(0.5 * dyn), rootIndex: 0, intervals: [n.S[n.idx + 1]], art: 'mel', oct: false });
            }
        });
    }

    // ---- accordéon : accords courts (plus rares quand la ligne détachée joue) ----
    const chord = (pos, dur, vel) => {
        if (run && pos >= runFrom - eps) return;
        piano.push({ pos, dur, vel: clampV(vel * dyn), rootIndex: 0, intervals: Vs[segAt(pos)], art: 'pah' });
    };
    groups.forEach((g, gi) => {
        if (feel === 'oompah') {
            if (gi % 2 === 1) chord(P(gs[gi]), 0.5, melBar ? 0.62 : 0.74);       // l'accord remplace la basse sur le temps faible
        } else {
            for (let k = 1; k < g; k++) {
                const last = k === g - 1;
                if ((melBar || thin > 0.5) && !last) continue;                    // sous la ligne détachée (ou si c'est rapide) : seulement le contretemps de fin de groupe
                chord(P(gs[gi] + k), 0.6 / spe, ((last ? 0.72 : 0.6) + 0.08 * I) * (melBar ? 0.85 : 1));
            }
        }
    });

    // ---- basse : fondamentale / quinte sur les débuts de groupe, note d'approche vers l'accord suivant ----
    const PATS = [[0, 1], [0, 0, 1, 1], [0, 1, 0, 2]];            // 0 fondamentale, 1 quinte, 2 tierce
    const pat = PATS[ph.bassIdx % PATS.length];
    segs.forEach((sg, si) => {
        const T = popBassTones(env, sg.cs);
        const tone = [T.root, T.fifth, T.third];
        const lastHere = si === segs.length - 1;
        const nxt = lastHere ? (changeNext ? nextStep : null) : segs[si + 1].cs;
        let n = 0;
        groups.forEach((g, gi) => {
            const pos = P(gs[gi]);
            if (pos < sg.s - eps || pos >= sg.e - eps) return;
            if (feel === 'oompah' && gi % 2 === 1) return;
            const a = tone[pat[n % pat.length]];
            const first = gi === 0;
            bass.push({ pos, abs: a, dur: (feel === 'oompah' ? 0.85 : 0.72 * g / spe), vel: clampV((first ? 0.9 : 0.74) * (0.85 + 0.2 * I)) });
            n++;
        });
        if (lastHere && nxt && (isTurn ? 0.85 : 0.3) > rng()) {
            // note d'approche sur la dernière croche : annonce l'accord suivant
            const apr = popBassApproach(env, T.root, nxt, rng);
            bass.push({ pos: P(E - 1), abs: apr, dur: 0.8 / spe, vel: clampV(0.7 * (0.85 + 0.2 * I)) });
        }
    });

    // ---- percussions ----
    const dr = (e, drum, vel, extra) => drums.push(Object.assign({ pos: P(e), drum, vel: Math.min(1, vel * (0.85 + 0.2 * I)) }, extra || {}));
    if (kolo) {
        // tapan (grosse caisse frappée à la mailloche) sur les temps, baguette fine sur les contretemps
        const TAP = [
            [[0, 'tapan', 1], [1, 'stick', 0.5], [2, 'tapan', 0.82], [3, 'stick', 0.55]],
            [[0, 'tapan', 1], [1, 'stick', 0.45], [2, 'stick', 0.5], [2.5, 'stick', 0.3], [3, 'stick', 0.6]],
            [[0, 'tapan', 1], [1, 'stick', 0.5], [2, 'tapan', 0.8], [3, 'stick', 0.5], [3.5, 'stick', 0.32]]
        ];
        TAP[ph.percIdx % TAP.length].forEach(([e, d, v]) => dr(e, d, v));
    } else if (aksak) {
        // darbuka : dum sur le 1er et le 3e groupe, tek sur les autres débuts de groupe, ka de remplissage
        const DAR = [
            [[0, 'dum', 1], [2, 'tek', 0.7], [3, 'ka', 0.4], [4, 'dum', 0.88], [6, 'tek', 0.75], [7, 'ka', 0.4], [8, 'tek', 0.62]],
            [[0, 'dum', 1], [1, 'ka', 0.33], [2, 'tek', 0.7], [4, 'dum', 0.85], [5, 'ka', 0.33], [6, 'tek', 0.72], [7, 'ka', 0.38], [8, 'tek', 0.55]]
        ];
        DAR[ph.darIdx % DAR.length].forEach(([e, d, v]) => dr(e, d, v));
        if (I > 0.62) [1, 5].forEach(e => dr(e + 0.5, 'ka', 0.28));
    } else if (ternary) {
        groups.forEach((g, gi) => { dr(gs[gi], 'dum', gi % 2 === 0 ? 1 : 0.7); dr(gs[gi] + 1, 'ka', 0.35); dr(gs[gi] + 2, 'tek', 0.62); });
    } else {
        groups.forEach((g, gi) => {
            dr(gs[gi], gi % 2 === 0 ? 'tapan' : 'stick', gi % 2 === 0 ? (gi === 0 ? 1 : 0.8) : 0.55);
            if (I > 0.5) dr(gs[gi] + 1, 'stick', 0.3);
        });
    }
    // daire (tambour sur cadre à cymbalettes) : frémissement continu en croches
    if (ph.daire && I > 0.4) for (let e = 0; e < E; e++) dr(e, 'daire', gs.includes(e) ? 0.38 : 0.22);
    // roulement avant l'accord suivant
    if (isTurn && L > 1 && ph.fill) {
        const keep = drums.filter(d => d.pos < runFrom - eps || d.drum === 'daire');
        drums.length = 0; keep.forEach(d => drums.push(d));
        for (let k = 0; k < nRun; k++) {
            const d = kolo ? 'stick' : (k % 2 ? 'tek' : 'ka');
            drums.push({ pos: runFrom + k / nRun, drum: d, vel: Math.min(1, 0.3 + 0.55 * k / (nRun - 1)) });
        }
    }

    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums, accordion: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { balkanVoicing, balkanPhraseExtras, buildBalkanPlan };
}
