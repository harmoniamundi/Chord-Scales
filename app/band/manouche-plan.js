// band/manouche-plan.js — orchestre « Jazz manouche » de la jam (dans l'esprit du Quintette du Hot Club de France) : guitare
// rythmique qui joue « la pompe », contrebasse, guitare solo (ligne improvisée à la Django) et violon (chant et notes tenues, à la
// Grappelli). Pas de batterie : dans le swing manouche, c'est la pompe qui tient le tempo.
// Chargé par index.html via <script src="app/band/manouche-plan.js"> (après band-helpers.js) et testé par band/manouche-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band-helpers.js
//   env.splitBeat      temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm            tempo courant (sous 100 : jeu de ballade)
//   env.density        curseur « Densité » (0 à 1, 0,5 par défaut) : présence des solistes et quantité de notes de leurs lignes
//   env.measureInStep  rang de la mesure dans le bloc de la grille (un accord tenu deux mesures : 0 puis 1)
//   env.state          mémoire entre deux mesures, modifiée en place : { mnState: { voice, roles, gl, vl, vh, lead } }
//                      (voicing de la pompe, rôles de la phrase, lignes de la guitare et du violon, note tenue du violon,
//                      note d'arrivée d'une réponse de la guitare)
// buildManouchePlan renvoie { piano, bass, drums: [], manouche: true } ; chaque frappe de « piano » porte e.inst :
//   'pompe'  guitare rythmique, e.art = 'boom' (temps faibles de la basse : cordes graves), 'chick' (contretemps étouffé),
//            'ghost' (coup remonté étouffé, presque muet), 'roll' (petit coup du roulement de fin de phrase),
//            'ballad' (coup égal et doux des ballades), 'slide' (accord glissé d'un demi-ton) ;
//   'lead'   guitare solo, une note par frappe (deux en octaves), e.art = 'pick' ; 'target' pour une note longue ;
//   'violin' violon, e.art = 'sus' (note guide tenue), 'lyr' (note chantée longue) ou 'line' (note de passage).
// e.noSwing : position déjà exacte (triolets), à ne pas déformer par le réglage de swing ; e.lay : décalage en secondes.
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
// d'accord typique) ou se prolonge d'un petit roulement en triolet ; la contrebasse amène l'accord suivant par une note voisine.

const MN_BASS_LO = 40;   // mi2 : corde grave de la guitare
const MN_UP_LO = 52, MN_UP_HI = 69;   // notes du haut de la pompe : mi3 à la4
const MN_LEAD_LO = 57, MN_LEAD_HI = 84;   // guitare solo : la3 à do6
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

// ===================== Le dialogue des solistes =====================
// Chaque phrase de la grille (au moins 4 mesures) a un soliste : la guitare (ligne improvisée continue, à la Django), le violon
// (chant lyrique, à la Grappelli) ou personne. Le soliste change le plus souvent d'une phrase à l'autre, comme un échange de
// chorus ; derrière la guitare, le violon peut tenir des notes guides très douces ; quand le violon chante, la guitare lui répond
// par une petite phrase sur la fin de la phrase. Une décision par phrase (jamais au milieu) : rien n'apparaît ni ne disparaît
// sans raison, et chaque soliste termine son idée sur une note longue avant de laisser la place.

// Profils des deux solistes : registre et centre de gravité de la ligne.
const MN_SOLO = {
    gtr: { lo: MN_LEAD_LO, hi: MN_LEAD_HI, center: 70 },
    vln: { lo: 64, hi: 86, center: 76 }
};

