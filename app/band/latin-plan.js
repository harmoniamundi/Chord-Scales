// band/latin-plan.js — orchestre guitare / basse / batterie du style Latin (bossa, samba, afro, tango…) de la jam.
// Chargé par index.html via <script src="band/latin-plan.js"> (après band-patterns.js et band/band-helpers.js)
// et testé par band/latin-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.state   mémoire entre deux mesures, modifiée en place : latVoice, latTie, latRunAt, bandLastFill
// latinPhraseExtras reçoit un petit contexte { isCuba, bpm, groove } (orchestre Cuba ?, tempo, rythme imposé).
// Les autres fonctions du moteur sont appelées avec `env` en premier paramètre.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof popBassApproach === 'undefined' && typeof require === 'function') {
    var { popBassApproach, popRun, latBassTones, popVoicing, latThumb, latVary, latDetach } = require('./band-helpers.js');
}
// Tables rythmiques : globales en navigateur (band-patterns.js), à charger sous Node.
const LATIN_PAT = (typeof LAT_AFRO !== 'undefined')
    ? { LAT_AFRO, LAT_BASS, LAT_BOSSA, LAT_PIAZZOLLA, LAT_SAMBA, LAT_TANGO, LAT_VOICE_RANGE }
    : require('../band-patterns.js');

function latinPhraseExtras(ctx, rng, prev, index) {
    const isCuba = ctx.isCuba;
    // la phrase précédente ne sert de repère que si elle vient du même orchestre (Cuba et Brasil partagent le style « latin »)
    const pl = (prev && prev.style === 'latin' && !!prev.cuba === isCuba) ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.36 + rng() * 0.22 : prevI + (0.58 - prevI) * 0.25 + (rng() - 0.5) * 0.5;
    I = Math.max(0.25, Math.min(1, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const bpm = ctx.bpm;
    const wg = bpm < 125 ? [0.72, 0.08] : (bpm < 175 ? [0.42, 0.33] : [0.12, 0.6]);
    // Orchestre Cuba : toujours le rythme afro-cubain. Orchestre Brasil : samba, tango et Piazzolla imposent leur rythme ;
    // sinon le moteur choisit bossa / samba selon le tempo (jamais « afro » : c'est le rôle de l'orchestre Cuba).
    const hint = isCuba ? (ctx.groove === 'salsa' ? 'salsa' : 'afro') : ctx.groove; // Cuba : rythme afro-cubain, ou salsa quand le style de grille l'impose
    const groove = hint || ((pl && pl.groove && pl.groove !== 'afro' && rng() < 0.75) ? pl.groove : pickW([['bossa', wg[0]], ['samba', wg[1]]]));
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs(c.d - I) * 2)]));
    const keep = !!(pl && pl.groove === groove && rng() < 0.35);
    return {
        intensity: I, groove,
        bossaIdx: (keep && pl.bossaIdx !== undefined) ? pl.bossaIdx : byDensity(LATIN_PAT.LAT_BOSSA),
        sambaIdx: (keep && pl.sambaIdx !== undefined) ? pl.sambaIdx : byDensity(LATIN_PAT.LAT_SAMBA),
        afroIdx: (keep && pl.afroIdx !== undefined) ? pl.afroIdx : byDensity(LATIN_PAT.LAT_AFRO),
        tangoIdx: (keep && pl.tangoIdx !== undefined) ? pl.tangoIdx : byDensity(LATIN_PAT.LAT_TANGO),
        piazzollaIdx: (keep && pl.piazzollaIdx !== undefined) ? pl.piazzollaIdx : byDensity(LATIN_PAT.LAT_PIAZZOLLA),
        bassIdx: Math.floor(rng() * LATIN_PAT.LAT_BASS[groove === 'salsa' ? 'afro' : groove].length), // la salsa a son propre tumbao (band/salsa-plan.js)
        bassAlt: Math.floor(rng() * LATIN_PAT.LAT_BASS[groove === 'salsa' ? 'afro' : groove].length),
        claveOn: rng() < 0.88,
        fill: rng() < 0.45 && groove !== 'tango', // le tango marcato n'a pas de fills de batterie
        fillKind: Math.floor(rng() * 3),
        // bossa : charleston fermé, ganzá (shaker) seul pour les phrases les plus douces, ou les deux ensemble
        bossaPerc: pickW(I < 0.42 ? [['shaker', 0.5], ['hat', 0.5]] : [['hat', 0.6], ['both', 0.4]]),
        bossaThumb: rng() < 0.75 ? 'alt' : 'root' // pouce fondamentale / quinte, ou fondamentale répétée
    };
}

function buildLatinPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    if (ph.groove === 'bossa') return buildBossaPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m);
    const rng = ph.rng;
    const I = ph.intensity;
    const g = ph.groove;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.74 + 0.3 * I) * (0.92 + 0.08 * prog); // échelle de vélocité de la guitare (crescendo dans la phrase)
    const segs = halves
        ? [{ s: 0, e: 2, cs: halves[0] }, { s: 2, e: 4, cs: halves[1] }]
        : [{ s: 0, e: 4, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    // Anticipation : l'accord suivant est joué sur le « et » du temps 4 (toujours, dans le tumbao)
    const anticip = changeNext && (g === 'afro' || rng() < 0.4 + 0.35 * I);
    const tied = env.state.latTie;

    // ---- conduite des voix de la guitare ----
    const cache = {};
    let lastV = env.state.latVoice ? env.state.latVoice.v : null;
    let lastKey = env.state.latVoice ? env.state.latVoice.key : null;
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        const v = (env.state.latVoice && env.state.latVoice.key === key) ? env.state.latVoice.v : popVoicing(env, cs, lastV, LATIN_PAT.LAT_VOICE_RANGE);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const peekVoice = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        if (env.state.latVoice && env.state.latVoice.key === key) return env.state.latVoice.v;
        return popVoicing(env, cs, lastV, LATIN_PAT.LAT_VOICE_RANGE);
    };

    // ---- guitare ----
    const gtr = [];
    const csAtPos = (pos) => (anticip && pos >= 3.5) ? nextStep : (halves && pos >= 2 ? segs[1].cs : segs[0].cs);
    const endOf = (pos) => {
        if (anticip && pos >= 3.5) return 4.9;
        if (halves && pos < 2) return 2.05;
        return anticip ? 3.55 : 4.05;
    };
    const mkGtr = (pos, dur, notes, vel, dir, roll, damped) => {
        const n = notes.length;
        return {
            pos,
            dur: Math.max(damped ? 0.1 : 0.15, Math.min(dur, endOf(pos) - pos)),
            vel: Math.max(0.1, Math.min(1, vel * gv)),
            rootIndex: 0, intervals: notes,
            noteVels: notes.map((_, k) => n === 1 ? 1 : (k === 0 ? 1 : (k === n - 1 ? 0.9 : 0.78))),
            dir, roll: n > 1 ? roll : 0,
            lay: 0.002 + rng() * 0.01
        };
    };
    const mk = (pos, dur, kind, vel) => {
        const cs = csAtPos(pos);
        const V = voiceFor(cs);
        if (!V.length) return null;
        const th = latThumb(env, cs);
        const upper = V.length > 3 ? V.slice(-3) : V.slice();
        const above = (lo) => { const a = V.filter(n => n > lo + 2); return a.length >= 2 ? a : V.slice(-2); };
        let notes, dir = 1, roll = 0.011 + rng() * 0.012;
        switch (kind) {
            case 'T': notes = [th.root]; break;
            case 't': notes = [th.fifth]; break;
            case 'C': notes = V; break;
            case 'U': notes = upper; dir = -1; roll = 0.005 + rng() * 0.007; break;
            case 'X': notes = upper; dir = rng() < 0.5 ? 1 : -1; roll = 0.003 + rng() * 0.003; break;
            case 'TC': notes = [th.root].concat(above(th.root)); break;
            case 'tC': notes = [th.fifth].concat(above(th.fifth)); break;
            default: { // aN : une note de l'accord (arpège), qui résonne jusqu'au changement d'accord
                const idx = parseInt(kind.slice(1), 10) || 0;
                notes = [V[Math.min(idx, V.length - 1)]];
            }
        }
        notes = notes.slice().sort((a, b) => a - b).filter((n, k, arr) => k === 0 || n !== arr[k - 1]); // pas de note doublée
        return mkGtr(pos, dur, notes, vel, dir, roll, kind === 'X');
    };

    let cell;
    if (g === 'bossa') { const pair = LATIN_PAT.LAT_BOSSA[ph.bossaIdx]; cell = (m % 2 === 0) ? pair.A : pair.B; }
    else if (g === 'samba') cell = LATIN_PAT.LAT_SAMBA[ph.sambaIdx].A;
    else if (g === 'tango') cell = LATIN_PAT.LAT_TANGO[ph.tangoIdx].A;
    else if (g === 'piazzolla') cell = LATIN_PAT.LAT_PIAZZOLLA[ph.piazzollaIdx].A;
    else cell = LATIN_PAT.LAT_AFRO[ph.afroIdx].A;
    let ev = latVary(cell, rng, I, i);
    ev = latDetach(ev, rng, I, g, { free: [0.5, 1, 1.5, 2, 2.5, 3, 3.5], u: 0.5, keep: halves ? [0, 2] : [0] });
    if (halves) { // mesure à deux accords : chaque accord commence par un pouce + accord
        [0, 2].forEach(st => { if (!ev.some(h => Math.abs(h[0] - st) < 0.01)) ev.push([st, 1.4, 'TC', 0.7]); });
        ev.sort((a, b) => a[0] - b[0]);
    }
    ev.forEach(([p, d, k, v]) => { const e = mk(p, d, k, v); if (e) gtr.push(e); });

    // Petite phrase conjointe qui amène l'accord suivant (fin de phrase ou changement d'accord)
    let ran = false;
    if (g !== 'samba' && g !== 'tango' && env.state.latRunAt !== m - 1 && (isTurn || changeNext)
        && rng() < (isTurn ? 0.4 : 0.16) * (0.5 + 0.6 * I)) {
        const fromV = voiceFor(lastSeg.cs);
        const tcs = changeNext ? nextStep : lastSeg.cs;
        const tV = changeNext ? peekVoice(nextStep) : fromV;
        if (fromV.length && tV.length) {
            const count = rng() < 0.5 ? 3 : 4;
            const startPos = 4 - count * 0.5;
            const notes = popRun(env, tcs, fromV[fromV.length - 1], tV[tV.length - 1], count);
            if (notes.length === count) {
                for (let k = gtr.length - 1; k >= 0; k--) if (gtr[k].pos >= startPos - 1e-6) gtr.splice(k, 1);
                gtr.forEach(e => { if (e.pos < startPos) e.dur = Math.min(e.dur, startPos - e.pos + 0.1); });
                notes.forEach((n, k) => gtr.push(mkGtr(startPos + k * 0.5, k === count - 1 ? 0.7 : 0.55, [n], (0.44 + 0.28 * (k / (count - 1))) * 1, 1, 0, false)));
                ran = true;
                env.state.latRunAt = m;
            }
        }
    }
    if (anticip && !ran) {
        for (let k = gtr.length - 1; k >= 0; k--) if (gtr[k].pos >= 3.5 - 1e-6) gtr.splice(k, 1);
        const a = mk(3.5, 1.4, rng() < 0.5 ? 'tC' : 'C', 0.62);
        if (a) gtr.push(a);
    }
    gtr.sort((a, b) => a.pos - b.pos);

    // ---- basse ----
    const bass = [];
    const bassSet = LATIN_PAT.LAT_BASS[g];
    const bi = (i === 2 && rng() < 0.5) ? ph.bassAlt : ph.bassIdx;
    segs.forEach((sg, si) => {
        const T = latBassTones(env, sg.cs);
        const len = sg.e - sg.s;
        const isLast = si === segs.length - 1;
        const follow = !isLast ? segs[si + 1].cs : (changeNext ? nextStep : null);
        const approach = follow ? popBassApproach(env, T.root, follow, rng) : null;
        const resolve = (tok) => {
            switch (tok) {
                case 'F': return T.fifth;
                case 'T': return T.third;
                case 'O': return T.octave;
                case 'A': return approach !== null ? approach : T.fifth;
                case 'N': return (isLast && changeNext) ? latBassTones(env, nextStep).root : T.root;
                default: return T.root;
            }
        };
        const tpl = len >= 4
            ? bassSet[bi % bassSet.length]
            : (g === 'samba'
                ? [[0, 'R', 0.45, 0.82], [1, follow && rng() < 0.4 ? 'A' : 'F', 0.9, 0.78]]
                : [[0, 'R', g === 'afro' ? 0.9 : 1.4, 0.84], [1.5, follow && rng() < 0.5 ? 'A' : 'F', 0.45, 0.66]]);
        tpl.forEach(([p, tok, d, v]) => {
            if (g === 'afro' && tied && sg.s === 0 && p < 0.75) return; // note anticipée tenue sur le 1
            let abs = resolve(tok);
            const prevB = bass[bass.length - 1];
            if (tok === 'A' && follow && prevB && prevB.abs === abs) {
                for (let t = 0; t < 4 && abs === prevB.abs; t++) abs = popBassApproach(env, T.root, follow, rng);
                if (abs === prevB.abs) abs = T.fifth;
            }
            bass.push({
                pos: sg.s + p, abs, dur: d, tok,
                vel: Math.min(1, v * (0.82 + 0.22 * I) * (0.92 + 0.08 * prog)), wide: true
            });
        });
    });
    if (anticip) {
        for (let k = bass.length - 1; k >= 0; k--) if (bass[k].pos >= 3.5 - 1e-6) bass.splice(k, 1);
        bass.push({ pos: 3.5, abs: latBassTones(env, nextStep).root, dur: 1.2, tok: 'N', vel: 0.76 * (0.85 + 0.2 * I), wide: true });
    }
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.03 : (b.tok === 'N' ? 1.2 : 4 - b.pos - 0.03);
        b.dur = Math.max(0.12, Math.min(b.dur, limit));
    });
    env.state.latTie = g === 'afro' && bass.some(b => b.tok === 'N' && b.pos >= 3.5 - 1e-6);

    const drums = buildLatinDrums(env, ph, i, L, isTurn, bass, rng, I, m);
    env.state.latVoice = lastKey ? { key: lastKey, v: lastV } : null;
    return { piano: gtr, bass, drums, guitar: true };
}

