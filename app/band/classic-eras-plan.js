// band/classic-eras-plan.js — orchestre « Classique » (piano seul) : une écriture par époque, imposée par les styles de grille
// de la famille « Musique classique » (rythmes c-renaissance, c-chaconne, c-nocturne, c-romantic, c-impression, c-satie,
// c-neoclassic, c-minimal), et choisie aussi dans le pop-up Orchestre (« Classique : nocturne »…). Sans DOM. Fonctions pures :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.bpm        tempo ;  env.splitBeat  temps où change l'accord d'une mesure à deux accords
//   env.density    curseur « Densité » (0 à 1 ; 0,5 = écriture d'origine) ; absent = écriture d'origine
// Toutes les signatures régulières (2, 3 ou 4 temps, binaires ou composées : en 6/8, 9/8, 12/8 un temps = une noire pointée)
// sont jouées ; le style Baroque d'origine (c-baroque) reste dans band/classic-plan.js.
// Chargé par index.html via <script src="band/classic-eras-plan.js"> (après band/band-helpers.js, avant band/classic-plan.js)
// et testé par band/classic-eras-plan.test.js.

if (typeof clsVoicing === 'undefined' && typeof require === 'function') {
    var { clsVoicing, clsLowNote, popScaleNotes } = require('./band-helpers.js');
}

const CLASSIC_ERA_GROOVES = ['c-renaissance', 'c-chaconne', 'c-nocturne', 'c-romantic', 'c-impression', 'c-satie', 'c-neoclassic', 'c-minimal'];
// Rythme d'époque applicable (ou null : jeu Classique ordinaire, ou Baroque).
function classicEraGroove(groove) { return CLASSIC_ERA_GROOVES.includes(groove) ? groove : null; }

// Ordre des variations d'une basse obstinée : chaque énoncé du ground (huit mesures = deux phrases) change d'écriture,
// du plus simple au plus brillant, comme dans une chaconne de Bach ou une passacaille de Haendel.
const CE_CHACONNE_ORDER = ['sarabande', 'eighths', 'dotted', 'sixteenths', 'scales', 'chords'];
// Motifs d'ostinato du minimalisme (rangs dans l'accord ; au-delà du nombre de notes, l'octave supérieure)
const CE_MIN_PATTERNS = [[0, 1, 2, 1], [0, 1, 2, 3, 2, 1], [0, 2, 1, 2], [0, 1, 2, 0, 1, 2, 0, 1], [0, 1, 2, 3]];
// Cellules de doubles-croches d'un temps (chaconne) : rangs dans l'accord
const CE_CELLS = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [3, 2, 1, 0], [2, 1, 0, 1]];

function cePickW(rng, opts) {
    const tot = opts.reduce((a, o) => a + o[1], 0);
    let r = rng() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[opts.length - 1][0];
}

