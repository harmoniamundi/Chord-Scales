// band/baden-plan.js — jeu « violão brésilien » de l'orchestre « Guitare », dans l'esprit de Baden Powell (afro-sambas, sambas
// de Baden et Vinicius), sans DOM. Chargé par index.html via <script src="app/band/baden-plan.js"> (avant band/guitar-plan.js,
// qui lui passe la main quand la phrase porte `ph.baden`) et testé par band/baden-plan.test.js.
// Fonctions pures : ce qui dépendait de JamEngine (`this`) passe par l'objet `env` (comme band/guitar-plan.js) :
//   env.transOffset, env.findChordObj(id), env.splitBeat, env.bpm, env.density (curseur « Densité », 0 à 1)
//   env.state.gtrVoice   voix de la guitare (partagée avec le jeu classique : basse + voicing aigu)
//   env.state.badenHold  { key, n } : accord en cours et nombre de mesures déjà jouées sur lui (ligne chromatique « clichê »)
// Les outils de voicing de la guitare classique (gtrVoice…) sont passés par band/guitar-plan.js dans `tools`, pour éviter
// un chargement croisé des deux fichiers sous Node.
//
// ===================== Ce que la guitare joue =====================
// Le violão de Baden Powell est une petite batterie à lui seul : le pouce fait le surdo, les doigts font le tamborim.
//  - La mesure se compte en doubles-croches (4 cases par temps) et le cycle dure deux temps forts-faibles (2 mesures de 2/4,
//    ou une mesure de 4/4) : le motif des doigts est écrit sur 16 cases et lu en continu d'une mesure à l'autre.
//  - Pouce (lane à part) : basse sur chaque temps, légère sur le temps 1, appuyée et plus longue sur le 2 (« surdo de marcação »),
//    fondamentale puis quinte grave ; selon la phrase, une levée en double-croche avant le temps fort (figure pointée), ou une
//    note de passage chromatique qui annonce la basse de l'accord suivant.
//  - Doigts : surtout des NOTES DÉTACHÉES (une corde à la fois, brèves, un peu plus longues sur les appuis), prises dans le
//    voicing de l'accord, avec des notes de passage de la gamme sur les doubles-croches faibles ; quelques appuis doublés
//    (deux cordes) et, rarement, un accord pincé. Entre les notes, quelques notes étouffées (« abafado », effet percussif).
//    Motifs : partido alto, batida, afro-samba (Canto de Ossanha), samba-canção, berimbau, arpejo en doubles-croches continues.
//  - Petite « ginga » : les doubles-croches faibles sont à peine retardées, comme dans la samba jouée.
//  - Sur un accord mineur tenu (triade ou add9), une voix intérieure descend chromatiquement mesure après mesure
//    (fondamentale → septième majeure → septième → sixte : Rém, Rém(maj7), Rém7, Rém6), cliché du violão brésilien.
//  - Mesures « riff » (la plupart des phrases, plusieurs mesures sur quatre) : la guitare chante. Soit une figure mélodique aux doigts sur
//    la gamme de l'accord (ostinato modal façon Berimbau / Ossanha, répété et varié) pendant que le pouce garde les temps ;
//    soit une « baixaria » : le pouce chante une ligne grave en doubles-croches et les doigts ne gardent que deux pincés.
//  - Dernière mesure d'une phrase (avant un changement d'accord) : « virada », le pouce descend ou monte en doubles-croches
//    vers la basse de l'accord suivant.
//  - Dernier accord de la grille (sans boucle) : coup étouffé, puis l'accord plein roulé qui résonne, avec un coup sur la table.
//
// ===================== Les percussions (très discrètes) =====================
//  Agogô (cloche aiguë / grave) en motif de deux mesures et ganzá en doubles-croches (accent sur la dernière de chaque temps),
//  comme sur les enregistrements des afro-sambas ; elles n'entrent qu'avec l'intensité de la phrase et s'effacent dans les
//  mesures « riff ». Le curseur « Percus. » du pop-up Orchestre les règle (à zéro : guitare seule). Elles ont leur propre
//  tirage au sort, pour ne pas décaler celui de la guitare.

if (typeof bassPc === 'undefined' && typeof require === 'function') {
    var { bassPc } = require('./band-helpers.js');
}
const BDN_SCALES = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