// ===================== Bossa nova =====================
// Écriture calquée sur le trio de bossa (violão, contrebasse, batterie légère) :
//  - guitare : le pouce joue la basse sur les temps 1 et 3 sans jamais s'interrompre ; trois doigts pincent ensemble
//    un accord sans fondamentale (tierce, septième, neuvième quand la gamme le permet) sur un motif syncopé de deux
//    mesures (LAT_BOSSA). L'accord suivant est anticipé sur le « et » du 4e temps et reste lié par-dessus la barre de
//    mesure : c'est le pouce seul qui marque le 1er temps. Ni grattés, ni accords étouffés, ni arpèges.
//  - basse : fondamentale et quinte en « noire pointée - croche », la croche étant une levée discrète.
//  - batterie : croches régulières et douces (charleston fermé et / ou ganzá), clave de bossa au cross-stick
//    (1, 2&, 4 | 2, 3&), grosse caisse feutrée qui double la basse (1, 2&, 3, 4&). Pas de roulements de toms ni de crash.

// Gammes dont la neuvième majeure colore l'accord sans le brouiller.
const BOSSA_NINTH_OK = new Set(['ionian', 'lydian', 'dorian', 'aeolian', 'mixolydian', 'lydianDominant', 'melodicMinor',
    'harmonicMinor', 'majorBebop', 'dominantBebop', 'majorPentatonic', 'mixolydianFlat13']);
