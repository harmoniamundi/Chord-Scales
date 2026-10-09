// band/cuban-plan.js — orchestre cubain de la jam (rythme « afro » du style Latin) : piano montuno (guajeo),
// tumbao de basse, cloche, clave, congas, shaker. Chargé par index.html via <script src="band/cuban-plan.js">
// (après band-patterns.js) et testé sous Node par band/cuban-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat        temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.state            mémoire entre deux mesures, modifiée en place : latTie (la basse de la mesure précédente
//                        a-t-elle anticipé ? la note est alors tenue sur le 1 suivant)
// buildCubanPlan renvoie { piano, bass, drums }.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { latBassTones, popBassApproach } = require('./band-helpers.js');
}
// En navigateur, CUBA est global (band-patterns.js) ; sous Node on le charge.
const CUBA_TABLES = (typeof CUBA !== 'undefined') ? CUBA : require('../band-patterns.js').CUBA;

// ===== Orchestre cubain : piano montuno (guajeo), tumbao de basse, cloche, congas, shaker, clave =====
// Utilisé pour le rythme « afro » du style Latin, quelle que soit la signature (6/8 : cloche de bembé ; 4/4 : clave de son 3-2).
function cubanPhraseExtras(ph, ternary) {
    const rng = ph.rng;
    const C = ternary ? CUBA_TABLES.ternary : CUBA_TABLES.binary;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.3 + 0.6 * (typeof ph.density === 'number' ? ph.density : 0.5);
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs(c.d - I) * 2)]));
    const cellIdx = byDensity(C.guajeos);
    return {
        t: ternary, I, cellIdx,
        altIdx: Math.max(0, Math.min(C.guajeos.length - 1, cellIdx + (rng() < 0.5 ? -1 : 1))),
        altOn: rng() < 0.6,
        bassIdx: byDensity(C.bass),
        bassAlt: Math.floor(rng() * C.bass.length),
        congaIdx: byDensity(C.congas),
        oct: rng() < 0.7,      // guajeo en octaves
        shaker: rng() < 0.75
    };
}

function buildCubanPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    if (!ph.cu || ph.cu.t !== ternary) ph.cu = cubanPhraseExtras(ph, ternary);
    const cu = ph.cu;
    const C = ternary ? CUBA_TABLES.ternary : CUBA_TABLES.binary;
    const spb = ternary ? 3 : 2;                    // croches par pulsation
    const E = bpb * spb;                            // croches dans la mesure
    const F = C.frame;
    const g0 = (m * E) % F;                         // position de la mesure dans le cadre rythmique (cloche / clave)
    const eps = 1e-6;
    const I = cu.I;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.78 + 0.28 * I) * (0.93 + 0.07 * prog);
    const splitAt = env.splitBeat;
    const aPos = bpb - 1 / spb;                     // dernière croche : anticipation de l'accord suivant
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const followOf = (si) => si < segs.length - 1 ? segs[si + 1].cs : (changeNext ? nextStep : null);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const pianoAnticip = changeNext && rng() < 0.7;
    const tied = env.state.latTie;
    const slot = (fi) => { const e = (((fi - g0) % F) + F) % F; return e < E ? e : -1; };
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? bpb - 1 : 99;
    const fk = (ph.fillKind || 0) % 2;

    // ---- piano : guajeo / montuno ----
    const off = env.transOffset;
    const stacks = {};
    const stackFor = (cs) => {
        const key = cs.rootIndex + ':' + cs.chordId;
        if (stacks[key]) return stacks[key];
        const notes = env.findChordObj(cs.chordId).notes;
        const r0 = notes[0] || 0;
        let rel = [...new Set(notes.slice(0, 4).map(n => (((n - r0) % 12) + 12) % 12))];
        if (rel.length < 3) rel = [...new Set(rel.concat([0, 7]))];
        rel.sort((a, b) => a - b);
        const pcRoot = (((cs.rootIndex + r0) % 12) + 12) % 12;
        const lo = 3 - off;                          // fondamentale entre do3 et si3 (réels)
        const r = lo + ((((pcRoot - lo) % 12) + 12) % 12);
        return (stacks[key] = rel.map(x => r + x));
    };
    const noteOf = (T, v) => T[v % T.length] + 12 * Math.floor(v / T.length);
    const chordOf = (pos) => (pianoAnticip && pos >= aPos - eps) ? nextStep : segs[segAt(pos)].cs;
    const useAlt = (i === 2 || isTurn) && cu.altOn;
    const gHits = C.guajeos[useAlt ? cu.altIdx : cu.cellIdx].hits;
    let gh = [];
    gHits.forEach(([fi, v, vel]) => { const e = slot(fi); if (e >= 0) gh.push([e / spb, v, vel]); });
    if (pianoAnticip) {
        const old = gh.find(h => h[0] >= aPos - eps);
        gh = gh.filter(h => h[0] < aPos - eps);
        gh.push([aPos, old ? old[1] : 0, 0.62]);
    }
    segs.forEach(sg => {
        const hi = pianoAnticip ? Math.min(sg.e, aPos) : sg.e;
        if (!gh.some(h => h[0] >= sg.s - eps && h[0] < hi - eps)) gh.push([sg.s, 0, 0.7]);
    });
    gh.sort((a, b) => a[0] - b[0]);
    const piano = gh.map(([pos, v, vel], k) => {
        const T = stackFor(chordOf(pos));
        const p = noteOf(T, v);
        const notes = (cu.oct && v < T.length && p + 12 + off <= 36) ? [p, p + 12] : [p];
        const nx = gh[k + 1];
        const gap = nx ? nx[0] - pos : 0.5;
        const lim = (pianoAnticip && pos < aPos - eps) ? aPos + 0.03
            : ((halves && pos < splitAt - eps) ? splitAt + 0.03 : bpb + (changeNext ? 0.03 : 0.3));
        return {
            pos,
            dur: Math.max(0.12, Math.min(gap * 1.1, 1.0, lim - pos)),
            vel: Math.max(0.1, Math.min(1, vel * gv)),
            rootIndex: 0, intervals: notes,
            noteVels: notes.map((_, q) => q === 0 ? 1 : 0.8),
            roll: 0.004, wide: true, gainMul: 1.1,
            lay: rng() * 0.008
        };
    });

    // ---- basse : tumbao (anticipation sur la dernière croche, tenue sur le 1 suivant) ----
    const bass = [];
    const bl = C.bass;
    const bCell = bl[((i === 2 && rng() < 0.5) ? cu.bassAlt : cu.bassIdx) % bl.length].hits;
    const bh = [];
    bCell.forEach(([fi, tok, d, v]) => { const e = slot(fi); if (e >= 0) bh.push([e, tok, d, v]); });
    segs.forEach(sg => {
        if (tied && sg.s === 0) return; // la note anticipée de la mesure précédente couvre le 1
        const hi = Math.min(sg.e, aPos);
        if (!bh.some(h => h[0] / spb >= sg.s - eps && h[0] / spb < hi - eps)) bh.push([sg.s * spb, 'R', spb, 0.8]);
    });
    const segInfo = segs.map((sg, si) => {
        const T = latBassTones(env, sg.cs);
        const follow = followOf(si);
        return { T, approach: follow ? popBassApproach(env, T.root, follow, rng) : null };
    });
    bh.forEach(([e, tok, d, v]) => {
        const pos = e / spb;
        if (tied && pos < 0.2) return;
        const { T, approach } = segInfo[segAt(pos)];
        const last = e === E - 1;
        let abs, dur = d / spb;
        switch (tok) {
            case 'F': abs = T.fifth; break;
            case 'T': abs = T.third; break;
            case 'O': abs = T.octave; break;
            case 'A': abs = approach !== null ? approach : T.fifth; break;
            case 'N': abs = (last && changeNext) ? latBassTones(env, nextStep).root : T.root; if (last) dur = 1.2; break;
            default: abs = T.root;
        }
        bass.push({ pos, abs, dur, tok, vel: Math.min(1, v * (0.82 + 0.22 * I) * (0.92 + 0.08 * prog)), wide: true });
    });
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.03 : (b.tok === 'N' && b.pos >= aPos - eps ? 1.2 : bpb - b.pos - 0.03);
        b.dur = Math.max(0.12, Math.min(b.dur, limit));
    });
    const tie = bass.some(b => b.tok === 'N' && b.pos >= aPos - eps);

    // ---- percussions : cloche, clave, congas, shaker ----
    const drums = [];
    const FILL_DRUMS = ['conga1', 'conga2', 'slap', 'shaker'];
    const dr = (pos, drum, vel) => {
        if (pos >= bpb - eps) return;
        if (pos >= fillFrom - eps && FILL_DRUMS.includes(drum)) return;
        drums.push({ pos, drum, vel: Math.max(0.05, Math.min(1, vel)) });
    };
    const bs = 0.8 + 0.3 * I;
    if (ternary && E % 6 !== 0) {                   // 9/8 : cloche sur les trois pulsations
        for (let e = 0; e < E; e++) {
            if (e % 3 === 0) dr(e / spb, 'bell', 0.62 * bs);
            else if (e % 3 === 2) dr(e / spb, 'bell', 0.44 * bs);
        }
    } else {
        Object.keys(C.bellVel).forEach(k => { const e = slot(+k); if (e >= 0) dr(e / spb, 'bell', C.bellVel[k] * bs); });
    }
    if (!ternary && bpb === 4 && C.clave) {
        Object.keys(C.clave).forEach(k => { const e = slot(+k); if (e >= 0) dr(e / spb, 'clave', C.clave[k]); });
    }
    const cs2 = 0.85 + 0.25 * I;
    C.congas[cu.congaIdx].hits.forEach(([fi, drum, vel]) => { const e = slot(fi); if (e >= 0) dr(e / spb, drum, vel * cs2); });
    if (cu.shaker) {
        for (let e = 0; e < E; e++) dr(e / spb, 'shaker', (e % spb === 0 ? 0.3 : (ternary ? 0.16 : 0.2)) * (0.8 + 0.3 * I));
    }
    if (doFill) {
        const seq = fk === 0 ? ['conga1', 'conga2', 'slap'] : ['slap', 'conga1', 'slap'];
        for (let k = 0; k < spb; k++) {
            const pos = fillFrom + k / spb;
            if (pos < bpb - eps) drums.push({ pos, drum: seq[k % seq.length], vel: 0.5 + 0.12 * k + 0.1 * I });
        }
        if (spb === 2) drums.push({ pos: fillFrom, drum: 'conga2', vel: 0.5 });
    }
    env.state.latTie = tie;
    return { piano, bass, drums };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cubanPhraseExtras, buildCubanPlan };
}
