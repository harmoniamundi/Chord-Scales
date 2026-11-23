// band/manouche-plan.js — orchestre « Jazz manouche » de la jam (dans l'esprit du Quintette du Hot Club de France) : guitare
// rythmique qui joue « la pompe », contrebasse, guitare solo (petites phrases de fin de phrase, à la Django) et violon (nappes
// et réponses, à la Grappelli). Pas de batterie : dans le swing manouche, c'est la pompe qui tient le tempo.
// Chargé par index.html via <script src="app/band/manouche-plan.js"> (après band-helpers.js) et testé par band/manouche-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band-helpers.js
//   env.splitBeat      temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm            tempo courant (sous 100 : jeu de ballade)
//   env.density        curseur « Densité » (0 à 1, 0,5 par défaut) : quantité de phrases de la guitare solo et du violon
//   env.measureInStep  rang de la mesure dans le bloc de la grille (un accord tenu deux mesures : 0 puis 1)
//   env.state          mémoire entre deux mesures, modifiée en place : { mnState: { voice, lead, vln } }
//                      (voicing de la pompe, note d'arrivée de la phrase de guitare solo, dernière note du violon)
// buildManouchePlan renvoie { piano, bass, drums: [], manouche: true } ; chaque frappe de « piano » porte e.inst :
//   'pompe'  guitare rythmique, e.art = 'boom' (temps faibles de la basse : cordes graves), 'chick' (contretemps étouffé),
//            'ghost' (coup remonté étouffé, presque muet), 'ballad' (coup égal et doux des ballades), 'slide' (accord glissé d'un demi-ton) ;
//   'lead'   guitare solo, une note par frappe (e.art = 'pick' ; 'target' pour la note d'arrivée) ;
//   'violin' violon, e.art = 'sus' (nappe tenue) ou 'line' (petite réponse).
// Hauteurs : e.intervals sont des demi-tons écrits depuis do3 (réel = 48 + x + transOffset), basse depuis do2, comme ailleurs.

if (typeof popScaleNotes === 'undefined' && typeof require === 'function') {
    var { popScaleNotes, popBassApproach, latBassTones } = require('./band-helpers.js');
}

// ===================== Orchestration JAZZ MANOUCHE =====================
// La pompe (4/4) : sur 1 et 3 un coup descendant bref, surtout sur les cordes graves (« boum ») ; sur 2 et 4 l'accord entier,
// accentué et aussitôt étouffé par la main gauche (« tchac »), suivi d'un coup remonté étouffé presque muet. La contrebasse
// double les « boum » (fondamentale, quinte) et marche en noires dans les phrases plus chargées. En 3/4 (valse manouche) :
// boum - tchac - tchac ; en 2/4 : boum - tchac ; en mesure composée, la pulsation est la noire pointée. Sous 100 à la noire,
// ballade : quatre coups égaux et doux, la basse en blanches.
// Accords de la pompe : formes de guitare à 4 sons, la basse sur la 6e ou la 5e corde et trois notes au-dessus, choisies comme
// les grilles de Django : m6 = 1-6-♭3-5, 6 = 1-3-6-5, 7 = 1-3-♭7-5, 7(♭9) = 1-3-♭7-♭9 (le son « diminué »), °7 = les quatre notes.
// Fins de phrase : de temps en temps, le dernier « tchac » glisse d'un demi-ton au-dessus de l'accord suivant (glissando
// d'accord typique), la guitare solo place une courte phrase (arpège diminué en triolets sur une dominante, arpège de l'accord,
// broderie chromatique) qui retombe sur une note de l'accord suivant, la contrebasse amène l'accord suivant par une note voisine.

const MN_BASS_LO = 40;   // mi2 : corde grave de la guitare
const MN_UP_LO = 52, MN_UP_HI = 69;   // notes du haut de la pompe : mi3 à la4
const MN_LEAD_LO = 57, MN_LEAD_HI = 81;   // guitare solo : la3 à la5
const MN_VLN_LO = 62, MN_VLN_HI = 79;     // nappes du violon : ré4 à sol5

const mnMod = (x) => ((x % 12) + 12) % 12;

