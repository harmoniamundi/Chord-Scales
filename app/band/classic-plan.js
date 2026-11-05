// band/classic-plan.js — orchestre « Classique » (piano seul : roulements, quartes de noires, arpèges mêlés, basse sous le motif)
// et mode « Arpèges » (bouton harpe), sans DOM. Fonctions pures :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.bpm        tempo (au-delà de 165, pas de croches continues)
//   env.ternary    mesure composée (mode Arpèges) ;  env.splitBeat  temps où change l'accord d'une mesure à deux accords
//   env.density    densité de notes réglée par le curseur « Densité » (0 à 1 ; 0,5 = écriture d'origine) ; absent = écriture d'origine
// Chargé par index.html via <script src="band/classic-plan.js"> (après band-patterns.js et band/band-helpers.js)
// et testé par band/classic-plan.test.js.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof clsVoicing === 'undefined' && typeof require === 'function') {
    var { clsVoicing, clsLowNote, clsMutate, popScaleNotes, popRun } = require('./band-helpers.js');
}
// Tables de motifs : globales en navigateur (band-patterns.js), à charger sous Node.
const CLASSIC_PAT = (typeof CLS_EIGHTS !== 'undefined') ? { CLS_EIGHTS, CLS_QUARTERS, CLS_MIXED, CLS_UPPER } : require('../band-patterns.js');
const { CLS_EIGHTS: CL_EIGHTS, CLS_QUARTERS: CL_QUARTERS, CLS_MIXED: CL_MIXED, CLS_UPPER: CL_UPPER } = CLASSIC_PAT;

// Choix faits une fois par phrase et gardés pendant toute la phrase : intensité, famille de motif, variantes.
function classicPhraseExtras(bpm, rng, prev, index, groove) {
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
    const out = {
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
    if (groove === BAROQUE_GROOVE) Object.assign(out, baroquePhraseExtras(bpm, rng, pl, pickW));
    return out;
}

// ---------------------------------------------------------------------------------------------
// Style Baroque (rythme imposé « c-baroque » par le style de grille du même nom) : écriture continue, comme une
// réalisation de basse continue ou un prélude de Bach — doubles-croches ininterrompues à la main droite (arpèges
// en cellules d'un temps, séquences, gammes) sur une basse qui marche (noires, croches) ou tient la fondamentale.
// ---------------------------------------------------------------------------------------------
const BAROQUE_GROOVE = 'c-baroque';
// Cellules d'un temps (rang de la note de l'accord : 0 = grave ; au-delà du nombre de notes, l'octave supérieure)
const BQ_CELLS = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [3, 2, 1, 0], [2, 1, 0, 1], [0, 2, 3, 2], [1, 2, 3, 2], [3, 2, 3, 1]];
// Montée ou descente d'un rang d'un temps à l'autre (effet de séquence)
const BQ_SHIFTS = [[0, 0, 0, 0], [0, 0, 1, 1], [1, 1, 0, 0], [0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 2, 1]];
// Motifs de prélude sur 8 doubles-croches (la première est la basse tenue à la main gauche, d'où le silence)
const BQ_PRELUDE = [[null, 1, 2, 3, 4, 2, 3, 4], [null, 2, 3, 2, 1, 2, 3, 2], [null, 1, 2, 3, 2, 1, 2, 3]];
// Cellules de gamme : décalages en degrés conjoints
const BQ_SCALE_CELLS = [[0, 1, 2, 1], [0, 1, 2, 3], [0, 2, 1, 2], [3, 2, 1, 0], [2, 1, 0, 1]];

function baroquePhraseExtras(bpm, rng, pl, pickW) {
    const pb = (pl && pl.baroque) ? pl : null;
    const fast = bpm > BQ_FAST_BPM;
    const idx = (n) => Math.floor(rng() * n);
    let fam;
    if (pb && rng() < 0.35 && !(fast && pb.bFam === 'prelude')) fam = pb.bFam;
    else fam = fast ? pickW([['cells', 3], ['scale', 2]]) : pickW([['prelude', 3], ['cells', 3], ['scale', 2.5]]);
    const bass = fam === 'prelude' ? 'held' : pickW([['walk', 3], ['eights', 2], ['held', 0.6]]);
    return {
        baroque: true, bFam: fam, bBass: bass,
        bCellA: idx(BQ_CELLS.length), bCellB: idx(BQ_CELLS.length),
        bShift: idx(BQ_SHIFTS.length), bPre: idx(BQ_PRELUDE.length),
        bScaleCell: idx(BQ_SCALE_CELLS.length), bScaleDir: pickW([[1, 3], [-1, 2], [0, 1]]),
        bRun: rng() < 0.7   // la dernière double-croche d'un temps mène par degrés conjoints à l'accord suivant
    };
}
const BQ_FAST_BPM = 132; // au-delà : croches au lieu de doubles-croches

