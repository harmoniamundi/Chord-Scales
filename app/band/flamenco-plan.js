// band/flamenco-plan.js — toque flamenco de l'orchestre « Guitare » : une guitare flamenca seule qui accompagne la grille comme
// un guitariste de cante (toque de acompañamiento), sans DOM. Chargé par index.html via <script src="app/band/flamenco-plan.js">
// (avant band/guitar-plan.js, qui lui passe la main quand la phrase est flamenca) et testé par band/flamenco-plan.test.js.
// Fonctions pures : ce qui dépendait de JamEngine (`this`) passe par l'objet `env` (comme band/guitar-plan.js) :
//   env.transOffset, env.findChordObj(id), env.splitBeat, env.bpm
//
// ===================== Ce que la guitare joue =====================
//  - Les accords sont ceux d'un vrai guitariste : formes à cordes à vide (La mineur 002210, Mi majeur 022100, Sol 320003, Fa en barré…)
//    avec « cejilla » (capodastre) quand la fondamentale n'est pas celle d'une forme ouverte ; jamais de renversement « de piano ».
//  - Le compás (cycle rythmique) est écrit en « cases » : un tiers de pulsation en 12/8 (donc les 12 temps du flamenco : les accents
//    tombent sur 12, 3, 6, 8 et 10 ; la mesure commence sur le temps 12), une croche en 4/4 (rumba / tangos).
//    Chaque case porte un geste :
//      D coup de pouce / rasgueo plein vers le bas (toutes les cordes, accentué)   d coup léger vers le bas (cordes aiguës)
//      U coup d'index vers le haut (cordes aiguës)     S accord étouffé, très court (« seco »)
//      A abanico : 4 coups d'ongles qui s'éventaillent en crescendo          a rasgueo court en trois coups (bas, haut, bas)
//      T pouce sur la basse   t pouce sur la seconde basse   1 2 3 doigts sur les trois cordes aiguës (de la plus aiguë à la plus grave)
//      . silence (les cordes s'éteignent avec la main droite)
//    Un geste peut être accompagné d'un golpe (coup d'annulaire sur la table : D/G fort, D/g léger).
//  - Les mesures « falseta » remplacent le rasgueo par une phrase mélodique à une voix (picado) dans la gamme de l'accord
//    (phrygien dominant sur le Mi, éolien sur le La mineur…), qui retombe sur les accents du compás ; le pouce marque la basse.
//  - La dernière mesure d'une phrase est un « remate » (rasgueos enchaînés qui lancent le compás suivant) ; sur le dernier accord
//    de la grille, un abanico et un golpe concluent.
//  - Au dernier temps d'un accord qui va changer, le coup montant annonce parfois l'accord suivant (« adelanto »).

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux.
const FLA_H = (typeof bassPc !== 'undefined') ? { bassPc } : require('./band-helpers.js');
const FLA_SCALES = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

const FLA_BASE = 48;                                   // hauteur réelle de la note écrite 0 (do3), comme band/guitar-plan.js
const FLA_OPEN = [40, 45, 50, 55, 59, 64];             // cordes à vide : mi2 la2 ré3 sol3 si3 mi4
const flaMod = (n) => ((n % 12) + 12) % 12;
const flaClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------------------------
// Formes d'accords : cases frettées de la corde grave à l'aiguë (null = corde non jouée), fondamentale à vide `pc`
// ---------------------------------------------------------------------------------------------
const FLA_SHAPES = [
    { f: 'M', pc: 4, fr: [0, 2, 2, 1, 0, 0] },        // Mi
    { f: 'M', pc: 9, fr: [null, 0, 2, 2, 2, 0] },     // La
    { f: 'M', pc: 2, fr: [null, null, 0, 2, 3, 2] },  // Ré
    { f: 'M', pc: 7, fr: [3, 2, 0, 0, 0, 3] },        // Sol
    { f: 'M', pc: 0, fr: [null, 3, 2, 0, 1, 0] },     // Do
    { f: 'm', pc: 9, fr: [null, 0, 2, 2, 1, 0] },     // La mineur
    { f: 'm', pc: 4, fr: [0, 2, 2, 0, 0, 0] },        // Mi mineur
    { f: 'm', pc: 2, fr: [null, null, 0, 2, 3, 1] },  // Ré mineur
    { f: '7', pc: 4, fr: [0, 2, 0, 1, 0, 0] },        // Mi7
    { f: '7', pc: 9, fr: [null, 0, 2, 0, 2, 0] },     // La7
    { f: '7', pc: 2, fr: [null, null, 0, 2, 1, 2] },  // Ré7
    { f: '7', pc: 7, fr: [3, 2, 0, 0, 0, 1] },        // Sol7
    { f: '7', pc: 0, fr: [null, 3, 2, 3, 1, 0] },     // Do7
    { f: '7', pc: 11, fr: [null, 2, 1, 2, 0, 2] },    // Si7
    { f: '7b9', pc: 4, fr: [0, 2, 0, 1, 0, 1] },      // Mi7(b9) : la neuvième mineure sur la corde aiguë (fa4)
    { f: '7b9', pc: 11, fr: [null, 2, 1, 2, 1, 2] }   // Si7(b9)
];