// Classes de hauteur réelles utiles à la ligne : notes de l'accord, couleurs manouches (6te sur un accord parfait, tension notée),
// gamme de l'accord, arpège diminué d'une dominante (3, 5, ♭7, ♭9) et notes guides (tierce, 7e ou 6te).
function mnPcs(env, cs) {
    const off = env.transOffset || 0;
    const sh = mnChordShape(env, cs);
    const R = (d) => mnMod(sh.root + d + off);
    const chord = [0, sh.third, sh.fifth].concat(sh.sev !== null ? [sh.sev] : []).map(R);
    const color = [];
    if (sh.sev === null && sh.fifth === 7 && (sh.third === 3 || sh.third === 4)) color.push(R(9));
    if (sh.ext !== null) color.push(R(sh.ext));
    let scale = (typeof popScaleNotes === 'function') ? popScaleNotes(cs, 0, 11).map(n => mnMod(n + off)) : [];
    if (scale.length < 5) scale = chord.concat(color);
    const isDom = sh.third === 4 && sh.sev === 10;
    return {
        chord, color, scale, sh,
        tones: chord.concat(color.filter(c => !chord.includes(c))),
        dim: isDom ? [sh.third, sh.fifth, 10, 1].map(R) : null,
        guide: [sh.third, sh.sev !== null ? sh.sev : (color.length ? 9 : sh.fifth)].map(R),
        ends: [sh.third, sh.sev !== null ? sh.sev : (color.length ? 9 : sh.fifth), sh.ext !== null ? sh.ext : sh.fifth, 0].map(R)
    };
}

// Hauteur de `pcs` la plus proche de x dans [lo, hi], dans la direction dir (+1, -1 ou 0), à au moins minStep et au plus maxStep.
function mnNear(pcs, x, lo, hi, dir, minStep, maxStep) {
    let best = null, bc = Infinity;
    for (let m = lo; m <= hi; m++) {
        if (!pcs.includes(mnMod(m))) continue;
        const dl = m - x;
        if (dir > 0 && dl < minStep) continue;
        if (dir < 0 && -dl < minStep) continue;
        if (dir === 0 && Math.abs(dl) < minStep) continue;
        if (Math.abs(dl) > maxStep) continue;
        if (Math.abs(dl) < bc) { bc = Math.abs(dl); best = m; }
    }
    return best;
}

// Cellules rythmiques (un ou deux temps) de chaque soliste. pos / dur en temps, relatifs au début de la cellule.
// La guitare joue surtout en croches et en triolets (les arpèges de Django), avec des anticipations ; le violon chante en
// valeurs plus longues (blanches, noires pointées), avec quelques croches.
function mnCells(voice, ternary, d, I, bpm) {
    const g = voice === 'gtr';
    const fast = bpm > 210, slow = bpm < 120;
    if (ternary) return [
        { beats: 1, w: g ? 3 + 2 * d : 1 + d, pos: [0, 2 / 3], dur: [2 / 3, 1 / 3] },
        { beats: 1, w: g ? 2 + 2 * d : 0.5, pos: [0, 1 / 3, 2 / 3], dur: [1 / 3, 1 / 3, 1 / 3], arp: true },
        { beats: 1, w: g ? 1.5 : 3, pos: [0], dur: [1] },
        { beats: 1, w: g ? 0.8 : 0.6, pos: [2 / 3], dur: [1 / 3], syn: true },
        { beats: 2, w: g ? 0.5 : 2.6, pos: [0], dur: [2] }
    ];
    return [
        { beats: 1, w: g ? 3 + 3 * d + I : 1 + 1.5 * d, pos: [0, 0.5], dur: [0.5, 0.5] },
        { beats: 1, w: g ? (fast ? 0.25 : 1 + 1.5 * d) : 0.25, pos: [0, 1 / 3, 2 / 3], dur: [1 / 3, 1 / 3, 1 / 3], arp: true, noSwing: true },
        { beats: 1, w: g && slow ? 0.6 + 1.2 * d : 0, pos: [0, 0.25, 0.5, 0.75], dur: [0.25, 0.25, 0.25, 0.25] },
        { beats: 1, w: g ? 1.5 - 0.8 * d : 3, pos: [0], dur: [1] },
        { beats: 1, w: g ? 1 : 0.7, pos: [0.5], dur: [0.5], syn: true },
        { beats: 2, w: g ? 0.8 : 1.8, pos: [0, 1.5], dur: [1.5, 0.5] },
        { beats: 2, w: g ? 0.4 : 2.4, pos: [0], dur: [2] }
    ];
}

function mnPick(list, rng) {
    const tot = list.reduce((s, c) => s + c.w, 0);
    let r = rng() * tot;
    for (const c of list) { r -= c.w; if (r <= 0) return c; }
    return list[list.length - 1];
}