const BDN_SPB = 4;                                    // cases (doubles-croches) par temps
const BDN_CYCLE = 16;                                 // cycle des doigts : 16 doubles-croches (2 × 2/4)
const BDN_BASS_LO = 40, BDN_BASS_HI = 55;             // registre du pouce : mi2 à sol3
const BDN_MEL_LO = 60, BDN_MEL_HI = 76;               // registre des riffs aux doigts : do4 à mi5
const bdnMod = (n) => ((n % 12) + 12) % 12;
const bdnClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bdnCell = (s) => s.split(' ');

// Motifs des doigts sur 16 doubles-croches, en NOTES DÉTACHÉES : 1 2 3 4 = note aiguë de ce rang (1 la plus grave du voicing,
// 4 au-dessus de la plus aiguë), . rien. Sur certains appuis, la note est doublée (deux cordes) ; les accords pincés sont rares.
const BDN_FINGERS = [
    '3 . . 2 . . 4 . . 3 . . 2 . 3 .',   // partido alto
    '. 2 . 3 4 . 3 . . 2 . 3 . 4 2 .',   // batida de samba
    '3 . . 2 . . 3 . 4 . . 3 . . 2 .',   // afro-samba (Canto de Ossanha) : 3 + 3 + 2 dans chaque mesure
    '. . 2 . 3 . . 4 . . 3 . 2 . . 1',   // samba-canção, plus aéré
    '2 . 3 2 . 3 . 4 . 2 3 . 2 . 3 .',   // berimbau : notes serrées
    '1 2 3 2 4 3 2 3 1 2 3 4 3 2 3 2'    // arpejo : doubles-croches continues (phrases intenses ou densité forte)
].map(bdnCell);
const BDN_FINGER_NAMES = ['partido alto', 'batida', 'afro-samba', 'samba-canção', 'berimbau', 'arpejo'];

// Rythmes des riffs aux doigts (16 cases, x = note) : cellules d'ostinato modal
const BDN_RIFF_RHYTHM = [
    'x . x x . x . x . x x . x . x .',
    'x . . x . . x . x . x . x . . .',
    'x x . x . x x . x . x x . x . .',
    '. x . x x . x . . x . x x . x .'
].map(bdnCell);

// Contours des riffs : décalages successifs sur l'échelle de la gamme (0 = note de départ)
const BDN_RIFF_SHAPES = [
    [0, 0, -1, -2, -1, 0, 1, 0],
    [0, 2, 1, 0, -1, 0, -2, -1],
    [0, -1, 0, 1, 2, 1, 0, -1],
    [0, 1, 0, -2, -1, -2, -3, -2],
    [0, 0, 2, 1, 0, -1, -2, 0]
];

// ---------------------------------------------------------------------------------------------
// Phrase : choix faits une fois et gardés pendant toute la phrase
// ---------------------------------------------------------------------------------------------
function badenPhraseExtras(ctx, rng, prev, index) {
    if (!ctx || ctx.groove !== 'g-baden' || ctx.ternary) return {};
    const pl = (prev && prev.baden) ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.38 + rng() * 0.2 : prevI + (0.55 - prevI) * 0.25 + (rng() - 0.5) * 0.45;
    I = bdnClamp(I, 0.28, 0.92);
    // le motif des doigts tend à rester d'une phrase à l'autre (un guitariste ne change pas de batida à chaque phrase)
    const fingers = (pl && rng() < 0.55) ? pl.fingers : Math.floor(rng() * BDN_FINGERS.length);
    // le motif « bis » (mesures 3-4 de la phrase) va volontiers vers l'arpejo continu quand la phrase est intense
    const fingersAlt = rng() < 0.25 + 0.4 * I ? BDN_FINGERS.length - 1 : (rng() < 0.5 ? fingers : Math.floor(rng() * BDN_FINGERS.length));
    const r = rng();
    return {
        baden: true,
        intensity: I,
        fingers, fingersAlt,
        thumb: rng() < 0.45 + 0.3 * I ? 1 : 0,          // 1 : levée en double-croche avant le temps fort (figure pointée)
        abafa: 0.05 + 0.22 * I,                         // part des cases vides remplies d'une note étouffée
        chordP: 0.06 + 0.12 * I,                        // rare : un appui joué en accord pincé plutôt qu'en note
        dyadP: 0.15 + 0.15 * I,                         // un appui doublé (deux cordes)
        passP: 0.3 + 0.2 * rng(),                       // part des notes faibles remplacées par une note de passage de la gamme
        riff: r < 0.7 ? (rng() < 0.75 ? 'top' : 'baixo') : null,
        riffRhythm: Math.floor(rng() * BDN_RIFF_RHYTHM.length),
        riffShape: Math.floor(rng() * BDN_RIFF_SHAPES.length),
        cliche: rng() < 0.75,
        virada: rng() < 0.55 + 0.3 * I,
        approach: 0.3 + 0.35 * I,                       // chance d'annoncer la basse de l'accord suivant
        ginga: 0.018 + rng() * 0.02,                    // retard des doubles-croches faibles (en temps)
        roll: 0.004 + rng() * 0.004,                    // retard (s) entre deux cordes d'un pincé
        golpe: I > 0.6 && rng() < 0.6,                  // coups sur la table sur certains temps forts
        perc: I > 0.42 || rng() < 0.3
    };
}