// Famille d'accord (M, m, 7, 7b9) d'après ses intervalles ; null quand la forme ne s'y prête pas (suspendu, diminué…).
function flaFamily(notes) {
    const r0 = notes[0] || 0;
    const s = new Set(notes.map(x => flaMod(x - r0)));
    if (s.has(4) && s.has(10)) return s.has(1) ? '7b9' : '7';
    if (s.has(3) && !s.has(4)) return (s.has(6) && !s.has(7)) ? null : 'm';
    if (s.has(4)) return 'M';
    return null;
}

// Forme (et position de cejilla) la plus proche de la position ouverte pour cette fondamentale ; null si trop haute.
function flaPickShape(fam, rootPc) {
    let best = null;
    FLA_SHAPES.forEach(sh => {
        if (sh.f !== fam) return;
        const capo = flaMod(rootPc - sh.pc);
        if (capo > 7) return;
        const cost = capo > 0 ? capo + 0.6 : 0;
        if (!best || cost < best.cost) best = { sh, capo, cost };
    });
    return best;
}

// Voicing générique (accord sur basse, suspendu, diminué…) : basse entre mi2 et mi3, notes de l'accord au-dessus.
function flaGenericVoice(env, cs, notes) {
    const off = env.transOffset;
    const bpc = flaMod(FLA_H.bassPc(env, cs) + off);
    let bass = 40 + flaMod(bpc - 40);
    if (bass > 52) bass -= 12;
    const pcs = [];
    notes.forEach(iv => { const pc = flaMod(cs.rootIndex + iv + off); if (!pcs.includes(pc)) pcs.push(pc); });
    const pool = pcs.length > 3 ? pcs.filter(pc => pc !== bpc) : pcs.slice();
    const all = [bass];
    let cur = bass + 4;
    pool.slice(0, 4).forEach(pc => {
        let n = cur + flaMod(pc - cur);
        if (n - all[all.length - 1] < 3) n += 12;
        all.push(n); cur = n;
    });
    while (all[all.length - 1] > 76 && all.length > 2) all.pop();
    return all;
}

// Cordes jouées par l'accord (hauteurs réelles, de la plus grave à la plus aiguë).
// Renvoie { key, all, bass, alt, shape } : `all` = toutes les cordes, `bass` la basse du pouce, `alt` la seconde basse.
function flaVoice(env, cs) {
    const off = env.transOffset;
    const notes = env.findChordObj(cs.chordId).notes;
    const r0 = notes[0] || 0;
    const rootPc = flaMod(cs.rootIndex + r0 + off);
    const slash = Number.isInteger(cs.bassRootIndex) && flaMod(cs.bassRootIndex + off) !== rootPc;
    const fam = flaFamily(notes);
    const key = cs.rootIndex + ':' + cs.chordId + ':' + (Number.isInteger(cs.bassRootIndex) ? cs.bassRootIndex : '-');
    let all = null, shape = null;
    if (fam && !slash) {
        const p = flaPickShape(fam, rootPc);
        if (p) {
            all = [];
            p.sh.fr.forEach((f, s) => { if (f !== null) all.push(FLA_OPEN[s] + f + p.capo); });
            shape = fam + '+' + p.capo;
        }
    }
    if (!all) all = flaGenericVoice(env, cs, notes);
    return { key, all, bass: all[0], alt: all.length > 1 ? all[1] : all[0], shape };
}

