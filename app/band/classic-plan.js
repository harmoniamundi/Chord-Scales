// band/classic-plan.js — orchestre « Classique » (piano seul : roulements, quartes de noires, arpèges mêlés, basse sous le motif)
// et mode « Arpèges » (bouton harpe), sans DOM. Fonctions pures :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.bpm        tempo (au-delà de 165, pas de croches continues)
//   env.ternary    mesure composée (mode Arpèges) ;  env.splitBeat  temps où change l'accord d'une mesure à deux accords
// Chargé par index.html via <script src="band/classic-plan.js"> (après band-patterns.js et band/band-helpers.js)
// et testé par band/classic-plan.test.js.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof clsVoicing === 'undefined' && typeof require === 'function') {
    var { clsVoicing, clsLowNote, clsMutate } = require('./band-helpers.js');
}
// Tables de motifs : globales en navigateur (band-patterns.js), à charger sous Node.
const CLASSIC_PAT = (typeof CLS_EIGHTS !== 'undefined') ? { CLS_EIGHTS, CLS_QUARTERS, CLS_MIXED, CLS_UPPER } : require('../band-patterns.js');
const { CLS_EIGHTS: CL_EIGHTS, CLS_QUARTERS: CL_QUARTERS, CLS_MIXED: CL_MIXED, CLS_UPPER: CL_UPPER } = CLASSIC_PAT;