// Ligne d'un soliste sur une mesure ; ls = mémoire de la ligne, modifiée en place :
//   { m: dernière hauteur, dir: direction (+1 / -1), idea: temps restants de l'idée en cours, rest: temps de silence restants,
//     forced: note visée au premier temps de la mesure suivante (changement d'accord), oct: idée jouée en octaves (guitare) }
// Une idée dure une à deux mesures et demie, se termine sur une note longue (tierce, 6te, 7e, 9e) puis laisse respirer ;
// les temps tombent sur des notes de l'accord, les contretemps avancent par degrés conjoints de la gamme, chromatismes de
// passage ; avant chaque changement d'accord, la ligne approche par demi-ton (ou broderie) une note guide du nouvel accord.
// phraseEnd : dernière mesure de la phrase, l'idée se termine dans la mesure (avant le temps c.stopAt s'il est donné). Renvoie [{ pos, dur, m, vel, art, noSwing, oct }].
function mnSoloLine(env, voice, ls, c) {
    const { segs, bpb, ternary, nextStep, changeNext, rng, d, I, bpm, phraseEnd, splitAt } = c;
    const P = MN_SOLO[voice];
    const g = voice === 'gtr';
    const eps = 1e-6;
    const cells = mnCells(voice, ternary, d, I, bpm).filter(x => x.w > 0);
    const ideaLen = () => g ? 5 + Math.floor(rng() * (3 + 7 * d)) : 4 + Math.floor(rng() * (3 + 3 * d));
    const restLen = () => g ? 1 + Math.floor(rng() * (3 - 2 * d)) : 2 + Math.floor(rng() * (3 - 1.5 * d));
    // ---- rythme ----
    const slots = [];
    // fin de phrase : l'idée se termine dans la mesure (avant stopAt quand l'autre soliste répond sur les derniers temps)
    const stopAt = phraseEnd ? Math.max(1, Math.min(bpb, Number.isFinite(c.stopAt) ? c.stopAt : bpb)) : bpb;
    if (phraseEnd && ls.idea > 0) ls.idea = Math.min(ls.idea, stopAt, rng() < 0.5 ? 2 : bpb);
    let b = 0;
    while (b < bpb) {
        if (ls.rest > 0) { ls.rest--; b++; continue; }
        if (phraseEnd && b >= stopAt) { b++; continue; }
        if (ls.idea <= 0) {
            if (phraseEnd && b >= stopAt - 1) { b++; continue; }
            ls.idea = ideaLen();
            if (phraseEnd) ls.idea = Math.min(ls.idea, stopAt - b);
            ls.fresh = true;
            ls.oct = g && I > 0.62 && rng() < 0.22 * d + 0.1;
        }
        let cell;
        const room = stopAt - b;
        if (ls.idea <= 1 || (ls.idea === 2 && room >= 2 && rng() < 0.6)) {
            const len = Math.min(ls.idea, room);
            cell = { beats: len, pos: [0], dur: [Math.max(0.5, len - (g ? 0.12 : 0.05))], end: true };
        } else {
            const ok = cells.filter(x => x.beats <= room && x.beats < ls.idea);
            const weighted = ok.map(x => ({ ...x, w: x.w * (x.syn ? (ls.fresh ? 3 : 0.7) : 1) }));
            cell = weighted.length ? mnPick(weighted, rng) : { beats: 1, pos: [0], dur: [1] };
        }
        cell.pos.forEach((p, k) => slots.push({ pos: b + p, dur: cell.dur[k], k, arp: !!cell.arp, end: !!cell.end, noSwing: !!cell.noSwing, fresh: !!ls.fresh && k === 0 }));
        ls.fresh = false;
        ls.idea -= cell.beats;
        b += cell.beats;
        if (cell.end) { ls.idea = 0; ls.rest = restLen(); }
    }
    // ---- hauteurs ----
    const segOf = (pos) => (segs.length > 1 && pos >= splitAt - eps) ? 1 : 0;
    const info = segs.map(sg => mnPcs(env, sg.cs));
    const nextInfo = nextStep ? mnPcs(env, nextStep) : null;
    const continues = ls.idea > 0 && ls.rest === 0;
    let x = Number.isFinite(ls.m) ? Math.max(P.lo + 2, Math.min(P.hi - 2, ls.m)) : P.center + Math.round((rng() - 0.5) * 6);
    let dir = ls.dir === 1 || ls.dir === -1 ? ls.dir : (x > P.center ? -1 : 1);
    let pending = null, arpPcs = null;
    const out = [];
    const fit = (m) => { while (m > P.hi) m -= 12; while (m < P.lo) m += 12; return m; };
    slots.forEach((s, k) => {
        const inf = info[segOf(s.pos)];
        const nx = slots[k + 1];
        let ahead = null;
        if (nx && segOf(nx.pos) !== segOf(s.pos)) ahead = info[segOf(nx.pos)];
        else if (!nx && continues && changeNext && nextInfo) ahead = nextInfo;
        const prevX = x;
        let m;
        if (s.arp && s.k === 0) arpPcs = (inf.dim && rng() < 0.7) ? inf.dim : inf.tones;
        if (k === 0 && s.pos < eps && Number.isFinite(ls.forced) && !s.fresh) m = ls.forced;
        else if (pending !== null) m = pending;
        else if (s.fresh) {
            // départ d'une idée : près de la dernière note, sur une note de l'accord, parfois après un saut (arpège montant)
            dir = x > P.center + 4 ? -1 : (x < P.center - 4 ? 1 : (rng() < 0.5 ? 1 : -1));
            const jump = rng() < 0.3 ? 5 + Math.floor(rng() * 4) : 0;
            m = mnNear(inf.tones, x + dir * jump, P.lo + 2, P.hi - 2, 0, jump ? 0 : 1, 12);
        } else if (ahead && !s.arp) {
            // approche du nouvel accord : demi-ton en dessous (ou au-dessus), ou broderie depuis la gamme
            const tgt = mnNear(ahead.guide, x + dir * 2, P.lo + 1, P.hi - 1, 0, 0, 12) ?? mnNear(ahead.chord, x, P.lo, P.hi, 0, 0, 12);
            const r = rng();
            if (tgt === null) m = x;
            else if (s.dur > 0.6) m = mnNear(inf.tones, tgt, P.lo, P.hi, 0, 1, 4) ?? tgt;   // note longue : une note de l'accord voisine
            else m = r < 0.55 ? tgt - dir : (r < 0.8 ? tgt + dir : (mnNear(inf.scale, tgt - 2 * dir, P.lo, P.hi, 0, 0, 2) ?? tgt - dir));
            pending = tgt;
        } else if (s.arp) {
            m = mnNear(arpPcs || inf.tones, x, P.lo, P.hi, dir, 1, 6) ?? mnNear(arpPcs || inf.tones, x, P.lo, P.hi, -dir, 1, 6);
            if (m !== null && (m >= P.hi - 2 || m <= P.lo + 2)) dir = -dir;
        } else if (s.end) {
            m = mnNear(inf.ends.slice(0, 3), x, P.lo + 1, P.hi - 1, 0, 1, 4) ?? mnNear(inf.ends, x, P.lo, P.hi, 0, 0, 12);
        } else if (Math.abs(s.pos - Math.round(s.pos)) < eps) {
            m = mnNear(inf.tones, x, P.lo, P.hi, dir, 1, 5) ?? mnNear(inf.tones, x, P.lo, P.hi, -dir, 1, 5);
        } else {
            m = rng() < 0.16 ? x + dir : (mnNear(inf.scale, x, P.lo, P.hi, dir, 1, 3) ?? x - dir);
        }
        if (pending !== null && m === pending) pending = null;
        if (m === null || !Number.isFinite(m)) m = x;
        m = fit(m);
        // direction : rebond aux bords, retour après un saut, retour vers le centre, quelques changements libres
        if (m >= P.hi - 3) dir = -1;
        else if (m <= P.lo + 3) dir = 1;
        else if (Math.abs(m - prevX) >= 5 && rng() < 0.7) dir = m > prevX ? -1 : 1;
        else if (Math.abs(m - P.center) > 9 && rng() < 0.3) dir = m > P.center ? -1 : 1;
        else if (rng() < (s.end ? 0.5 : 0.12)) dir = -dir;
        x = m;
        // durée (lié : chaque note tient jusqu'à la suivante) et nuance
        const gap = nx ? nx.pos - s.pos : s.dur;
        const dur = g ? Math.max(0.1, Math.min(s.dur, gap) * 0.94) : Math.max(0.15, Math.min(s.dur, gap) + (nx ? 0.06 : 0));
        const onBeat = Math.abs(s.pos - Math.round(s.pos)) < eps;
        let vel = g
            ? (s.end ? 0.74 : (onBeat ? 0.7 : 0.6)) + (s.arp && s.k === 0 ? 0.05 : 0) + 0.06 * I + 0.005 * (m - P.center)
            : (s.end || dur >= 0.9 ? 0.52 : 0.47) + 0.1 * I + 0.004 * (m - P.center) + (s.fresh ? -0.06 : 0);
        vel += (rng() - 0.5) * 0.08;
        out.push({ pos: s.pos, dur, m, vel: Math.max(0.12, Math.min(0.95, vel)),
            art: g ? ((s.end || dur >= 0.9) ? 'target' : 'pick') : (dur >= 0.85 ? 'lyr' : 'line'),
            noSwing: s.noSwing || undefined, oct: g && ls.oct && m - 12 >= MN_UP_LO });
    });
    ls.m = x; ls.dir = dir;
    ls.forced = (continues && pending !== null) ? pending : null;
    if (!continues) ls.oct = false;
    return out;
}