// Notes de l'accord en demi-tons au-dessus de sa fondamentale : { third, fifth, sev (6e ou 7e, ou null), ext (tension, ou null) }
function mnChordShape(env, cs) {
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    const rel = (k, d) => mnMod((t[k] !== undefined ? t[k] : d) - r0);
    return {
        root: mnMod(cs.rootIndex + r0),
        third: rel(1, 4), fifth: rel(2, 7),
        sev: t.length > 3 ? rel(3, 10) : null,
        ext: t.length > 4 ? rel(t.length - 1, 2) : null
    };
}

// Notes du haut de la pompe (degrés au-dessus de la fondamentale), dans l'ordre de priorité.
function mnUpperDegrees(sh) {
    if (sh.third === 3 && sh.fifth === 6 && sh.sev === 9) return [3, 6, 9];          // °7 : les trois notes au-dessus de la basse
    if (sh.sev === null) return [sh.third, sh.fifth, 0];                             // triade : tierce, quinte, octave
    const top = sh.ext !== null ? sh.ext : sh.fifth;                                  // 7(♭9) → ♭9, 6/9 → 9, sinon la quinte
    return [sh.third, sh.sev, top];
}

// Voicing de la pompe en hauteurs réelles (MIDI) : { low, up: [3 notes croissantes] }. prev = voicing précédent (conduite des voix).
function manoucheVoicing(env, cs, prev) {
    const off = env.transOffset || 0;
    const sh = mnChordShape(env, cs);
    const real = (pcWritten) => mnMod(pcWritten + off);
    const bassPcW = Number.isInteger(cs.bassRootIndex) ? cs.bassRootIndex : sh.root;
    const low = MN_BASS_LO + mnMod(real(bassPcW) - MN_BASS_LO);
    const pcs = mnUpperDegrees(sh).map(d => real(sh.root + d));
    const opts = pcs.map(pc => {
        const out = [];
        for (let m = MN_UP_LO + mnMod(pc - MN_UP_LO); m <= MN_UP_HI; m += 12) out.push(m);
        return out;
    });
    const prevUp = prev && Array.isArray(prev.up) ? prev.up : null;
    let best = null, bestCost = Infinity;
    const tryAll = (maxSpan) => {
        opts[0].forEach(a => opts[1].forEach(b => opts[2].forEach(c => {
            const v = [a, b, c].sort((x, y) => x - y);
            if (v[0] === v[1] || v[1] === v[2]) return;
            if (v[2] - v[0] > maxSpan || v[0] <= low + 2) return;
            let cost = prevUp ? v.reduce((s, x, k) => s + Math.abs(x - prevUp[k]), 0) : Math.abs((v[0] + v[1] + v[2]) / 3 - 60) * 1.5;
            cost += 0.6 * Math.max(0, v[2] - 66) + 0.4 * Math.max(0, 55 - v[0]);
            if (cost < bestCost - 1e-9) { bestCost = cost; best = v; }
        })));
    };
    tryAll(9);
    if (!best) tryAll(14);
    if (!best) best = [MN_UP_LO + mnMod(pcs[0] - MN_UP_LO), MN_UP_LO + mnMod(pcs[1] - MN_UP_LO) + 12, MN_UP_LO + mnMod(pcs[2] - MN_UP_LO) + 12].sort((x, y) => x - y);
    return { low, up: best };
}

// Notes réelles des accords d'un accord dans un registre : fondamentale, tierce, quinte, 6e / 7e.
function mnChordTonesIn(env, cs, lo, hi) {
    const off = env.transOffset || 0;
    const sh = mnChordShape(env, cs);
    const degs = [0, sh.third, sh.fifth].concat(sh.sev !== null ? [sh.sev] : []);
    const pcs = degs.map(d => mnMod(sh.root + d + off));
    const out = [];
    for (let m = lo; m <= hi; m++) if (pcs.includes(mnMod(m))) out.push(m);
    return out;
}

// Note d'arrivée d'une phrase sur l'accord suivant : la tierce de préférence (puis la 6e / 7e, la quinte), la plus proche de `near`.
function mnTargetNote(env, cs, near) {
    const off = env.transOffset || 0;
    const sh = mnChordShape(env, cs);
    let best = null, bestCost = Infinity;
    [[sh.third, 0], [sh.sev !== null ? sh.sev : sh.fifth, 1.5], [sh.fifth, 2.5], [0, 3]].forEach(([d, pen]) => {
        const pc = mnMod(sh.root + d + off);
        for (let m = MN_LEAD_LO + mnMod(pc - MN_LEAD_LO); m <= MN_LEAD_HI; m += 12) {
            const c = Math.abs(m - near) + pen;
            if (c < bestCost) { bestCost = c; best = m; }
        }
    });
    return best;
}

