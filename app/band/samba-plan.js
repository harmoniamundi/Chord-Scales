// band/samba-plan.js — orchestre de la samba (rythme « samba » de l'orchestre Brasil, mesures à 2 ou 4 temps) : une roda de samba
// plutôt qu'une batterie. Violão (guitare nylon) en batida, basse qui imite le surdo avec des « baixarias », et percussions
// brésiliennes : surdo, pandeiro, tamborim, ganzá, agogô. Chargé par index.html via <script src="band/samba-plan.js">
// (après band/band-helpers.js) et testé sous Node par band/samba-plan.test.js.
// Fonction pure : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat        temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.state            mémoire entre deux mesures, modifiée en place : latVoice (conduite des voix de la guitare, partagée avec
//                        l'orchestre Brasil), bandLastFill (la phrase précédente finissait-elle par une virada ?)
// buildSambaPlan renvoie { piano (= guitare), bass, drums, guitar: true }, comme buildLatinPlan.
//
// Écriture : la samba se pense en 2/4, par « cycles » de deux temps découpés en doubles croches (0.25). Une mesure de 2/4 = un
// cycle ; une mesure de 4/4 = deux cycles. Le tamborim joue le teleco-teco, une figure sur deux cycles (côté A puis côté B) :
//     A : x . x . . x . x     B : . x . x . . x .
// Tout l'orchestre s'y accroche :
//  - surdo : étouffé sur le 1, ouvert et appuyé sur le 2 (la « marcação ») ; un troisième surdo répond par moments ;
//  - pandeiro : les quatre doubles croches de chaque temps (pouce, doigts, talon, doigts), accent sur la dernière, grave sur le 2 ;
//  - violão : le pouce marque les deux temps (court sur le 1, plus long et appuyé sur le 2, comme le surdo), les doigts pincent
//    l'accord (cordes aiguës) sur les syncopes du teleco-teco ; l'accord suivant est souvent anticipé d'une double croche ;
//  - basse : « courte-longue » comme le surdo, petites notes de reprise avant le 2, baixaria (petite descente ou montée en
//    doubles croches) qui amène l'accord suivant ;
//  - « ginga » : les doubles croches ne sont pas égales ; la deuxième et la quatrième de chaque temps traînent un peu.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js, band-patterns.js).
if (typeof latBassTones === 'undefined' && typeof require === 'function') {
    var { latBassTones, popVoicing, popBassApproach } = require('./band-helpers.js');
}
const SAMBA_VOICE_RANGE = (typeof LAT_VOICE_RANGE !== 'undefined') ? LAT_VOICE_RANGE : require('../band-patterns.js').LAT_VOICE_RANGE;
const SAMBA_SCALES = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

// ---- Tables rythmiques (positions en temps dans un cycle de deux temps ; 0.25 = double croche) ----
// Teleco-teco du tamborim : [position, vélocité] ; les coups sur un temps sont un peu plus appuyés.
const SAMBA_TELECO = {
    A: [[0, 0.62], [0.5, 0.5], [1.25, 0.56], [1.75, 0.52]],
    B: [[0.25, 0.54], [0.75, 0.5], [1.5, 0.58]]
};
// Doigts du violão (accord pincé sur les cordes aiguës) : figures sur deux cycles.
//  teleco : calé sur le tamborim (la levada la plus courante) ;
//  basica : batida de base, doigts sur le « et » et le « a » de chaque temps ;
//  partido : partido-alto, plus syncopé (pour les phrases énergiques).
const SAMBA_FINGERS = {
    teleco:  { A: [[0.5, 0.6], [1.25, 0.64], [1.75, 0.6]], B: [[0.25, 0.62], [0.75, 0.56], [1.5, 0.66]] },
    basica:  { A: [[0.5, 0.6], [0.75, 0.5], [1.5, 0.62], [1.75, 0.54]], B: [[0.5, 0.58], [0.75, 0.5], [1.5, 0.62]] },
    partido: { A: [[0.25, 0.6], [0.75, 0.62], [1.25, 0.56], [1.75, 0.6]], B: [[0.5, 0.62], [0.75, 0.56], [1.25, 0.6], [1.75, 0.56]] }
};
// Basse : [position, note, durée max (temps), vélocité] ; R fondamentale, F quinte (grave), O octave, T tierce,
// A note de passage vers l'accord suivant (ou quinte s'il ne change pas).
const SAMBA_BASS = [
    [[0, 'R', 0.42, 0.72], [1, 'F', 0.95, 0.92]],
    [[0, 'R', 0.4, 0.72], [0.75, 'R', 0.2, 0.5], [1, 'F', 0.9, 0.92]],
    [[0, 'R', 0.42, 0.72], [1, 'F', 0.6, 0.9], [1.75, 'A', 0.25, 0.6]],
    [[0, 'R', 0.4, 0.72], [0.5, 'O', 0.25, 0.5], [1, 'F', 0.9, 0.9]]
];
// Agogô : [position, aigu ?, vélocité] sur deux cycles.
const SAMBA_AGOGO = {
    A: [[0, true, 0.5], [0.5, false, 0.38], [1, true, 0.46], [1.25, true, 0.36], [1.75, false, 0.42]],
    B: [[0.25, true, 0.4], [0.75, false, 0.4], [1, true, 0.48], [1.5, false, 0.42]]
};
// Ginga : retard (en temps) de chaque double croche dans le temps (la 1re reste sur le temps).
const SAMBA_GINGA = [0, 0.028, 0.01, 0.022];