// ---------------------------------------------------------------------------------------------
// Cycles rythmiques (compás) : un geste par case. Voir l'en-tête pour le sens des lettres.
// ---------------------------------------------------------------------------------------------
const flaCell = (s) => s.split(' ');
const flaBank = (o) => { const out = {}; Object.keys(o).forEach(k => { out[k] = o[k].map(flaCell); }); return out; };

const FLA_BANK = {
    // Soleá : 12 temps, tempo lent ; la mesure commence sur le temps 12 (cases 0, 3, 6, 8, 10 = temps 12, 3, 6, 8, 10)
    solea: { 12: flaBank({
        base: ['D/G . . D . . D . D . D .', 'D/G . U D . U D . D . D U', 'D . . D . U D . D U D .', 'D/G . . D/g . . D . D . A .', 'D . . A . . D . D . D U'],
        alt:  ['A . . D . . A . D . A .', 'D/G . . A . . D . A . D U', 'T . U D . . T . D . A .'],
        arp:  ['T . 3 2 1 . T . 3 . 2 1', 'T 3 2 1 . . T 2 1 . t 3'],
        turn: ['D/G . . D . . D . D . A A', 'D . . D/g . . D . A . A A']
    }) },
    // Bulerías : 12 temps, tempo vif ; rasgueos plus serrés, contretemps, abanicos
    bulerias: { 12: flaBank({
        base: ['D/G . . D . . D . D . D .', 'D/G . U D . U D U D U D U', 'A/G . . D . . A/g . A . A .', 'D/G . . D/g . . A . D . A .', 'D/G . U D . . D/g . D U A .'],
        alt:  ['T . U D . U T . D U D U', 'D/G . . A . . D/g . A . A .', 'D . U A . . D . D U D U'],
        arp:  ['T . 3 2 1 . T . 3 2 1 3'],
        turn: ['D/G . . D . . D . D . A A', 'D . U D/g . . D U A . A A']
    }) },
    // Rumba / tangos : 4/4 en croches ; accents sur les temps 1 et 3, contretemps du coup montant
    tangos: { 8: flaBank({
        base: ['D . D U . U D U', 'D . d U D . d U', 'D/g . D U . U D U', 'T . D U . U D U'],
        alt:  ['D . D U . U A .', 'D/g . d U D/g . d U'],
        arp:  ['T 3 2 3 T 3 2 1'],
        turn: ['D . D U . U A A']
    }) }
};

// Accents du compás (cases) : 12 temps = 3 + 3 + 2 + 2 + 2 ; sinon les temps de la mesure.
function flaAccents(N, spb) {
    if (N === 12 && spb === 3) return [0, 3, 6, 8, 10];
    const out = [];
    for (let k = 0; k < N; k += spb) out.push(k);
    return out;
}

// Cycle d'une signature qui n'a pas de cycle écrit : un coup plein sur chaque temps, un coup montant entre les temps.
function flaGenericCell(N, spb, kind) {
    const c = [];
    for (let k = 0; k < N; k++) {
        if (k % spb === 0) c.push(k === 0 ? (kind === 'turn' ? 'D/G' : 'D') : 'd');
        else if (spb === 2 || k % spb === spb - 1) c.push(kind === 'arp' ? '.' : 'U');
        else c.push('.');
    }
    if (kind === 'turn') c[N - 1] = 'A';
    if (kind === 'arp') { c[0] = 'T'; for (let k = 1; k < N; k++) if (c[k] === 'd') c[k] = '2'; }
    return c;
}

function flaCellsFor(palo, N, spb, kind) {
    const table = FLA_BANK[palo] && FLA_BANK[palo][N];
    const list = table && table[kind === 'turn' ? 'turn' : kind];
    return list && list.length ? list : [flaGenericCell(N, spb, kind)];
}

// ---------------------------------------------------------------------------------------------
// Phrase : choix faits une fois et gardés pendant toute la phrase
// ---------------------------------------------------------------------------------------------
const FLA_PALO = { 'f-solea': 'solea', 'f-bulerias': 'bulerias', 'f-tangos': 'tangos' };
const FLA_FALSETA_P = { solea: 0.5, bulerias: 0.45, tangos: 0.3 };

