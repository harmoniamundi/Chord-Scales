// band/piazzolla-plan.js — orchestre « Tango nuevo » de Piazzolla (bandonéon, violon, guitare, piano, contrebasse) et sa variante
// « Milonga lyrique ». Chargé par index.html via <script src="band/piazzolla-plan.js"> (après band-patterns.js et
// band/band-helpers.js) et testé par band/piazzolla-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.state       mémoire entre deux mesures, modifiée en place : pzState (voix, mélodies, chromatismes, fugue)
// piazzollaPhraseExtras reçoit un petit contexte { groove } (rythme imposé par le style de grille, ex. 'lyrique').

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof popBassTones === 'undefined' && typeof require === 'function') {
    var { popBassTones, popBassApproach, popScaleNotes, popVoicing } = require('./band-helpers.js');
}
// Tables de motifs : globales en navigateur (band-patterns.js), à charger sous Node.
const PZ_PAT = (typeof PZ_SUBJECTS !== 'undefined')
    ? { PZ_LYR_ARP, PZ_SUBJECTS }
    : require('../band-patterns.js');

function piazzollaPhraseExtras(ctx, rng, prev, index) {
    const pl = (prev && prev.style === 'piazzolla') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.45 + rng() * 0.2 : prevI + (0.68 - prevI) * 0.22 + (rng() - 0.5) * 0.5;
    I = Math.max(0.25, Math.min(0.98, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const tex = pickW([['marcato', 1 + 3 * I], ['cantabile', 3.2 - 2.4 * I], ['fugue', 2.4], ['chromatic', 2]]
        .map(o => (pl && pl.tex === o[0]) ? [o[0], o[1] * 0.3] : o));
    const firstVoice = rng() < 0.5 ? 'bandoneon' : 'violin';
    const others = ['bandoneon', 'violin', 'guitar'].filter(x => x !== firstVoice);
    if (rng() < 0.5) others.reverse();
    const out = {
        intensity: I, tex,
        lead: rng() < 0.68 ? 'violin' : 'bandoneon',      // voix qui chante
        counterGuitar: rng() < 0.4,                         // contre-chant à la guitare plutôt qu'au bandonéon
        order: [firstVoice].concat(others),                 // ordre des entrées de la fugue
        subjIdx: Math.floor(rng() * PZ_PAT.PZ_SUBJECTS.length),
        groupVariant: pickW([[0, 5], [1, 1.2], [2, 1.2]]),  // 3+3+2, 2+3+3 ou 3+2+3
        contour: Array.from({ length: 12 }, () => pickW([[0, 0.35], [1, 3], [-1, 3], [2, 1.2], [-2, 1.2], [3, 0.25], [-3, 0.25]])),
        melSeed: rng(),
        stabIdx: Math.floor(rng() * 3),
        bassIdx: Math.floor(rng() * 3),
        arr: rng() < 0.55,                                  // « arrastre » : petite note d'appui par en dessous
        chich: rng() < 0.6,
        latigo: rng() < 0.5
    };
    return ctx.groove === 'lyrique' ? lyricPhraseExtras(rng, pl, index, out) : out;
}

// Milonga lyrique (style de grille « Milonga lyrique », d'après l'esprit d'« Oblivion ») : musique de chambre lente et
// contemplative. On garde le quintette du Tango nuevo mais on change d'écriture : le bandonéon (ou le violon) chante de
// longues phrases, le piano arpège doucement, la contrebasse reste obstinée sans marquer le pas de bal, et les voix dialoguent
// en imitation. Textures de phrase : « cantilena » (chant + halo), « dialogue » (question / réponse une mesure sur deux),
// « canon » (la seconde voix reprend le chant une demi-mesure plus tard) et « chromatic » (lignes chromatiques descendantes).
function lyricPhraseExtras(rng, pl, index, base) {
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.3;
    let I = index === 0 ? 0.28 + rng() * 0.12 : prevI + (0.34 - prevI) * 0.3 + (rng() - 0.5) * 0.18;
    I = Math.max(0.16, Math.min(0.55, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const tex = pickW([['cantilena', 3], ['dialogue', 2.4], ['canon', 1.8], ['chromatic', 1.6]]
        .map(o => (pl && pl.tex === o[0]) ? [o[0], o[1] * 0.25] : o));
    return Object.assign(base, {
        lyr: true, intensity: I, tex,
        lead: rng() < 0.7 ? 'bandoneon' : 'violin',        // le bandonéon chante, le violon répond (parfois l'inverse)
        groupVariant: 0,                                   // toujours 3+3+2 : appuis stables
        arpIdx: Math.floor(rng() * PZ_PAT.PZ_LYR_ARP.length),
        rhythmSeed: rng(),
        lag: rng() < 0.7 ? 4 : 3,                          // retard du canon, en croches
        shift: rng() < 0.6 ? 12 : -5,                      // intervalle de la reprise (octave ou quinte inférieure)
        halo: rng() < 0.6,                                 // guitare : note longue et douce au début de la phrase
        soft: rng() < 0.5,
        latigo: false
    });
}

// Registre (hauteurs réelles, do3 = 0) de chaque voix selon son rôle : chant, contre-chant (registre très contrasté),
// voix intérieure, sujet de fugue.
function pzReg(who, role) {
    const R = {
        violin:    { lead: [19, 34], counter: [27, 37], inner: [10, 24], fugue: [19, 34] },
        bandoneon: { lead: [10, 26], counter: [1, 16],  inner: [3, 17],  fugue: [9, 25] },
        guitar:    { lead: [10, 24], counter: [2, 16],  inner: [2, 15],  fugue: [4, 19] }
    };
    return (R[who] && (R[who][role] || R[who].lead)) || [5, 20];
}

function buildPiazzollaPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const eps = 1e-6;
    const off = env.transOffset;
    const spe = ternary ? 3 : 2;                                  // croches par pulsation
    const E = bpb * spe;                                          // croches dans la mesure
    // groupes de croches : la cellule 3+3+2 (ou ses permutations) en 4/4, des groupes de trois ailleurs
    let groups;
    if (ternary) groups = Array(bpb).fill(3);
    else if (E === 8) groups = [[3, 3, 2], [2, 3, 3], [3, 2, 3]][ph.groupVariant % 3];
    else { groups = []; let r = E; while (r > 3) { groups.push(3); r -= 3; } if (r > 0) groups.push(r); }
    const gs = []; { let a = 0; groups.forEach(g => { gs.push(a); a += g; }); }
    const P = (e) => e / spe;                                     // position (en pulsations) de la croche e
    const W = (x) => x - off;                                     // hauteur réelle -> hauteur écrite
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const nextBarCs = (isLastMeasureOfStep && nextStep) ? nextStep : segs[0].cs;   // premier accord de la mesure suivante
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const csAt = (pos) => segs[segAt(pos)].cs;
    const prog = L > 1 ? i / (L - 1) : 0;
    const dyn = (0.72 + 0.3 * I) * (0.92 + 0.08 * prog);
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    const piano = [], bass = [], drums = [];
    const st = env.state.pzState || (env.state.pzState = { v: {}, mel: {}, chrom: {}, fugueStart: null });
    const add = (inst, pos, dur, vel, ints, art) => piano.push({ inst, pos, dur, vel: clampV(vel * dyn), rootIndex: 0, intervals: ints, art });
    const dr = (e, drum, vel) => drums.push({ pos: P(e), drum, vel: Math.min(1, vel * (0.85 + 0.2 * I)) });

    // ---- outils ----
    const ctSet = (cs) => {
        const s = new Set();
        env.findChordObj(cs.chordId).notes.forEach(iv => s.add((((cs.rootIndex + iv) % 12) + 12) % 12));
        return s;
    };
    const isCT = (cs, x) => ctSet(cs).has(((x % 12) + 12) % 12);
    const nearIdx = (S, x) => { let b = 0; for (let j = 1; j < S.length; j++) if (Math.abs(S[j] - x) < Math.abs(S[b] - x)) b = j; return b; };
    const toCT = (cs, S, idx) => {
        if (isCT(cs, S[idx])) return idx;
        for (const d of [1, -1, 2, -2]) { const j = idx + d; if (S[j] !== undefined && isCT(cs, S[j])) return j; }
        return idx;
    };
    const centreFold = (x, lo, hi) => x + 12 * Math.round(((lo + hi) / 2 - x) / 12);
    const mkRng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
    const baseSeed = Math.floor(ph.melSeed * 1e9);
    const chromDesc = (start, target, n) => {
        const d = Math.max(0, start - target);
        const out = [];
        for (let j = 0; j < n; j++) out.push(n === 1 ? start : start - Math.round(j * d / (n - 1)));
        return out;
    };
    // les croches de la cellule : début de chaque groupe (variante 1 : + dernière croche des longs groupes ; 2 : anticipations)
    const cellOnsets = (variant) => {
        const o = [];
        groups.forEach((g, gi) => {
            const s = gs[gi];
            o.push((variant === 2 && gi > 0 && g >= 2) ? s - 1 : s);
            if (variant === 1 && g >= 3 && gi < groups.length - 1) o.push(s + g - 1);
        });
        return Array.from(new Set(o)).filter(e => e >= 0 && e < E).sort((a, b) => a - b);
    };

    // ---- conduite des voix des accords : le renversement le plus proche du précédent, par instrument ----
    const RANGES = {
        piano: { lo: -5, hi: 13, centre: 4, soft: 10 },
        guitar: { lo: 3, hi: 18, centre: 10, soft: 15 },
        bandoneon: { lo: 5, hi: 22, centre: 13, soft: 19 },
        pianoArp: { lo: -7, hi: 9, centre: 1, soft: 7 }          // arpèges de la Milonga lyrique : du sol2 au la4 environ
    };
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (who, cs) => {
        const slot = st.v[who] || (st.v[who] = { key: null, v: null });
        const key = keyOf(cs);
        if (slot.key === key && slot.v && slot.v.length) return slot.v;
        const v = popVoicing(env, cs, slot.v, RANGES[who] || RANGES.piano);
        slot.key = key; slot.v = v;
        return v;
    };
    const stab = (who, e, dur, vel, art) => {
        const pos = P(e);
        const V = voiceFor(who, csAt(pos));
        if (V && V.length) add(who, pos, dur, vel, V, art || 'stab');
    };

    // ---- ligne mélodique conjointe : degrés de la gamme de l'accord, notes d'accord sur les débuts de groupe ----
    const melody = (who, role, onsets, o) => {
        o = o || {};
        const lo = W(pzReg(who, role)[0]), hi = W(pzReg(who, role)[1]);
        const mr = mkRng(baseSeed + (i % 2) * 7919 + (o.salt || 0) * 131);
        let prev = st.mel[who];
        if (!Number.isFinite(prev) || prev < lo - 3 || prev > hi + 3) prev = null;
        const notes = [];
        onsets.forEach((e, k) => {
            const pos = P(e), cs = csAt(pos);
            const S = popScaleNotes(cs, lo, hi);
            if (S.length < 4) return;
            const strong = gs.includes(e);
            let idx;
            if (prev === null) idx = nearIdx(S, o.start !== undefined ? o.start : (lo + hi) / 2);
            else {
                let stp = ph.contour[(k + (i % 2) * 5 + (o.salt || 0)) % ph.contour.length];
                const bias = o.dir !== undefined ? o.dir : (i < L / 2 ? 0.6 : -0.6);   // on monte puis on redescend
                if (stp !== 0 && Math.sign(stp) !== Math.sign(bias) && mr() < 0.4) stp = -stp;
                const c = nearIdx(S, prev);
                let j = c + stp;
                if (j < 0 || j >= S.length) j = c - stp;
                idx = Math.max(0, Math.min(S.length - 1, j));
            }
            if (strong || o.allCT) idx = toCT(cs, S, idx);
            if (prev !== null && S[idx] === prev && !o.allCT) {      // le contour demandait un mouvement : on cherche la note d'accord voisine
                const sg = Math.sign(ph.contour[(k + (i % 2) * 5 + (o.salt || 0)) % ph.contour.length]) || 1;
                for (const d of [sg, -sg, 2 * sg]) {
                    const j = idx + d;
                    if (S[j] !== undefined && S[j] !== prev && (!strong || isCT(cs, S[j]))) { idx = j; break; }
                }
            }
            prev = S[idx];
            notes.push({ e, pos, x: prev, strong });
        });
        if (prev !== null) st.mel[who] = prev;
        return notes;
    };
    const emitLine = (who, notes, o) => {
        notes.forEach((n, k) => {
            const nextPos = k + 1 < notes.length ? notes[k + 1].pos : bpb;
            let dur = Math.max(0.1 / spe, (nextPos - n.pos) * o.legato);
            if (o.maxDur) dur = Math.min(dur, o.maxDur);
            add(who, n.pos, dur, n.strong ? o.vs : o.vw, [n.x], o.art || 'line');
            // « arrastre » : petite note d'appui un demi-ton en dessous, juste avant un début de groupe
            if (o.arr && n.strong && n.pos > 0.2 && rng() < 0.4) add(who, n.pos - 0.14 / spe, 0.12 / spe, 0.5, [n.x - 1], 'grace');
        });
    };
    const lastDir = (notes) => {
        if (notes.length < 2) return -1;
        return Math.sign(notes[notes.length - 1].x - notes[0].x) || -1;
    };

    // ---- rythmes ----
    const leadOnsets = (kind) => {
        const mr = mkRng(baseSeed + (i % 2) * 104729 + 17);
        const o = [];
        groups.forEach((g, gi) => {
            const s = gs[gi];
            o.push(s);
            const r = mr();
            if (kind === 'busy') {
                if (g >= 2 && r < 0.45 + 0.4 * I) o.push(s + 1);
                if (g >= 3 && mr() < 0.35 * I) o.push(s + 2);
            } else if (g >= 3 && r < 0.3) o.push(s + g - 1);     // longue-longue-brève
        });
        return Array.from(new Set(o)).filter(e => e < E).sort((a, b) => a - b);
    };
    const counterOnsets = (taken) => {
        const mr = mkRng(baseSeed + 31337 + (i % 2));
        const set = new Set(taken);
        const o = [];
        groups.forEach((g, gi) => {
            if (g < 2) return;
            const c = gs[gi] + (g >= 3 ? 1 + Math.floor(mr() * 2) : 1);
            if (c < E && !set.has(c) && mr() < 0.5 + 0.35 * I) o.push(c);
        });
        if (!o.length) { const c = (gs[1] !== undefined ? gs[1] : gs[0]) + 1; if (c < E && !set.has(c)) o.push(c); }
        return o;
    };

    // ---- voix intérieure chromatique descendante ----
    // Elle part de la hauteur où la précédente mesure l'a laissée (une note de l'accord de cette mesure), descend d'un demi-ton
    // à la fois et s'arrête un demi-ton au-dessus d'une note de l'accord suivant, qu'elle atteint au début de la mesure suivante.
    // positions (en croches) de n notes réparties dans la mesure : les débuts de groupe quand n leur est égal
    const slotsFor = (n) => {
        if (n === groups.length) return gs.slice();
        const o = [];
        for (let k = 0; k < n; k++) o.push(Math.round(k * E / n));
        return Array.from(new Set(o)).sort((a, b) => a - b);
    };
    const innerChrom = (who, vel) => {
        const lo = W(pzReg(who, 'inner')[0]), hi = W(pzReg(who, 'inner')[1]);
        const nMax = Math.min(6, 2 * groups.length, E);
        const cs0 = segs[0].cs;
        let start = st.chrom[who];
        if (!Number.isFinite(start) || start < lo + 2 || start > hi + 2) {          // (ré)exposition au haut du registre
            const ct = popScaleNotes(cs0, hi - 6, hi).filter(x => isCT(cs0, x));
            start = ct.length ? ct[ct.length - 1] : hi - 2;
        } else if (!isCT(cs0, start)) {
            const ct = popScaleNotes(cs0, start - 4, start + 4).filter(x => isCT(cs0, x));
            if (ct.length) start = ct.reduce((b, x) => Math.abs(x - start) < Math.abs(b - start) ? x : b, ct[0]);
        }
        const tg = popScaleNotes(nextBarCs, start - nMax - 1, start + 6).filter(x => isCT(nextBarCs, x));
        const reach = tg.filter(x => start - (x + 1) >= 0 && start - (x + 1) <= nMax - 1);   // atteignables en descendant d'un demi-ton par note
        let target, pitches, slots;
        if (reach.length) {
            const shallow = reach.filter(x => start - x <= 3);
            target = (changeNext || !shallow.length) ? Math.min(...reach) : Math.max(...shallow);
            const n = Math.max(groups.length, start - (target + 1) + 1);
            slots = slotsFor(n);
            pitches = chromDesc(start, target + 1, slots.length);
        } else {                                                                      // rien à portée : la voix tient, puis passe à la note la plus proche
            target = tg.length ? tg.reduce((b, x) => Math.abs(x - start) < Math.abs(b - start) ? x : b, tg[0]) : start;
            slots = gs.slice();
            pitches = Array(slots.length).fill(start);
        }
        st.chrom[who] = target;
        pitches.forEach((x, k) => {
            const nextPos = k + 1 < slots.length ? P(slots[k + 1]) : bpb;
            add(who, P(slots[k]), Math.max(0.2, (nextPos - P(slots[k])) * 0.96), vel * (k === 0 ? 1 : 0.92), [x], 'sus');
        });
    };

    // ---- contrebasse ----
    const PATS = [[0, 1, 0], [0, 0, 1], [0, 2, 1]];                // 0 fondamentale, 1 quinte, 2 tierce
    const bassPattern = (long) => {
        const pat = PATS[ph.bassIdx % PATS.length];
        segs.forEach((sg, si) => {
            const T = popBassTones(env, sg.cs);
            const tone = [T.root, T.fifth, T.third];
            const lastHere = si === segs.length - 1;
            const nxt = lastHere ? (changeNext ? nextStep : null) : segs[si + 1].cs;
            let n = 0;
            gs.forEach((e, gi) => {
                const pos = P(e);
                if (pos < sg.s - eps || pos >= sg.e - eps) return;
                bass.push({ pos, abs: tone[pat[n % pat.length]], dur: (long ? 0.92 : 0.62) * groups[gi] / spe, art: 'pizz',
                    vel: clampV((n === 0 && si === 0 ? 0.92 : 0.74) * (0.85 + 0.2 * I)) });
                n++;
            });
            if (lastHere && nxt && (isTurn ? 0.85 : 0.35) > rng()) {
                const apr = popBassApproach(env, T.root, nxt, rng);
                const pe = P(E - 1);
                const same = bass.find(b => Math.abs(b.pos - pe) < eps);
                if (same) same.abs = apr;
                else bass.push({ pos: pe, abs: apr, dur: 0.8 / spe, art: 'pizz', vel: clampV(0.7 * (0.85 + 0.2 * I)) });
            }
        });
    };
    const bassArco = () => {                                         // notes longues à l'archet ; note d'approche sur le dernier groupe
        segs.forEach((sg, si) => {
            const T = popBassTones(env, sg.cs);
            const lastHere = si === segs.length - 1;
            const nxt = lastHere ? (changeNext ? nextStep : null) : segs[si + 1].cs;
            const lastStart = P(gs[gs.length - 1]);
            const approach = lastHere && nxt && groups.length > 1 && (isTurn ? 0.9 : 0.4) > rng();
            const endPos = approach ? lastStart : sg.e;
            bass.push({ pos: sg.s, abs: T.root, dur: Math.max(0.3, (endPos - sg.s) * 0.95), art: 'arco', vel: clampV(0.8 * (0.85 + 0.2 * I)) });
            if (approach) bass.push({ pos: lastStart, abs: popBassApproach(env, T.root, nxt, rng), dur: (sg.e - lastStart) * 0.9, art: 'arco', vel: clampV(0.7 * (0.85 + 0.2 * I)) });
        });
    };
    // descente chromatique de la basse : fondamentale -> un demi-ton au-dessus de la fondamentale suivante (si elle est à portée)
    const bassChrom = () => {
        if (halves || sameChord(segs[0].cs, nextBarCs)) return false;
        const nMax = Math.min(6, 2 * groups.length, E);
        const Tn = popBassTones(env, segs[0].cs), Tx = popBassTones(env, nextBarCs);
        for (const tgt of [Tx.root, Tx.root - 12, Tx.root + 12]) {
            const d = Tn.root - (tgt + 1);
            if (d >= 0 && d <= nMax - 1 && tgt + 1 + off >= -8) {          // la ligne reste dans le registre de la contrebasse (mi1 et au-dessus)
                const slots = slotsFor(Math.max(groups.length, d + 1));
                chromDesc(Tn.root, tgt + 1, slots.length).forEach((abs, k) => {
                    const nextPos = k + 1 < slots.length ? P(slots[k + 1]) : bpb;
                    bass.push({ pos: P(slots[k]), abs, dur: (nextPos - P(slots[k])) * 0.93, art: 'arco', vel: clampV((k === 0 ? 0.88 : 0.78) * (0.85 + 0.2 * I)) });
                });
                return true;
            }
        }
        return false;
    };

    // ---- Milonga lyrique : écriture de chambre, lente et contemplative ----
    // Le bandonéon (ou le violon) chante de longues notes liées ; le piano arpège doucement l'accord ; la contrebasse tient
    // une pulsation obstinée (fondamentale - quinte - fondamentale) sans marquer le pas lourd du tango de bal ; la seconde voix
    // répond en imitation, en dialogue (une mesure sur deux) ou en canon (une demi-mesure plus tard) ; la guitare ne fait
    // que poser un halo. Les accents de percussion sont à peine effleurés.
    if (ph.lyr) {
        const lyL = ph.lead;                                          // voix qui chante
        const lyO = lyL === 'bandoneon' ? 'violin' : 'bandoneon';     // voix qui répond
        const lyTex = ph.tex;
        const lrng = mkRng(baseSeed + i * 977 + 5);
        const soft = ph.soft ? 0.92 : 1;
        const vS = (0.62 + 0.14 * I) * soft, vW = (0.5 + 0.12 * I) * soft;
        // rythme du chant : notes longues sur la cellule 3+3+2 (ou une blanche, ou une ronde)
        const RH = [[0, 3, 6], [0, 4], [0, 3, 5], [0, 2, 3, 6], [0, 3, 4, 6], [0]];
        const RHW = [3, 2.2, 2, 1.2, 1.2, 0.6];
        let lyOn = gs.slice();
        if (E === 8) {
            const tot = RHW.reduce((a, b) => a + b, 0);
            let r = lrng() * tot, k = 0;
            for (; k < RHW.length - 1; k++) { r -= RHW[k]; if (r <= 0) break; }
            lyOn = RH[k].slice();
        }
        // imitation d'une ligne : mêmes rythme et contour, transposés (shift demi-tons) et recalés sur la gamme de l'accord
        const imitate = (who, src, lagE, shift, mode) => {
            const lo = W(pzReg(who, 'lead')[0]), hi = W(pzReg(who, 'lead')[1]);
            const out = [];
            (src || []).forEach(n => {
                let e2 = n.e + lagE;
                if (mode === 'now' && e2 >= E) return;
                if (mode === 'carry') { if (e2 < E) return; e2 -= E; }
                if (e2 < 0 || e2 >= E) return;
                const pos = P(e2), cs = csAt(pos);
                const S = popScaleNotes(cs, lo, hi);
                if (S.length < 4) return;
                let x = n.x + shift;
                while (x > hi) x -= 12;
                while (x < lo) x += 12;
                let idx = nearIdx(S, x);
                const strong = gs.includes(e2);
                if (strong) idx = toCT(cs, S, idx);
                out.push({ e: e2, pos, x: S[idx], strong });
            });
            return out.sort((a, b) => a.e - b.e);
        };
        const keepSrc = (notes) => { if (notes.length) st.lyrSrc = notes.map(n => ({ e: n.e, x: n.x })); };
        let sang = true;

        if (lyTex === 'chromatic') {
            // lignes chromatiques descendantes (basse à l'archet, voix intérieure) sous un chant tenu
            const cOn = E === 8 ? [0, 4] : gs.slice(0, 2);
            const ln = melody(lyL, 'lead', cOn, { salt: 1, allCT: true });
            emitLine(lyL, ln, { legato: 0.99, vs: vS, vw: vW, art: 'lyr' });
            keepSrc(ln);
            innerChrom(lyO === 'violin' ? 'violin' : 'guitar', 0.4 + 0.08 * I);
        } else if (lyTex === 'dialogue' && (i % 2 === 1) && st.lyrSrc) {
            // la voix qui chante se tait (une note tenue seulement) ; l'autre reprend le chant de la mesure précédente
            sang = false;
            emitLine(lyL, melody(lyL, 'lead', [gs[0]], { salt: 4, allCT: true }), { legato: 0.99, vs: vW * 0.8, vw: vW * 0.8, art: 'lyr' });
            emitLine(lyO, imitate(lyO, st.lyrSrc, 0, ph.shift, 'all'), { legato: 0.98, vs: vS * 0.92, vw: vW * 0.92, art: 'lyr' });
        } else {
            const ln = melody(lyL, 'lead', lyOn, { salt: 1 });
            emitLine(lyL, ln, { legato: 0.99, vs: vS, vw: vW, art: 'lyr' });
            if (lyTex === 'canon' && st.lyrSrc) {
                const lag = ph.lag;
                const ans = imitate(lyO, st.lyrSrc, lag, ph.shift, 'carry').concat(imitate(lyO, ln, lag, ph.shift, 'now'));
                ans.sort((a, b) => a.e - b.e);
                emitLine(lyO, ans, { legato: 0.98, vs: vS * 0.82, vw: vW * 0.82, art: 'lyr' });
            } else {
                // cantilena (et début de canon / de dialogue) : contre-chant long en mouvement contraire
                const cOn = E === 8 ? [0, 4] : gs.slice(0, 1);
                emitLine(lyO, melody(lyO, 'counter', cOn, { salt: 2, allCT: true, dir: -lastDir(ln) }), { legato: 0.99, vs: vW * 0.85, vw: vW * 0.8, art: 'lyr' });
            }
            keepSrc(ln);
        }

        // piano : arpège doux sur l'accord de chaque croche (silences selon le motif)
        const arp = PZ_PAT.PZ_LYR_ARP[ph.arpIdx % PZ_PAT.PZ_LYR_ARP.length];
        for (let e = 0; e < E; e++) {
            const k = arp[e % arp.length];
            if (k === null || k === undefined) continue;
            const pos = P(e), cs = csAt(pos);
            const V = voiceFor('pianoArp', cs);
            if (!V || !V.length) continue;
            let T4;
            if (V.length >= 4) T4 = [V[0], V[1], V[2], V[V.length - 1]];
            else { T4 = V.slice(); for (let j = 0; T4.length < 4; j++) T4.push(V[j % V.length] + 12); T4.sort((a, b) => a - b); }
            add('piano', pos, 2.6 / spe, (e === 0 ? 0.5 : (gs.includes(e) ? 0.4 : 0.31)) * soft + 0.05 * I, [T4[k]], 'sus');
        }
        // contrebasse obstinée (ou descente chromatique à l'archet)
        if (lyTex === 'chromatic') { if (!bassChrom()) bassPattern(true); } else bassPattern(true);
        bass.forEach(b => { b.vel = clampV(b.vel * 0.88); });
        // guitare : halo doux au début de la phrase
        if (ph.halo && i === 0 && lyTex !== 'chromatic') stab('guitar', gs[0], Math.min(bpb, 3.6), 0.3, 'lyr');
        // percussions effleurées
        if (i % 2 === 0) dr(gs[0], 'golpe', 0.26);
        if (ph.chich && gs[2] !== undefined && I > 0.3) dr(gs[2], 'chich', 0.12);
        if (isTurn && L > 1 && I > 0.4 && lrng() < 0.25) dr(E - 1, 'latigo', 0.3);

        piano.sort((a, b) => a.pos - b.pos);
        bass.sort((a, b) => a.pos - b.pos);
        drums.sort((a, b) => a.pos - b.pos);
        return { piano, bass, drums, piazzolla: true };
    }

    // ---- les textures ----
    const lead = ph.lead;
    const other = lead === 'violin' ? 'bandoneon' : 'violin';
    const counter = (lead === 'violin' && ph.counterGuitar) ? 'guitar' : other;
    const third = ['bandoneon', 'violin', 'guitar'].find(x => x !== lead && x !== counter);   // jamais le violon
    const tex = ph.tex;

    if (tex === 'marcato') {
        // cellule 3+3+2 percussive : le chant (staccato) sur la cellule, accords en contretemps, basse pizzicato
        const leadNotes = melody(lead, 'lead', leadOnsets('busy'), { salt: 1 });
        emitLine(lead, leadNotes, { legato: 0.58, vs: 0.82 + 0.1 * I, vw: 0.64 + 0.1 * I, arr: ph.arr, maxDur: 1.1 / spe });
        if (counter === 'violin') {
            emitLine('violin', melody('violin', 'counter', [gs[0]], { salt: 2, allCT: true, dir: -1 }), { legato: 0.98, vs: 0.5, vw: 0.5, art: 'sus' });
        } else {
            cellOnsets(ph.stabIdx).forEach((e, k) => { if (k === 0 && rng() < 0.4) return; stab(counter, e, 0.6 / spe, (gs.includes(e) ? 0.74 : 0.6) + 0.08 * I); });
        }
        cellOnsets(2).slice(1).forEach(e => { if (rng() < 0.65) stab(third, e, 0.5 / spe, 0.5 + 0.1 * I); });
        cellOnsets(0).forEach((e, k) => stab('piano', e, 0.7 / spe, (k === 0 ? 0.92 : 0.78) + 0.06 * I));
        bassPattern(false);
        dr(gs[0], 'golpe', 1);
        if (gs[1] !== undefined) dr(gs[1], 'golpe', 0.62);
        if (gs[2] !== undefined) dr(gs[2], ph.chich ? 'chich' : 'golpe', 0.7);
        if (I > 0.6) groups.forEach((g, gi) => { if (g >= 3) dr(gs[gi] + g - 1, 'chich', 0.35); });
        if (isTurn && L > 1 && ph.latigo) dr(E - 1, 'latigo', 0.9);
    } else if (tex === 'cantabile') {
        // chant long du violon (ou du bandonéon), contre-chant en mouvement contraire dans un registre très différent,
        // voix intérieure chromatique, piano en coussin, contrebasse à l'archet
        const lOn = leadOnsets('long');
        const leadNotes = melody(lead, 'lead', lOn, { salt: 1 });
        emitLine(lead, leadNotes, { legato: 0.97, vs: 0.8 + 0.1 * I, vw: 0.68 + 0.1 * I, arr: ph.arr });
        const cNotes = melody(counter, 'counter', counterOnsets(lOn), { salt: 2, dir: -lastDir(leadNotes) });
        emitLine(counter, cNotes, { legato: 0.9, vs: 0.6 + 0.1 * I, vw: 0.55 + 0.1 * I, maxDur: 2.2 / spe });
        innerChrom(third, 0.46 + 0.08 * I);
        stab('piano', gs[0], Math.max(0.5, P(gs[1] !== undefined ? gs[1] : E) * 0.9), 0.5, 'sus');
        if (gs[1] !== undefined && groups.length > 2) stab('piano', gs[1], 0.8 / spe, 0.42, 'stab');
        const e2 = gs.find(e => P(e) >= splitAt - eps);
        if (halves && e2 !== undefined) stab('piano', e2, 0.9, 0.48, 'sus');      // le second accord se fait entendre
        bassArco();
        if (I > 0.55) dr(gs[0], 'golpe', 0.4);
        if (ph.chich && I > 0.4 && gs[1] !== undefined) dr(gs[1], 'chich', 0.28);
    } else if (tex === 'fugue') {
        // entrées en imitation : sujet (bandonéon, violon, guitare dans l'ordre de la phrase), réponse à la quinte
        const subj = PZ_PAT.PZ_SUBJECTS[ph.subjIdx % PZ_PAT.PZ_SUBJECTS.length].filter(o => o[0] < E);
        const k = i % 3;
        const entering = ph.order[k];
        const entered = i >= 3 ? ph.order.filter(x => x !== entering) : ph.order.slice(0, k);   // voix déjà entrées : contre-sujet
        const cs0 = segs[0].cs;
        const lo = W(pzReg(entering, 'fugue')[0]), hi = W(pzReg(entering, 'fugue')[1]);
        let startPitch;
        const lowHi = lo + (hi - lo) * 0.6;                         // le sujet monte souvent : on part dans le bas du registre
        if (k === 1 && Number.isFinite(st.fugueStart)) startPitch = centreFold(st.fugueStart + 7, lo, lowHi);   // réponse à la quinte
        else startPitch = centreFold(cs0.rootIndex, lo, lowHi);                                                 // sujet sur la fondamentale
        const notes = [];
        let prevX = null;
        subj.forEach(([e, inc], q) => {
            const pos = P(e), cs = csAt(pos);
            const S = popScaleNotes(cs, lo, hi);
            if (S.length < 4) return;
            let idx = prevX === null ? nearIdx(S, startPitch) : nearIdx(S, prevX) + inc;
            idx = Math.max(0, Math.min(S.length - 1, idx));
            const strong = gs.includes(e);
            if (q === 0 || q === subj.length - 1) idx = toCT(cs, S, idx);   // le reste suit les degrés du sujet (imitation fidèle)
            prevX = S[idx];
            notes.push({ e, pos, x: prevX, strong });
        });
        if (notes.length) st.fugueStart = notes[0].x;
        emitLine(entering, notes, { legato: 0.8, vs: 0.84 + 0.1 * I, vw: 0.7 + 0.1 * I, arr: false });
        entered.forEach((who, q) => {                               // contre-sujet : lignes conjointes qui descendent
            const cn = melody(who, 'fugue', gs.slice(), { salt: 3 + q, dir: -1 });
            emitLine(who, cn, { legato: 0.95, vs: 0.52, vw: 0.46, maxDur: 3 / spe });
        });
        cellOnsets(0).slice(1).forEach((e, q) => stab('piano', e, 0.6 / spe, 0.5 + 0.12 * I));
        bassPattern(true);
        if (gs[1] !== undefined) dr(gs[0], 'golpe', 0.4);
        if (I > 0.5 && isTurn && ph.latigo) dr(E - 1, 'latigo', 0.7);
    } else {
        // lignes chromatiques descendantes : à la basse (archet) et dans une voix intérieure, sous un chant tenu
        if (!bassChrom()) bassPattern(true);
        innerChrom(third, 0.55 + 0.1 * I);
        const lOn = [gs[0]].concat(groups.length > 2 && rng() < 0.5 ? [gs[2]] : []);
        emitLine(lead, melody(lead, 'lead', lOn, { salt: 1, allCT: true }), { legato: 0.98, vs: 0.74 + 0.1 * I, vw: 0.66, art: 'sus' });
        if (counter === 'violin') emitLine('violin', melody('violin', 'counter', [gs[Math.min(1, gs.length - 1)]], { salt: 2, allCT: true, dir: -1 }), { legato: 0.98, vs: 0.46, vw: 0.46, art: 'sus' });
        else cellOnsets(0).slice(1).forEach(e => stab(counter, e, 0.55 / spe, 0.52 + 0.1 * I));
        cellOnsets(0).forEach((e, q) => stab('piano', e, 0.6 / spe, (q === 0 ? 0.74 : 0.6) + 0.06 * I));
        dr(gs[0], 'golpe', 0.6);
        if (gs[1] !== undefined && ph.chich) dr(gs[1], 'chich', 0.4);
        if (isTurn && L > 1 && ph.latigo) dr(E - 1, 'latigo', 0.8);
    }

    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    drums.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums, piazzolla: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { piazzollaPhraseExtras, lyricPhraseExtras, pzReg, buildPiazzollaPlan };
}