// ---------------------------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------------------------
function bdnHashRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Accord mineur « simple » (triade ou add9) : la voix intérieure peut y descendre chromatiquement.
function bdnClicheable(notes) {
    const r0 = notes[0] || 0;
    const s = new Set(notes.map(x => bdnMod(x - r0)));
    if (!s.has(3) || !s.has(7) || s.has(4)) return false;
    return [...s].every(x => x === 0 || x === 3 || x === 7 || x === 2);
}

// Échelle de la gamme de l'accord (hauteurs réelles croissantes entre lo et hi) et classes de hauteur de l'accord.
function bdnLadder(env, cs, lo, hi) {
    const off = env.transOffset;
    const notes = env.findChordObj(cs.chordId).notes;
    const rootPc = bdnMod(cs.rootIndex + (notes[0] || 0) + off);
    const r0 = notes[0] || 0;
    const s = new Set(notes.map(x => bdnMod(x - r0)));
    const def = cs.scaleId && BDN_SCALES[cs.scaleId];
    let iv;
    if (def && Array.isArray(def.intervals) && def.intervals.length >= 5) iv = def.intervals;
    else if (s.has(3) && !s.has(4)) iv = s.has(6) ? [0, 2, 3, 5, 6, 8, 10] : [0, 2, 3, 5, 7, 9, 10];   // dorien (ou locrien #2)
    else if (s.has(10)) iv = s.has(1) ? [0, 1, 4, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 10];              // mixolydien (ou phrygien dominant)
    else iv = [0, 2, 4, 5, 7, 9, 11];
    const pcs = new Set(iv.map(x => bdnMod(rootPc + x)));
    const tones = new Set(notes.map(x => bdnMod(cs.rootIndex + x + off)));
    const ladder = [];
    for (let m = lo; m <= hi; m++) if (pcs.has(bdnMod(m))) ladder.push(m);
    return { ladder, tones, rootPc };
}

// Basse de l'accord suivant, au plus près de la basse actuelle, dans le registre du pouce.
function bdnNextBass(env, nextCs, cur) {
    const pc = bdnMod(bassPc(env, nextCs) + env.transOffset);
    let best = null;
    for (let m = BDN_BASS_LO; m <= BDN_BASS_HI; m++) {
        if (bdnMod(m) !== pc) continue;
        if (best === null || Math.abs(m - cur) < Math.abs(best - cur)) best = m;
    }
    return best;
}

// Virada : quatre doubles-croches du pouce qui mènent à la basse suivante (gamme de l'accord, dernier pas chromatique).
function bdnVirada(env, cs, bass, target, rng) {
    if (target === null || target === bass) return null;
    const { ladder } = bdnLadder(env, cs, BDN_BASS_LO - 2, BDN_BASS_HI + 2);
    const dir = target > bass ? 1 : -1;
    const last = target - dir;                     // demi-ton d'approche
    const path = [];
    let x = last;
    for (let k = 0; k < 3; k++) {
        // on remonte le chemin à rebours : notes de la gamme, du côté de la basse actuelle
        const cands = ladder.filter(m => (dir > 0 ? m < x : m > x));
        if (!cands.length) break;
        x = dir > 0 ? cands[cands.length - 1] : cands[0];
        path.unshift(x);
    }
    path.push(last);
    while (path.length < 4) path.unshift(path[0]);
    return rng() < 0.25 ? path.map((m, k) => (k === 0 ? bass : m)) : path;
}

