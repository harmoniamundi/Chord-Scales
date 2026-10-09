// band/meter-plan.js — orchestre piano / basse / batterie des mesures binaires à 2 ou 3 temps (2/4, 3/4) de la jam.
// Chargé par index.html via <script src="band/meter-plan.js"> (après band-patterns.js et band/band-helpers.js)
// et testé par band/meter-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat   temps après lequel une mesure à deux accords change d'accord
//   env.meterKey    signature courante ('2/4', '3/4', '6/8', '9/8', '12/8'…) : choisit la bibliothèque de patterns
//   env.swing       rapport de swing (bandSwing(style, bpm))
//   env.state       mémoire entre deux mesures, modifiée en place : meterVoice, bandLastFill

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof popBassApproach === 'undefined' && typeof require === 'function') {
    var { popBassApproach, popBassTones, popVoicing, latBassTones, latThumb, latDetach, bassNear,
        swingPos, pickWeighted, patternLib, pianoHitIntervals, clsVoicing, clsLowNote } = require('./band-helpers.js');
}
// Tables : globales en navigateur (theory.js, band-patterns.js), à charger sous Node.
const METER_PAT = (typeof LAT_VOICE_RANGE !== 'undefined') ? { LAT_VOICE_RANGE } : require('../band-patterns.js');
const METER_SCALES = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

// Choix propres au 3/4 et au 2/4, faits une fois par phrase et gardés pendant toute la phrase.
function meterPhraseExtras(bpb, style, lib, ph, rng) {
    const idx = (n) => Math.floor(rng() * n);
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.3 + 0.6 * (typeof ph.density === 'number' ? ph.density : 0.5);
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs(c.d - I) * 2)]));
    const mx = { I, bassIdx: idx(2), bassAlt: idx(2) };
    if (style === 'swing') {
        mx.rideVar = pickW([[0, 3], [1, 1.5], [2, I > 0.6 ? 2.5 : 0.7]]);
    } else if (style === 'pop') {
        mx.compIdx = idx(lib.comp.length);
        mx.compAlt = idx(lib.comp.length);
        mx.arpIdx = idx(lib.arp.length);
        const W3 = I < 0.4 ? [['ballad', 3], ['waltz', 2], ['back', 0.5]]
            : (I < 0.7 ? [['waltz', 3], ['back', 2.5], ['ballad', 0.5], ['drive', 0.7]] : [['back', 3], ['drive', 3], ['waltz', 1]]);
        const W2 = I < 0.4 ? [['ballad', 3], ['march', 2]]
            : (I < 0.7 ? [['march', 3], ['polka', 1.5], ['drive', 1]] : [['drive', 3], ['march', 2], ['polka', 1]]);
        mx.drumKey = pickW(bpb === 3 ? W3 : W2);
    } else if (style === 'latin') {
        const g = lib[ph.groove] ? ph.groove : 'bossa';
        mx.cellIdx = byDensity(lib[g]);
        mx.bassIdx = idx(lib.bassCells[g].length);
        mx.bassAlt = idx(lib.bassCells[g].length);
    } else if (style === 'classic') {
        mx.eightIdx = idx(lib.eights.length); mx.eightAlt = idx(lib.eights.length);
        mx.quarterIdx = idx(lib.quarters.length); mx.quarterAlt = idx(lib.quarters.length);
        mx.mixedIdx = idx(lib.mixed.length); mx.mixedAlt = idx(lib.mixed.length);
        mx.upperIdx = idx(lib.upper.length); mx.upperAlt = idx(lib.upper.length);
        mx.waltz = rng() < 0.65; // 3/4 : basse puis accord (« oom-pah-pah ») plutôt que trois notes arpégées
    }
    return mx;
}