const bossaMod = (x) => ((x % 12) + 12) % 12;

// Classes de hauteur jouées par les doigts : tierce, septième et une couleur (tension notée dans l'accord, neuvième si la
// gamme l'admet, sinon quinte). `sixth` : la septième majeure laisse la place à la sixte (Fmaj7 → F6/9).
function bossaFingerPcs(env, cs, sixth) {
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    const rel = (k) => bossaMod(t[k] - r0);
    let ivs;
    if (t.length <= 3) ivs = t.map((_, k) => rel(k));
    else if (t.length > 4) ivs = [rel(1), rel(3), rel(t.length - 1)];
    else {
        const third = rel(1), fifth = rel(2);
        let sev = rel(3);
        const plain = fifth === 7 && (third === 3 || third === 4);
        if (sixth && third === 4 && sev === 11) sev = 9;
        ivs = [third, sev, (plain && BOSSA_NINTH_OK.has(cs.scaleId)) ? 2 : fifth];
    }
    const pcs = [];
    ivs.forEach(iv => { const pc = bossaMod(cs.rootIndex + r0 + iv); if (!pcs.includes(pc)) pcs.push(pc); });
    return pcs.sort((a, b) => a - b);
}

// Peut-on alléger la septième majeure en sixte quand l'accord dure ? (accords maj7 à quatre sons seulement)
function bossaHasSixth(env, cs) {
    const t = env.findChordObj(cs.chordId).notes;
    if (t.length !== 4) return false;
    const r0 = t[0] || 0;
    return bossaMod(t[1] - r0) === 4 && bossaMod(t[2] - r0) === 7 && bossaMod(t[3] - r0) === 11;
}

// Dominante altérée (tierce majeure, quinte diminuée) : la basse ne joue pas la quinte diminuée, elle redit la fondamentale.
function bossaNoFifth(env, cs) {
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    return t.length > 2 && bossaMod(t[1] - r0) === 4 && bossaMod(t[2] - r0) !== 7;
}

// Pouce de la guitare (hauteurs écrites) : fondamentale sur la 6e ou la 5e corde (mi2 à mi♭3 réels), quinte sur la corde
// voisine (dessous si la guitare le permet, sinon dessus).
function bossaThumb(env, cs) {
    const off = env.transOffset;
    const T = latBassTones(env, cs);
    let root = bossaMod(T.root + off);
    if (root > 3) root -= 12;
    const up = bossaMod(T.fifth - T.root) || 7;
    const fifth = bossaNoFifth(env, cs) ? root : ((root - (12 - up) >= -8) ? root - (12 - up) : root + up);
    return { root: root - off, fifth: fifth - off };
}