// ctx = { groove } ; renvoie les champs à ajouter à la phrase (ph.flamenco vaut le palo, ou rien si le rythme n'est pas flamenco).
function flamencoPhraseExtras(ctx, rng, prev, index) {
    const palo = FLA_PALO[ctx && ctx.groove];
    if (!palo) return {};
    const pl = (prev && prev.flamenco === palo) ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.55;
    let I = index === 0 ? 0.45 + rng() * 0.2 : prevI + (0.55 - prevI) * 0.2 + (rng() - 0.5) * 0.45;
    I = flaClamp(I, 0.3, 0.92);
    return {
        flamenco: palo,
        intensity: I,
        toque: Math.floor(rng() * 100), toque2: Math.floor(rng() * 100), altIdx: Math.floor(rng() * 100),
        arpIdx: Math.floor(rng() * 100), turnIdx: Math.floor(rng() * 100),
        arpP: 0.22 - 0.18 * I,                            // part des mesures en arpège (plus rare quand la phrase est intense)
        altP: 0.2 + 0.4 * I,                              // part des mesures plus rasgueadas
        falseta: rng() < FLA_FALSETA_P[palo],
        falsetaU: rng(),
        roll: 0.004 + rng() * 0.003,                      // retard (s) entre deux cordes d'un rasgueo
        mutate: 0.1 + 0.25 * I                            // chance de petite variation d'une case
    };
}

// ---------------------------------------------------------------------------------------------
// Falseta : phrase à une voix qui retombe sur les accents du compás
// ---------------------------------------------------------------------------------------------
const FLA_DEFAULT_SCALE = { M: [0, 2, 4, 5, 7, 9, 11], m: [0, 2, 3, 5, 7, 8, 10], 7: [0, 2, 4, 5, 7, 9, 10], '7b9': [0, 1, 4, 5, 7, 8, 10] };
const FLA_MEL_LO = 57, FLA_MEL_HI = 79;                 // registre de la mélodie : la3 à sol5

// Gamme de la falseta : hauteurs réelles croissantes dont la classe de hauteur est dans la gamme de l'accord.
function flaLadder(env, cs, fam) {
    const off = env.transOffset;
    const notes = env.findChordObj(cs.chordId).notes;
    const rootPc = flaMod(cs.rootIndex + (notes[0] || 0) + off);
    const def = cs.scaleId && FLA_SCALES[cs.scaleId];
    const iv = def ? def.intervals : (FLA_DEFAULT_SCALE[fam] || FLA_DEFAULT_SCALE.M);
    const pcs = new Set(iv.map(x => flaMod(rootPc + x)));
    const tones = new Set(notes.map(x => flaMod(cs.rootIndex + x + off)));
    const ladder = [];
    for (let m = FLA_MEL_LO; m <= FLA_MEL_HI; m++) if (pcs.has(flaMod(m))) ladder.push(m);
    return { ladder, tones, rootPc };
}

// Ligne mélodique de n notes qui finit sur l'indice `target` de l'échelle : on la construit à rebours, pas par pas (rarement une tierce),
// de préférence en descendant vers la cible, comme les descentes d'une falseta.
function flaRun(len, target, n, rng) {
    const idx = [target];
    let dir = rng() < 0.65 ? 1 : -1;
    for (let k = 1; k < n; k++) {
        if (rng() < 0.2) dir = -dir;
        const step = rng() < 0.8 ? 1 : 2;
        let next = idx[0] + dir * step;
        if (next < 0 || next >= len) { dir = -dir; next = idx[0] + dir * step; }
        next = flaClamp(next, 0, len - 1);
        if (next === idx[0]) next = flaClamp(idx[0] + (idx[0] > 0 ? -1 : 1), 0, len - 1);
        idx.unshift(next);
    }
    return idx;
}