// Plan d'une mesure du style Baroque.
function buildBaroquePlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn) {
    const rng = ph.rng;
    const off = env.transOffset;
    const div = env.bpm > BQ_FAST_BPM ? 2 : 4;           // notes de la main droite par temps
    const I = ph.intensity;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.72 + 0.3 * I) * (0.94 + 0.06 * prog);
    const splitAt = env.splitBeat || 2;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: 4, cs: halves[1] }]
        : [{ s: 0, e: 4, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changes = isLastMeasureOfStep && !!nextStep && !sameChord(lastSeg.cs, nextStep);
    const holdOn = !changes && !!nextStep;
    const dens = Number.isFinite(env.density) ? Math.max(0, Math.min(1, env.density)) : null;
    const clamp = (v) => Math.max(0.12, Math.min(1, v));
    const fold = (p) => { while (p + off > 19) p -= 12; while (p + off < -12) p += 12; return p; };
    const ev = [];

    // Note de la main droite : rang dans l'accord, avec reprise à l'octave au-delà du nombre de notes
    const rank = (V, k) => { const n = V.length, q = Math.floor(k / n); return V[k - q * n] + 12 * q; };
    // Notes de basse : la basse de l'accord puis ses notes repliées dans l'octave au-dessus
    const bassTones = (V, low) => {
        const set = new Set([low]);
        V.forEach(x => { let y = x; while (y - low >= 12) y -= 12; while (y < low) y += 12; set.add(y); });
        return [...set].sort((a, b) => a - b);
    };
    // Note conjointe (degré de la gamme du prochain accord) qui amène à sa basse
    const approach = (from, ncs) => {
        if (!ncs) return null;
        const tgt = clsLowNote(env, ncs, off);
        const S = popScaleNotes(ncs, tgt - 4, tgt + 4).filter(x => x !== tgt);
        if (!S.length) return null;
        const dir = from >= tgt ? 1 : -1;
        const side = S.filter(x => (x - tgt) * dir > 0).sort((a, b) => Math.abs(a - tgt) - Math.abs(b - tgt));
        return side.length ? side[0] : S.sort((a, b) => Math.abs(a - tgt) - Math.abs(b - tgt))[0];
    };

    segs.forEach((sg, si) => {
        const len = sg.e - sg.s;
        const lastOne = si === segs.length - 1;
        const V = clsVoicing(env, sg.cs, off);
        const n = V.length;
        if (!n) return;
        const low = clsLowNote(env, sg.cs, off);
        const toCs = lastOne ? (changes ? nextStep : null) : segs[si + 1].cs;   // accord vers lequel on s'oriente
        const endPos = sg.e + ((lastOne && holdOn) ? 1.2 : 0.05);
        const put = (pos, max, p, vel) => {
            const at = sg.s + pos;
            ev.push({
                pos: at, dur: Math.max(0.2, Math.min(endPos - at, max)), vel: clamp(vel * gv),
                rootIndex: 0, intervals: [fold(p)], noteVels: [1], roll: 0,
                lay: rng() * 0.006, wide: true, gainMul: 1.2
            });
        };

        // ---------- main gauche ----------
        const T = bassTones(V, low);
        const tone = (k) => { const q = Math.floor(k / T.length); return T[k - q * T.length] + 12 * q; };
        const app = toCs ? approach(low, toCs) : null;
        let kind = len < 4 && ph.bBass === 'eights' ? 'walk' : ph.bBass;
        // Curseur « Densité » : au-dessus de 0,5, la main gauche s'anime (basse tenue → qui marche → en croches)
        if (dens !== null && dens > 0.5) {
            const u = (dens - 0.5) / 0.5;
            if (kind === 'held' && rng() < Math.min(1, u * 1.4)) kind = 'walk';
            else if (kind === 'walk' && len >= 4 && rng() < u) kind = 'eights';
        }
        if (kind === 'held') {
            put(0, len >= 4 ? 2.4 : len, low, 0.72);
            if (len >= 4) put(2, 2.2, rng() < 0.55 ? low : tone(2), 0.56);
        } else if (kind === 'walk') {
            const q = Math.floor(len);
            const shape = (i % 2 === 0) ? [0, 1, 2] : [0, 2, 1];
            for (let b = 0; b < q; b++) {
                const last = b === q - 1;
                const p = (last && app !== null) ? app : (b === 0 ? low : tone(shape[Math.min(b, shape.length - 1)]));
                put(b, 1.15, p, b === 0 ? 0.72 : (b === 2 ? 0.6 : 0.52));
            }
        } else { // croches : la basse arpège l'accord (basse d'Alberti à la main gauche)
            const ranks = i % 2 === 0 ? [0, 2, 1, 2, 0, 2, 1, 2] : [0, 1, 2, 1, 0, 1, 2, 1];
            const q = Math.floor(len * 2);
            for (let k = 0; k < q; k++) {
                const last = k === q - 1;
                const p = (last && app !== null) ? app : tone(ranks[k % 8]);
                put(k / 2, 0.8, p, k === 0 ? 0.72 : (k % 2 === 0 ? 0.58 : 0.48));
            }
        }

        // ---------- main droite ----------
        const slots = len * div;
        const fig = new Array(slots).fill(null);
        let fam = ph.bFam;
        if (fam === 'prelude' && (len < 4 || div !== 4)) fam = 'cells';
        if (i % 4 === 3 && fam === 'cells' && rng() < 0.4) fam = 'scale';   // une mesure de gamme pour relancer la phrase
        if (fam === 'prelude') {
            const P = BQ_PRELUDE[ph.bPre];
            const closing = isTurn && lastOne && L > 1;
            const second = closing ? [null, 1, 2, 3, 4, 3, 2, 1] : P;   // dernière mesure de la phrase : le motif redescend
            for (let k = 0; k < 8; k++) {
                if (P[k] !== null) fig[k] = rank(V, P[k]);
                if (second[k] !== null) fig[k + 8] = rank(V, second[k]);
            }
        } else if (fam === 'cells') {
            const A = BQ_CELLS[ph.bCellA], B = BQ_CELLS[ph.bCellB], sh = BQ_SHIFTS[ph.bShift];
            for (let b = 0; b < len; b++) {
                const cell = (b % 2 === 0 ? A : B);
                for (let k = 0; k < div; k++) {
                    // à 2 notes par temps (tempo vif) : on garde la 1re et la 3e note de la cellule
                    const r = div === 4 ? cell[k] : cell[k * 2];
                    fig[b * div + k] = rank(V, r + sh[b % 4]);
                }
            }
        } else { // scale : séquence de gammes autour des notes de l'accord
            const S = popScaleNotes(sg.cs, V[0] - 5, V[n - 1] + 14);
            if (S.length >= 6) {
                const nearest = (p) => { let bi = 0; S.forEach((x, j) => { if (Math.abs(x - p) < Math.abs(S[bi] - p)) bi = j; }); return bi; };
                const dir = ph.bScaleDir;
                const i0 = nearest(dir < 0 ? V[n - 1] + (n < 4 ? 12 : 0) : V[0]);
                const cell = BQ_SCALE_CELLS[ph.bScaleCell];
                for (let b = 0; b < len; b++) {
                    for (let k = 0; k < div; k++) {
                        const d = div === 4 ? cell[k] : cell[k * 2];
                        const j = Math.max(0, Math.min(S.length - 1, i0 + dir * b + d));
                        fig[b * div + k] = S[j];
                    }
                }
            } else {
                for (let k = 0; k < slots; k++) fig[k] = rank(V, [0, 1, 2, 1][k % 4]);
            }
        }

        // Dernier temps : une courte gamme qui mène par degrés conjoints à l'accord suivant, ou (fin de phrase) un accord posé
        const lastBeat = slots - div;
        if (isTurn && lastOne && L > 1 && ph.endingOn && len >= 3) {
            for (let k = lastBeat; k < slots; k++) fig[k] = null;
            ev.push({
                pos: sg.s + len - 1, dur: Math.max(0.3, Math.min(endPos - (sg.s + len - 1), 2.4)), vel: clamp(0.5 * gv),
                rootIndex: 0, intervals: V.map(fold), noteVels: V.map((_, k) => k === n - 1 ? 1 : 0.86), roll: 0.014 + rng() * 0.01,
                lay: rng() * 0.008, wide: true, gainMul: 1.2
            });
        } else if (toCs && ph.bRun && div === 4 && len >= 2 && fam !== 'prelude') {
            const nV = clsVoicing(env, toCs, off);
            const before = fig[lastBeat - 1];
            const run = popRun(env, toCs, before === null ? V[n - 1] : before, nV[Math.min(1, nV.length - 1)], 3);
            if (run.length === 3) { fig[lastBeat + 1] = run[0]; fig[lastBeat + 2] = run[1]; fig[lastBeat + 3] = run[2]; }
        }

        // Curseur « Densité » sous 0,5 : la main droite s'éclaircit (doubles-croches, puis temps, retirés ; la première note reste)
        if (dens !== null && dens < 0.5) {
            const t = (0.5 - dens) / 0.5;
            for (let k = 1; k < slots; k++) {
                if (fig[k] !== null && rng() < (k % div === 0 ? 0.8 : 0.97) * t) fig[k] = null;
            }
        }

        fig.forEach((p, k) => {
            if (p === null) return;
            const beatStart = k % div === 0;
            const base = beatStart ? (k === 0 ? 0.7 : 0.62) : (div === 4 && k % 2 === 0 ? 0.5 : 0.44);
            put(k / div, div === 4 ? 0.95 : 1.1, p, base + (rng() - 0.5) * 0.05);
        });
    });

    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

// Plan d'une mesure du style Classique.
function buildClassicPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    if (ph.baroque) return buildBaroquePlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn);
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
    const segData = []; // pour le curseur « Densité » : voicing, basse et fin de résonance de chaque moitié de mesure

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
        segData.push({ s: sg.s, e: sg.e, V, low, endPos });
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

    if (Number.isFinite(env.density)) clsDensify(ev, segData, { d: Math.max(0, Math.min(1, env.density)), rng, gv, bpm: env.bpm });
    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

// Curseur « Densité » (0 à 1) appliqué aux notes déjà écrites d'une mesure du style Classique ; 0,5 = écriture d'origine :
//  - sous 0,5 : des notes disparaissent (la première note de chaque accord et la basse restent) ; à 0, presque rien d'autre ;
//  - de 0,5 à 0,9 : les croches vides se remplissent (le motif poursuit l'accord en zigzag) ;
//  - au-dessus de 0,6 (jusqu'à 132 BPM) : des doubles-croches s'intercalent entre deux croches jouées, jusqu'à un flot continu à 1.
// Au-delà de 165 BPM on ne remplit pas (déjà trop vite). Modifie `ev` en place.
// o.unit : durée de la croche en temps (0,5 en binaire ; 1/3 en mesure composée, où le BPM compte les noires pointées) ;
// les doubles-croches s'intercalent à mi-croche.
function clsDensify(ev, segData, o) {
    const { d, rng, gv, bpm } = o;
    const unit = o.unit || 0.5;
    const rate = bpm / 60 / unit;                     // croches par seconde
    const canFill = rate <= 5.5, canSplit = rate <= 4.4;
    const EPS = 1e-6;
    const clamp = (v) => Math.max(0.12, Math.min(1, v));
    segData.forEach(sd => {
        const inSeg = (e) => e.pos >= sd.s - EPS && e.pos < sd.e - EPS;
        const isLow = (e) => e.intervals.length === 1 && e.intervals[0] === sd.low;
        if (d < 0.5) {
            const t = (0.5 - d) / 0.5;
            for (let k = ev.length - 1; k >= 0; k--) {
                const e = ev[k];
                if (!inSeg(e) || isLow(e) || Math.abs(e.pos - sd.s) < EPS) continue;
                if (rng() < (e.intervals.length > 1 ? 0.55 : 0.92) * t) ev.splice(k, 1);
            }
            return;
        }
        if (d === 0.5) return;
        const u = (d - 0.5) / 0.5;
        const n = sd.V.length;
        const pitchOf = (k) => k < n ? sd.V[k] : sd.V[k - n] + 12;
        const occupied = (p) => ev.some(e => Math.abs(e.pos - p) < EPS);
        const mk = (p, rank, vel, max) => ({
            pos: p, dur: Math.max(0.2, Math.min(sd.endPos - p, max)), vel: clamp(vel * gv),
            rootIndex: 0, intervals: [pitchOf(rank)], noteVels: [1], roll: 0,
            lay: rng() * 0.008, wide: true, gainMul: 1.2
        });
        let last = 1, dir = 1;
        const nextRank = () => {
            let r = last + dir;
            if (r > n || r < 0) { dir = -dir; r = last + dir; }
            last = Math.max(0, Math.min(n, r));
            return last;
        };
        const slots = Math.round((sd.e - sd.s) / unit);
        const pf = Math.min(1, u * 1.6);
        if (canFill) {
            for (let k = 0; k < slots; k++) {
                const p = sd.s + k * unit;
                if (occupied(p) || rng() >= pf) continue;
                ev.push(mk(p, nextRank(), Math.abs(p - Math.round(p)) < EPS ? 0.5 : 0.44, 1.3));
            }
        }
        const ps = Math.max(0, Math.min(1, (u - 0.2) / 0.8));
        if (ps > 0 && canSplit) {
            for (let k = 0; k < slots - 1; k++) {
                const p = sd.s + k * unit;
                if (!occupied(p) || !occupied(p + unit) || occupied(p + unit / 2)) continue;
                if (rng() < ps) ev.push(mk(p + unit / 2, nextRank(), 0.4, 0.9));
            }
        }
        if (d > 0.65 && canFill) { // flot de notes : elles ne doivent plus se superposer en longues résonances
            ev.forEach(e => { if (inSeg(e) && e.intervals.length === 1 && !isLow(e) && e.dur > 1.0) e.dur = 1.0; });
        }
    });
}

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
    module.exports = { classicPhraseExtras, buildClassicPlan, buildArpPlan, buildBaroquePlan, clsDensify, BAROQUE_GROOVE };
}