// Accord des doigts (hauteurs écrites, du grave à l'aigu) : position serrée sur les cordes 4-3-2 / 3-2-1 (ré3 à fa4
// réels), au-dessus du pouce, choisie pour bouger le moins possible par rapport à l'accord précédent.
function bossaFingers(env, cs, prev, sixth) {
    const off = env.transOffset;
    const pcs = bossaFingerPcs(env, cs, sixth);
    if (!pcs.length) return [];
    const thumb = bossaThumb(env, cs).root + off;
    let best = null, bestCost = Infinity;
    for (let r = 0; r < pcs.length; r++) {
        const order = pcs.slice(r).concat(pcs.slice(0, r));
        for (let lo = 2; lo <= 13; lo++) {
            if (bossaMod(lo) !== order[0]) continue;
            const v = [lo];
            for (let k = 1; k < order.length; k++) v.push(v[k - 1] + (bossaMod(order[k] - v[k - 1]) || 12));
            const top = v[v.length - 1];
            if (top > 19) continue;
            let c = 0.35 * Math.abs((v[0] + top) / 2 - 10) + Math.max(0, top - 16) * 1.2;
            if (v[0] <= thumb + 2) c += 6;
            for (let k = 0; k + 1 < v.length; k++) if (v[k + 1] - v[k] === 1) c += 16; // pas de seconde mineure serrée
            if (prev && prev.length === v.length) for (let k = 0; k < v.length; k++) c += Math.abs(v[k] - (prev[k] + off));
            if (c < bestCost - 1e-9) { bestCost = c; best = v; }
        }
    }
    return best ? best.map(n => n - off) : [];
}

function buildBossaPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const prog = L > 1 ? i / (L - 1) : 0;
    const gv = (0.88 + 0.14 * I) * (0.95 + 0.05 * prog); // la bossa reste égale : nuances resserrées
    const segs = halves
        ? [{ s: 0, e: 2, cs: halves[0] }, { s: 2, e: 4, cs: halves[1] }]
        : [{ s: 0, e: 4, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const st = (env.state.latVoice && env.state.latVoice.bossa) ? env.state.latVoice : null;
    const tied = !!st && st.tie === m - 1 && st.tieKey === keyOf(segs[0].cs); // accord déjà posé sur le « et » du 4 précédent
    const mainKey = keyOf(lastSeg.cs);
    const hold = (!halves && st && st.main === mainKey) ? (st.hold || 0) + 1 : 0; // mesures passées sur le même accord
    const sixth = hold % 2 === 1 && bossaHasSixth(env, lastSeg.cs);

    // ---- motif des doigts ----
    const pair = LATIN_PAT.LAT_BOSSA[(ph.bossaIdx || 0) % LATIN_PAT.LAT_BOSSA.length];
    let hits = ((m % 2 === 0) ? pair.A : pair.B).map(h => h.slice());
    const at = (p) => hits.findIndex(h => Math.abs(h[0] - p) < 0.01);
    const drop = (p) => { const k = at(p); if (k >= 0) hits.splice(k, 1); };
    const put = (p, d, v) => { drop(p); hits.push([p, d, v]); };
    // petite respiration : en cours de phrase, un contretemps léger disparaît parfois (jamais deux mesures de suite au même endroit)
    if (i > 0 && hits.length > 3 && rng() < 0.18 * (1.1 - I)) {
        const soft = hits.map((h, k) => k).filter(k => hits[k][0] > 0.01 && hits[k][0] < 3.4);
        if (soft.length) hits.splice(soft[Math.floor(rng() * soft.length)], 1);
    }
    if (tied) drop(0);
    // Anticipation : l'accord suivant arrive sur le « et » du 4e temps, lié jusqu'à la mesure suivante
    const anticip = changeNext && rng() < (at(3.5) >= 0 ? 0.9 : 0.55 + 0.2 * I);
    if (anticip) {
        const k3 = at(3);
        if (k3 >= 0) hits[k3][1] = Math.min(hits[k3][1], 0.42);
        put(3.5, 1.3, 0.54);
    } else if (changeNext) drop(3.5); // sans anticipation, rien ne déborde sur le nouvel accord
    // Mesure à deux accords : le second arrive souvent en avance sur le « et » du 2e temps
    let midAntic = false;
    if (halves) {
        midAntic = at(1.5) >= 0 ? rng() < 0.75 : rng() < 0.3;
        if (midAntic) { put(1.5, 1.2, 0.54); drop(2); }
        const cut = midAntic ? 1.5 : 2;
        if (!tied && !hits.some(h => h[0] < cut - 0.01)) put(0, 0.9, 0.56);
        if (!hits.some(h => h[0] >= cut - 0.01 && h[0] < 3.4)) put(2, 0.9, 0.54);
    }
    hits.sort((a, b) => a[0] - b[0]);
    const ties = hits.some(h => h[0] >= 3.5 - 0.01);
    const tieKey = ties ? keyOf(anticip ? nextStep : lastSeg.cs) : null;

    // ---- conduite des voix ----
    const cache = {};
    let lastV = st ? st.v : null;
    let lastKey = st ? st.key : null;
    const voiceFor = (cs, six) => {
        const key = keyOf(cs) + (six ? ':6' : '');
        if (cache[key]) return cache[key];
        const v = (st && st.key === key) ? st.v : bossaFingers(env, cs, lastV, six);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const csAtPos = (pos) => (anticip && pos >= 3.5 - 0.01) ? nextStep : (halves && pos >= (midAntic ? 1.5 : 2) - 0.01 ? segs[1].cs : segs[0].cs);

    // ---- guitare ----
    const gtr = [];
    const lay = () => 0.003 + rng() * 0.008;
    // pouce : temps 1 et 3, note qui résonne presque jusqu'à la suivante
    const thumbAlt = ph.bossaThumb !== 'root';
    [0, 2].forEach(p => {
        const cs = (halves && p === 2) ? segs[1].cs : segs[0].cs;
        const th = bossaThumb(env, cs);
        const note = (p === 2 && !halves && thumbAlt) ? th.fifth : th.root;
        gtr.push({
            pos: p, dur: 1.8, vel: Math.min(1, (p === 0 ? 0.62 : 0.54) * gv * (0.96 + rng() * 0.08)),
            rootIndex: 0, intervals: [note], noteVels: [1], dir: 1, roll: 0, lay: lay(), thumb: true
        });
    });
    // doigts : trois cordes pincées ensemble (à peine égrenées), tenues jusqu'à la frappe suivante
    hits.forEach(([p, d, v], k) => {
        const cs = csAtPos(p);
        const six = sixth && cs === lastSeg.cs && !halves;
        const V = voiceFor(cs, six);
        if (!V.length) return;
        const nx = hits[k + 1];
        const room = nx ? nx[0] - p - 0.06 : (p >= 3.5 - 0.01 ? 1.4 : 4.3 - p);
        const dur = Math.max(0.3, Math.min(d, room));
        const onBeat = Math.abs(p - Math.round(p)) < 0.01;
        gtr.push({
            pos: p, dur, vel: Math.max(0.1, Math.min(1, v * gv * (onBeat ? 1 : 1.05) * (0.95 + rng() * 0.1))),
            rootIndex: 0, intervals: V.slice(),
            noteVels: V.map((_, j) => j === V.length - 1 ? 1 : (j === 0 ? 0.86 : 0.8)), // la voix du haut chante
            dir: 1, roll: 0.002 + rng() * 0.004, lay: lay()
        });
    });
    gtr.sort((a, b) => a.pos - b.pos || (a.thumb ? -1 : 1));

    // ---- contrebasse ----
    const bass = [];
    const bassSet = LATIN_PAT.LAT_BASS.bossa;
    const bi = ((i === 2 && rng() < 0.35) ? ph.bassAlt : ph.bassIdx) || 0;
    const bv = (0.86 + 0.16 * I) * (0.95 + 0.05 * prog);
    segs.forEach((sg, si) => {
        const T = latBassTones(env, sg.cs);
        const isLast = si === segs.length - 1;
        const follow = !isLast ? segs[si + 1].cs : (changeNext ? nextStep : null);
        const approach = (follow && rng() < 0.25) ? popBassApproach(env, T.root, follow, rng) : null;
        const pickup = () => approach !== null ? approach : (follow ? latBassTones(env, follow).root : T.root);
        const tpl = (sg.e - sg.s) >= 4
            ? bassSet[bi % bassSet.length]
            : [[0, 'R', 1.42, 0.82], [1.5, 'N', 0.45, 0.5]];
        tpl.forEach(([p, tok, d, v]) => {
            let abs;
            switch (tok) {
                case 'F': abs = bossaNoFifth(env, sg.cs) ? T.root : T.fifth; break;
                case 'N': abs = pickup(); break;
                default: abs = T.root;
            }
            bass.push({ pos: sg.s + p, abs, dur: d, tok, vel: Math.min(1, v * bv * (0.96 + rng() * 0.08)), wide: true });
        });
    });
    bass.sort((a, b) => a.pos - b.pos);
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        b.dur = Math.max(0.12, Math.min(b.dur, nx ? nx.pos - b.pos + 0.02 : 4 - b.pos - 0.03));
    });

    const drums = buildBossaDrums(env, ph, i, L, isTurn, rng, I, m);
    env.state.latTie = false;
    env.state.latVoice = lastKey ? { key: lastKey, v: lastV, bossa: true, tie: ties ? m : -9, tieKey, main: mainKey, hold } : null;
    return { piano: gtr, bass, drums, guitar: true };
}

