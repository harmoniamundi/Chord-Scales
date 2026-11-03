// band/salsa-plan.js — orchestre de la salsa (rythme « salsa » de l'orchestre Cuba, mesure à 4 temps) : clave de son 3-2 ou 2-3,
// piano montuno calé sur la clave, tumbao de basse qui anticipe l'accord suivant, congas (tumbao / marcha), timbales (cáscara
// dans les couplets, cloche dans le montuno), bongos (martillo), güiro et maracas. Chargé par index.html via
// <script src="band/salsa-plan.js"> (après band/band-helpers.js) et testé sous Node par band/salsa-plan.test.js.
// Fonction pure : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat        temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.seed             graine de la lecture : fixe le sens de la clave (3-2 ou 2-3), qui ne change pas en cours de morceau
//   env.state            mémoire entre deux mesures, modifiée en place : latTie (la basse a-t-elle anticipé ? note tenue sur le 1)
// buildSalsaPlan renvoie { piano, bass, drums }, comme buildCubanPlan.
//
// Écriture : une mesure = 8 croches (positions 0 à 7, deux par temps). La clave de son s'étend sur deux mesures : le côté « trois »
// (temps 1, 2& et 4 = croches 0, 3, 6) et le côté « deux » (temps 2 et 3 = croches 2 et 4). Tout l'orchestre se cale dessus :
//  - le piano marque les coups de clave avec les notes aiguës de l'arpège et remplit entre eux avec les voix intérieures ;
//  - la basse joue le tumbao : la quinte sur le « et » du 2, puis la fondamentale de l'accord suivant sur le temps 4 (ou sur le
//    « et » du 4), tenue par-dessus la barre de mesure, de sorte que le 1 n'est presque jamais joué ;
//  - la conga marque le temps 4 (ouvert) et le « et » du 2 (ouvert), avec la claque sur le 2.
// Deux ambiances alternent par groupes de phrases : « son » (cáscara, bongos en martillo, güiro, piano plus léger) et « montuno »
// (cloche, maracas, congas pleines, piano plus dense).

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { latBassTones, popBassApproach } = require('./band-helpers.js');
}