// ---------------------------------------------------------------------------------------------
// Plan d'une mesure
// ---------------------------------------------------------------------------------------------
// tools = { gtrVoice, GTR_BASE } (band/guitar-plan.js)
function buildBadenPlan(env, bpb, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m, tools) {
    const rng = ph.rng;
    const I = ph.intensity;
    const off = env.transOffset;
    const base = tools.GTR_BASE;
    const spb = BDN_SPB;
    const splitAt = env.splitBeat || 2;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.76 + 0.3 * I) * (0.95 + 0.05 * prog) * (isTurn ? 0.96 : 1);
    const dens = Number.isFinite(env.density) ? bdnClamp(env.density, 0, 1) : 0.5;
    const tooFast = (env.bpm || 100) > 150;            // au-delà, les doubles-croches faibles des doigts tombent
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const holdOn = !changeNext && !!nextStep;
    const isFinal = !nextStep && isLastMeasureOfStep;
    const ev = [], drums = [];
    const clamp = (v) => bdnClamp(v, 0.1, 1);
    const toWritten = (mid) => mid - base - off;
    const Nfull = Math.round(bpb * spb);
    const ii = Math.max(0, i | 0);                     // rang de la mesure dans la phrase (jamais négatif, même hors lecture)
    const cycleAt = (ii * Nfull) % BDN_CYCLE;          // la mesure reprend le cycle de 16 cases là où la précédente l'a laissé
    const pair = Math.floor(ii / 2) % 2 === 1;         // une paire de mesures sur deux
    const riffBar = !!ph.riff && (pair || ii % 4 === 1) && !(isTurn && changeNext) && !isFinal && bpb >= 2;   // la virada garde la fin de phrase
    const fPat = BDN_FINGERS[((ii % 4) >= 2 ? ph.fingersAlt : ph.fingers) % BDN_FINGERS.length];
    const ginga = (k) => (k % 2 === 1 ? ph.ginga : 0);

    segs.forEach((sg, si) => {
        const lastOne = si === segs.length - 1;
        const voice = tools.gtrVoice(env, sg.cs, env.state.gtrVoice);
        env.state.gtrVoice = voice;
        const { bass } = voice;
        let alt = voice.alt;
        if (alt > bass && alt - 12 >= BDN_BASS_LO) alt -= 12;          // la quinte du surdo se joue sous la fondamentale
        const N = Math.round((sg.e - sg.s) * spb);
        const k0 = Math.round(sg.s * spb);
        const posOf = (k) => sg.s + k / spb + ginga(k + k0);
        const endPos = sg.e + (isFinal && lastOne ? 2.5 : ((lastOne && holdOn) ? 0.6 : 0.02));
        const ring = (pos, max) => Math.max(0.12, Math.min(endPos - pos, max));
        const notesOf = env.findChordObj(sg.cs.chordId).notes;

        // ---------- ligne chromatique sur un accord mineur tenu ----------
        let up = voice.up.slice();
        const hk = voice.key;
        const hold = env.state.badenHold && env.state.badenHold.key === hk ? env.state.badenHold : { key: hk, n: -1 };
        if (si === 0 || !halves) { hold.n += 1; env.state.badenHold = hold; }
        if (ph.cliche && !halves && bdnClicheable(notesOf) && hold.n >= 1) {
            const rootPc = bdnMod(sg.cs.rootIndex + (notesOf[0] || 0) + off);
            const step4 = [0, 11, 10, 9][hold.n % 4];
            const linePc = bdnMod(rootPc + step4);
            // la voix la plus proche de la fondamentale (ou la plus grave des voix aiguës) porte la ligne
            let j = up.findIndex(x => bdnMod(x) === rootPc);
            if (j < 0) j = 0;
            // hauteur de la ligne : la plus proche de cette voix, de préférence en dessous (la ligne descend)
            let nv = up[j];
            for (let d = 0; d <= 6; d++) {
                if (bdnMod(up[j] - d) === linePc) { nv = up[j] - d; break; }
                if (d > 0 && d <= 2 && bdnMod(up[j] + d) === linePc) { nv = up[j] + d; break; }
            }
            up[j] = nv;
            up = up.sort((a, b) => a - b).filter((x, q, arr) => q === 0 || x !== arr[q - 1]);
        }
        const top = (n) => up.slice(-n);

        const addEvent = (pos, notes, o) => {
            const sorted = notes.slice().sort((a, b) => a - b).filter((x, j, arr) => j === 0 || x !== arr[j - 1]);
            const c = sorted.length;
            const nv = sorted.map((x, j) => (c === 1 ? 1 : (j === c - 1 ? 1 : (j === 0 ? 0.9 : 0.8))));
            ev.push(Object.assign({
                pos: bdnClamp(pos, 0, bpb - 0.01), dur: o.dur, vel: clamp(o.vel * gv),
                rootIndex: 0, intervals: sorted.map(toWritten), noteVels: nv,
                roll: c > 1 ? (o.roll !== undefined ? o.roll : ph.roll) : 0, dir: o.dir || 1, lay: rng() * 0.005, wide: true, gainMul: 1.15, tok: o.tok
            }, o.mute ? { mute: true } : {}));
        };
        const golpe = (pos, vel) => drums.push({ pos: bdnClamp(pos, 0, bpb - 0.01), drum: 'golpe', vel, onGuitar: true, tok: 'G' });

        // ---------- dernier accord de la grille ----------
        if (isFinal && lastOne && si === 0) {
            addEvent(sg.s, top(3), { vel: 0.5, dur: 0.06, mute: true, tok: 'm' });
            addEvent(sg.s + 0.5, [bass].concat(up), { vel: 0.82, dur: ring(sg.s + 0.5, bpb + 2.5), roll: 0.03 + rng() * 0.015, tok: 'R' });
            golpe(sg.s + 0.5, 0.6);
            return;
        }

        // ---------- pouce : surdo sur chaque temps (temps 1 léger, temps 2 appuyé), levées, approche, virada ----------
        const thumb = new Array(N).fill(null);
        for (let k = 0; k < N; k += spb) {
            const gb = Math.round((k + k0) / spb);       // temps dans la mesure
            const strong = gb % 2 === 1;                 // 2e temps de chaque groupe de deux : l'appui du surdo
            thumb[k] = strong ? { midi: alt, vel: 0.84, dur: 1.05, tok: 'b' } : { midi: bass, vel: 0.62, dur: 0.7, tok: 'B' };
            if (ph.thumb === 1 && strong && k - 1 >= 0 && !thumb[k - 1] && rng() < 0.75) thumb[k - 1] = { midi: bass, vel: 0.46, dur: 0.22, tok: 'p' };
        }
        // première note d'un nouvel accord : la fondamentale, appuyée
        if (thumb[0]) thumb[0] = { midi: bass, vel: thumb[0].tok === 'b' ? 0.84 : 0.7, dur: thumb[0].dur, tok: 'B' };
        let viradaNotes = null;
        const nextBass = (changeNext && lastOne) ? bdnNextBass(env, nextStep, bass) : null;
        if (changeNext && lastOne && N >= 8 && isTurn && ph.virada) viradaNotes = bdnVirada(env, sg.cs, bass, nextBass, rng);
        if (viradaNotes) {
            for (let q = 0; q < 4; q++) thumb[N - 4 + q] = { midi: viradaNotes[q], vel: 0.6 + 0.05 * q, dur: 0.3, tok: 'v' };
        } else if (changeNext && lastOne && N >= 4 && nextBass !== null && nextBass !== bass && rng() < ph.approach) {
            const side = bass >= nextBass ? 1 : -1;
            const a = nextBass + side;
            if (a >= BDN_BASS_LO && a <= BDN_BASS_HI) thumb[N - 1] = { midi: a, vel: 0.55, dur: 0.25, tok: 'A' };
        }

        // ---------- baixaria : le pouce chante, les doigts ne gardent que deux pincés ----------
        const baixo = riffBar && ph.riff === 'baixo' && N >= 8 && !halves;
        if (baixo) {
            const { ladder } = bdnLadder(env, sg.cs, BDN_BASS_LO, BDN_BASS_HI + 5);
            let idx = Math.max(0, ladder.indexOf(bass));
            if (idx < 0) idx = 0;
            const shape = BDN_RIFF_SHAPES[ph.riffShape % BDN_RIFF_SHAPES.length];
            let q = 0;
            for (let k = 0; k < N; k++) {
                const strongBeat = k % spb === 0;
                if (!strongBeat && k % 2 === 1 && rng() < 0.35) { if (k > 0) thumb[k] = null; continue; }
                if (strongBeat && k === 0) continue;                         // la basse de l'accord reste sur le temps 1
                if (thumb[k] && thumb[k].tok === 'v') continue;
                const j = bdnClamp(idx + shape[q % shape.length] + (q >= shape.length ? -1 : 0), 0, ladder.length - 1);
                thumb[k] = { midi: ladder[j], vel: strongBeat ? 0.68 : 0.55, dur: 0.3, tok: 'x' };
                q++;
            }
        }

        thumb.forEach((t, k) => {
            if (!t) return;
            const pos = posOf(k);
            addEvent(pos, [t.midi], { vel: t.vel, dur: ring(pos, t.dur), tok: t.tok });
        });

        // ---------- doigts ----------
        if (riffBar && ph.riff === 'top' && !halves) {
            // riff modal aux doigts : ostinato sur la gamme de l'accord, cible sur une note de l'accord
            const { ladder, tones } = bdnLadder(env, sg.cs, BDN_MEL_LO, BDN_MEL_HI);
            if (ladder.length >= 4) {
                const rh = BDN_RIFF_RHYTHM[ph.riffRhythm % BDN_RIFF_RHYTHM.length];
                const shape = BDN_RIFF_SHAPES[ph.riffShape % BDN_RIFF_SHAPES.length];
                let startIdx = ladder.findIndex(x => tones.has(bdnMod(x)) && x >= 66);
                if (startIdx < 0) startIdx = Math.floor(ladder.length / 2);
                let q = (ii % 2) * 3;                                          // la 2e mesure de la paire reprend la figure plus loin
                for (let k = 0; k < N; k++) {
                    if (rh[(k + cycleAt) % BDN_CYCLE] !== 'x') continue;
                    if (tooFast && k % 2 === 1) continue;
                    let j = bdnClamp(startIdx + shape[q % shape.length], 0, ladder.length - 1);
                    if (k % spb === 0 && !tones.has(bdnMod(ladder[j]))) {   // sur le temps, une note de l'accord si elle est à un degré
                        for (const d of [-1, 1]) if (j + d >= 0 && j + d < ladder.length && tones.has(bdnMod(ladder[j + d]))) { j += d; break; }
                    }
                    const pos = posOf(k);
                    // sur l'appui, la note est doublée à la tierce inférieure de la gamme (sonorité de deux cordes)
                    const two = k % spb === 0 && j - 2 >= 0 && rng() < 0.2;
                    addEvent(pos, two ? [ladder[j - 2], ladder[j]] : [ladder[j]], { vel: (k % spb === 0 ? 0.66 : 0.56) + 0.06 * I, dur: ring(pos, k % spb === 0 ? 0.35 : 0.22), tok: 'r' });
                    q++;
                }
                return;
            }
        }

        // notes détachées : chaque note sonne brièvement (le doigt reprend la corde), un peu plus sur les appuis
        const { ladder: fl } = bdnLadder(env, sg.cs, 52, 81);
        // rang 1 = note la plus grave du voicing aigu ; au-delà du nombre de notes, l'octave au-dessus si la guitare l'atteint
        const rankNote = (r) => {
            if (r <= up.length) return up[r - 1];
            const x = up[(r - 1) % up.length] + 12 * Math.floor((r - 1) / up.length);
            return x <= 81 ? x : up[up.length - 1];
        };
        let lastNote = null;
        for (let k = 0; k < N; k++) {
            const g = (k + k0 + cycleAt) % BDN_CYCLE;
            let tok = fPat[g];
            if (baixo) tok = (k === 2 || k === N - 4) ? '3' : '.';
            if (tok === '.' && !baixo) {
                // cases vides : de temps en temps une note étouffée, ou (densité forte) une note de plus
                const fill = ph.abafa * (0.4 + dens);
                if (k % 2 === 1 && !tooFast && rng() < fill * 0.5) tok = 'm';
                else if (dens > 0.6 && rng() < (dens - 0.6) * 1.4) tok = String(1 + Math.floor(rng() * Math.min(4, up.length + 1)));
            } else if (/^[1-4]$/.test(tok) && dens < 0.35 && k % spb !== 0 && rng() < (0.35 - dens) * 2) tok = '.';
            if (tooFast && k % 2 === 1) tok = '.';
            if (halves && si > 0 && k === 0 && tok === '.') tok = '3';     // un changement d'accord en milieu de mesure sonne
            if (tok === '.') continue;
            const pos = posOf(k);
            let gap = 1; while (k + gap < N && fPat[(g + gap) % BDN_CYCLE] === '.') gap++;
            const gapB = gap / spb;
            const accent = k % spb === 0 || (g % 8 === 3) || (g % 8 === 6);   // temps et appuis du partido alto
            if (tok === 'm') {
                addEvent(pos, [lastNote !== null ? lastNote : top(1)[0]], { vel: 0.3 + 0.1 * I, dur: 0.05, mute: true, tok });
                continue;
            }
            let note = rankNote(Number(tok));
            // note de passage : sur une double-croche faible, la note voisine dans la gamme (vers la note suivante)
            if (!accent && fl.length && rng() < ph.passP) {
                const j = fl.indexOf(note);
                const dir = lastNote !== null && lastNote > note ? 1 : -1;
                if (j >= 0 && fl[j + dir] !== undefined && fl[j + dir] !== lastNote) note = fl[j + dir];
            }
            const det = accent ? bdnClamp(gapB * 0.9, 0.2, 0.5) : bdnClamp(gapB * 0.75, 0.12, 0.3);
            const vel = (accent ? 0.66 : 0.54) + 0.06 * I + (rng() - 0.5) * 0.06;
            if (accent && rng() < ph.chordP && k % spb === 0) {
                addEvent(pos, top(3), { vel: vel + 0.04, dur: ring(pos, bdnClamp(gapB, 0.25, 0.6)), tok: 'c' });
                if (ph.golpe && rng() < 0.5) golpe(pos, 0.3 + 0.2 * I);
            } else if (accent && rng() < ph.dyadP) {
                // deux cordes : la note et la note de l'accord juste en dessous
                const below = up.filter(x => x < note).pop();
                addEvent(pos, below !== undefined ? [below, note] : [note], { vel, dur: ring(pos, det), roll: 0.002, tok: 'd' });
            } else {
                addEvent(pos, [note], { vel, dur: ring(pos, det), tok: 'n' });
            }
            lastNote = note;
        }
    });

    // ---------- percussions discrètes : agogô et ganzá (cycle de 16 cases, indépendant du découpage en accords) ----------
    if (ph.perc && !isFinal) {
        const prng = bdnHashRng(Math.imul(ph.fingers * 97 + ph.riffShape * 13 + ph.riffRhythm * 5 + 1, 2654435761) + (ii + 1) * 7919 + ((m || 0) + 1) * 31);
        const lite = riffBar ? 0.6 : 1;
        const pv = (0.6 + 0.5 * I) * lite * (0.96 + 0.04 * prog);
        const perc = (k, drum, vel) => drums.push({ pos: bdnClamp(k / spb + ginga(k), 0, bpb - 0.01), drum, vel: bdnClamp(vel * pv, 0.05, 1), perc: true, tok: drum });
        // agogô : motif afro-samba de deux mesures (aigu / grave)
        const AGO = 'h . h . l . h . h . l . h . l .';
        const ago = bdnCell(AGO);
        if (I > 0.5 || prng() < 0.4) {
            for (let k = 0; k < Nfull; k++) {
                const t = ago[(k + cycleAt) % BDN_CYCLE];
                if (t === 'h') perc(k, 'agogoh', 0.16 + 0.04 * prng());
                else if (t === 'l') perc(k, 'agogol', 0.18 + 0.04 * prng());
            }
        }
        // ganzá : doubles-croches, accent sur la dernière de chaque temps
        for (let k = 0; k < Nfull; k++) {
            if ((env.bpm || 100) > 150 && k % 2 === 1) continue;
            const acc = k % spb === 3;
            if (!acc && prng() < 0.15) continue;
            perc(k, 'ganza', acc ? 0.15 : 0.08);
        }
    }

    ev.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums, classicalGuitar: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        badenPhraseExtras, buildBadenPlan, bdnClicheable, bdnLadder, bdnVirada, bdnNextBass, bdnHashRng,
        BDN_FINGERS, BDN_FINGER_NAMES, BDN_RIFF_RHYTHM, BDN_RIFF_SHAPES, BDN_CYCLE, BDN_SPB
    };
}