// Batterie de bossa nova : tout est doux et régulier, la clave au cross-stick porte le rythme.
function buildBossaDrums(env, ph, i, L, isTurn, rng, I, m) {
    const d = [];
    const prog = L > 1 ? i / (L - 1) : 0;
    const dv = (0.8 + 0.2 * I) * (0.95 + 0.05 * prog);
    const add = (pos, drum, vel) => d.push({ pos, drum, vel: Math.max(0.06, Math.min(1, vel * dv)), lay: drum === 'rim' ? 0.004 : 0 });
    const jit = () => (rng() - 0.5) * 0.05;
    const doFill = isTurn && ph.fill;
    const kind = ph.fillKind;
    env.state.bandLastFill = false; // pas de crash après une relance de bossa
    const perc = ph.bossaPerc || 'hat';

    // croches : charleston fermé (égal, temps à peine appuyés) et / ou ganzá (contretemps un peu poussés)
    for (let k = 0; k < 8; k++) {
        const p = k * 0.5;
        const on = k % 2 === 0;
        if (perc !== 'shaker') {
            const open = doFill && kind === 0 && p === 3.5;
            add(p, open ? 'ohat' : 'hat', (on ? 0.32 : 0.26) + 0.08 * I + jit());
        }
        if (perc !== 'hat') add(p, 'shaker', (on ? 0.26 : 0.36) * (perc === 'both' ? 0.8 : 1) + jit());
    }
    // clave de bossa (3-2) au cross-stick ; absente seulement des phrases les plus retenues
    if (ph.claveOn || I >= 0.4) {
        const claveA = m % 2 === 0;
        (claveA ? [0, 1.5, 3] : [1, 2.5]).forEach((p, k) => add(p, 'rim', (claveA && k === 0 ? 0.5 : 0.44) + jit()));
        if (doFill && kind === 1) add(3.5, 'rim', 0.32);
    }
    // grosse caisse feutrée : 1 et 3, chacun précédé de sa levée (comme la basse)
    [[0, 0.5], [1.5, 0.28], [2, 0.44], [3.5, 0.3]].forEach(([p, v]) => add(p, 'kick', v + jit()));
    if (doFill && kind === 2) { add(3.25, 'ghost', 0.26); add(3.75, 'ghost', 0.34); }
    return d.sort((a, b) => a.pos - b.pos);
}