// ---- Tables rythmiques (positions en croches dans la mesure) ----
// Clave de son : [croche, vélocité]. « three » = côté des trois coups, « two » = côté des deux coups.
const SALSA_CLAVE = {
    three: [[0, 0.64], [3, 0.58], [6, 0.7]],
    two:   [[2, 0.64], [4, 0.68]]
};
// Cáscara (flanc du timbal). Les coups de clave sont accentués, les autres sont des notes de remplissage plus légères.
// « full » : 5 coups par mesure ; « light » : version épurée, les coups de clave et quelques appuis.
const SALSA_CASCARA = {
    full:  { three: [0, 2, 3, 5, 6], two: [0, 2, 4, 5, 7] },
    light: { three: [0, 3, 6],       two: [1, 2, 4, 7] }
};
// Cloche (campana) du montuno : noires de base avec les syncopes de la clave en accent.
const SALSA_BELL = {
    three: [[0, 0.5], [2, 0.54], [3, 0.74], [4, 0.5], [6, 0.74]],
    two:   [[0, 0.5], [2, 0.72], [4, 0.72], [6, 0.54], [7, 0.62]]
};
// Conga : tumbao (même mesure répétée) ; ghost = notes fantômes ajoutées quand la phrase est plus intense.
const SALSA_CONGA = [
    { d: 0.35, hits: [[0, 'conga1', 0.26], [2, 'slap', 0.6], [3, 'conga2', 0.72], [4, 'conga1', 0.28], [6, 'conga2', 0.8], [7, 'conga2', 0.58]] },
    { d: 0.65, hits: [[0, 'conga1', 0.26], [1, 'conga1', 0.2], [2, 'slap', 0.62], [3, 'conga2', 0.74], [4, 'conga1', 0.3], [5, 'conga1', 0.22], [6, 'conga2', 0.82], [7, 'conga2', 0.6]] },
    { d: 0.9,  hits: [[0, 'conga1', 0.28], [1, 'conga1', 0.2], [2, 'slap', 0.64], [3, 'conga2', 0.76], [4, 'conga1', 0.32], [5, 'slap', 0.38], [6, 'conga2', 0.84], [7, 'conga2', 0.64]] }
];
// Piano montuno : [croche, voix (0 fondamentale, 1 tierce, 2 quinte, 3 septième, 4 neuvième…), vélocité].
// Une cellule par côté de la clave et par densité ; les coups de clave portent les voix hautes. L'indice de densité est le même des
// deux côtés pour que les deux mesures se répondent.
const SALSA_MONTUNO = {
    three: [
        { d: 0.35, hits: [[0, 0, 0.78], [3, 2, 0.7], [6, 3, 0.72]] },
        { d: 0.6,  hits: [[0, 0, 0.78], [1, 1, 0.46], [3, 2, 0.72], [4, 1, 0.5], [6, 3, 0.72], [7, 2, 0.55]] },
        { d: 0.85, hits: [[0, 0, 0.78], [1, 1, 0.5], [2, 2, 0.5], [3, 3, 0.72], [4, 2, 0.5], [5, 1, 0.5], [6, 3, 0.72], [7, 2, 0.55]] }
    ],
    two: [
        { d: 0.35, hits: [[2, 2, 0.72], [4, 1, 0.7], [7, 0, 0.6]] },
        { d: 0.6,  hits: [[1, 0, 0.5], [2, 2, 0.72], [4, 3, 0.7], [5, 1, 0.5], [7, 2, 0.62]] },
        { d: 0.85, hits: [[0, 1, 0.5], [1, 0, 0.5], [2, 2, 0.74], [3, 1, 0.5], [4, 3, 0.72], [5, 2, 0.52], [6, 1, 0.5], [7, 3, 0.62]] }
    ]
};
// Tumbao de basse : [croche ('a' = croche d'anticipation, 6 ou 7 selon la phrase), jeton, durée en temps, vélocité].
// Jetons : R fondamentale, F quinte, T tierce, O octave, A approche chromatique / diatonique de l'accord suivant, N fondamentale de
// l'accord suivant (si l'accord change) tenue par-dessus la barre de mesure.
const SALSA_BASS = [
    { d: 0.3, hits: [[3, 'F', 1.4, 0.8], ['a', 'N', 1.3, 0.9]] },
    { d: 0.55, hits: [[3, 'F', 1.0, 0.8], [4, 'O', 0.9, 0.6], ['a', 'N', 1.3, 0.9]] },
    { d: 0.8, hits: [[1, 'R', 0.4, 0.5], [3, 'F', 1.0, 0.8], [5, 'A', 0.5, 0.62], ['a', 'N', 1.3, 0.9]] }
];

function salsaPhraseExtras(ph) {
    const rng = ph.rng;
    const idx = Number.isInteger(ph.index) ? ph.index : 0;
    // Ambiances par groupes de deux phrases : son, son, montuno, montuno, son…
    const section = (Math.floor(idx / 2) % 2 === 0) ? 'son' : 'montuno';
    const base = typeof ph.intensity === 'number' ? ph.intensity : 0.3 + 0.6 * (typeof ph.density === 'number' ? ph.density : 0.5);
    const I = Math.max(0.2, Math.min(1, base + (section === 'montuno' ? 0.15 : -0.08) - (idx === 0 ? 0.1 : 0)));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs(c.d - I) * 2)]));
    const cellIdx = byDensity(SALSA_MONTUNO.three);
    return {
        section, I, cellIdx,
        altIdx: Math.max(0, Math.min(SALSA_MONTUNO.three.length - 1, cellIdx + (rng() < 0.5 ? -1 : 1))),
        altOn: rng() < 0.6,
        bassIdx: byDensity(SALSA_BASS),
        bassAlt: Math.floor(rng() * SALSA_BASS.length),
        congaIdx: byDensity(SALSA_CONGA),
        ant: rng() < 0.55 ? 6 : 7,         // anticipation sur le temps 4 ou sur le « et » du 4
        cascara: I >= 0.5 ? 'full' : 'light',
        oct: rng() < 0.75,                 // montuno en octaves
        pianoAnt: rng() < 0.8              // le piano change d'accord en même temps que la basse
    };
}

function buildSalsaPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    if (!ph.sa) ph.sa = salsaPhraseExtras(ph);
    const sa = ph.sa;
    const montuno = sa.section === 'montuno';
    const E = 8;
    const eps = 1e-6;
    const I = sa.I;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.78 + 0.28 * I) * (0.93 + 0.07 * prog);
    // Sens de la clave : fixé par la graine de la lecture ; le côté de la mesure suit sa place depuis le début de la jam
    const dir = (env.seed || 0) % 2;                  // 0 : 3-2, 1 : 2-3
    const side = ((m + dir) % 2 === 0) ? 'three' : 'two';
    const splitAt = env.splitBeat;
    const antPos = sa.ant / 2;                        // position (en temps) de l'anticipation
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const followOf = (si) => si < segs.length - 1 ? segs[si + 1].cs : (changeNext ? nextStep : null);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const pianoAnticip = changeNext && sa.pianoAnt;
    const tied = env.state.latTie;
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? bpb - 1 : 99;
    const fk = (ph.fillKind || 0) % 3;

    // ---- piano : montuno ----
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
    const chordOf = (pos) => (pianoAnticip && pos >= antPos - eps) ? nextStep : segs[segAt(pos)].cs;
    const useAlt = (i === 2 || isTurn) && sa.altOn;
    const cell = SALSA_MONTUNO[side][useAlt ? sa.altIdx : sa.cellIdx];
    let gh = cell.hits.map(([e, v, vel]) => [e / 2, v, vel]);
    segs.forEach(sg => {
        const hi = pianoAnticip ? Math.min(sg.e, antPos) : sg.e;
        if (!gh.some(h => h[0] >= sg.s - eps && h[0] < hi - eps)) gh.push([sg.s, 0, 0.7]);
    });
    gh.sort((a, b) => a[0] - b[0]);
    const piano = gh.map(([pos, v, vel], k) => {
        const T = stackFor(chordOf(pos));
        const p = noteOf(T, v);
        const notes = (sa.oct && v < T.length && p + 12 + off <= 36) ? [p, p + 12] : [p];
        const nx = gh[k + 1];
        const gap = nx ? nx[0] - pos : 0.5;
        const lim = (pianoAnticip && pos < antPos - eps) ? antPos + 0.03
            : ((halves && pos < splitAt - eps) ? splitAt + 0.03 : bpb + (changeNext ? 0.03 : 0.3));
        return {
            pos,
            dur: Math.max(0.14, Math.min(gap * 0.95, 0.9, lim - pos)),
            vel: Math.max(0.1, Math.min(1, vel * gv)),
            rootIndex: 0, intervals: notes,
            noteVels: notes.map((_, q) => q === 0 ? 1 : 0.8),
            roll: 0.004, wide: true, gainMul: 1.1,
            lay: rng() * 0.008
        };
    });

    // ---- basse : tumbao ----
    const bass = [];
    const bCell = SALSA_BASS[((i === 2 && rng() < 0.5) ? sa.bassAlt : sa.bassIdx) % SALSA_BASS.length].hits;
    const bh = bCell.map(([e, tok, d, v]) => [e === 'a' ? sa.ant : e, tok, d, v]);
    segs.forEach(sg => {
        if (tied && sg.s === 0) return; // la note anticipée de la mesure précédente couvre le 1
        // chaque accord commence par sa fondamentale, sauf si le tumbao y joue déjà quelque chose
        if (!bh.some(h => h[0] / 2 >= sg.s - eps && h[0] / 2 < sg.s + 0.5 - eps)) bh.push([sg.s * 2, 'R', 2, 0.8]);
    });
    const segInfo = segs.map((sg, si) => {
        const T = latBassTones(env, sg.cs);
        const follow = followOf(si);
        return { T, approach: follow ? popBassApproach(env, T.root, follow, rng) : null };
    });
    bh.forEach(([e, tok, d, v]) => {
        const pos = e / 2;
        if (tied && pos < 0.2) return;
        const { T, approach } = segInfo[segAt(pos)];
        let abs;
        switch (tok) {
            case 'F': abs = T.fifth; break;
            case 'T': abs = T.third; break;
            case 'O': abs = T.octave; break;
            case 'A': abs = approach !== null ? approach : T.fifth; break;
            case 'N': abs = changeNext ? latBassTones(env, nextStep).root : T.root; break;
            default: abs = T.root;
        }
        bass.push({ pos, abs, dur: d, tok, vel: Math.min(1, v * (0.82 + 0.22 * I) * (0.92 + 0.08 * prog)), wide: true });
    });
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const isAnt = b.tok === 'N' && b.pos >= antPos - eps;
        const limit = nx ? nx.pos - b.pos + 0.03 : (isAnt ? 1.3 : bpb - b.pos - 0.03);
        b.dur = Math.max(0.12, Math.min(b.dur, limit));
    });
    const tie = bass.some(b => b.tok === 'N' && b.pos >= antPos - eps);

    // ---- percussions : clave, timbales (cáscara ou cloche), conga, bongos, güiro, maracas ----
    const drums = [];
    const FILL_DRUMS = ['conga1', 'conga2', 'slap', 'shell', 'bongoh', 'bongol', 'guiro', 'guirot', 'shaker'];
    const dr = (pos, drum, vel) => {
        if (pos >= bpb - eps) return;
        if (pos >= fillFrom - eps && FILL_DRUMS.includes(drum)) return;
        drums.push({ pos, drum, vel: Math.max(0.05, Math.min(1, vel)) });
    };
    const bs = 0.85 + 0.25 * I;
    SALSA_CLAVE[side].forEach(([e, v]) => dr(e / 2, 'clave', v * (montuno ? 0.9 : 1)));
    const conga = SALSA_CONGA[sa.congaIdx];
    const cs2 = (montuno ? 1 : 0.85) * (0.85 + 0.25 * I);
    conga.hits.forEach(([e, drum, v]) => dr(e / 2, drum, v * cs2));
    if (montuno) {
        // Cloche + maracas : le timbalero passe à la campana, le maracas tient les croches
        SALSA_BELL[side].forEach(([e, v]) => dr(e / 2, 'bell', v * bs));
        for (let e = 0; e < E; e++) dr(e / 2, 'shaker', (e % 2 === 0 ? 0.3 : 0.2) * (0.8 + 0.3 * I));
    } else {
        // Cáscara : les coups de clave en accent, les autres plus légers
        const claveSet = new Set(SALSA_CLAVE[side].map(c => c[0]));
        SALSA_CASCARA[sa.cascara][side].forEach(e => dr(e / 2, 'shell', (claveSet.has(e) ? 0.62 : 0.38) * bs));
        // Bongos : martillo en croches, la basse (macho) sur les temps, l'aigu (hembra) sur les contretemps, quelques trous
        for (let e = 0; e < E; e++) {
            if (e > 0 && rng() < 0.18) continue;
            const strong = (e === 3 || e === 7);
            dr(e / 2, e % 2 === 0 ? 'bongol' : 'bongoh', (e % 2 === 0 ? 0.36 : (strong ? 0.5 : 0.3)) * (0.8 + 0.3 * I));
        }
        // Güiro : un coup long sur les temps 1 et 3, deux courts entre eux
        [0, 4].forEach(e => {
            dr(e / 2, 'guiro', 0.34 * (0.8 + 0.3 * I));
            dr((e + 2) / 2, 'guirot', 0.2);
            dr((e + 3) / 2, 'guirot', 0.22);
        });
    }
    if (doFill) {
        // Roulement de doubles croches sur le dernier temps de la phrase
        const seq = fk === 0 ? ['bongol', 'bongoh', 'bongol', 'bongoh'] : (fk === 1 ? ['conga1', 'conga2', 'slap', 'conga2'] : ['shell', 'shell', 'shell', 'shell']);
        for (let k = 0; k < 4; k++) {
            const pos = fillFrom + k / 4;
            if (pos < bpb - eps) drums.push({ pos, drum: seq[k], vel: Math.min(1, 0.4 + 0.1 * k + 0.12 * I) });
        }
    }
    env.state.latTie = tie;
    return { piano, bass, drums };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { salsaPhraseExtras, buildSalsaPlan, SALSA_CLAVE, SALSA_CASCARA, SALSA_BELL, SALSA_CONGA, SALSA_MONTUNO, SALSA_BASS };
}