// Phrase de guitare solo sur [from, to[ (en temps), qui mène à l'accord suivant (nextCs). kind :
//   'dim'    arpège diminué en triolets (tierce, quinte, septième, neuvième mineure de la dominante), en montant ;
//   'arp'    arpège de l'accord en croches (montant ou descendant) puis broderie chromatique (dessus, dessous) de la note d'arrivée ;
//   'chrom'  descente chromatique en croches vers la note d'arrivée, depuis une note de l'accord.
// Renvoie { notes: [{ pos, dur, m, vel }], target } (hauteurs réelles ; target = note d'arrivée, jouée au début de la mesure suivante).
function manoucheLick(env, cs, nextCs, from, to, kind, rng, start) {
    const off = env.transOffset || 0;
    const len = Math.max(0, to - from);
    const sh = mnChordShape(env, cs);
    const isDom = sh.third === 4 && sh.sev === 10;
    const near = Number.isFinite(start) ? start : 67;
    let k = kind;
    if (k === 'dim' && !isDom) k = 'arp';
    const tones = mnChordTonesIn(env, cs, MN_LEAD_LO, MN_LEAD_HI - 3);
    if (!tones.length || len < 0.49) return { notes: [], target: null };
    const closest = (arr, x) => arr.reduce((b, n) => Math.abs(n - x) < Math.abs(b - x) ? n : b, arr[0]);
    const inRange = (n) => n.m >= MN_LEAD_LO - 2 && n.m <= MN_LEAD_HI + 2;
    const notes = [];
    if (k === 'dim') {
        // arpège diminué en triolets : la dominante sonne comme un °7 posé sur sa tierce
        const pcs = [sh.third, sh.fifth, 10, 1].map(x => mnMod(sh.root + x + off));
        const count = Math.max(2, Math.round(len * 3));
        let m = closest(tones.filter(x => pcs.includes(mnMod(x))), near - 4);
        while (m + (count - 1) * 3 > MN_LEAD_HI - 2 && m - 12 >= MN_LEAD_LO) m -= 12;
        for (let j = 0; j < count; j++) {
            notes.push({ pos: from + j / 3, dur: 0.3, m, vel: 0.62 + 0.22 * j / Math.max(1, count - 1) });
            let nx = m + 1;
            while (!pcs.includes(mnMod(nx))) nx++;
            m = nx;
        }
        const target = nextCs ? mnTargetNote(env, nextCs, notes[notes.length - 1].m + 1) : null;
        return { notes: notes.filter(inRange), target };
    }
    const count = Math.max(1, Math.round(len * 2));                 // croches
    const vel = (pos, j) => (Number.isInteger(pos) ? 0.74 : 0.62) + 0.1 * j / Math.max(1, count - 1);
    if (k === 'chrom') {
        // descente chromatique qui finit un demi-ton au-dessus de la note d'arrivée
        const t = nextCs ? mnTargetNote(env, nextCs, near) : closest(tones, near);
        for (let j = 0; j < count; j++) {
            const pos = from + j * 0.5;
            notes.push({ pos, dur: 0.42, m: t + count - j, vel: vel(pos, j) });
        }
        return { notes: notes.filter(inRange), target: t };
    }
    // 'arp' : arpège de l'accord (montant ou descendant), puis broderie chromatique (dessus, dessous) de la note d'arrivée
    const tail = count >= 4 ? 2 : (count >= 2 ? 1 : 0);
    const up = rng() < 0.55;
    const sorted = tones.slice().sort((a, b) => a - b);
    let idx = sorted.indexOf(closest(sorted, up ? near - 5 : near + 5));
    const seq = [];
    for (let j = 0; j < count - tail; j++) {
        seq.push(sorted[Math.max(0, Math.min(sorted.length - 1, idx))]);
        idx += up ? 1 : -1;
        if (idx >= sorted.length) idx = sorted.length - 2;
        if (idx < 0) idx = 1;
    }
    const lastHead = seq.length ? seq[seq.length - 1] : near;
    const t = nextCs ? mnTargetNote(env, nextCs, lastHead + (up ? 2 : -2)) : closest(sorted, lastHead);
    if (tail === 2) seq.push(t + 1, t - 1); else if (tail === 1) seq.push(t - 1);
    seq.forEach((m, j) => { const pos = from + j * 0.5; notes.push({ pos, dur: 0.42, m, vel: vel(pos, j) }); });
    return { notes: notes.filter(inRange), target: t };
}