// Choix faits une fois par phrase et gardés pendant toute la phrase : intensité, famille de motif, variantes.
function classicPhraseExtras(bpm, rng, prev, index) {
    const pl = (prev && prev.style === 'classic') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.35 + rng() * 0.2 : prevI + (0.55 - prevI) * 0.25 + (rng() - 0.5) * 0.45;
    I = Math.max(0.25, Math.min(0.9, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const fast = bpm > 165; // trop vite pour des croches continues
    let family;
    if (pl && pl.family && rng() < 0.45 && !(fast && (pl.family === 'roll' || pl.family === 'bassup'))) family = pl.family;
    else if (fast) family = pickW([['quarter', 3], ['blockarp', 2], ['mixed', 2]]);
    else if (I < 0.45) family = pickW([['quarter', 3], ['blockarp', 2], ['mixed', 1.5], ['roll', 1]]);
    else if (I < 0.7) family = pickW([['roll', 3], ['mixed', 2], ['bassup', 2], ['quarter', 1], ['blockarp', 1]]);
    else family = pickW([['roll', 3], ['bassup', 3], ['mixed', 1]]);
    const idx = (n) => Math.floor(rng() * n);
    return {
        intensity: I, family,
        eightIdx: idx(CL_EIGHTS.length), eightAlt: idx(CL_EIGHTS.length),
        quarterIdx: idx(CL_QUARTERS.length), quarterAlt: idx(CL_QUARTERS.length),
        mixedIdx: idx(CL_MIXED.length), mixedAlt: idx(CL_MIXED.length),
        upperIdx: idx(CL_UPPER.length), upperAlt: idx(CL_UPPER.length),
        bassLow: rng() < 0.45,       // une basse grave sous le motif
        blockOnOne: rng() < 0.35,    // accord doux sur le premier temps
        ending: idx(2),
        endingOn: rng() < 0.75
    };
}

// Plan d'une mesure du style Classique.
function buildClassicPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const fam = ph.family;
    const off = env.transOffset;
    const fast = env.bpm > 165;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.7 + 0.32 * I) * (0.94 + 0.06 * prog);
    const segs = halves
        ? [{ s: 0, e: 2, cs: halves[0] }, { s: 2, e: 4, cs: halves[1] }]
        : [{ s: 0, e: 4, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const holdOn = !(isLastMeasureOfStep && nextStep && !sameChord(lastSeg.cs, nextStep)) && !!nextStep; // même accord ensuite : ça résonne
    const ev = [];
    const clamp = (v) => Math.max(0.12, Math.min(1, v));

    segs.forEach((sg, si) => {
        const len = sg.e - sg.s;
        const V = clsVoicing(env, sg.cs, off);
        const n = V.length;
        if (!n) return;
        const note = (k) => k < n ? V[k] : V[k - n] + 12;
        const low = clsLowNote(env, sg.cs, off);
        const slash = Number.isInteger(sg.cs.bassRootIndex);
        const lastOne = si === segs.length - 1;
        const endPos = sg.e + ((lastOne && holdOn) ? 1.2 : 0.05); // fin de résonance
        const ring = (pos, max) => Math.max(0.2, Math.min(endPos - pos, max));
        const rel = (pos) => sg.s + pos;
        const push = (pos, max, notes, vel, roll) => {
            const sorted = notes.slice().sort((a, b) => a - b).filter((x, k, arr) => k === 0 || x !== arr[k - 1]);
            const c = sorted.length;
            ev.push({
                pos, dur: ring(pos, max), vel: clamp(vel * gv),
                rootIndex: 0, intervals: sorted,
                noteVels: sorted.map((_, k) => c === 1 ? 1 : (k === c - 1 ? 1 : (k === 0 ? 0.9 : 0.84))),
                roll: c > 1 ? (roll !== undefined ? roll : 0.012 + rng() * 0.012) : 0,
                lay: rng() * 0.008, wide: true, gainMul: 1.2 // piano seul : pas de basse ni de batterie, on compense le niveau
            });
        };
        const eightVel = (k, v) => (k === 0 ? 0.76 : (k % 4 === 0 ? 0.62 : (k % 2 === 0 ? 0.55 : 0.47))) + (v === n - 1 ? 0.05 : 0);
        const quarterVel = [0.76, 0.54, 0.64, 0.54];

        // ---------- demi-mesure (deux accords dans la mesure) ----------
        if (len < 4) {
            if (slash || (fam === 'bassup') || ph.bassLow) push(rel(0), 1.9, [low], 0.62);
            if (fam === 'blockarp') {
                push(rel(0), 1.5, V, 0.62);
                if (!fast) push(rel(1.5), 1, [note(n - 1)], 0.5);
            } else if (fam === 'quarter' || fast) {
                push(rel(0), 2, [note(0)], 0.74);
                push(rel(1), 1.4, [note(2)], 0.55);
            } else if (fam === 'mixed') {
                push(rel(0), 2, [note(0)], 0.74);
                push(rel(1), 1.4, [note(1)], 0.55);
                push(rel(1.5), 1.2, [note(2)], 0.5);
            } else {
                CL_EIGHTS[ph.eightIdx].slice(0, 4).forEach((v, k) => {
                    if (v === null) return;
                    push(rel(k * 0.5), 2, [note(v)], eightVel(k, v));
                });
            }
            return;
        }

        // ---------- mesure entière ----------
        // Basse sous le motif (toujours pour un accord sur basse)
        const bassFam = fam === 'bassup';
        if (slash || bassFam || (ph.bassLow && fam !== 'blockarp')) {
            push(rel(0), bassFam || slash ? 2 : 2.4, [low], bassFam ? 0.68 : 0.6);
            if (bassFam && (i % 2 === 1 || rng() < 0.4)) push(rel(2), 1.9, [low], 0.5);
        }

        const items = []; // { pos, v | block, vel, max }
        if (fam === 'roll') {
            const base = CL_EIGHTS[ph.eightIdx], alt = CL_EIGHTS[ph.eightAlt];
            let slots;
            if (i === 0) slots = base;
            else if (i === 1) slots = rng() < 0.5 ? base : alt;
            else slots = clsMutate(rng() < 0.5 ? alt : base, rng);
            slots.forEach((v, k) => { if (v !== null) items.push({ pos: k * 0.5, v, vel: eightVel(k, v), max: 2.1 }); });
        } else if (fam === 'quarter') {
            const pat = CL_QUARTERS[(i === 1 && rng() < 0.5) || i === 2 ? ph.quarterAlt : ph.quarterIdx];
            pat.forEach((v, k) => items.push({ pos: k, v, vel: quarterVel[k], max: 2.2 }));
        } else if (fam === 'mixed') {
            const pat = CL_MIXED[(i === 1 && rng() < 0.5) || i === 2 ? ph.mixedAlt : ph.mixedIdx];
            pat.forEach(([pos, v]) => items.push({ pos, v, vel: pos === 0 ? 0.76 : (Number.isInteger(pos) ? 0.6 : 0.5), max: 2.0 }));
        } else if (fam === 'bassup') {
            const up = CL_UPPER[i === 2 ? ph.upperAlt : ph.upperIdx];
            up.forEach((v, k) => items.push({ pos: 0.5 + k * 0.5, v, vel: (k % 2 === 1 ? 0.55 : 0.47) + (v === 3 ? 0.04 : 0), max: 1.9 }));
        } else { // blockarp : accord doux sur le 1, puis arpège sur les temps 3-4
            items.push({ pos: 0, block: true, vel: 0.62, max: 1.9 });
            const tail = i % 2 === 0 ? [1, 2, 3, 2] : [0, 2, 3, 2];
            tail.forEach((v, k) => items.push({ pos: 2 + k * 0.5, v, vel: k === 0 ? 0.56 : 0.5, max: 1.7 }));
            if (!fast && rng() < 0.4) { // sur le 3, un second accord très doux à la place de la première note de l'arpège
                const k = items.findIndex(it => it.pos === 2 && !it.block);
                if (k >= 0) items.splice(k, 1);
                items.push({ pos: 2, block: true, vel: 0.42, max: 1.9 });
            }
        }

        // Accord doux sur le premier temps (une phrase sur trois environ), à la place de la première note
        if (ph.blockOnOne && fam !== 'blockarp' && fam !== 'bassup' && i % 2 === 0) {
            const first = items.find(it => it.pos === 0);
            if (first) { first.block = true; first.vel = 0.62; first.max = 2.2; }
        }

        // Dernière mesure de la phrase : le motif se « referme »
        if (isTurn && L > 1 && ph.endingOn) {
            const keep = items.filter(it => it.pos < 2 || (it.pos < 3 && Number.isInteger(it.pos)));
            items.length = 0;
            keep.forEach(it => items.push(it));
            if (ph.ending === 0) items.push({ pos: 3, v: n - 1, vel: 0.62, max: 2.6 });  // note aiguë tenue
            else items.push({ pos: 3, block: true, vel: 0.5, max: 2.4 });                  // accord doux
        }

        items.forEach(it => {
            if (it.block) push(rel(it.pos), it.max, V, it.vel);
            else push(rel(it.pos), it.max, [note(it.v)], it.vel);
        });
    });

    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

// Mode « Arpèges » (bouton harpe) : à chaque accord, un arpège simple qui commence toujours par la basse
// de l'accord puis monte dans les notes de l'accord. La vitesse s'adapte à la durée de l'accord et au nombre de notes.
// Mode « Arpèges » (bouton harpe) : à chaque accord, un arpège simple qui commence toujours par la basse
// de l'accord puis monte dans les notes de l'accord. La vitesse s'adapte à la durée de l'accord et au nombre de notes.
function buildArpPlan(env, bpb, step, nextStep, isLastMeasureOfStep, halves) {
    const off = env.transOffset;
    const ternary = env.ternary;
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const holdOn = !(isLastMeasureOfStep && nextStep && !sameChord(lastSeg.cs, nextStep)) && !!nextStep;
    const ev = [];
    segs.forEach((sg, si) => {
        const len = sg.e - sg.s;
        const V = clsVoicing(env, sg.cs, off);
        const n = V.length;
        if (!n) return;
        const low = clsLowNote(env, sg.cs, off);
        const endPos = sg.e + ((si === segs.length - 1 && holdOn) ? 1.2 : 0.05);
        // Vitesse : la plus lente qui laisse entendre toutes les notes (basse + accord), sinon la plus rapide
        const rates = ternary ? [1, 3] : [1, 2];
        let rate = rates[rates.length - 1];
        for (const r of rates) { if (len * r >= n + 1) { rate = r; break; } }
        const S = Math.round(len * rate);
        // Notes de l'arpège : basse, puis l'accord en montant ; au-delà, on continue à l'octave
        // supérieure (deux octaves au plus), puis une nouvelle vague repart de la basse.
        let seq = [low].concat(V);
        if (S < seq.length) { // trop de notes pour la durée : on retire la quinte (avant-dernière note)
            while (seq.length > S && seq.length > 2) seq.splice(seq.length - 2, 1);
        }
        const cyc = S >= seq.length ? Math.min(1 + 2 * n, 8) : seq.length;
        const noteAt = (k) => {
            const j = k % cyc;
            if (j < seq.length) return seq[j];
            return V[(j - 1) % n] + 12 * Math.floor((j - 1) / n);
        };
        for (let k = 0; k < S; k++) {
            const pos = sg.s + k / rate;
            const wave = (k % cyc) === 0;
            const vel = (wave ? 0.74 : (Number.isInteger(k / rate) ? 0.6 : 0.52));
            ev.push({
                pos, dur: Math.max(0.3, Math.min(endPos - pos, wave ? 3 : 2.5)), vel,
                rootIndex: 0, intervals: [noteAt(k)], noteVels: [1], roll: 0,
                lay: Math.random() * 0.006, wide: true, gainMul: 1.2
            });
        }
    });
    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { classicPhraseExtras, buildClassicPlan, buildArpPlan };
}