// Choix faits une fois par phrase (gardés pendant toute la phrase) : figure de doigts, basses, percussions présentes.
function sambaPhraseExtras(ph, rng) {
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    return {
        fingers: pickW(I < 0.4 ? [['basica', 3], ['teleco', 2]] : (I < 0.7 ? [['teleco', 3], ['basica', 1.5], ['partido', 1]] : [['teleco', 2], ['partido', 3]])),
        bassIdx: Math.floor(rng() * SAMBA_BASS.length),
        bassAlt: Math.floor(rng() * SAMBA_BASS.length),
        ganza: rng() < 0.35 + 0.5 * I,          // le ganzá entre quand la phrase s'anime
        agogo: rng() < (I > 0.45 ? 0.45 : 0.15),
        tamborim: rng() < 0.9,
        terceira: rng() < 0.2 + 0.6 * I,        // troisième surdo (cortador) qui répond
        ghosts: I > 0.55 && rng() < 0.75,       // accords étouffés du violão sur les doubles croches libres
        ginga: 0.7 + rng() * 0.4,
        flip: rng() < 0.25                      // teleco-teco pris par le côté B (phrase « à l'envers »)
    };
}

function buildSambaPlan(env, bpb, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    if (!ph.sb) ph.sb = sambaPhraseExtras(ph, rng);
    const sb = ph.sb;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const prog = L > 1 ? i / (L - 1) : 0;
    const cycles = bpb >= 4 ? 2 : 1;
    const splitAt = env.splitBeat || bpb / 2;
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const aPos = bpb - 0.25;                     // dernière double croche : l'accord suivant y est souvent anticipé
    const anticip = changeNext && rng() < 0.45 + 0.35 * I;
    const segAt = (p) => (halves && p >= splitAt - 1e-6) ? segs[1] : segs[0];
    const csAt = (p) => (anticip && p >= aPos - 1e-6) ? nextStep : segAt(p).cs;
    const endOf = (p) => {
        if (anticip && p >= aPos - 1e-6) return bpb + 0.8;
        if (halves && p < splitAt - 1e-6) return splitAt + 0.03;
        return (anticip ? aPos : bpb) + 0.03;
    };
    const side = (c) => {                        // côté du teleco-teco pour le cycle c de la mesure
        const n = m * cycles + c + (sb.flip ? 1 : 0);
        return n % 2 === 0 ? 'A' : 'B';
    };
    const ginga = (p) => {
        const k = Math.round(((p % 1) + 1) % 1 * 4) % 4;
        return p + SAMBA_GINGA[k] * sb.ginga;
    };
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? bpb - 1 : 99;

    // ---- conduite des voix du violão (même mémoire que l'orchestre Brasil) ----
    const cache = {};
    let lastV = env.state.latVoice ? env.state.latVoice.v : null;
    let lastKey = env.state.latVoice ? env.state.latVoice.key : null;
    const voiceFor = (cs) => {
        const key = cs.rootIndex + ':' + cs.chordId;
        if (cache[key]) return cache[key];
        const v = (env.state.latVoice && env.state.latVoice.key === key) ? env.state.latVoice.v : popVoicing(env, cs, lastV, SAMBA_VOICE_RANGE);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };

    // ---- violão ----
    const gv = (0.74 + 0.3 * I) * (0.93 + 0.07 * prog);
    const gtr = [];
    const pushG = (p, dur, notes, vel, opts) => {
        const sorted = notes.slice().sort((a, b) => a - b).filter((n, k, arr) => k === 0 || n !== arr[k - 1]);
        if (!sorted.length) return;
        const n = sorted.length;
        const o = opts || {};
        gtr.push({
            pos: ginga(p),
            dur: Math.max(o.damped ? 0.08 : 0.12, Math.min(dur, endOf(p) - p)),
            vel: Math.max(0.08, Math.min(1, vel * gv * (0.94 + rng() * 0.12))),
            rootIndex: 0, intervals: sorted,
            noteVels: sorted.map((_, k) => n === 1 ? 1 : (k === n - 1 ? 1 : 0.82)),
            dir: o.dir || 1, roll: n > 1 ? (o.roll !== undefined ? o.roll : 0.004 + rng() * 0.005) : 0,
            lay: 0.002 + rng() * 0.008
        });
    };
    // Doigts : trois cordes aiguës, sans la fondamentale (le pouce et la basse la donnent) pour garder tierce et septième
    const upperOf = (cs) => {
        const V = voiceFor(cs);
        const noRoot = V.filter(n => (((n - cs.rootIndex) % 12) + 12) % 12 !== 0);
        const src = noRoot.length >= 3 ? noRoot : V;
        return src.length > 3 ? src.slice(-3) : src.slice();
    };
    for (let c = 0; c < cycles; c++) {
        const base = c * 2;
        const sd = side(c);
        const fig = SAMBA_FINGERS[sb.fingers][sd].map(h => h.slice());
        // pouce : 1 court, 2 plus long et appuyé (comme le surdo) ; la quinte en alternance sur le 2
        [0, 1].forEach(b => {
            const p = base + b;
            const cs = segAt(p).cs;
            const T = latBassTones(env, cs);
            const firstOfSeg = Math.abs(segAt(p).s - p) < 1e-6;
            const note = (b === 1 && !firstOfSeg) ? T.fifth : T.root;
            const V = voiceFor(cs);
            const thumbNotes = [note]; // même registre que le pouce de l'orchestre Brasil (latThumb)
            // sur le 1 du cycle, le pouce et les doigts attaquent parfois ensemble (accord plein, plus discret)
            if (b === 0 && rng() < 0.35) thumbNotes.push(...V.slice(-3));
            pushG(p, b === 0 ? 0.4 : 0.7, thumbNotes, b === 0 ? 0.56 : 0.66, { roll: 0.012 });
        });
        // doigts : accord des cordes aiguës, court, sur les syncopes
        const taken = new Set();
        fig.forEach(([q, v], k) => {
            if (k > 0 && i > 0 && rng() < 0.08 * (1.1 - I)) return; // une frappe sautée de temps en temps
            const p = base + q;
            if (p >= bpb) return;
            taken.add(q);
            const accent = (q % 1) === 0.75 || (q % 1) === 0.25 ? 1.06 : 1;
            pushG(p, 0.28, upperOf(csAt(p)), v * accent, { dir: rng() < 0.5 ? 1 : -1 });
        });
        // accords étouffés (« abafado ») sur quelques doubles croches libres : le mouvement continu du violão
        if (sb.ghosts) {
            [0.25, 0.75, 1.25, 1.75].forEach(q => {
                if (taken.has(q) || rng() > 0.45 * I) return;
                const p = base + q;
                pushG(p, 0.09, upperOf(csAt(p)).slice(-2), 0.26, { damped: true, roll: 0.002 });
            });
        }
    }
    // anticipation : l'accord suivant pincé sur la dernière double croche (il remplace ce qui y était)
    if (anticip) {
        for (let k = gtr.length - 1; k >= 0; k--) if (gtr[k].pos >= aPos - 1e-6) gtr.splice(k, 1);
        pushG(aPos, 0.6, upperOf(nextStep), 0.66, { dir: -1 });
    }
    // mesure à deux accords : le deuxième accord doit s'entendre dès qu'il arrive
    if (halves) {
        const s2 = segs[1].s;
        if (!gtr.some(e => Math.abs(e.pos - s2) < 0.05)) pushG(s2, 0.4, upperOf(segs[1].cs), 0.6);
    }
    gtr.sort((a, b) => a.pos - b.pos);

    // ---- basse (surdo + baixaria) ----
    const bass = [];
    const bvel = (v) => Math.min(1, v * (0.82 + 0.22 * I) * (0.93 + 0.07 * prog));
    for (let c = 0; c < cycles; c++) {
        const base = c * 2;
        const tpl = SAMBA_BASS[((i % 2 === 1 || c === 1) && rng() < 0.5) ? sb.bassAlt : sb.bassIdx];
        tpl.forEach(([q, tok, d, v]) => {
            const p = base + q;
            const sg = segAt(p);
            const T = latBassTones(env, sg.cs);
            const segIdx = segs.indexOf(sg);
            const follow = segIdx < segs.length - 1 ? segs[segIdx + 1].cs : (changeNext ? nextStep : null);
            let abs;
            if (Math.abs(sg.s - p) < 1e-6) abs = T.root; // premier temps d'un accord : sa fondamentale
            else if (tok === 'F') abs = T.fifth;
            else if (tok === 'O') abs = T.octave;
            else if (tok === 'T') abs = T.third;
            else if (tok === 'A') abs = (follow && p >= sg.e - 0.5) ? popBassApproach(env, T.root, follow, rng) : T.fifth;
            else abs = T.root;
            bass.push({ pos: p, abs, dur: d, tok, vel: bvel(v), wide: true });
        });
    }
    // deuxième accord d'une mesure coupée : sa fondamentale sur son premier temps
    if (halves && !bass.some(b => Math.abs(b.pos - segs[1].s) < 1e-6)) {
        bass.push({ pos: segs[1].s, abs: latBassTones(env, segs[1].cs).root, dur: 0.9, tok: 'R', vel: bvel(0.88), wide: true });
    }
    // baixaria : trois doubles croches qui conduisent à la fondamentale de l'accord suivant
    let run = false;
    if (changeNext && !doFill && rng() < (isTurn ? 0.55 : 0.3) * (0.6 + 0.6 * I)) {
        const t = latBassTones(env, nextStep).root;
        const sc = (SAMBA_SCALES[nextStep.scaleId] && SAMBA_SCALES[nextStep.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
        const fromAbove = (t + env.transOffset < -4) ? true : ((t + env.transOffset > 2) ? false : rng() < 0.55);
        const notes = fromAbove
            ? [t + sc[3 % sc.length], t + sc[2 % sc.length], t + sc[1 % sc.length]]
            : sc.map(x => t - 12 + x).filter(n => n < t).slice(-3);
        if (notes.length === 3) {
            const start = bpb - 0.75;
            for (let k = bass.length - 1; k >= 0; k--) if (bass[k].pos >= start - 1e-6) bass.splice(k, 1);
            notes.forEach((n, k) => bass.push({ pos: start + k * 0.25, abs: n, dur: 0.24, tok: 'A', vel: bvel(0.6 + 0.06 * k), wide: true }));
            run = true;
        }
    }
    if (anticip && !run && rng() < 0.4) {
        for (let k = bass.length - 1; k >= 0; k--) if (bass[k].pos >= aPos - 1e-6) bass.splice(k, 1);
        bass.push({ pos: aPos, abs: latBassTones(env, nextStep).root, dur: 0.8, tok: 'N', vel: bvel(0.7), wide: true });
    }
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.02 : (b.tok === 'N' ? 0.8 : bpb - b.pos - 0.02);
        b.dur = Math.max(0.1, Math.min(b.dur, limit));
        if (!Number.isInteger(b.pos)) b.pos = ginga(b.pos);
    });

    // ---- percussions ----
    const drums = [];
    const dv = (0.74 + 0.3 * I) * (0.92 + 0.08 * prog);
    const add = (p, drum, vel, orn) => {
        if (p >= fillFrom - 1e-6 || p >= bpb) return;
        const e = { pos: ginga(p), drum, vel: Math.max(0.05, Math.min(1, vel * dv * (0.93 + rng() * 0.14))), lay: 0 };
        if (orn) e.orn = true; // ornement : abandonné au niveau de qualité « Minimal »
        drums.push(e);
    };
    const resolveAfterFill = i === 0 && env.state.bandLastFill;
    env.state.bandLastFill = false;
    if (isTurn) env.state.bandLastFill = doFill;
    for (let c = 0; c < cycles; c++) {
        const base = c * 2;
        const sd = side(c);
        // surdo : étouffé sur le 1 (ouvert juste après une virada), ouvert et appuyé sur le 2
        add(base, (resolveAfterFill && c === 0) ? 'surdo' : 'surdom', (resolveAfterFill && c === 0) ? 0.8 : 0.5);
        add(base + 1, 'surdo', 0.86);
        if (sb.terceira) { // cortador : répond entre les deux autres surdos
            (sd === 'A' ? [[0.75, 0.4], [1.5, 0.46]] : [[0.5, 0.38], [1.75, 0.42]]).forEach(([q, v]) => { if (rng() < 0.8) add(base + q, 'surdom', v); });
        }
        // pandeiro : pouce, doigts, talon, doigts — accent sur la 4e double croche, pouce grave sur le 2
        for (let b = 0; b < 2; b++) {
            const p = base + b;
            add(p, 'pandg', b === 1 ? 0.62 : 0.42);
            add(p + 0.25, 'pandj', 0.3, true);
            add(p + 0.5, 'pandj', 0.4);
            if (b === 1 && rng() < 0.3 + 0.3 * I) add(p + 0.75, 'pandt', 0.5);
            else add(p + 0.75, 'pandj', 0.6);
        }
        // tamborim : teleco-teco
        if (sb.tamborim) SAMBA_TELECO[sd].forEach(([q, v]) => { if (rng() < 0.94) add(base + q, 'tamborim', v); });
        // ganzá : toutes les doubles croches, appui sur la dernière de chaque temps
        if (sb.ganza) for (let k = 0; k < 8; k++) add(base + k * 0.25, 'ganza', [0.3, 0.16, 0.22, 0.38][k % 4], k % 4 !== 3);
        // agogô
        if (sb.agogo) SAMBA_AGOGO[sd].forEach(([q, hi, v]) => add(base + q, hi ? 'agogoh' : 'agogol', v, true));
    }
    // virada (fin de phrase) : roulement de tamborim en doubles croches qui monte, surdo ouvert, tapa du pandeiro
    if (doFill) {
        const b = bpb - 1;
        const kind = (ph.fillKind || 0) % 2;
        const pushF = (p, drum, v) => drums.push({ pos: ginga(p), drum, vel: Math.max(0.05, Math.min(1, v * dv)), lay: 0 });
        if (kind === 0) {
            [0.5, 0.56, 0.64, 0.74].forEach((v, k) => pushF(b + k * 0.25, 'tamborim', v));
            pushF(b, 'surdo', 0.7); pushF(b + 0.75, 'pandt', 0.6);
        } else {
            pushF(b, 'surdo', 0.78); pushF(b + 0.5, 'surdo', 0.62); pushF(b + 0.75, 'surdom', 0.7);
            [0.25, 0.5, 0.75].forEach((q, k) => pushF(b + q, 'tamborim', 0.5 + 0.08 * k));
            pushF(b + 0.5, 'pandt', 0.55);
        }
    }
    drums.sort((a, b) => a.pos - b.pos);

    env.state.latVoice = lastKey ? { key: lastKey, v: lastV } : null;
    return { piano: gtr, bass, drums, guitar: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sambaPhraseExtras, buildSambaPlan, SAMBA_TELECO, SAMBA_FINGERS, SAMBA_BASS, SAMBA_AGOGO, SAMBA_GINGA };
}