// Rôles d'une phrase : { idx, solo: 'gtr' | 'vln' | 'none', pad (violon en notes guides derrière), fill (réponse de la guitare) }.
function mnRoles(prev, rng, d, ballad, idx) {
    let solo = 'none';
    const pSolo = d <= 0.05 ? 0 : Math.min(1, 0.3 + 1.2 * d);
    if (rng() < pSolo) {
        const ps = prev ? prev.solo : null;
        if (ps === 'gtr') solo = rng() < 0.55 ? 'vln' : 'gtr';
        else if (ps === 'vln') solo = rng() < 0.7 ? 'gtr' : 'vln';
        else solo = rng() < (ballad ? 0.5 : 0.38) ? 'vln' : 'gtr';
    }
    const keep = prev && prev.pad ? 0.2 : 0;
    const pPad = solo === 'gtr' ? -0.15 + 1.3 * d + keep : (solo === 'none' ? 0.8 * Math.max(0, d - 0.3) + keep : 0);
    const pad = d > 0.08 && rng() < pPad;
    const fill = solo !== 'gtr' && d > 0.05 && rng() < 0.2 + 0.7 * d;
    return { idx, solo, pad, fill };
}

// Choix faits une fois par phrase : énergie, basse qui marche, glissandos d'accord, coups remontés, variations de la pompe.
function manouchePhraseExtras(rng, prev, index) {
    const pl = (prev && prev.style === 'manouche') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.4 + rng() * 0.15 : prevI + (0.62 - prevI) * 0.3 + (rng() - 0.5) * 0.36;
    I = Math.max(0.25, Math.min(0.95, I));
    return {
        intensity: I,
        walk: rng() < 0.15 + 0.6 * Math.max(0, I - 0.35),          // contrebasse en noires (sinon en deux temps)
        walkHalf: rng() < 0.5,                                      // ... seulement dans la seconde moitié de la phrase
        slide: 0.2 + 0.35 * I,                                      // probabilité d'un glissando d'accord en fin de bloc
        ghost: rng() < 0.75,                                        // coups remontés étouffés après les « tchac »
        leadRoll: rng(), leadKind: rng(), leadMid: rng(),           // réponse de la guitare (type de phrase)
        vlnRoll: rng(), vlnKind: rng()
    };
}

function buildManouchePlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const d = Number.isFinite(env.density) ? Math.max(0, Math.min(1, env.density)) : 0.5;
    const eps = 1e-6;
    const off = env.transOffset || 0;
    const W = (real) => real - 48 - off;                 // hauteur réelle → intervalle écrit (depuis do3)
    const st = env.state.mnState || (env.state.mnState = {});
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
    const jit = () => rng() - 0.5;
    const dyn = 0.84 + 0.18 * I;
    const bpm = env.bpm || 180;
    const ballad = !ternary && bpm < 100;
    const valse = !ternary && bpb === 3;
    const mis = Number.isInteger(env.measureInStep) ? env.measureInStep : 0;
    const piano = [], bass = [];

    // ---- phrase et rôles des solistes ----
    const LL = Math.max(4, L || 4);
    const absM = Number.isInteger(m) && m >= 0 ? m : i;
    const phraseIdx = Math.floor(absM / LL);
    const phraseEnd = absM % LL === LL - 1;
    if (!st.roles || st.roles.idx !== phraseIdx) {
        const prev = st.roles || null;
        st.roles = mnRoles(prev, rng, d, ballad, phraseIdx);
        const fresh = (ls) => ({ m: ls ? ls.m : null, dir: ls ? ls.dir : 0, idea: 0, rest: rng() < 0.45 ? 1 : 0, forced: null, oct: false });
        if (!prev || prev.solo !== 'gtr' || st.roles.solo !== 'gtr') st.gl = fresh(st.gl);
        if (!prev || prev.solo !== 'vln' || st.roles.solo !== 'vln') st.vl = fresh(st.vl || (st.vh ? { m: st.vh.m } : null));
    }
    const R = st.roles;
    if (!st.gl) st.gl = { m: null, dir: 0, idea: 0, rest: 0, forced: null, oct: false };
    if (!st.vl) st.vl = { m: st.vh ? st.vh.m : null, dir: 0, idea: 0, rest: 0, forced: null, oct: false };

    // ---- voicings de la pompe (conduite des voix d'une mesure à l'autre) ----
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId + ':' + (Number.isInteger(cs.bassRootIndex) ? cs.bassRootIndex : '');
    let prevV = st.voice ? st.voice.v : null;
    const V = segs.map(sg => {
        const k = keyOf(sg.cs);
        let v;
        if (st.voice && st.voice.key === k) {
            v = st.voice.v;
            // accord tenu : de temps en temps, la pompe change de renversement (un peu de mouvement sans changer d'accord)
            if (!halves && mis > 0 && rng() < 0.3) {
                const avg = (v.up[0] + v.up[1] + v.up[2]) / 3;
                v = manoucheVoicing(env, sg.cs, { up: v.up.map(x => x + (avg < 61 ? 5 : -5)) });
            }
        } else v = manoucheVoicing(env, sg.cs, prevV);
        st.voice = { key: k, v };
        prevV = v;
        return v;
    });
    const nextV = changeNext ? manoucheVoicing(env, nextStep, V[V.length - 1]) : null;

    // ---- la pompe ----
    // Toujours un peu en retrait : le « boum » est léger, le « tchac » net mais pas claqué ; chaque coup varie un peu
    // (nombre de cordes, vitesse du coup de médiator, nuance), le « tchac » est très légèrement en avance (la pompe pousse).
    const strokes = [];
    for (let b = 0; b < bpb; b++) {
        const kind = ballad ? 'ballad' : (valse ? (b === 0 ? 'boom' : 'chick') : (b % 2 === 0 ? 'boom' : 'chick'));
        strokes.push({ pos: b, kind });
    }
    const slideOn = changeNext && !ballad && nextV && bpb >= 2 && rng() < ph.slide;
    // fin de phrase : de temps en temps, le dernier « tchac » est suivi d'un petit roulement en triolet (haut-bas étouffés)
    const rollOn = !ternary && !ballad && phraseEnd && !slideOn && bpb >= 2 && rng() < 0.15 + 0.3 * I;
    strokes.forEach(({ pos, kind }) => {
        const v = V[segAt(pos)];
        const lastStroke = pos === bpb - 1;
        if (kind === 'boom') {
            const notes = rng() < 0.3 ? [v.low, v.up[0]] : [v.low, v.up[0], v.up[1]];
            piano.push({ inst: 'pompe', art: 'boom', pos, dur: 0.45, vel: clampV((0.4 + (pos === 0 ? 0.05 : 0) + jit() * 0.07) * dyn),
                rootIndex: 0, intervals: notes.map(W), roll: 0.009 + rng() * 0.007 });
        } else if (kind === 'chick') {
            const lay = -0.002 - rng() * 0.004;
            if (lastStroke && slideOn) {
                // glissando : l'accord suivant, un demi-ton plus haut, sur le dernier contretemps
                piano.push({ inst: 'pompe', art: 'slide', pos, dur: 0.3, vel: clampV((0.66 + jit() * 0.06) * dyn), rootIndex: 0,
                    intervals: nextV.up.map(x => W(x + 1)), roll: 0.006 + rng() * 0.004, lay });
            } else {
                const notes = rng() < 0.2 ? v.up.slice(1) : v.up;
                const base = valse && pos === 2 ? 0.52 : 0.62;
                piano.push({ inst: 'pompe', art: 'chick', pos, dur: 0.26 + rng() * 0.05, vel: clampV((base + jit() * 0.08) * dyn), rootIndex: 0,
                    intervals: notes.map(W), roll: 0.005 + rng() * 0.005, lay });
            }
            const up = (lastStroke && slideOn ? nextV.up.map(x => x + 1) : v.up).slice(1);
            if (rollOn && lastStroke) {
                piano.push({ inst: 'pompe', art: 'ghost', pos: pos + 1 / 3, dur: 0.06, vel: clampV(0.26 * dyn), rootIndex: 0, intervals: up.map(W), roll: 0.005, dir: -1, noSwing: true });
                piano.push({ inst: 'pompe', art: 'roll', pos: pos + 2 / 3, dur: 0.12, vel: clampV(0.4 * dyn), rootIndex: 0, intervals: up.map(W), roll: 0.005, noSwing: true });
            } else if (ph.ghost && !ternary && rng() < 0.65) {
                piano.push({ inst: 'pompe', art: 'ghost', pos: pos + 0.12, dur: 0.05, vel: clampV((0.16 + rng() * 0.06) * dyn), rootIndex: 0,
                    intervals: up.map(W), roll: 0.006, dir: -1 });
            }
        } else {
            // ballade : quatre coups égaux et doux, l'accord entier
            piano.push({ inst: 'pompe', art: 'ballad', pos, dur: 0.7, vel: clampV((pos === 0 ? 0.44 : 0.37) * dyn + jit() * 0.04), rootIndex: 0,
                intervals: [v.low].concat(v.up).map(W), roll: 0.018 + rng() * 0.012 });
        }
    });

    // ---- contrebasse ----
    {
        const tones = segs.map(sg => latBassTones(env, sg.cs));
        const T = (pos) => tones[segAt(pos)];
        const hits = [];
        const walkNow = !ballad && !valse && bpb === 4 && !ternary && ph.walk && (!ph.walkHalf || i >= Math.floor(L / 2)) && bpm <= 240;
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

    const lineCtx = { segs, bpb, ternary, nextStep, changeNext, rng, d, I, bpm, phraseEnd, splitAt };

    // ---- guitare solo ----
    // note d'arrivée d'une réponse de la mesure précédente
    if (st.lead && Number.isFinite(st.lead.m)) {
        piano.push({ inst: 'lead', art: 'target', pos: 0, dur: ballad ? 1.6 : 1.1, vel: clampV(0.74 * dyn), rootIndex: 0, intervals: [W(st.lead.m)] });
        if (st.gl) { st.gl.m = st.lead.m; if (R.solo === 'gtr' && st.gl.idea <= 0) st.gl.rest = Math.max(st.gl.rest, 1); }
    }
    st.lead = null;
    if (R.solo === 'gtr' && d > 0.05) {
        mnSoloLine(env, 'gtr', st.gl, lineCtx).forEach(n => {
            const ivs = n.oct ? [W(n.m - 12), W(n.m)] : [W(n.m)];
            piano.push({ inst: 'lead', art: n.art, pos: n.pos, dur: n.dur, vel: clampV(n.vel * dyn), rootIndex: 0, intervals: ivs,
                roll: n.oct ? 0.004 : undefined, noSwing: n.noSwing, lay: (rng() - 0.4) * 0.01 });
        });
    } else if (R.fill && phraseEnd && nextStep && bpb >= 2) {
        // réponse de la guitare à la fin d'une phrase chantée par le violon (ou sans soliste) : petite phrase qui mène à l'accord suivant
        const len = Math.min(2, bpb - 1);
        const from = bpb - len;
        const cs = segs[segAt(from)].cs;
        const kind = ph.leadKind < 0.4 ? 'dim' : (ph.leadKind < 0.75 ? 'arp' : 'chrom');
        const lick = manoucheLick(env, cs, nextStep, from, bpb, ternary ? 'arp' : kind, rng, (st.gl && st.gl.m) || 67);
        lick.notes.forEach(n => piano.push({ inst: 'lead', art: 'pick', pos: n.pos, dur: n.dur, vel: clampV(n.vel * dyn), rootIndex: 0, intervals: [W(n.m)],
            noSwing: Math.abs(n.pos * 2 - Math.round(n.pos * 2)) > eps || undefined }));
        if (lick.notes.length && Number.isFinite(lick.target)) st.lead = { m: lick.target };
    }

    // ---- violon ----
    if (R.solo === 'vln' && d > 0.05) {
        // chant lyrique, legato, qui respire entre les idées
        mnSoloLine(env, 'vln', st.vl, { ...lineCtx, stopAt: R.fill ? bpb - Math.min(2, bpb - 1) : bpb }).forEach(n => {
            piano.push({ inst: 'violin', art: n.art, pos: n.pos, dur: n.dur, vel: clampV(n.vel), rootIndex: 0, intervals: [W(n.m)], noSwing: n.noSwing, lay: 0.008 });
            st.vh = { m: n.m, until: absM * bpb + n.pos + n.dur };
        });
    } else if (R.pad) {
        // notes guides tenues, très douces : une note par accord, voisine de la précédente ; une note commune à l'accord suivant
        // reste tenue (pas de nouveau coup d'archet), un accord tenu longtemps est repris d'un nouveau coup d'archet toutes les deux mesures
        segs.forEach((sg, k) => {
            const absPos = absM * bpb + sg.s;
            const inf = mnPcs(env, sg.cs);
            if (st.vh && st.vh.until > absPos + 0.25 && inf.chord.concat(inf.color).includes(mnMod(st.vh.m))) return;
            const prevM = st.vh ? st.vh.m : 69;
            let best = null;
            for (let mm = MN_VLN_LO; mm <= MN_VLN_HI; mm++) {
                if (!inf.guide.includes(mnMod(mm))) continue;
                const cost = Math.abs(mm - prevM) + (mm === prevM && st.vh && st.vh.until > absPos - 0.5 ? 1.5 : 0);
                if (best === null || cost < best.c) best = { m: mm, c: cost };
            }
            if (!best) return;
            let dur;
            if (halves) dur = sg.e - sg.s - 0.08;
            else dur = Math.max(1, Math.min(2, (step.measures || 1) - mis)) * bpb - sg.s - 0.1;
            const isLastSeg = k === segs.length - 1;
            const lastOfChord = halves ? isLastSeg && isLastMeasureOfStep : (step.measures || 1) - mis <= 2;
            if (lastOfChord && isLastSeg && nextStep && !phraseEnd && mnPcs(env, nextStep).chord.includes(mnMod(best.m))) dur += bpb;
            const entering = !st.vh || st.vh.until < absPos - bpb;
            piano.push({ inst: 'violin', art: 'sus', pos: sg.s, dur, vel: clampV((0.3 + 0.1 * I) * (entering ? 0.85 : 1) + jit() * 0.04), rootIndex: 0, intervals: [W(best.m)], lay: 0.01 });
            st.vh = { m: best.m, until: absPos + dur };
        });
    }

    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums: [], manouche: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { manoucheVoicing, manoucheLick, manouchePhraseExtras, buildManouchePlan, mnChordShape, mnUpperDegrees, mnSoloLine, mnRoles, mnPcs };
}