function buildMeterPlan(env, bpb, style, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const lib = patternLib(env.meterKey, style);
    if (!ph.mx) ph.mx = meterPhraseExtras(bpb, style, lib, ph, rng);
    const mx = ph.mx;
    const swing = env.swing;
    const sw = (p) => swingPos(p, swing);
    const dens = typeof ph.density === 'number' ? ph.density : 0.6;
    const I = mx.I;
    const prog = L > 1 ? i / (L - 1) : 0;
    const splitAt = env.splitBeat;
    const aPos = bpb - 0.5;                // « et » du dernier temps : l'accord suivant peut y être annoncé
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const pc = (n) => ((n % 12) + 12) % 12;
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const followOf = (si) => si < segs.length - 1 ? segs[si + 1].cs : (changeNext ? nextStep : null);
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? bpb - 1 : 99;
    const fk = (ph.fillKind || 0) % 2;
    const piano = [], bass = [], drums = [];
    const dr = (pos, drum, vel) => { if (pos < bpb) drums.push({ pos, drum, vel }); };
    let anticip = false;
    const csAt = (pos) => (anticip && pos >= aPos) ? nextStep : ((halves && pos >= splitAt) ? segs[1].cs : segs[0].cs);
    const endOf = (pos) => {
        if (anticip && pos >= aPos) return bpb + 0.9;
        if (halves && pos < splitAt) return splitAt + 0.05;
        return anticip ? aPos + 0.05 : bpb + 0.05;
    };
    const dropFrom = (arr, p) => { for (let k = arr.length - 1; k >= 0; k--) if (arr[k].pos >= p - 1e-6) arr.splice(k, 1); };

    if (i === 0 && env.state.bandLastFill) {
        if (rng() < 0.6) dr(0, 'crash', 0.9);
        env.state.bandLastFill = false;
    }
    if (isTurn) env.state.bandLastFill = doFill;

    // Chaque note de basse s'arrête à l'attaque suivante ; la dernière avant la barre de mesure.
    const finishBass = () => {
        bass.sort((a, b) => a.pos - b.pos);
        bass.forEach((b, k) => {
            const nx = bass[k + 1];
            const limit = nx ? nx.pos - b.pos + 0.03 : (b.tok === 'N' ? 1.2 : bpb - b.pos - 0.03);
            b.dur = Math.max(0.12, Math.min(b.dur, limit));
        });
    };

    // Conduite des voix (pop et latin) : on garde le voicing précédent quand l'accord ne change pas.
    const vRange = style === 'latin' ? METER_PAT.LAT_VOICE_RANGE : undefined;
    const vCache = {};
    let lastV = env.state.meterVoice ? env.state.meterVoice.v : null;
    let lastKey = env.state.meterVoice ? env.state.meterVoice.key : null;
    const voiceFor = (cs) => {
        const key = cs.rootIndex + ':' + cs.chordId;
        if (vCache[key]) return vCache[key];
        const v = (env.state.meterVoice && env.state.meterVoice.key === key) ? env.state.meterVoice.v : popVoicing(env, cs, lastV, vRange);
        vCache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const mkEv = (pos, dur, notes, vel, extra) => {
        const n = notes.length;
        return Object.assign({
            pos,
            dur: Math.max(0.15, Math.min(dur, endOf(pos) - pos)),
            vel: Math.max(0.1, Math.min(1, vel)),
            rootIndex: 0, intervals: notes,
            noteVels: notes.map((_, k) => n === 1 ? 1 : (k === n - 1 ? 1.1 : (k === 0 ? 0.8 : 0.9))),
            roll: n > 1 ? 0.008 + rng() * 0.014 : 0,
            lay: 0.003 + rng() * 0.012,
            wide: true
        }, extra || {});
    };
    const fillDrums = (kind) => {
        const b = bpb - 1;
        if (kind === 'pop') {
            const seq = fk === 0 ? ['snare', 'tom1', 'tom2', 'tom3'] : ['snare', 'snare', 'snare', 'snare'];
            [0.5, 0.55, 0.7, 0.85].forEach((v, k) => dr(b + k * 0.25, seq[k], v));
        } else if (kind === 'latin') {
            if (fk === 0) { dr(b, 'tom1', 0.5); dr(b + 0.5, 'tom2', 0.6); dr(b + 0.75, 'tom3', 0.72); }
            else { dr(b, 'rim', 0.55); dr(b + 0.25, 'rim', 0.5); dr(b + 0.5, 'snare', 0.5); }
        } else {
            if (fk === 0) { dr(b, 'snare', 0.5); dr(b + 1 / 3, 'tom1', 0.6); dr(b + 2 / 3, 'tom3', 0.72); }
            else { dr(b, 'snare', 0.5); dr(b + swing, 'snare', 0.7); dr(b + swing, 'kick', 0.6); }
        }
    };

    // ------------------------------------------------------------------ SWING
    if (style === 'swing') {
        const anticipOK = isLastMeasureOfStep && !!nextStep;
        const chordFor = (pos) => (anticipOK && pos >= aPos) ? nextStep : ((halves && pos >= splitAt) ? segs[1].cs : segs[0].cs);
        const cell = isTurn ? ph.turn : (i === 0 ? ph.motif : (i === 1 ? ph.second : ph.varied));
        const pcell = cell.map(h => h.slice());
        if (halves) { // chaque accord doit s'entendre au piano, même si le motif n'a aucune frappe dans sa part de mesure
            segs.forEach(sg => {
                const hi = anticipOK ? Math.min(sg.e, aPos) : sg.e;
                if (!pcell.some(h => h[0] >= sg.s - 1e-6 && h[0] < hi - 1e-6)) pcell.push([sg.s, 1.4, 'C', 0.75]);
            });
            pcell.sort((a, b) => a[0] - b[0]);
        }
        const tension = 0.92 + 0.08 * prog;
        pcell.forEach((h, k) => {
            const [pos, dur, kind, vel] = h;
            const cs = chordFor(pos);
            const anticipated = anticipOK && pos >= aPos;
            const nextPos = k + 1 < pcell.length ? pcell[k + 1][0] : bpb;
            let room = anticipated ? (bpb - pos + 0.6) : Math.max(0.2, nextPos - pos + 0.15);
            if (halves && pos < splitAt) room = Math.min(room, Math.max(0.15, splitAt - sw(pos)));
            piano.push({
                pos: sw(pos),
                dur: Math.min(dur, room),
                vel: Math.min(1, vel * tension),
                rootIndex: cs.rootIndex,
                intervals: pianoHitIntervals(env.findChordObj(cs.chordId), kind, ph.voicing, rng)
            });
        });

        // Basse : marche en trois (3/4) ou sur chaque temps (2/4), passage chromatique, approche de l'accord suivant.
        const tonesOf = (c) => {
            const t = env.findChordObj(c.chordId).notes, rt = c.rootIndex;
            const sc = (METER_SCALES[c.scaleId] && METER_SCALES[c.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
            return {
                root: bassNear(env, c),
                second: rt + (sc[1] !== undefined ? sc[1] : 2),
                third: rt + (t[1] !== undefined ? t[1] : 4),
                fifth: rt + (t[2] !== undefined ? t[2] : 7),
                seventh: rt + (t[3] !== undefined ? t[3] : 12)
            };
        };
        const apprTo = (from, toCs, fallbacks) => {
            const toRoot = bassNear(env, toCs);
            return pc(toRoot) === pc(from.root) ? pick(fallbacks) : toRoot + (rng() < 0.65 ? -1 : 1);
        };
        if (!halves) {
            const T = tonesOf(step);
            const approach = (isLastMeasureOfStep && nextStep) ? bassNear(env, nextStep) + (rng() < 0.65 ? -1 : 1) : null;
            if (bpb === 3) {
                const r = rng();
                if (r < 0.16) { // feeling « à deux temps » dans la valse
                    bass.push({ pos: 0, abs: T.root, dur: 1.9, vel: 0.9 });
                    bass.push({ pos: 2, abs: approach !== null ? approach : pick([T.fifth, T.third]), dur: 0.95, vel: 0.8 });
                } else {
                    const b1 = pick([T.third, T.second, T.fifth, T.third]);
                    const c2 = [T.fifth, T.seventh, T.third].filter(n => n !== b1);
                    const b2 = approach !== null ? approach : (c2.length ? pick(c2) : T.fifth);
                    bass.push({ pos: 0, abs: T.root, dur: 0.95, vel: 0.95 });
                    bass.push({ pos: 1, abs: b1, dur: 0.95, vel: 0.8 });
                    bass.push({ pos: 2, abs: b2, dur: 0.95, vel: 0.86 });
                    if (rng() < 0.18) { // note de passage chromatique en croche swinguée, vers le temps 3
                        bass[1].dur = 0.6;
                        bass.push({ pos: 1 + swing, abs: b2 + (b2 > b1 ? -1 : 1), dur: 0.3, vel: 0.55 });
                    }
                }
            } else {
                const b1 = approach !== null ? approach : pick([T.fifth, T.third, T.fifth, T.seventh]);
                if (rng() < 0.15) {
                    bass.push({ pos: 0, abs: T.root, dur: 1.9, vel: 0.9 });
                } else {
                    bass.push({ pos: 0, abs: T.root, dur: 0.95, vel: 0.95 });
                    bass.push({ pos: 1, abs: b1, dur: 0.95, vel: 0.8 });
                    if (approach === null && rng() < 0.15) { // croche chromatique avant le second temps
                        bass[1].pos = 1 + swing; bass[1].dur = 0.6;
                        bass.push({ pos: 1, abs: b1 + (rng() < 0.5 ? 1 : -1), dur: 0.3, vel: 0.5 });
                    }
                }
            }
        } else {
            const A = tonesOf(halves[0]), B = tonesOf(halves[1]);
            const withEnd = changeNext && pc(bassNear(env, nextStep)) !== pc(B.root) && rng() < 0.6;
            bass.push({ pos: 0, abs: A.root, dur: 0.95, vel: 0.95 });
            if (splitAt > 1) bass.push({ pos: 1, abs: apprTo(A, halves[1], [A.fifth, A.third]), dur: 0.95, vel: 0.8 });
            bass.push({ pos: splitAt, abs: B.root, dur: withEnd ? 0.6 : 0.95, vel: 0.9 });
            if (withEnd) bass.push({ pos: splitAt + swing, abs: apprTo(B, nextStep, [B.fifth, B.third]), dur: 0.3, vel: 0.6 });
        }
        finishBass();

        // Batterie : ride (« ding, ding-a, ding » de la valse jazz) selon la variante de la phrase, pédale, plume.
        const rideSets = bpb === 3
            ? [[0, 1, 1 + swing, 2], [0, 1, 2, 2 + swing], [0, swing, 1, 1 + swing, 2, 2 + swing]]
            : [[0, 1, 1 + swing], [0, swing, 1, 1 + swing], [0, 1]];
        rideSets[mx.rideVar % rideSets.length].forEach(p => {
            if (p < fillFrom) dr(p, 'ride', Number.isInteger(p) ? (p === 0 ? 0.62 : 0.5) : 0.36);
        });
        if (rng() < 0.18 * dens) { const p = (rng() < 0.5 ? 0 : bpb - 1) + swing; if (p < fillFrom) dr(p, 'ride', 0.33); }
        for (let b = 1; b < bpb; b++) if (b < fillFrom) dr(b, 'pedal', 0.5);
        if (ph.feather) { for (let b = 0; b < bpb; b++) if (b < fillFrom) dr(b, 'kick', 0.16 + rng() * 0.06); }
        else dr(0, 'kick', 0.35);
        piano.filter(e => Math.abs(e.pos - Math.round(e.pos)) > 0.05 && e.pos < fillFrom).forEach(e => {
            if (rng() < 0.4 * dens) rng() < 0.7 ? dr(e.pos, 'ghost', 0.7) : dr(e.pos, 'kick', 0.55);
        });
        if (doFill) fillDrums('swing');
        return { piano, bass, drums };
    }

    // ------------------------------------------------------------------ POP
    if (style === 'pop') {
        anticip = changeNext && rng() < 0.2 + 0.5 * I;
        const pv = 0.78 + 0.3 * I;
        const pStyle = ph.pianoStyle || 'comp';
        segs.forEach(sg => {
            const len = sg.e - sg.s;
            const V = voiceFor(sg.cs);
            if (!V.length) return;
            const n = V.length;
            const note = (k) => V[Math.min(k, n - 1)];
            const rel = (p) => sg.s + p;
            if (pStyle === 'pad') {
                piano.push(mkEv(rel(0), len + 0.4, V, 0.62 * pv, { roll: 0.016 + rng() * 0.012 }));
                if (len >= 3 && rng() < 0.4) piano.push(mkEv(rel(2), 1.4, V.slice(1), 0.48 * pv)); // petite relance sur le 3
            } else if (pStyle === 'ballad') {
                const arp = lib.arp[mx.arpIdx % lib.arp.length];
                for (let k = 0; k < len * 2; k++) {
                    const v = arp[k % arp.length];
                    if (v === null) continue;
                    piano.push(mkEv(rel(k * 0.5), 1.6, [note(v)], (k === 0 ? 0.62 : (k % 2 === 0 ? 0.5 : 0.42)) * pv));
                }
            } else {
                const useAlt = i > 0 && rng() > 0.6;
                const tpl = lib.comp[(useAlt ? mx.compAlt : mx.compIdx) % lib.comp.length];
                tpl.filter(h => h[0] < len).forEach(([p, d, v, part]) => {
                    piano.push(mkEv(rel(p), d, (part === 'upper' && n > 2) ? V.slice(1) : V, v * pv));
                });
            }
        });
        if (anticip) {
            dropFrom(piano, aPos);
            const Vn = voiceFor(nextStep);
            if (Vn.length) piano.push(mkEv(aPos, 1.4, Vn, 0.62 * pv));
        }

        const bKey = lib.bassCells[ph.bassStyle] ? ph.bassStyle : 'dotted';
        const bCells = lib.bassCells[bKey];
        const bCell = bCells[((i === 2 && rng() < 0.5) ? mx.bassAlt : mx.bassIdx) % bCells.length];
        segs.forEach((sg, si) => {
            const len = sg.e - sg.s;
            const Tn = popBassTones(env, sg.cs);
            const follow = followOf(si);
            const approach = follow ? popBassApproach(env, Tn.root, follow, rng) : null;
            const res = (tok) => {
                switch (tok) {
                    case 'F': return Tn.fifth;
                    case 'T': return Tn.third;
                    case 'A': return approach !== null ? approach : Tn.fifth;
                    default: return Tn.root;
                }
            };
            bCell.filter(b => b[0] < len).forEach(([p, tok, d, v]) => {
                bass.push({ pos: sg.s + p, abs: res(tok), dur: d, tok, vel: Math.min(1, v * (0.82 + 0.22 * I)), wide: true });
            });
        });
        if (anticip) {
            dropFrom(bass, aPos);
            bass.push({ pos: aPos, abs: popBassTones(env, nextStep).root, dur: 1.2, tok: 'N', vel: 0.76 * (0.85 + 0.2 * I), wide: true });
        }
        finishBass();

        const gr = lib.drums[mx.drumKey] || lib.drums[Object.keys(lib.drums)[0]];
        const hs = gr.hat === 'q' ? 1 : 0.5;
        for (let p = 0; p < bpb; p += hs) {
            if (p >= fillFrom) break;
            const open = gr.hat === 'e' && p === aPos && rng() < 0.25 * dens;
            dr(p, open ? 'ohat' : 'hat', Number.isInteger(p) ? 0.6 : 0.38);
        }
        if (ph.hat16 && gr.hat === 'e') for (let p = 0.25; p < bpb; p += 0.5) if (p < fillFrom) dr(p, 'hat', 0.2);
        gr.kick.forEach(([p, v]) => { if (p < fillFrom) dr(p, 'kick', v); });
        gr.snare.forEach(([p, v, d]) => { if (p < fillFrom) dr(p, d, v); });
        bass.forEach(b => { // la grosse caisse se cale parfois sur les attaques de la basse
            if (b.pos > 0.2 && b.pos < fillFrom && !gr.kick.some(k => Math.abs(k[0] - b.pos) < 0.05) && rng() < 0.25 * I) dr(b.pos, 'kick', 0.55);
        });
        if (bpb - 0.25 < fillFrom && rng() < 0.3 * dens) dr(bpb - 0.25, 'ghost', 0.6);
        if (doFill) fillDrums('pop');
        env.state.meterVoice = lastKey ? { key: lastKey, v: lastV } : null;
        return { piano, bass, drums };
    }

    // ------------------------------------------------------------------ LATIN
    if (style === 'latin') {
        const g = lib[ph.groove] ? ph.groove : 'bossa';
        anticip = changeNext && (g === 'afro' || rng() < 0.4 + 0.35 * I);
        const gv = (0.74 + 0.3 * I) * (0.92 + 0.08 * prog);
        const defs = lib[g];
        const def = defs[Math.min(mx.cellIdx, defs.length - 1)];
        const cell = ((m % 2 === 0) ? def.A : (def.B || def.A)).map(h => h.slice());
        if (i > 0) { // petite variation : une frappe légère retirée, ou un accord étouffé ajouté
            const r = rng();
            if (r < 0.3 * (1.1 - I) && cell.length > 3) {
                const idxs = cell.map((h, k) => k).filter(k => cell[k][2] === 'U' || cell[k][2] === 'X');
                if (idxs.length) cell.splice(idxs[Math.floor(rng() * idxs.length)], 1);
            } else if (r < 0.3 + 0.3 * I) {
                const taken = new Set(cell.map(h => h[0]));
                const free = [0.5, 1, 1.5, 2, 2.5].filter(p => p <= aPos && !taken.has(p));
                if (free.length) cell.push([pick(free), 0.2, 'X', 0.32]);
            }
        }
        const cellD = (() => { const fr = []; for (let p = 0.5; p < bpb; p += 0.5) fr.push(p); return latDetach(cell, rng, I, g, { free: fr, u: 0.5, keep: segs.map(sg => sg.s) }); })();
        cell.length = 0; cellD.forEach(h => cell.push(h));
        segs.forEach(sg => { if (!cell.some(h => Math.abs(h[0] - sg.s) < 0.01)) cell.push([sg.s, 1.4, 'TC', 0.7]); });
        cell.sort((a, b) => a[0] - b[0]);
        const mkG = (p, d, kind, v) => {
            const cs = csAt(p);
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
                default: { // aN : une note de l'accord (arpège)
                    const k = parseInt(kind.slice(1), 10) || 0;
                    notes = [V[Math.min(k, V.length - 1)]];
                }
            }
            notes = notes.slice().sort((a, b) => a - b).filter((n, k, arr) => k === 0 || n !== arr[k - 1]);
            const n = notes.length;
            return {
                pos: p,
                dur: Math.max(kind === 'X' ? 0.1 : 0.15, Math.min(d, endOf(p) - p)),
                vel: Math.max(0.1, Math.min(1, v * gv)),
                rootIndex: 0, intervals: notes,
                noteVels: notes.map((_, k) => n === 1 ? 1 : (k === 0 ? 1 : (k === n - 1 ? 0.9 : 0.78))),
                dir, roll: n > 1 ? roll : 0,
                lay: 0.002 + rng() * 0.01
            };
        };
        cell.forEach(([p, d, kind, v]) => { const e = mkG(p, d, kind, v); if (e) piano.push(e); });
        if (anticip) {
            dropFrom(piano, aPos);
            const a = mkG(aPos, 1.4, rng() < 0.5 ? 'tC' : 'C', 0.62);
            if (a) piano.push(a);
        }
        piano.sort((a, b) => a.pos - b.pos);

        const bSet = lib.bassCells[g];
        const bCell = bSet[((i === 2 && rng() < 0.5) ? mx.bassAlt : mx.bassIdx) % bSet.length];
        segs.forEach((sg, si) => {
            const len = sg.e - sg.s;
            const T = latBassTones(env, sg.cs);
            const follow = followOf(si);
            const approach = follow ? popBassApproach(env, T.root, follow, rng) : null;
            bCell.filter(b => b[0] < len).forEach(([p, tok, d, v]) => {
                let abs;
                switch (tok) {
                    case 'F': abs = T.fifth; break;
                    case 'T': abs = T.third; break;
                    case 'O': abs = T.octave; break;
                    case 'A': abs = approach !== null ? approach : T.fifth; break;
                    default: abs = T.root;
                }
                bass.push({ pos: sg.s + p, abs, dur: d, tok, vel: Math.min(1, v * (0.82 + 0.22 * I) * (0.92 + 0.08 * prog)), wide: true });
            });
        });
        if (anticip) {
            dropFrom(bass, aPos);
            bass.push({ pos: aPos, abs: latBassTones(env, nextStep).root, dur: 1.2, tok: 'N', vel: 0.76 * (0.85 + 0.2 * I), wide: true });
        }
        finishBass();

        const gd = lib.drums[g];
        for (let p = 0; p < bpb && !gd.noHat; p += 0.5) {
            if (p >= fillFrom) break;
            const open = p === aPos && rng() < 0.2 * dens;
            dr(p, open ? 'ohat' : 'hat', Number.isInteger(p) ? 0.5 : 0.32);
        }
        gd.kick.forEach(([p, v]) => { if (p < fillFrom) dr(p, 'kick', v); });
        (m % 2 === 0 ? gd.rimA : gd.rimB).forEach(p => { if (p < fillFrom) dr(p, 'rim', gd.rimVel || 0.55); });
        if (doFill) fillDrums('latin');
        env.state.meterVoice = lastKey ? { key: lastKey, v: lastV } : null;
        return { piano, bass, drums, guitar: true };
    }

    // ------------------------------------------------------------------ CLASSIQUE (piano seul)
    anticip = false;
    const off = env.transOffset;
    const fam = ph.family || 'roll';
    const gvc = (0.7 + 0.32 * I) * (0.94 + 0.06 * prog);
    const holdOn = !(isLastMeasureOfStep && nextStep && !sameChord(lastSeg.cs, nextStep)) && !!nextStep;
    const pcls = (arr, k) => arr[k % arr.length];
    const mutate = (slots) => { // même idée que _clsMutate, bornée à la longueur de la mesure
        const o = slots.slice();
        const r = rng();
        if (r < 0.4 && o.length > 3) {
            const k = 1 + Math.floor(rng() * (o.length - 2));
            const t = o[k]; o[k] = o[k + 1]; o[k + 1] = t;
        } else if (r < 0.7 && o.length > 3) {
            const odd = []; for (let k = 1; k < o.length; k += 2) odd.push(k);
            o[pick(odd)] = null;
        } else {
            const k = 1 + Math.floor(rng() * (o.length - 1));
            if (o[k] !== null) o[k] = Math.max(0, Math.min(3, o[k] + (rng() < 0.5 ? -1 : 1)));
        }
        return o;
    };
    const ev = [];
    segs.forEach((sg, si) => {
        const len = sg.e - sg.s;
        const V = clsVoicing(env, sg.cs, off);
        const n = V.length;
        if (!n) return;
        const note = (k) => k < n ? V[k] : V[k - n] + 12;
        const low = clsLowNote(env, sg.cs, off);
        const slash = Number.isInteger(sg.cs.bassRootIndex);
        const lastOne = si === segs.length - 1;
        const endPos = sg.e + ((lastOne && holdOn) ? 1.2 : 0.05);
        const ring = (pos, max) => Math.max(0.2, Math.min(endPos - pos, max));
        const rel = (p) => sg.s + p;
        const push = (pos, max, notes, vel, roll) => {
            const sorted = notes.slice().sort((a, b) => a - b).filter((x, k, arr) => k === 0 || x !== arr[k - 1]);
            const c = sorted.length;
            ev.push({
                pos, dur: ring(pos, max), vel: Math.max(0.12, Math.min(1, vel * gvc)),
                rootIndex: 0, intervals: sorted,
                noteVels: sorted.map((_, k) => c === 1 ? 1 : (k === c - 1 ? 1 : (k === 0 ? 0.9 : 0.84))),
                roll: c > 1 ? (roll !== undefined ? roll : 0.012 + rng() * 0.012) : 0,
                lay: rng() * 0.008, wide: true, gainMul: 1.2 // piano seul : pas de basse ni de batterie, on compense le niveau
            });
        };
        const eightVel = (k, v) => (k === 0 ? 0.76 : (k % 2 === 0 ? 0.58 : 0.47)) + (v === n - 1 ? 0.05 : 0);
        const quarterVel = [0.76, 0.54, 0.64];
        const bassFam = fam === 'bassup';
        const waltz = bpb === 3 && fam === 'quarter' && mx.waltz;
        if (slash || bassFam || (ph.bassLow && fam !== 'blockarp' && !waltz)) push(rel(0), 2.2, [low], bassFam ? 0.68 : 0.6);

        let items = [];
        if (fam === 'roll') {
            const baseS = pcls(lib.eights, mx.eightIdx), altS = pcls(lib.eights, mx.eightAlt);
            let slots = i % 2 === 1 ? (rng() < 0.5 ? baseS : altS) : baseS;
            if (i >= 2) slots = mutate(rng() < 0.5 ? altS : baseS);
            slots.slice(0, len * 2).forEach((v, k) => { if (v !== null) items.push({ pos: k * 0.5, v, vel: eightVel(k, v), max: 2.1 }); });
        } else if (fam === 'quarter') {
            if (waltz) { // « oom-pah-pah » : basse puis deux accords légers
                items.push({ pos: 0, v: 0, vel: 0.76, max: 2.2 });
                [1, 2].forEach(p => { if (p < len) items.push({ pos: p, block: 'up', vel: p === 1 ? 0.5 : 0.56, max: 1.8 }); });
            } else {
                const pat = pcls(lib.quarters, (i === 1 && rng() < 0.5) || i === 2 ? mx.quarterAlt : mx.quarterIdx);
                pat.slice(0, len).forEach((v, k) => items.push({ pos: k, v, vel: quarterVel[k] || 0.54, max: 2.2 }));
            }
        } else if (fam === 'mixed') {
            const pat = pcls(lib.mixed, (i === 1 && rng() < 0.5) || i === 2 ? mx.mixedAlt : mx.mixedIdx);
            pat.filter(([pos]) => pos < len).forEach(([pos, v]) => items.push({ pos, v, vel: pos === 0 ? 0.76 : (Number.isInteger(pos) ? 0.6 : 0.5), max: 2.0 }));
        } else if (fam === 'bassup') {
            const up = pcls(lib.upper, i === 2 ? mx.upperAlt : mx.upperIdx);
            up.forEach((v, k) => { const pos = 0.5 + k * 0.5; if (pos < len) items.push({ pos, v, vel: (k % 2 === 1 ? 0.55 : 0.47) + (v === 3 ? 0.04 : 0), max: 1.9 }); });
        } else { // blockarp : accord doux sur le 1, puis arpège sur la suite de la mesure
            items.push({ pos: 0, block: true, vel: 0.62, max: len + 0.4 });
            const tail = pcls(lib.tail, i);
            const ts = len >= 3 ? 1.5 : 1;
            tail.forEach((v, k) => { const pos = ts + k * 0.5; if (pos < len) items.push({ pos, v, vel: k === 0 ? 0.56 : 0.5, max: 1.7 }); });
        }
        // Dernière mesure de la phrase : le motif se « referme » (moins de notes, note aiguë tenue ou accord doux)
        if (isTurn && L > 1 && ph.endingOn && lastOne && len >= 2) {
            items = items.filter(it => it.pos < len - 1);
            if (ph.ending === 0) items.push({ pos: len - 1, v: n - 1, vel: 0.62, max: 2.6 });
            else items.push({ pos: len - 1, block: true, vel: 0.5, max: 2.4 });
        }
        items.forEach(it => {
            if (it.block === 'up') push(rel(it.pos), it.max, V.length > 2 ? V.slice(1) : V, it.vel);
            else if (it.block) push(rel(it.pos), it.max, V, it.vel);
            else push(rel(it.pos), it.max, [note(it.v)], it.vel);
        });
    });
    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { meterPhraseExtras, buildMeterPlan };
}