// Notes d'une falseta sur `N` cases : [{ slot (fractionnaire), midi, vel, dur (temps), grace? }], avec le pouce sur les basses.
// `I` : intensité de la phrase (0 à 1) ; la densité (croches ou doubles croches) en dépend.
function flaFalseta(env, cs, voice, N, spb, palo, I, rng) {
    const notes = env.findChordObj(cs.chordId).notes;
    const fam = flaFamily(notes);
    const { ladder, tones } = flaLadder(env, cs, fam);
    if (ladder.length < 3) return [];
    const acc = flaAccents(N, spb);
    const last = acc[acc.length - 1];
    // Onsets : on remplit chaque intervalle entre deux accents d'une figure (silence avec levée, croches ou doubles croches).
    const onsets = [];
    for (let g = 0; g + 1 < acc.length; g++) {
        const a = acc[g], b = acc[g + 1];
        const r = rng();
        const fig = r < 0.18 ? 'pickup' : (r < 0.18 + 0.3 + 0.35 * I ? 'sixteenth' : 'eighth');
        if (fig === 'pickup') { onsets.push(b - 1); if (b - a > 2 && rng() < 0.6) onsets.push(b - 0.5); }
        else if (fig === 'sixteenth') for (let s = a; s < b; s += 0.5) onsets.push(s);
        else for (let s = a; s < b; s += 1) onsets.push(s);
    }
    onsets.push(last);
    const uniq = onsets.filter((s, j) => j === 0 || s > onsets[j - 1] + 1e-6);
    // Cible : une note de l'accord autour de mi4-mi5.
    const cands = [];
    ladder.forEach((m, j) => { if (tones.has(flaMod(m)) && m >= 62 && m <= 76) cands.push(j); });
    const target = cands.length ? cands[Math.floor(rng() * cands.length)] : Math.floor(ladder.length / 2);
    const idx = flaRun(ladder.length, target, uniq.length, rng);
    // Aux accents, la note est une note de l'accord quand c'est possible à un degré près.
    uniq.forEach((s, j) => {
        if (!acc.includes(s) || tones.has(flaMod(ladder[idx[j]]))) return;
        for (const d of [1, -1, 2, -2]) {
            const k = idx[j] + d;
            if (k >= 0 && k < ladder.length && tones.has(flaMod(ladder[k]))) { idx[j] = k; break; }
        }
    });
    const out = [];
    uniq.forEach((s, j) => {
        const isAcc = acc.includes(s);
        const nextS = j + 1 < uniq.length ? uniq[j + 1] : s + 2;
        const gap = (nextS - s) / spb;                       // en temps
        const finalNote = j === uniq.length - 1;
        out.push({
            slot: s, midi: ladder[idx[j]],
            vel: flaClamp(0.5 + 0.1 * I + (isAcc ? 0.13 : 0) + (rng() - 0.5) * 0.08, 0.3, 0.9),
            dur: finalNote ? 1.6 : flaClamp(gap * 1.5, 0.15, 0.9)
        });
        // Petit ornement (note de gamme au-dessus, très brève) avant certains accents
        if (isAcc && s >= 0.6 && !finalNote && idx[j] + 1 < ladder.length && rng() < 0.3 + 0.2 * I) {
            out.push({ slot: s - 0.25, midi: ladder[idx[j] + 1], vel: 0.38, dur: 0.12, grace: true });
        }
    });
    // Le pouce marque la basse sur le temps 12 et sur le 6 (ou sur les temps 1 et 3 en 4/4)
    out.push({ slot: 0, midi: voice.bass, vel: 0.78, dur: 1.4, bass: true });
    const mid = acc[Math.floor(acc.length / 2)];
    if (mid > 0 && mid < last) out.push({ slot: mid, midi: voice.alt, vel: 0.62, dur: 1.0, bass: true });
    return out.sort((a, b) => a.slot - b.slot);
}

// ---------------------------------------------------------------------------------------------
// Plan d'une mesure
// ---------------------------------------------------------------------------------------------
const flaPickIdx = (list, u) => list[Math.floor(u) % list.length];

// Petite variation d'une cellule : un contretemps ajouté ou retiré, jamais sur un accent.
function flaMutate(cell, acc, rng, p) {
    const out = cell.slice();
    for (let k = 1; k < out.length; k++) {
        if (acc.includes(k) || rng() > p * 0.5) continue;
        if (out[k] === '.' && out[k - 1] !== '.') out[k] = 'U';
        else if (out[k] === 'U' && rng() < 0.5) out[k] = '.';
    }
    return out;
}

function buildFlamencoPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const palo = ph.flamenco;
    const I = ph.intensity;
    const off = env.transOffset;
    const spb = ternary ? 3 : 2;
    const splitAt = env.splitBeat || 2;
    const beatSec = 60 / (env.bpm || 100);
    const slotSec = beatSec / spb;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.78 + 0.3 * I) * (0.96 + 0.04 * prog);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const isFinal = !nextStep && isLastMeasureOfStep;
    const ev = [], drums = [];
    const clamp = (v) => flaClamp(v, 0.12, 1);
    const toWritten = (mid) => mid - FLA_BASE - off;
    const Nfull = Math.round(bpb * spb);
    const acc = flaAccents(Nfull, spb);
    const falsetaAt = (ph.falseta && L >= 3) ? 1 + Math.floor(ph.falsetaU * (L - 2)) : -1;
    const wantFalseta = i === falsetaAt && !isFinal && !isTurn;

    // Cellule de la mesure entière (puis découpée par moitié si la mesure porte deux accords)
    let kind;
    if (isTurn && L > 1) kind = 'turn';
    else if (i === 0) kind = 'base';
    else { const r = rng(); kind = r < ph.arpP ? 'arp' : (r < ph.arpP + ph.altP ? 'alt' : 'base'); }
    const pool = flaCellsFor(palo, Nfull, spb, kind);
    const uPick = kind === 'turn' ? ph.turnIdx : kind === 'arp' ? ph.arpIdx : kind === 'alt' ? ph.altIdx : (i % 2 === 1 ? ph.toque2 : ph.toque);
    let full = flaPickIdx(pool, uPick).slice();
    if (kind === 'base' && i >= 1 && rng() < ph.mutate * 2) full = flaMutate(full, acc, rng, ph.mutate);

    segs.forEach((sg, si) => {
        const lastOne = si === segs.length - 1;
        const voice = flaVoice(env, sg.cs);
        const N = Math.round((sg.e - sg.s) * spb);
        const k0 = Math.round(sg.s * spb);
        const posOf = (k) => sg.s + k / spb;                      // k fractionnaire possible (ornements, coups d'un rasgueo)
        const dtBeats = (sec) => sec / beatSec;
        const gtop = (n) => voice.all.slice(-n);

        const addEvent = (pos, notes, o) => {
            const sorted = notes.slice().sort((a, b) => a - b).filter((x, j, arr) => j === 0 || x !== arr[j - 1]);
            const c = sorted.length;
            const nv = sorted.map((x, j) => (c === 1 ? 1 : (j === 0 ? 1 : (j === c - 1 ? 0.95 : 0.82))));
            ev.push(Object.assign({
                pos: flaClamp(pos, 0, bpb - 0.01), dur: o.dur, vel: clamp(o.vel * gv),
                rootIndex: 0, intervals: sorted.map(toWritten), noteVels: nv,
                roll: c > 1 ? (o.roll !== undefined ? o.roll : ph.roll) : 0, dir: o.dir || 1, lay: rng() * 0.004, wide: true, gainMul: 1.15, tok: o.tok
            }));
        };
        const golpe = (pos, strong) => drums.push({ pos: flaClamp(pos, 0, bpb - 0.01), drum: 'golpe', vel: strong ? 0.78 : 0.5, onGuitar: true, tok: strong ? 'G' : 'g' });

        // ---------- dernier accord de la grille (sans boucle) : abanico, golpe, l'accord résonne ----------
        if (isFinal && si === 0 && lastOne) {
            const n = 4, dt = dtBeats(Math.min(0.07, slotSec * 0.9 / n));
            for (let q = 0; q < n; q++) addEvent(posOf(0) + q * dt, q === n - 1 ? voice.all : gtop(4), { vel: 0.55 + q * 0.14, dur: q === n - 1 ? bpb + 2.4 : dt * 1.2, roll: 0.004, tok: 'A' });
            golpe(posOf(0) + (n - 1) * dt, true);
            return;
        }

        // ---------- cellule de ce segment ----------
        let cell;
        if (halves) {
            cell = full.slice(k0, k0 + N);
            while (cell.length < N) cell.push('.');
            if (si > 0 && cell[0] === '.') cell[0] = 'D';          // un changement d'accord tombe toujours sur un geste plein
        } else {
            cell = full.slice(0, N);
            while (cell.length < N) cell.push('.');
        }

        // ---------- mesure « falseta » ----------
        if (wantFalseta) {
            flaFalseta(env, sg.cs, voice, N, spb, palo, I, rng).forEach(n => {
                if (n.bass) addEvent(posOf(n.slot), [n.midi], { vel: n.vel, dur: n.dur, tok: 'T' });
                else addEvent(posOf(n.slot), [n.midi], { vel: n.vel, dur: n.dur, tok: n.grace ? 'g' : 'p' });
            });
            return;
        }

        // ---------- anticipation du prochain accord sur le dernier coup montant ----------
        const lastTok = cell[N - 1];
        const nextVoice = (changeNext && lastOne && /^U$/.test(lastTok) && rng() < 0.55) ? flaVoice(env, nextStep) : null;

        // ---------- gestes → notes ----------
        const nextHit = (k) => { let j = k + 1; while (j < N && cell[j] === '.') j++; return j; };
        cell.forEach((tokFull, k) => {
            if (tokFull === '.') return;
            const parts = tokFull.split('/');
            const tok = parts[0];
            const pos = posOf(k);
            const gap = (nextHit(k) - k) / spb;                   // temps jusqu'au geste suivant
            const acc1 = acc.includes(k + k0);
            if (parts[1] === 'G') golpe(pos, true);
            else if (parts[1] === 'g') golpe(pos, false);
            switch (tok) {
                case 'D': addEvent(pos, voice.all, { vel: acc1 ? 0.95 : 0.8, dur: flaClamp(gap + 0.1, 0.3, 2.2), tok }); break;
                case 'd': addEvent(pos, gtop(4), { vel: 0.58, dur: flaClamp(gap, 0.2, 0.7), roll: 0.004, tok }); break;
                case 'U': addEvent(pos, nextVoice ? nextVoice.all.slice(-4) : gtop(4), { vel: nextVoice ? 0.62 : 0.5, dur: flaClamp(gap, 0.15, 0.5), roll: 0.0035, dir: -1, tok }); break;
                case 'S': addEvent(pos, voice.all, { vel: 0.62, dur: 0.12, roll: 0.004, tok }); break;
                case 'T': addEvent(pos, [voice.bass], { vel: 0.86, dur: flaClamp(gap + 0.8, 0.6, 2.4), tok }); break;
                case 't': addEvent(pos, [voice.alt], { vel: 0.66, dur: flaClamp(gap + 0.6, 0.5, 2.0), tok }); break;
                case '1': case '2': case '3': {
                    const v = voice.all[Math.max(0, voice.all.length - Number(tok))];
                    addEvent(pos, [v], { vel: 0.6 + (acc1 ? 0.08 : 0), dur: flaClamp(gap + 0.7, 0.5, 2.2), tok });
                    break;
                }
                case 'A': {                                          // abanico : quatre coups qui s'éventaillent, crescendo, le dernier accentué
                    const n = 4, dt = dtBeats(Math.min(0.075, slotSec * 0.9 / n));
                    for (let q = 0; q < n; q++) {
                        const last = q === n - 1;
                        addEvent(pos + q * dt, last ? voice.all : gtop(4), { vel: 0.5 + q * 0.13, dur: last ? flaClamp(gap + 0.1, 0.3, 1.6) : dt * 1.3, roll: 0.0035, tok });
                    }
                    break;
                }
                case 'a': {                                          // rasgueo court : bas, haut, bas
                    const dt = dtBeats(Math.min(0.08, slotSec * 0.9 / 3));
                    addEvent(pos, gtop(4), { vel: 0.6, dur: dt * 1.3, roll: 0.004, tok });
                    addEvent(pos + dt, gtop(3), { vel: 0.5, dur: dt * 1.3, roll: 0.0035, dir: -1, tok });
                    addEvent(pos + 2 * dt, voice.all, { vel: 0.85, dur: flaClamp(gap + 0.1, 0.3, 1.6), tok });
                    break;
                }
                default: break;
            }
        });
    });

    ev.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums, classicalGuitar: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        flamencoPhraseExtras, buildFlamencoPlan,
        flaFamily, flaPickShape, flaVoice, flaGenericVoice, flaFalseta, flaLadder, flaRun, flaAccents, flaCellsFor, flaGenericCell, flaMutate,
        FLA_SHAPES, FLA_BANK, FLA_PALO, FLA_OPEN, FLA_BASE
    };
}