// Choix faits une fois par phrase (ajoutés aux choix du style Classique par classicPhraseExtras).
// prev : phrase précédente du même orchestre (ou null) ; index : rang de la phrase depuis le début de la jam.
function classicEraPhraseExtras(groove, bpm, rng, prev, index) {
    const g = classicEraGroove(groove);
    if (!g) return {};
    const pe = (prev && prev.cEra === g) ? prev : null;
    const idx = (n) => Math.floor(rng() * n);
    const out = { cEra: g, ceShift: Math.round((rng() - 0.5) * 4), ceOrn: rng() < 0.55, ceDouble: rng() < 0.5 };
    if (g === 'c-renaissance') out.ceFam = (pe && rng() < 0.4) ? pe.ceFam : cePickW(rng, [['pavane', 3], ['choral', 2], ['lute', 2]]);
    else if (g === 'c-chaconne') {
        const k = Math.floor(index / 2);   // un énoncé du ground = deux phrases de quatre mesures
        out.ceVar = k < CE_CHACONNE_ORDER.length ? CE_CHACONNE_ORDER[k] : CE_CHACONNE_ORDER[1 + idx(CE_CHACONNE_ORDER.length - 1)];
        if (pe && index % 2 === 1) out.ceVar = pe.ceVar;   // les deux moitiés d'un énoncé gardent la même écriture
        out.ceCell = (pe && index % 2 === 1) ? pe.ceCell : idx(CE_CELLS.length);
        out.ceOct = rng() < 0.4;
    } else if (g === 'c-nocturne') out.ceFam = cePickW(rng, [['cantabile', 3], ['appog', 1.5]]);
    else if (g === 'c-romantic') out.ceFam = (pe && rng() < 0.35) ? pe.ceFam : cePickW(rng, [['battus', 3], ['surge', 2], ['choral', 2]]);
    else if (g === 'c-impression') out.ceFam = (pe && rng() < 0.3) ? pe.ceFam : cePickW(rng, [['planing', 3], ['arabesque', 3], ['bells', 2]]);
    else if (g === 'c-satie') {
        out.ceIntro = index === 0;   // comme dans les Gymnopédies : la main gauche seule d'abord
        out.ceRh = idx(3);
        out.ceDir = rng() < 0.5 ? 1 : -1;
    } else if (g === 'c-neoclassic') {
        out.ceFam = (pe && rng() < 0.35) ? pe.ceFam : cePickW(rng, [['march', 3], ['toccata', 2], ['pastiche', 2.5]]);
        out.ceMotif = idx(4);
        out.ceWrong = 1 + idx(6);
    } else if (g === 'c-minimal') {
        // l'ostinato tient deux phrases (huit mesures), puis change de motif
        if (pe && index % 2 === 1) { out.ceFam = pe.ceFam; out.ceP = pe.ceP; out.ceSize = pe.ceSize; }
        else { out.ceFam = cePickW(rng, [['glass', 4], ['triplets', 2], ['pulse', 1.5]]); out.ceP = idx(CE_MIN_PATTERNS.length); out.ceSize = rng() < 0.6 ? 3 : 4; }
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Outils de hauteur (hauteurs écrites ; réel = écrit + transOffset)
// ---------------------------------------------------------------------------------------------
const ceMod = (x) => ((x % 12) + 12) % 12;
// Classes de hauteur de l'accord (toutes ses notes, neuvièmes comprises)
function cePcs(env, cs) {
    const co = env.findChordObj(cs.chordId);
    const set = [];
    (co && co.notes ? co.notes : [0, 4, 7]).forEach(n => { const p = ceMod(cs.rootIndex + n); if (!set.includes(p)) set.push(p); });
    return set;
}
// Notes de l'accord entre deux hauteurs, en montant
function ceTonesIn(pcs, lo, hi) {
    const out = [];
    for (let p = Math.ceil(lo); p <= hi; p++) if (pcs.includes(ceMod(p))) out.push(p);
    return out;
}
// Accord en position serrée (size notes consécutives de l'accord) dont la note du haut est la plus proche de `center` ;
// les positions où deux voix voisines frottent d'un demi-ton (si - do d'une septième majeure) sont évitées quand c'est possible.
function ceVoiceNear(pcs, center, size, lo, hi) {
    const T = ceTonesIn(pcs, lo, hi);
    if (T.length <= size) return T.length ? T : [Math.round(center)];
    let best = null, bs = Infinity;
    for (let k = size - 1; k < T.length; k++) {
        const v = T.slice(k - size + 1, k + 1);
        let sc = Math.abs(v[v.length - 1] - center) + (v[v.length - 1] - v[0] > 14 ? 4 : 0);
        for (let j = 1; j < v.length; j++) if (v[j] - v[j - 1] === 1) sc += j === 1 ? 4 : 2.5;
        if (sc < bs) { bs = sc; best = v; }
    }
    return best;
}
// Note de passage du soprano : degré voisin (dir d'abord, sinon l'autre sens) qui ne fait ni demi-ton ni triton avec les
// autres voix ; à défaut, la note de départ (la voix reste en place).
function ceConsonantStep(cs, p, dir, others) {
    for (const d of [dir, -dir]) {
        const n = ceStep(cs, p, d);
        if (others.every(o => { const ic = ceMod(n - o); return ic !== 1 && ic !== 11 && ic !== 6; })) return n;
    }
    return p;
}
const ceNearest = (list, p) => list.reduce((b, x) => (b === null || Math.abs(x - p) < Math.abs(b - p)) ? x : b, null);
// Note voisine dans la gamme de l'accord (dir = +1 au-dessus, -1 au-dessous)
function ceStep(cs, p, dir) {
    const S = popScaleNotes(cs, p - 3, p + 3).filter(x => (x - p) * dir > 0);
    if (!S.length) return p + dir;
    return dir > 0 ? Math.min(...S) : Math.max(...S);
}

// ---------------------------------------------------------------------------------------------
// Plan d'une mesure
// ---------------------------------------------------------------------------------------------
// bpb : temps de la mesure ; ternary : mesure composée (un temps = trois croches) ; m : rang de la mesure depuis le début de la jam.
function buildClassicEraPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const off = env.transOffset || 0;
    const nb = Math.max(1, bpb || 4);
    const splitAt = halves ? Math.max(0.5, Math.min(nb - 0.5, env.splitBeat || Math.ceil(nb / 2))) : nb;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: nb, cs: halves[1] }]
        : [{ s: 0, e: nb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changes = isLastMeasureOfStep && !!nextStep && !sameChord(lastSeg.cs, nextStep);
    const holdOn = !changes && !!nextStep;
    const dens = Number.isFinite(env.density) ? Math.max(0, Math.min(1, env.density)) : 0.5;
    const up = Math.max(0, (dens - 0.5) / 0.5);     // 0 à 1 au-dessus de l'écriture d'origine
    const thin = Math.max(0, (0.5 - dens) / 0.5);   // 0 à 1 en dessous
    const prog = L > 1 ? i / (L - 1) : 0;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const gv = (0.72 + 0.3 * I) * (0.94 + 0.06 * prog);
    const bpm = env.bpm || 80;
    const e8 = ternary ? 1 / 3 : 0.5;        // croche, en temps
    const e16 = ternary ? 1 / 6 : 0.25;      // double-croche
    const beatSec = 60 / bpm;
    const fits = (unit) => unit * beatSec >= 0.085;   // assez lent pour des notes de cette valeur
    const ev = [];
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    const fold = (p) => { while (p + off > 31) p -= 12; while (p + off < -26) p += 12; return p; };

    const ctx = { env, rng, ph, i, L, isTurn, nb, ternary, prog, I, up, thin, e8, e16, fits, bpm, m: m || 0 };
    const writer = CE_WRITERS[ph.cEra] || CE_WRITERS['c-nocturne'];
    segs.forEach((sg, si) => {
        const lastOne = si === segs.length - 1;
        const cs = sg.cs;
        const toCs = lastOne ? (changes ? nextStep : null) : segs[si + 1].cs;
        const endPos = sg.e + ((lastOne && holdOn) ? 1.2 : 0.05);
        const pcs = cePcs(env, cs);
        const low = clsLowNote(env, cs, off);
        // put(position dans la mesure, durée max en temps, hauteurs, vélocité, options { roll, nv, opt, ring })
        const put = (pos, max, pitches, vel, o = {}) => {
            if (!pitches || !pitches.length || pos >= sg.e - 1e-6 || pos < sg.s - 1e-6) return;
            const ps = pitches.map(fold).sort((a, b) => a - b).filter((x, k, arr) => k === 0 || x !== arr[k - 1]);
            const c = ps.length;
            ev.push({
                pos, dur: Math.max(0.12, Math.min(endPos - pos, max)), vel: clampV(vel * gv),
                rootIndex: 0, intervals: ps,
                noteVels: o.nv ? ps.map((_, k) => (k === c - 1 ? 1 : o.nv)) : ps.map((_, k) => (c === 1 ? 1 : (k === c - 1 ? 1 : 0.84))),
                roll: c > 1 ? (o.roll !== undefined ? o.roll : 0.012 + rng() * 0.01) : 0,
                lay: rng() * 0.006, wide: true, gainMul: 1.2, opt: !!o.opt
            });
        };
        writer({ ...ctx, sg, si, lastOne, cs, toCs, pcs, low, put, len: sg.e - sg.s, closing: isTurn && lastOne && L > 1 });
    });

    // Curseur « Densité » sous 0,5 : les notes d'ornement et de remplissage disparaissent (la basse et les temps forts restent)
    if (thin > 0) {
        for (let k = ev.length - 1; k >= 0; k--) if (ev[k].opt && rng() < 0.9 * thin) ev.splice(k, 1);
    }
    ev.forEach(e => { delete e.opt; });
    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

// Positions régulières dans un segment (pas = unit), de s à e
function ceGrid(sg, unit) {
    const out = [];
    const n = Math.max(1, Math.round((sg.e - sg.s) / unit));
    for (let k = 0; k < n; k++) out.push(sg.s + k * unit);
    return out;
}

const CE_WRITERS = {
    // ---------- Renaissance : consort à quatre voix ou luth (pavane, passamezzo) ----------
    'c-renaissance': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, prog, closing, e8 } = c;
        const tri = pcs.slice(0, 3);
        const center = 13 + ph.ceShift + 3 * Math.sin(Math.PI * prog);
        const V = c.env.findChordObj(cs.chordId);
        const isTriad = V && V.notes && V.notes.length === 3 && (V.notes[1] === 3 || V.notes[1] === 4);
        let Vc = ceVoiceNear(tri, center, 3, low + 9, 24);
        const top = Vc[Vc.length - 1];
        const s = sg.s;
        // Cadence de fin de phrase : retard de la quarte (4 - 3) sur l'accord, résolu à mi-mesure
        if (closing && isTriad && len >= 2) {
            const third = ceMod(cs.rootIndex + V.notes[1]);
            const sus = Vc.map(p => ceMod(p) === third ? p + (5 - V.notes[1]) : p);
            const h = len >= 4 ? 2 : len / 2;
            put(s, len, [low], 0.62);
            put(s, h, sus, 0.6, { nv: 0.8 });
            put(s + h, len - h, Vc, 0.5, { nv: 0.8 });
            return;
        }
        put(s, len, [low], 0.62);
        if (ph.ceFam === 'lute') {
            // luth : basse au pouce, accord brisé en noires aux doigts, divisions en croches quand la densité monte
            const ord = [Vc[1], Vc[2], Vc[0], Vc[2]];
            const q = Math.max(1, Math.floor(len));
            for (let b = 0; b < q; b++) {
                const p = b === 0 ? Vc : [ord[b % 4]];
                put(s + b, 1.6, p, b === 0 ? 0.55 : 0.48, { roll: 0.035, opt: b > 0 && b % 2 === 1 });
                if (up > 0.3 && rng() < up && b < q - 1) put(s + b + e8, 0.6, [ceConsonantStep(cs, ord[b % 4], rng() < 0.5 ? 1 : -1, [low])], 0.4, { opt: true });
            }
            return;
        }
        if (ph.ceFam === 'choral' || len < 3) {
            // demi-notes (blanches) : le soprano change de note de l'accord au milieu de la mesure (échange de voix)
            const h = len >= 4 ? 2 : len;
            put(s, h, Vc, 0.56, { nv: 0.82, roll: 0.006 });
            if (len >= 4) {
                const alt = ceTonesIn(tri, top - 5, top + 5).filter(p => p !== top);
                const t2 = alt.length ? ceNearest(alt, top + (rng() < 0.5 ? 2 : -2)) : top;
                put(s + 2, 2, ceVoiceNear(tri, t2, 3, low + 9, 24), 0.5, { nv: 0.82, roll: 0.006 });
            }
            return;
        }
        // pavane : rythme long - bref - bref (blanche, noire, noire), le soprano passe par degrés conjoints
        const dir = rng() < 0.5 ? 1 : -1;
        put(s, 2, Vc, 0.58, { nv: 0.82, roll: 0.006 });
        const others = [low].concat(Vc.slice(0, -1));
        const n2 = ceConsonantStep(cs, top, dir, others);
        put(s + 2, 1, Vc.slice(0, -1).concat([n2]), 0.48, { nv: 0.82, roll: 0.006 });
        if (len >= 4) put(s + 3, 1, Vc, 0.5, { nv: 0.82, roll: 0.006, opt: true });
        if (up > 0.4 && n2 !== top) put(s + 2 + e8, 0.5, [top], 0.4, { opt: true });
    },

    // ---------- Basse obstinée (chaconne, passacaille, folia) : le ground à la main gauche, une variation par énoncé ----------
    'c-chaconne': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, prog, e8, e16, fits, closing } = c;
        const s = sg.s;
        const bass = (ph.ceOct && low - 12 + c.env.transOffset >= -24) ? [low - 12, low] : [low];
        put(s, len, bass, 0.66);
        const center = 12 + ph.ceShift + 2 * Math.sin(Math.PI * prog);
        const V3 = ceVoiceNear(pcs, center, 3, low + 8, 24);
        const rank = (V, k) => { const n = V.length, q = Math.floor(k / n); return V[k - q * n] + 12 * q; };
        let kind = ph.ceVar || 'sarabande';
        if (kind === 'sixteenths' && !fits(e16)) kind = 'eighths';
        if (closing && kind !== 'chords') {   // fin d'énoncé : accord posé sur le dernier temps
            put(s, Math.max(1, len - 1), V3, 0.5, { roll: 0.015 });
            if (len >= 2) put(s + len - 1, 1.4, V3.concat([V3[V3.length - 1] + (rng() < 0.5 ? 0 : 12)]), 0.56, { roll: 0.02 });
            return;
        }
        if (kind === 'sarabande') {
            // accent sur le deuxième temps, comme une sarabande
            put(s, 1, V3, 0.48);
            if (len >= 2) put(s + 1, len - 1, V3.concat(up > 0.4 ? [V3[0] + 12] : []), 0.62, { roll: 0.018 });
        } else if (kind === 'eighths' || kind === 'sixteenths') {
            const unit = kind === 'eighths' ? e8 : e16;
            const cell = kind === 'eighths' ? [0, 1, 2, 1] : CE_CELLS[ph.ceCell || 0];
            ceGrid(sg, unit).forEach((p, k) => {
                const shift = Math.floor((p - s) + 1e-6) % 2;   // la figure monte d'un rang un temps sur deux (effet de séquence)
                put(p, unit * 1.9, [rank(V3, cell[k % cell.length] + shift)], k === 0 ? 0.58 : (Math.abs(p - Math.round(p)) < 1e-6 ? 0.52 : 0.44), { opt: k % 2 === 1 && kind === 'sixteenths' });
            });
        } else if (kind === 'dotted') {
            // rythmes pointés (style français) : longue - brève, la brève mène à la note suivante
            const q = Math.max(1, Math.floor(len));
            let note = V3[V3.length - 1];
            for (let b = 0; b < q; b++) {
                put(s + b, 0.75, b === 0 ? V3 : [note], b === 0 ? 0.6 : 0.54);
                const nx = ceStep(cs, note, b % 2 === 0 ? 1 : -1);
                put(s + b + 0.75, 0.25, [nx], 0.44, { opt: true });
                const pool = ceTonesIn(pcs, nx - 4, nx + 4);
                note = pool.length ? ceNearest(pool, nx) : nx;
            }
        } else if (kind === 'scales') {
            // gamme en croches qui traverse la mesure, montante ou descendante une mesure sur deux
            const dir = c.i % 2 === 0 ? 1 : -1;
            const S = popScaleNotes(cs, V3[0] - 7, V3[V3.length - 1] + 12);
            let j = S.indexOf(dir > 0 ? V3[0] : V3[V3.length - 1]);
            if (j < 0) j = Math.floor(S.length / 2);
            ceGrid(sg, e8).forEach((p, k) => {
                const jj = Math.max(0, Math.min(S.length - 1, j + dir * k));
                put(p, e8 * 1.8, [S[jj]], k === 0 ? 0.56 : 0.46, { opt: k % 2 === 1 && up < 0.2 && rng() < 0.3 });
            });
        } else {   // chords : accords pleins sur chaque temps (variation majestueuse)
            const V4 = V3.concat([V3[0] + 12]);
            const q = Math.max(1, Math.floor(len));
            for (let b = 0; b < q; b++) put(s + b, 1, b === 0 ? V4 : V3, b === 0 ? 0.68 : 0.56, { roll: 0.012, opt: b === q - 1 && q > 2 });
            if (up > 0.5 && fits(e8)) for (let b = 0; b < q; b++) put(s + b + e8, e8, [V3[V3.length - 1]], 0.42, { opt: true });
        }
    },

    // ---------- Nocturne (Chopin, Field) : grand arpège de la main gauche avec pédale, mélodie chantée ornée ----------
    'c-nocturne': (c) => {
        const { sg, cs, toCs, pcs, low, put, len, rng, ph, up, prog, e8, fits, closing, ternary, I } = c;
        const s = sg.s;
        // main gauche : fondamentale, quinte, dixième… sur deux octaves, en croches (triolets quand la densité monte)
        const T = ceTonesIn(pcs, low + 5, low + 26);
        const spread = [];
        let last = low;
        for (const p of T) { if (p - last >= 3 && spread.length < 4) { spread.push(p); last = p; } }
        while (spread.length < 3) spread.push((spread[spread.length - 1] || low) + 12);
        const wave = [low].concat(spread, spread.slice(0, -1).reverse());
        const unit = (!ternary && up > 0.6 && fits(1 / 3)) ? 1 / 3 : (c.thin > 0.6 ? 1 : e8);
        ceGrid(sg, unit).forEach((p, k) => {
            const note = wave[k % wave.length];
            put(p, Math.min(2.4, sg.e - p + 0.6), [note], k === 0 ? 0.56 : 0.36 + (note === spread[spread.length - 1] ? 0.05 : 0), { opt: k > 0 && k % 2 === 1 && unit < 0.5 });
        });
        // main droite : la mélodie suit un arc (monte au milieu de la phrase), sur les notes de l'accord
        const center = 16 + ph.ceShift + 4 * Math.sin(Math.PI * prog);
        const M = ceTonesIn(pcs, 10, 26);
        if (!M.length) return;
        const m0 = ceNearest(M, center);
        const dbl = (p) => {
            if (!(ph.ceDouble && I > 0.55)) return [p];
            const below = ceTonesIn(pcs, p - 9, p - 3);
            return below.length ? [below[below.length - 1], p] : [p];
        };
        const h = len >= 4 ? 2 : len;
        if (ph.ceFam === 'appog' && len >= 2 && !closing) {
            // appoggiature : la note voisine au-dessus, sur le temps, qui se résout en soupirant
            const ap = ceStep(cs, m0, 1);
            put(s, 0.5, [ap], 0.66);
            put(s + 0.5, h - 0.5, dbl(m0), 0.6, { nv: 0.7 });
        } else {
            put(s, closing ? len : h, dbl(m0), 0.68, { nv: 0.7 });
        }
        if (len >= 4 && !closing) {
            // deuxième note : vers l'accord suivant par degré conjoint, ou une autre note de l'accord
            let m1;
            if (toCs) {
                const nx = ceTonesIn(cePcs(c.env, toCs), m0 - 5, m0 + 5);
                const tgt = nx.length ? ceNearest(nx, m0) : m0;
                m1 = tgt === m0 ? ceStep(cs, m0, rng() < 0.5 ? 1 : -1) : ceStep(cs, tgt, tgt > m0 ? -1 : 1);
            } else {
                const alt = M.filter(p => p !== m0 && Math.abs(p - m0) <= 5);
                m1 = alt.length ? alt[Math.floor(rng() * alt.length)] : m0;
            }
            // gruppetto (note du dessus, note, note du dessous) avant la deuxième note, une mesure sur deux
            if (ph.ceOrn && c.i % 2 === 1 && fits(1 / 6)) {
                put(s + 2 - 0.5, 1 / 6, [ceStep(cs, m1, 1)], 0.5, { opt: true });
                put(s + 2 - 1 / 3, 1 / 6, [m1], 0.48, { opt: true });
                put(s + 2 - 1 / 6, 1 / 6, [ceStep(cs, m1, -1)], 0.48, { opt: true });
            }
            put(s + 2, 2, dbl(m1), 0.62, { nv: 0.7 });
            if (up > 0.5) put(s + 3 + e8 * (ternary ? 2 : 1), e8, [ceStep(cs, m1, -1)], 0.46, { opt: true });
        }
    },

    // ---------- Romantisme tardif (Wagner, Franck, Liszt) : accords battus, grandes vagues, choral chromatique ----------
    'c-romantic': (c) => {
        const { sg, cs, toCs, pcs, low, put, len, rng, ph, up, prog, fits, ternary, closing } = c;
        const s = sg.s;
        const dyn = 0.45 + 0.4 * Math.sin(Math.PI * Math.min(1, prog * 1.3));   // crescendo vers le sommet de la phrase, puis retombée
        const oct = (low - 12 + c.env.transOffset >= -26) ? [low - 12, low] : [low, low + 12];
        const center = 13 + ph.ceShift + 4 * dyn;
        const Vc = ceVoiceNear(pcs, center, Math.min(4, Math.max(3, pcs.length)), low + 9, 25);
        const top = Vc[Vc.length - 1];
        const Vb = ceVoiceNear(pcs, center - 4, 3, low + 9, 22);   // accords battus, sous la mélodie
        const mel = ceNearest(ceTonesIn(pcs, Vb[Vb.length - 1] + 3, Vb[Vb.length - 1] + 9), center + 4) || top;
        const fam = closing ? 'choral' : ph.ceFam;
        put(s, len >= 4 ? 2 : len, oct, 0.58 + 0.25 * dyn);
        if (len >= 4 && fam !== 'surge') put(s + 2, 2, oct, 0.5 + 0.2 * dyn, { opt: true });
        if (fam === 'battus') {
            // accords répétés en triolets (en croches dans une mesure composée), mélodie doublée à l'octave sur les temps forts
            const unit = ternary ? 1 / 3 : (fits(1 / 3) ? 1 / 3 : 0.5);
            ceGrid(sg, unit).forEach((p, k) => {
                const onBeat = Math.abs(p - Math.round(p)) < 1e-6;
                put(p, unit * 1.05, Vb, (onBeat ? 0.36 : 0.28) + 0.2 * dyn, { roll: 0.004, opt: !onBeat && k % 3 === 2 });
            });
            put(s, len >= 4 ? 2 : len, [mel, mel + 12], 0.62 + 0.3 * dyn, { nv: 0.75, roll: 0.01 });
            if (len >= 4) {
                const nt = ceTonesIn(pcs, mel - 4, mel + 5).filter(p => p !== mel && p > Vb[Vb.length - 1]);
                const t2 = nt.length ? ceNearest(nt, mel + (dyn > 0.6 ? 3 : -2)) : mel;
                put(s + 2, 2, [t2, t2 + 12], 0.6 + 0.3 * dyn, { nv: 0.75, roll: 0.01 });
            }
        } else if (fam === 'surge') {
            // vague : arpège montant rapide sur deux octaves et demie, tenu à la pédale, puis grand accord
            const T = ceTonesIn(pcs, low + 7, low + 34);
            const unit = fits(1 / 6) ? (ternary ? 1 / 6 : 1 / 6) : 1 / 3;
            const n = Math.min(T.length, Math.floor(Math.min(len, 2) / unit));
            for (let k = 0; k < n; k++) put(s + k * unit, Math.max(0.5, len - k * unit), [T[k]], 0.38 + 0.3 * dyn * (k / Math.max(1, n)), { opt: k % 2 === 1 && k < n - 1 });
            if (len >= 3) put(s + 2, len - 2, Vc.concat([top + 12]), 0.62 + 0.3 * dyn, { roll: 0.025 });
        } else {
            // choral : accords pleins en blanches ; une voix intérieure glisse d'un demi-ton vers l'accord suivant
            put(s, len >= 4 ? 2 : len, Vc.concat([top + 12]), 0.5 + 0.3 * dyn, { roll: 0.02, nv: 0.8 });
            if (len >= 4) {
                let V2 = Vc.slice();
                if (toCs) {
                    const npcs = cePcs(c.env, toCs);
                    const k = V2.findIndex((p, ix) => ix > 0 && ix < V2.length - 1 && !npcs.includes(ceMod(p)));
                    if (k >= 0) V2[k] = npcs.includes(ceMod(V2[k] + 1)) ? V2[k] + 1 : (npcs.includes(ceMod(V2[k] - 1)) ? V2[k] - 1 : V2[k]);
                } else if (V2.length > 2) V2[1] = ceStep(cs, V2[1], rng() < 0.5 ? 1 : -1);
                put(s + 2, 2, V2.concat([top + 12]), 0.46 + 0.28 * dyn, { roll: 0.02, nv: 0.8 });
            }
            if (up > 0.5 && len >= 4) put(s + 1, 1, [ceStep(cs, top, 1)], 0.42, { opt: true });
        }
    },

    // ---------- Impressionnisme (Debussy, Ravel) : quinte grave tenue, accords parallèles, arabesques, cloches ----------
    'c-impression': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, prog, fits, ternary, closing } = c;
        const s = sg.s;
        const ninth = pcs.includes(ceMod(low + 2));
        put(s, len + 0.6, ninth ? [low, low + 7, low + 14] : [low, low + 7], 0.42, { roll: 0.045, nv: 0.8 });
        const center = 15 + ph.ceShift + 3 * Math.sin(Math.PI * prog);
        const V4 = ceVoiceNear(pcs, center, Math.min(4, pcs.length), low + 12, 27);
        const fam = closing ? 'bells' : ph.ceFam;
        if (fam === 'planing') {
            // glissement parallèle : le même accord monte d'un degré de la gamme puis revient
            const shift = (V, dir) => V.map(p => ceStep(cs, p, dir));
            const h = len >= 4 ? 1.5 : len / 2;
            put(s, h, V4, 0.42, { roll: 0.03 });
            if (len >= 2) {
                const dir = rng() < 0.65 ? 1 : -1;
                put(s + h, len >= 4 ? 1 : len - h, shift(V4, dir), 0.36, { roll: 0.03 });
                if (len >= 4) put(s + h + 1, len - h - 1, V4, 0.38, { roll: 0.03, opt: true });
                if (up > 0.4 && len >= 4) put(s + h + 0.5, 0.5, shift(V4, 2 * dir).slice(-2), 0.32, { opt: true });
            }
        } else if (fam === 'arabesque') {
            // arabesque en triolets (en croches en mesure composée) sur les notes de l'accord et ses neuvièmes, sans demi-ton qui frotte
            put(s, len, V4.slice(0, 2), 0.3, { roll: 0.05 });
            const pool = popScaleNotes(cs, 12, 31).filter(p => pcs.includes(ceMod(p)) || !pcs.includes(ceMod(p - 1)));
            if (pool.length < 4) return;
            const unit = ternary ? 1 / 3 : (fits(1 / 3) ? 1 / 3 : 0.5);
            const G = ceGrid(sg, unit);
            let j = pool.indexOf(ceNearest(pool, center - 3));
            const peak = Math.floor(G.length * (0.55 + 0.2 * rng()));
            G.forEach((p, k) => {
                j = Math.max(0, Math.min(pool.length - 1, j + (k < peak ? 1 : -1)));
                put(p, k === peak ? 1.5 : unit * 2.2, [pool[j]], k === 0 ? 0.42 : (k === peak ? 0.44 : 0.32), { opt: k % 2 === 1 && k !== peak });
            });
            if (up > 0.6) put(s + len / 2, len / 2, [pool[pool.length - 1]], 0.3, { opt: true });
        } else {
            // cloches : accord doux, puis deux ou trois notes aiguës laissées vibrer
            put(s, len, V4, 0.34, { roll: 0.05 });
            const hi = ceTonesIn(pcs, 20, 31);
            if (!hi.length) return;
            const spots = len >= 4 ? [0.5, 2, 3] : [len / 2];
            spots.forEach((p, k) => put(s + p, 2.6, [hi[Math.floor(rng() * hi.length)]], 0.36 - k * 0.03, { opt: k === 2 }));
        }
    },

    // ---------- Satie, gymnopédie : basse grave sur le 1, accord sur le 2, mélodie lente et nue ----------
    'c-satie': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, closing } = c;
        const s = sg.s;
        const deep = (low - 12 + c.env.transOffset >= -19) ? low - 12 : low;
        // accord sans fondamentale (la basse la donne) : si - ré - fa♯ sur sol, comme dans la première Gymnopédie
        const upper = pcs.length >= 4 ? pcs.slice(1, 4) : pcs;
        const V = ceVoiceNear(upper, 14, Math.min(3, upper.length), Math.max(low + 10, 2), 18);
        const q = Math.max(1, Math.floor(len));
        if (q >= 4) {   // 4/4 : basse - accord - basse (quinte) - accord
            put(s, 2, [deep], 0.5); put(s + 1, 1, V, 0.36, { roll: 0.008 });
            const fifth = ceTonesIn(pcs, deep + 5, deep + 9);
            put(s + 2, 2, [fifth.length ? fifth[0] : deep], 0.44, { opt: true }); put(s + 3, 1, V, 0.34, { roll: 0.008 });
        } else {
            put(s, len, [deep], 0.5);
            if (q >= 2) put(s + 1, len - 1, V, 0.36, { roll: 0.008 });
        }
        if (ph.ceIntro && !closing) return;
        // mélodie : une ou deux notes par mesure, par degrés conjoints, rebond aux bornes du registre
        if (typeof ph.ceMel !== 'number') ph.ceMel = ceNearest(ceTonesIn(pcs, 19, 26), 22) || 22;
        let mel = ph.ceMel;
        // sur le premier temps, la note se pose sur une note de l'accord ; ailleurs, une note de passage reste possible
        const nextMel = (strong) => {
            let n = ceStep(cs, mel, ph.ceDir);
            if (n > 28 || n < 18) { ph.ceDir = -ph.ceDir; n = ceStep(cs, mel, ph.ceDir); }
            const tones = ceTonesIn(pcs, n - 2, n + 2);
            if (tones.length && (strong || rng() < 0.55)) n = ceNearest(tones, n);
            mel = n; return n;
        };
        if (!pcs.includes(ceMod(mel))) { const tn = ceTonesIn(pcs, mel - 2, mel + 2); if (tn.length) mel = ceNearest(tn, mel); }
        const pats = q >= 3 ? [[[0, q]], [[0, 1], [1, q - 1]], [[1, q - 1]]] : [[[0, q]], [[0, q]], [[0, q]]];
        const pat = closing ? [[0, q]] : pats[(ph.ceRh + c.i) % pats.length];
        pat.forEach(([p, d], k) => put(s + p, d, [k === 0 && c.i % 2 === 0 ? mel : nextMel(p === 0)], 0.52, { opt: k > 0 && pat.length > 1 }));
        if (up > 0.5 && q >= 3 && !closing) put(s + q - 0.5, 0.5, [ceStep(cs, mel, -ph.ceDir)], 0.42, { opt: true });
        ph.ceMel = mel;
    },

    // ---------- Néoclassicisme (Stravinsky, Prokofiev, Poulenc) : staccato, ostinatos, « fausses notes » ----------
    'c-neoclassic': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, e8, fits, closing, I } = c;
        const s = sg.s;
        const Vlow = ceVoiceNear(pcs, 4, 3, low + 7, 12);
        const T = ceTonesIn(pcs, 12, 28);
        const q = Math.max(1, Math.floor(len));
        const wrong = (p, k) => (k === ph.ceWrong && I > 0.35) ? p + (rng() < 0.5 ? 1 : -1) : p;   // une note décalée d'un demi-ton, puis remise en place
        if (closing) {
            put(s, 0.4, [low, low + 12], 0.7); put(s, 0.4, Vlow.concat(T.slice(-2)), 0.66, { roll: 0.004 });
            if (len >= 2) put(s + len - 1, 0.5, [low - 12 + c.env.transOffset >= -26 ? low - 12 : low + 12, low], 0.72);
            return;
        }
        if (ph.ceFam === 'toccata' && fits(e8)) {
            // main gauche en croches (basse / accord), accords secs de la main droite en 3 + 3 + 2
            ceGrid(sg, e8).forEach((p, k) => put(p, e8 * 0.7, k % 2 === 0 ? [k % 4 === 0 ? low : low + 12] : Vlow, k % 2 === 0 ? 0.58 : 0.44, { roll: 0.002, opt: k % 2 === 1 && k % 4 === 3 }));
            const hits = len >= 4 ? [0, 1.5, 3] : (len >= 3 ? [0, 1.5] : [0]);
            const V3 = ceVoiceNear(pcs, 18 + ph.ceShift, 3, 12, 28);
            const odd = c.i % 2 === 1;
            hits.forEach((p, k) => put(s + p, 0.35, (k === 1 && odd) ? V3.slice(0, -1).concat([wrong(V3[V3.length - 1], ph.ceWrong)]) : V3, 0.7 - k * 0.04, { roll: 0.003 }));
            return;
        }
        if (ph.ceFam === 'pastiche' && fits(e8)) {
            // Alberti piqué à la main gauche, mélodie en grands sauts à la main droite (Symphonie classique de Prokofiev)
            const A = [low, Vlow[2] || low + 7, Vlow[1] || low + 4, Vlow[2] || low + 7];
            ceGrid(sg, e8).forEach((p, k) => put(p, e8 * 0.8, [A[k % 4]], k % 4 === 0 ? 0.48 : 0.36, { opt: k % 2 === 1 && c.thin > 0 }));
            const rhy = len >= 4 ? [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]] : [[0, 1], [1, 0.5], [1.5, 0.5]].filter(([p]) => p < len);
            let j = Math.max(0, T.indexOf(ceNearest(T, 16 + ph.ceShift)));
            rhy.forEach(([p, d], k) => {
                j = Math.max(0, Math.min(T.length - 1, j + [3, -1, -1, 2, -3][k % 5] * (rng() < 0.5 ? 1 : -1)));
                const note = wrong(T[j], k + 1);
                if (k === 3 && ph.ceOrn && fits(1 / 8)) put(s + p - 0.08, 0.08, [note - 1], 0.44, { opt: true });   // petite note
                put(s + p, d * 0.55, [note], k === 0 ? 0.64 : 0.54);
            });
            return;
        }
        // marche : basse et accords piqués (« oum - pa »), motif staccato en croches à la main droite
        for (let b = 0; b < q; b++) {
            if (b % 2 === 0) put(s + b, 0.4, [b % 4 === 0 ? low : low + 12], 0.62);
            else put(s + b, 0.3, Vlow, 0.44, { roll: 0.003 });
        }
        const MOT = [[0, 2, 1, 3, null, 2, 4, 3], [0, null, 2, 1, 3, null, 4, 2], [4, 3, 2, 1, 0, null, 1, 2], [0, 1, 2, null, 3, 4, 2, 0]][ph.ceMotif || 0];
        const base = Math.max(0, T.indexOf(ceNearest(T, 14 + ph.ceShift)));
        ceGrid(sg, fits(e8) ? e8 : 1).forEach((p, k) => {
            const r = MOT[k % MOT.length];
            if (r === null) return;
            const note = wrong(T[Math.min(T.length - 1, base + r)], k);
            put(p, 0.3, [note], k === 0 ? 0.62 : (Math.abs(p - Math.round(p)) < 1e-6 ? 0.54 : 0.46), { opt: k % 2 === 1 && rng() < 0.3 });
        });
        if (up > 0.5 && len >= 2) put(s + len - 0.5, 0.25, [T[T.length - 1]], 0.5, { opt: true });
    },

    // ---------- Minimalisme (Glass, Reich) : ostinato immuable, basse tenue, pulsation ----------
    'c-minimal': (c) => {
        const { sg, pcs, low, put, len, ph, up, e8, e16, fits, ternary } = c;
        const s = sg.s;
        put(s, len, [low, low + 12], 0.4, { roll: 0.004 });
        const V = ceVoiceNear(pcs.slice(0, ph.ceSize || 3), 12, Math.min(ph.ceSize || 3, pcs.length), low + 10, 25);
        const rank = (k) => { const n = V.length, qq = Math.floor(k / n); return V[k - qq * n] + 12 * qq; };
        if (ph.ceFam === 'pulse') {
            // pulsation de l'accord entier en croches, avec une respiration (crescendo - decrescendo) sur la mesure
            const G = ceGrid(sg, e8);
            G.forEach((p, k) => put(p, e8 * 0.9, V, 0.28 + 0.24 * Math.sin(Math.PI * (k + 0.5) / G.length), { roll: 0.002, opt: k % 2 === 1 }));
            return;
        }
        let unit, P;
        if (ph.ceFam === 'triplets' && !ternary) { unit = fits(1 / 3) ? 1 / 3 : 0.5; P = [0, 1, 2]; }
        else { unit = (up > 0.5 && fits(e16)) ? e16 : e8; P = CE_MIN_PATTERNS[ph.ceP || 0]; }
        ceGrid(sg, unit).forEach((p, k) => {
            const grp = k % P.length === 0;
            put(p, unit * 0.95, [rank(P[k % P.length])], grp ? 0.5 : 0.42, { opt: k % 2 === 1 });
        });
        if (up > 0.6 && fits(e8)) ceGrid(sg, 1).forEach(p => put(p + e8, e8, [low + 7], 0.3, { opt: true }));   // main gauche en croches (quinte)
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CLASSIC_ERA_GROOVES, classicEraGroove, classicEraPhraseExtras, buildClassicEraPlan,
        ceVoiceNear, ceTonesIn, cePcs, CE_CHACONNE_ORDER, CE_MIN_PATTERNS };
}