// Batterie latine : trois grooves (bossa, samba, afro-cubain), dynamique qui monte dans la phrase,
// grosse caisse calée sur les attaques de la basse, petits fills en fin de phrase.
function buildLatinDrums(env, ph, i, L, isTurn, bass, rng, I, m) {
    const d = [];
    const prog = L > 1 ? i / (L - 1) : 0;
    const dv = (0.72 + 0.32 * I) * (0.92 + 0.08 * prog);
    const doFill = isTurn && ph.fill;
    const kind = ph.fillKind;
    const fillFrom = doFill ? (kind === 2 ? 2.5 : 3) : 99;
    const add = (pos, drum, vel) => d.push({
        pos, drum,
        vel: Math.max(0.06, Math.min(1, vel * dv)),
        lay: (drum === 'rim' || drum === 'snare') ? 0.004 : 0
    });
    const jit = () => (rng() - 0.5) * 0.08;
    const g = ph.groove;
    const claveA = m % 2 === 0; // barre « 3 » puis barre « 2 » de la clave

    if (i === 0) {
        if (env.state.bandLastFill && rng() < 0.3) add(0, 'crash', 0.55);
        env.state.bandLastFill = false;
    }
    if (isTurn) env.state.bandLastFill = doFill;

    const clave = (vel) => {
        if (!ph.claveOn) return;
        (claveA ? [0, 1.5, 3] : [1, 2]).forEach(p => { if (p < fillFrom) add(p, 'rim', vel + (rng() - 0.5) * 0.1); });
    };
    const kicksOnBass = (base, maxN, pR, pF) => {
        const ks = new Set(base);
        bass.forEach(b => {
            if (b.pos >= fillFrom || ks.has(b.pos)) return;
            const strong = b.tok === 'R' || b.tok === 'N' || b.tok === 'O';
            if (rng() < (strong ? pR : pF)) ks.add(b.pos);
        });
        return [...ks].sort((a, b) => a - b).slice(0, maxN);
    };

    if (g === 'bossa') {
        const hb = 0.34 + 0.2 * I;
        for (let k = 0; k < 8; k++) {
            const p = k * 0.5;
            if (p >= fillFrom) break;
            if (k % 2 === 1 && rng() < 0.06) continue;
            const open = p === 3.5 && rng() < 0.12 + 0.2 * I;
            add(p, open ? 'ohat' : 'hat', (k % 2 === 0 ? hb : hb * 0.62) + jit());
        }
        clave(0.5);
        const ks = kicksOnBass([0, 2], 4, 0.5, 0.3 + 0.3 * I);
        ks.forEach(p => { if (p < fillFrom) add(p, 'kick', p === 0 ? 0.78 : (p === 2 ? 0.6 : 0.46 + rng() * 0.1)); });
    } else if (g === 'samba') {
        for (let k = 0; k < 16; k++) {
            const p = k * 0.25;
            if (p >= fillFrom) break;
            const r4 = k % 4;
            if (r4 % 2 === 1 && rng() < 0.08) continue;
            add(p, 'hat', (r4 === 0 ? 0.46 : (r4 === 2 ? 0.34 : 0.2)) + jit() * 0.6);
        }
        [[0, 0.5], [1, 0.85], [2, 0.5], [3, 0.85]].forEach(([p, v]) => { if (p < fillFrom) add(p, 'kick', v + (rng() - 0.5) * 0.08); });
        const tam = claveA ? [0.75, 1.5, 2.25, 3] : [0, 0.75, 1.25, 2, 2.75, 3.5];
        tam.forEach(p => { if (p < fillFrom && rng() < 0.9) add(p, 'rim', 0.36 + (rng() - 0.5) * 0.08); });
    } else if (g === 'tango') {
        // Tango : pas de batterie à proprement parler, un bombo très discret sur les temps forts
        [[0, 0.4], [2, 0.34]].forEach(([p, v]) => { if (p < fillFrom) add(p, 'kick', v + (rng() - 0.5) * 0.05); });
        [1, 3].forEach(p => { if (p < fillFrom && rng() < 0.7) add(p, 'rim', 0.2 + (rng() - 0.5) * 0.05); });
    } else if (g === 'piazzolla') {
        // Piazzolla : grosse caisse sur le 3-3-2, « chicharra » légère au rim, charleston discret sur les contretemps
        [[0, 0.62], [1.5, 0.5], [3, 0.54]].forEach(([p, v]) => { if (p < fillFrom) add(p, 'kick', v + (rng() - 0.5) * 0.06); });
        [0.75, 2.25, 3.5].forEach(p => { if (p < fillFrom && rng() < 0.85) add(p, 'rim', 0.32 + (rng() - 0.5) * 0.08); });
        for (let k = 1; k < 8; k += 2) { const p = k * 0.5; if (p >= fillFrom) break; add(p, 'hat', 0.2 + jit() * 0.6); }
    } else {
        for (let k = 0; k < 8; k++) {
            const p = k * 0.5;
            if (p >= fillFrom) break;
            const open = p === 3.5 && rng() < 0.2;
            add(p, open ? 'ohat' : 'hat', (k % 2 === 0 ? 0.4 : 0.26) + jit());
        }
        clave(0.52);
        const ks = kicksOnBass([0], 3, 0.0, 0.0);
        ks.forEach(p => add(p, 'kick', 0.5));
        if (3 < fillFrom) add(3, 'kick', 0.68);
        if (3.5 < fillFrom && bass.some(b => b.tok === 'N') && rng() < 0.7) add(3.5, 'kick', 0.58);
        [[1, 'tom3', 0.28], [1.5, 'tom2', 0.36], [3, 'tom3', 0.28]].forEach(([p, dr, v]) => { if (p < fillFrom && rng() < 0.85) add(p, dr, v); });
    }

    if (doFill) {
        const fills = {
            0: [[3, 'rim', 0.5], [3.5, 'tom2', 0.6], [3.75, 'tom3', 0.7]],
            1: [[3, 'snare', 0.4], [3.25, 'snare', 0.46], [3.5, 'snare', 0.58], [3.75, 'snare', 0.74]],
            2: [[2.5, 'tom1', 0.5], [3, 'tom2', 0.6], [3.5, 'tom3', 0.7], [3.75, 'tom3', 0.62]]
        };
        (fills[kind] || []).forEach(([p, dr, v]) => add(p, dr, v));
    }
    return d;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { latinPhraseExtras, buildLatinPlan, buildLatinDrums, buildBossaPlan, buildBossaDrums, bossaFingerPcs, bossaFingers, bossaThumb };
}