// Choix faits une fois par phrase : énergie, basse qui marche, glissandos d'accord, phrases de la guitare solo et du violon.
function manouchePhraseExtras(rng, prev, index) {
    const pl = (prev && prev.style === 'manouche') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.4 + rng() * 0.15 : prevI + (0.64 - prevI) * 0.3 + (rng() - 0.5) * 0.42;
    I = Math.max(0.25, Math.min(0.95, I));
    return {
        intensity: I,
        walk: rng() < 0.15 + 0.6 * Math.max(0, I - 0.35),          // contrebasse en noires (sinon en deux temps)
        walkHalf: rng() < 0.5,                                      // ... seulement dans la seconde moitié de la phrase
        slide: 0.25 + 0.4 * I,                                      // probabilité d'un glissando d'accord en fin de bloc
        ghost: rng() < 0.75,                                        // coup remonté étouffé après le « tchac »
        leadRoll: rng(), leadKind: rng(), leadMid: rng(),           // phrases de la guitare solo (comparées à la densité dans le plan)
        vlnRoll: rng(), vlnKind: rng()                              // violon : présent ou non, nappe ou réponses
    };
}

function buildManouchePlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const d = Number.isFinite(env.density) ? Math.max(0, Math.min(1, env.density)) : 0.5;
    const eps = 1e-6;
    const off = env.transOffset || 0;
    const W = (real) => real - 48 - off;                 // hauteur réelle → intervalle écrit (depuis do3)
    const st = env.state.mnState || (env.state.mnState = { voice: null, lead: null, vln: null });
    const splitAt = env.splitBeat || Math.ceil(bpb / 2);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const clampV = (v) => Math.max(0.08, Math.min(1, v));
    const dyn = 0.86 + 0.2 * I;
    const ballad = !ternary && (env.bpm || 180) < 100;
    const valse = !ternary && bpb === 3;
    const piano = [], bass = [];

    // ---- voicings de la pompe (conduite des voix d'une mesure à l'autre) ----
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId + ':' + (Number.isInteger(cs.bassRootIndex) ? cs.bassRootIndex : '');
    let prevV = st.voice ? st.voice.v : null;
    const V = segs.map(sg => {
        const k = keyOf(sg.cs);
        const v = (st.voice && st.voice.key === k) ? st.voice.v : manoucheVoicing(env, sg.cs, prevV);
        st.voice = { key: k, v };
        prevV = v;
        return v;
    });
    const nextV = changeNext ? manoucheVoicing(env, nextStep, V[V.length - 1]) : null;

    // ---- la pompe ----
    // Temps « boum » et « tchac » de la mesure
    const strokes = [];
    for (let b = 0; b < bpb; b++) {
        const kind = ballad ? 'ballad' : (valse ? (b === 0 ? 'boom' : 'chick') : (b % 2 === 0 ? 'boom' : 'chick'));
        strokes.push({ pos: b, kind });
    }
    // un accord à l'entrée de la seconde moitié d'une mesure scindée sur un temps impair (3/4 coupé après le 1er temps…) : déjà couvert
    const slideOn = changeNext && !ballad && nextV && bpb >= 2 && rng() < ph.slide;
    strokes.forEach(({ pos, kind }) => {
        const v = V[segAt(pos)];
        const lastStroke = pos === bpb - 1;
        if (kind === 'boom') {
            piano.push({ inst: 'pompe', art: 'boom', pos, dur: 0.5, vel: clampV((0.5 + 0.08 * (pos === 0 ? 1 : 0)) * dyn),
                rootIndex: 0, intervals: [v.low, v.up[0], v.up[1]].map(W), roll: 0.011 });
        } else if (kind === 'chick') {
            if (lastStroke && slideOn) {
                // glissando : l'accord suivant, un demi-ton plus haut, sur le dernier contretemps
                piano.push({ inst: 'pompe', art: 'slide', pos, dur: 0.32, vel: clampV(0.8 * dyn), rootIndex: 0,
                    intervals: nextV.up.map(x => W(x + 1)), roll: 0.007 });
            } else {
                piano.push({ inst: 'pompe', art: 'chick', pos, dur: 0.3, vel: clampV((valse && pos === 2 ? 0.66 : 0.78) * dyn), rootIndex: 0,
                    intervals: v.up.map(W), roll: 0.007 });
            }
            if (ph.ghost && !ternary) piano.push({ inst: 'pompe', art: 'ghost', pos: pos + 0.12, dur: 0.05, vel: clampV(0.22 * dyn), rootIndex: 0,
                intervals: (lastStroke && slideOn ? nextV.up.map(x => x + 1) : v.up).slice(1).map(W), roll: 0.006, dir: -1 });
        } else {
            // ballade : quatre coups égaux, un peu plus longs, l'accord entier
            piano.push({ inst: 'pompe', art: 'ballad', pos, dur: 0.7, vel: clampV((pos === 0 ? 0.5 : 0.42) * dyn), rootIndex: 0,
                intervals: [v.low].concat(v.up).map(W), roll: 0.02 });
        }
    });

    // ---- contrebasse ----
    {
        const tones = segs.map(sg => latBassTones(env, sg.cs));
        const T = (pos) => tones[segAt(pos)];
        const hits = [];
        const walkNow = !ballad && !valse && bpb === 4 && !ternary && ph.walk && (!ph.walkHalf || i >= Math.floor(L / 2)) && (env.bpm || 180) <= 240;
        if (walkNow && !halves) {
            const t0 = T(0);
            const third = t0.third + 12 * (t0.third < t0.root ? 1 : 0);
            hits.push([0, t0.root, 0.9, 0.9], [1, rng() < 0.6 ? third : t0.root + 2, 0.85, 0.72], [2, t0.fifth < t0.root ? t0.fifth + 12 : t0.fifth, 0.85, 0.82]);
            const last = changeNext ? popBassApproach(env, t0.root, nextStep, rng) : (rng() < 0.5 ? t0.octave : t0.fifth);
            hits.push([3, last, 0.85, 0.74]);
        } else if (valse) {
            segs.forEach(sg => hits.push([sg.s, T(sg.s).root, Math.min(1.6, sg.e - sg.s - 0.1), 0.88]));
            if (!halves && I > 0.55 && rng() < 0.5) hits.push([2, T(2).fifth, 0.8, 0.62]);
        } else {
            // deux temps : fondamentale sur 1, quinte (ou fondamentale) sur 3 ; en 2/4 et en mesure composée, sur chaque « boum »
            const booms = strokes.filter(s => s.kind === 'boom' || s.kind === 'ballad').map(s => s.pos).filter(p => ballad ? p % 2 === 0 : true);
            booms.forEach((p, k) => {
                const sgStart = segs.some(sg => Math.abs(sg.s - p) < eps);
                const t = T(p);
                const abs = (k === 0 || sgStart) ? t.root : (rng() < 0.7 ? t.fifth : t.root);
                hits.push([p, abs, ballad ? 1.8 : 0.9, k === 0 ? 0.9 : 0.78]);
            });
            segs.forEach(sg => { if (!hits.some(h => Math.abs(h[0] - sg.s) < eps)) hits.push([sg.s, T(sg.s).root, 0.9, 0.84]); });
            // note de liaison vers l'accord suivant sur le dernier temps (4/4), ou sur le « et » du dernier « boum »
            if (changeNext && bpb >= 4 && !ballad && rng() < (isTurn ? 0.7 : 0.35)) {
                const tl = tones[tones.length - 1];
                hits.push([bpb - 1, popBassApproach(env, tl.root, nextStep, rng), 0.7, 0.68]);
            }
        }
        hits.sort((a, b) => a[0] - b[0]).forEach(([pos, abs, dur, vel]) => {
            bass.push({ pos, abs, dur, vel: clampV(vel * (0.88 + 0.16 * I)), wide: true });
        });
        bass.forEach((b, k) => {
            const nx = bass[k + 1];
            const limit = nx ? nx.pos - b.pos + 0.02 : bpb - b.pos - 0.03;
            b.dur = Math.max(0.12, Math.min(b.dur, limit));
        });
    }

    // ---- guitare solo : note d'arrivée de la phrase précédente, puis phrase de fin de phrase ----
    let leadFrom = Infinity;
    if (st.lead && Number.isFinite(st.lead.m)) {
        piano.push({ inst: 'lead', art: 'target', pos: 0, dur: ballad ? 1.6 : 1.1, vel: clampV(0.8 * dyn), rootIndex: 0, intervals: [W(st.lead.m)] });
    }
    const lastLeadNote = st.lead ? st.lead.m : null;
    st.lead = null;
    const leadAtTurn = isTurn && L > 1 && d > 0.05 && ph.leadRoll < 0.1 + 0.8 * d;
    const leadMid = !isTurn && changeNext && d > 0.55 && ph.leadMid < (d - 0.55) * 1.6 && rng() < 0.5;
    if ((leadAtTurn || leadMid) && nextStep && bpb >= 2) {
        const len = leadAtTurn ? Math.min(ballad ? 2 : 2, bpb - 1) : 1;
        const from = bpb - len;
        const cs = segs[segAt(from)].cs;
        const kind = ph.leadKind < 0.4 ? 'dim' : (ph.leadKind < 0.75 ? 'arp' : 'chrom');
        const lick = manoucheLick(env, cs, nextStep, from, bpb, ternary ? 'arp' : kind, rng, lastLeadNote || 67);
        lick.notes.forEach(n => piano.push({ inst: 'lead', art: 'pick', pos: n.pos, dur: n.dur, vel: clampV(n.vel * dyn), rootIndex: 0, intervals: [W(n.m)] }));
        if (lick.notes.length && Number.isFinite(lick.target)) st.lead = { m: lick.target };
        if (lick.notes.length) leadFrom = from;
    }

    // ---- violon : nappes tenues (notes guides) ou petites réponses ----
    const vlnOn = d > 0.08 && ph.vlnRoll < (ballad ? 0.35 : 0.12) + 0.7 * d;
    if (vlnOn) {
        const pad = ballad || ph.vlnKind < 0.62;
        if (pad) {
            const mis = Number.isInteger(env.measureInStep) ? env.measureInStep : 0;
            segs.forEach((sg, k) => {
                // une nappe par accord, rejouée (coup d'archet) toutes les deux mesures sur un accord tenu
                if (!halves && mis % 2 === 1) return;
                const sh = mnChordShape(env, sg.cs);
                const guides = [sh.third, sh.sev !== null ? sh.sev : sh.fifth].map(x => mnMod(sh.root + x + off));
                const prevM = Number.isFinite(st.vln) ? st.vln : 69;
                let best = null;
                for (let mm = MN_VLN_LO; mm <= MN_VLN_HI; mm++) if (guides.includes(mnMod(mm)) && (best === null || Math.abs(mm - prevM) < Math.abs(best - prevM))) best = mm;
                if (best === null) return;
                st.vln = best;
                const bars = halves ? 0 : Math.max(1, Math.min(2, (step.measures || 1) - mis));
                const dur = halves ? sg.e - sg.s - 0.1 : bars * bpb - 0.15;
                piano.push({ inst: 'violin', art: 'sus', pos: sg.s, dur, vel: clampV((0.4 + 0.12 * I) * (k === 0 ? 1 : 0.94)), rootIndex: 0, intervals: [W(best)] });
            });
        } else if (i % 2 === 1 && bpb >= 3 && !(leadFrom < bpb)) {
            // réponse : quelques croches conjointes de la gamme qui retombent sur une note de l'accord
            const cs = lastSeg.cs;
            const S = popScaleNotes(cs, W(MN_VLN_LO), W(MN_VLN_HI));
            if (S.length >= 5) {
                const from = bpb - 2;
                const n = ternary ? 3 : 4;
                const prevW = Number.isFinite(st.vln) ? W(st.vln) : W(71);
                let idx = S.reduce((b, x, k) => Math.abs(x - prevW) < Math.abs(S[b] - prevW) ? k : b, 0);
                const dir = idx > S.length / 2 ? -1 : 1;
                for (let k = 0; k < n; k++) {
                    const x = S[Math.max(0, Math.min(S.length - 1, idx))];
                    piano.push({ inst: 'violin', art: 'line', pos: from + k * (2 / n), dur: (2 / n) * (k === n - 1 ? 1.6 : 0.9), vel: clampV(0.46 + 0.06 * k), rootIndex: 0, intervals: [x] });
                    st.vln = x + 48 + off;
                    idx += dir;
                }
            }
        }
    }

    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums: [], manouche: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { manoucheVoicing, manoucheLick, manouchePhraseExtras, buildManouchePlan, mnChordShape, mnUpperDegrees };
}
