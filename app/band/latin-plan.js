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
    const hint = isCuba ? 'afro' : ctx.groove;
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
        bassIdx: Math.floor(rng() * LATIN_PAT.LAT_BASS[groove].length),
        bassAlt: Math.floor(rng() * LATIN_PAT.LAT_BASS[groove].length),
        claveOn: rng() < 0.88,
        fill: rng() < 0.45 && groove !== 'tango', // le tango marcato n'a pas de fills de batterie
        fillKind: Math.floor(rng() * 3)
    };
}

function buildLatinPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
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
    module.exports = { latinPhraseExtras, buildLatinPlan, buildLatinDrums };
}
