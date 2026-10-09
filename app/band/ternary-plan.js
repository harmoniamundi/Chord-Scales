// band/ternary-plan.js — orchestre piano / basse / batterie des mesures ternaires (6/8, 9/8, 12/8) de la jam.
// Chargé par index.html via <script src="band/ternary-plan.js"> (après band-patterns.js et band/band-helpers.js)
// et testé par band/ternary-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat   temps après lequel une mesure à deux accords change d'accord
//   env.meterKey    signature courante ('2/4', '3/4', '6/8', '9/8', '12/8'…) : choisit la bibliothèque de patterns
//   env.state       mémoire entre deux mesures, modifiée en place : meterVoice, bandLastFill

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof popBassApproach === 'undefined' && typeof require === 'function') {
    var { popBassApproach, popBassTones, popVoicing, latBassTones, latThumb, latDetach, bassNear,
        swingPos, pickWeighted, patternLib, pianoHitIntervals, clsVoicing, clsLowNote } = require('./band-helpers.js');
}
// Tables : globales en navigateur (theory.js, band-patterns.js), à charger sous Node.
const TERN_PAT = (typeof LAT_VOICE_RANGE !== 'undefined') ? { LAT_VOICE_RANGE } : require('../band-patterns.js');
const TERN_SCALES = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

// Choix propres aux mesures composées, faits une fois par phrase.
function ternaryPhraseExtras(bpb, style, lib, ph, rng) {
    const idx = (n) => Math.floor(rng() * n);
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.3 + 0.6 * (typeof ph.density === 'number' ? ph.density : 0.5);
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    const byDensity = (list) => pickW(list.map((c, k) => [k, 0.25 + 1.6 * Math.max(0, 1 - Math.abs(c.d - I) * 2)]));
    const kinds = bpb === 2 ? ['H'] : (bpb === 3 ? ['H', 'P'] : ['H', 'H']);
    const mx = { I, kinds, bassIdx: idx(2), bassAlt: idx(2) };
    const wp = (list) => pickWeighted(list, rng);
    if (style === 'swing') {
        mx.motif = kinds.map(k => wp(lib[k]).hits);
        mx.alt = kinds.map(k => wp(lib[k]).hits);
        mx.second = rng() < 0.5 ? mx.motif : mx.alt;
        mx.turn = kinds.map(k => wp(lib[k + 'turn']).hits);
        mx.rideVar = pickW([[0, 3], [1, 1.5], [2, I > 0.6 ? 2.5 : 0.7]]);
    } else if (style === 'pop') {
        // les accords en triolets (doo-wop) sont la signature du 12/8
        const boost = (list) => list.map(c => ({ w: c.w * (c.trip ? (bpb === 4 ? 3 : (I > 0.5 ? 1.5 : 0.6)) : 1), hits: c.hits }));
        mx.comp = kinds.map(k => wp(boost(lib.comp[k])).hits);
        mx.compAlt = kinds.map(k => wp(boost(lib.comp[k])).hits);
        mx.arp = kinds.map(k => idx(lib.arp[k].length));
        mx.drumKey = pickW(I < 0.4 ? [['ballad', 3], ['back', 1]] : (I < 0.7 ? [['back', 3], ['ballad', 1], ['drive', 1]] : [['drive', 3], ['back', 2]]));
    } else if (style === 'latin') {
        const g = lib[ph.groove] ? ph.groove : 'bossa';
        mx.g = g;
        mx.cellIdx = byDensity(lib[g]);
        mx.bassIdx = idx(lib.bassCells[g].H.length);
        mx.bassAlt = idx(lib.bassCells[g].H.length);
    } else if (style === 'classic') {
        const pk = (src) => kinds.map(k => idx(src[k].length));
        mx.eight = pk(lib.eights); mx.eightAlt = pk(lib.eights);
        mx.mixed = pk(lib.mixed); mx.mixedAlt = pk(lib.mixed);
        mx.upper = pk(lib.upper); mx.upperAlt = pk(lib.upper);
        mx.tail = pk(lib.tail);
        mx.pulseBlock = rng() < 0.6; // « basse puis accord » plutôt que des notes seules
    }
    return mx;
}

function buildTernaryPlan(env, bpb, style, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const lib = patternLib(env.meterKey, style);
    if (!ph.mx) ph.mx = ternaryPhraseExtras(bpb, style, lib, ph, rng);
    const mx = ph.mx;
    const kinds = mx.kinds;
    const q = (e) => e / 3;                       // croche -> pulsations
    const E = bpb * 3;                            // croches dans la mesure
    const dens = typeof ph.density === 'number' ? ph.density : 0.6;
    const I = mx.I;
    const prog = L > 1 ? i / (L - 1) : 0;
    const splitAt = env.splitBeat;
    const aPos = bpb - 1 / 3;                     // dernière croche : l'accord suivant peut y être annoncé
    const eps = 1e-6;
    const unitStart = kinds.map((k, n) => kinds.slice(0, n).reduce((a, kk) => a + (kk === 'H' ? 6 : 3), 0));
    const unitLen = kinds.map(k => k === 'H' ? 6 : 3);
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
    const segAt = (pos) => (halves && pos >= splitAt - eps) ? 1 : 0;
    const doFill = isTurn && !!ph.fill;
    const fillFrom = doFill ? bpb - 1 : 99;
    const fk = (ph.fillKind || 0) % 2;
    const piano = [], bass = [], drums = [];
    const dr = (pos, drum, vel) => { if (pos < bpb - eps) drums.push({ pos, drum, vel }); };
    const de = (e, drum, vel) => dr(q(e), drum, vel);
    let anticip = false;
    const csAt = (pos) => (anticip && pos >= aPos - eps) ? nextStep : segs[segAt(pos)].cs;
    const endOf = (pos) => {
        if (anticip && pos >= aPos - eps) return bpb + 0.9;
        if (halves && pos < splitAt - eps) return splitAt + 0.05;
        return anticip ? aPos + 0.05 : bpb + 0.05;
    };
    const dropFrom = (arr, p) => { for (let k = arr.length - 1; k >= 0; k--) if (arr[k].pos >= p - eps) arr.splice(k, 1); };

    if (i === 0 && env.state.bandLastFill) {
        if (rng() < 0.6) dr(0, 'crash', 0.9);
        env.state.bandLastFill = false;
    }
    if (isTurn) env.state.bandLastFill = doFill;

    const finishBass = () => {
        bass.sort((a, b) => a.pos - b.pos);
        bass.forEach((b, k) => {
            const nx = bass[k + 1];
            const limit = nx ? nx.pos - b.pos + 0.03 : (b.tok === 'N' ? 1.2 : bpb - b.pos - 0.03);
            b.dur = Math.max(0.12, Math.min(b.dur, limit));
        });
    };
    // Chaque accord d'une mesure à deux accords doit avoir une attaque à son début.
    const ensureSegStarts = (arr, make) => {
        segs.forEach(sg => {
            const hi = anticip ? Math.min(sg.e, aPos) : sg.e;
            if (!arr.some(h => q(h[0]) >= sg.s - eps && q(h[0]) < hi - eps)) arr.push(make(sg));
        });
    };

    const vRange = style === 'latin' ? TERN_PAT.LAT_VOICE_RANGE : undefined;
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
    // Variation d'une cellule (en croches) : une frappe décalée, une frappe retirée, ou une note légère ajoutée.
    const varyT = (hits, len) => {
        const out = hits.map(h => h.slice());
        const r = rng();
        if (r < 0.35 && out.length > 1) {
            const h = pick(out);
            const ne = h[0] + (rng() < 0.5 ? -1 : 1);
            if (ne >= 0 && ne < len && !out.some(o => o[0] === ne)) h[0] = ne;
        } else if (r < 0.55 && out.length > 2) {
            out.splice(Math.floor(rng() * out.length), 1);
        } else if (r < 0.9) {
            const free = [];
            for (let e = 1; e < len; e++) if (!out.some(o => o[0] === e)) free.push(e);
            if (free.length) out.push([pick(free), 1, 'N', 0.6]);
        }
        return out.sort((a, b) => a[0] - b[0]);
    };
    const fillDrums = (kind) => {
        const b = bpb - 1;
        if (kind === 'swing') {
            if (fk === 0) { dr(b, 'snare', 0.5); dr(b + 1 / 3, 'tom1', 0.6); dr(b + 2 / 3, 'tom3', 0.72); }
            else { dr(b, 'snare', 0.5); dr(b + 2 / 3, 'snare', 0.7); dr(b + 2 / 3, 'kick', 0.6); }
        } else if (kind === 'pop') {
            const seq = fk === 0 ? ['snare', 'tom1', 'tom3'] : ['snare', 'snare', 'snare'];
            [0.5, 0.65, 0.82].forEach((v, k) => dr(b + k / 3, seq[k], v));
        } else {
            if (fk === 0) { dr(b, 'tom1', 0.5); dr(b + 1 / 3, 'tom2', 0.62); dr(b + 2 / 3, 'tom3', 0.74); }
            else { dr(b, 'rim', 0.55); dr(b + 1 / 3, 'rim', 0.5); dr(b + 2 / 3, 'snare', 0.55); }
        }
    };
    // Cellule de l'unité k pour cette mesure (motif, réponse, variation, ou fin de phrase sur la dernière unité)
    const cellFor = (k) => {
        if (isTurn && k === kinds.length - 1) return mx.turn[k];
        if (i === 0) return mx.motif[k];
        if (i === 1) return mx.second[k];
        return varyT(mx.motif[k], unitLen[k]);
    };

    // ------------------------------------------------------------------ SWING
    if (style === 'swing') {
        const anticipOK = isLastMeasureOfStep && !!nextStep;
        const chordFor = (pos) => (anticipOK && pos >= aPos - eps) ? nextStep : segs[segAt(pos)].cs;
        const pcell = [];
        kinds.forEach((kd, k) => cellFor(k).forEach(h => pcell.push([unitStart[k] + h[0], h[1], h[2], h[3]])));
        pcell.sort((a, b) => a[0] - b[0]);
        if (halves) {
            segs.forEach(sg => {
                const hi = anticipOK ? Math.min(sg.e, aPos) : sg.e;
                if (!pcell.some(h => q(h[0]) >= sg.s - eps && q(h[0]) < hi - eps)) pcell.push([sg.s * 3, 4, 'C', 0.75]);
            });
            pcell.sort((a, b) => a[0] - b[0]);
        }
        const tension = 0.92 + 0.08 * prog;
        pcell.forEach((h, k) => {
            const [e, dur, kind, vel] = h;
            const pos = q(e);
            const cs = chordFor(pos);
            const anticipated = anticipOK && pos >= aPos - eps;
            const nextPos = k + 1 < pcell.length ? q(pcell[k + 1][0]) : bpb;
            let room = anticipated ? (bpb - pos + 0.6) : Math.max(0.2, nextPos - pos + 0.15);
            if (halves && pos < splitAt - eps) room = Math.min(room, Math.max(0.15, splitAt - pos));
            piano.push({
                pos, dur: Math.min(q(dur), room), vel: Math.min(1, vel * tension),
                rootIndex: cs.rootIndex,
                intervals: pianoHitIntervals(env.findChordObj(cs.chordId), kind, ph.voicing, rng)
            });
        });

        // Basse : une note par pulsation (marche), avec croche de passage chromatique ; approche de l'accord suivant.
        const tonesOf = (c) => {
            const t = env.findChordObj(c.chordId).notes, rt = c.rootIndex;
            const sc = (TERN_SCALES[c.scaleId] && TERN_SCALES[c.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
            return {
                root: bassNear(env, c),
                second: rt + (sc[1] !== undefined ? sc[1] : 2),
                third: rt + (t[1] !== undefined ? t[1] : 4),
                fifth: rt + (t[2] !== undefined ? t[2] : 7),
                seventh: rt + (t[3] !== undefined ? t[3] : 12)
            };
        };
        segs.forEach((sg, si) => {
            const T = tonesOf(sg.cs);
            const follow = followOf(si);
            const n = sg.e - sg.s;
            let approach = null;
            if (follow) {
                const target = bassNear(env, follow);
                approach = pc(target) === pc(T.root) && n > 1 ? null : target + (rng() < 0.65 ? -1 : 1);
            }
            const walk = [];
            let prev = T.root;
            for (let j = 0; j < n; j++) {
                let abs;
                if (j === 0) abs = T.root;
                else if (j === n - 1 && approach !== null) abs = approach;
                else {
                    const c = [T.third, T.fifth, T.seventh, T.second].filter(x => x !== prev);
                    abs = pick(c.length ? c : [T.fifth]);
                }
                walk.push({ pos: sg.s + j, abs, dur: 0.95, vel: j === 0 ? 0.95 : 0.82 });
                prev = abs;
            }
            if (n === 1 && approach !== null) { // une seule pulsation : la fondamentale, puis une croche d'approche
                walk[0].dur = 0.6;
                walk.push({ pos: sg.e - 1 / 3, abs: approach, dur: 0.3, vel: 0.6 });
            } else {
                for (let j = 1; j < n - 1; j++) { // croche de passage chromatique vers la note suivante
                    if (rng() < 0.16) {
                        walk[j].dur = 0.62;
                        const nxt = walk[j + 1].abs;
                        walk.push({ pos: walk[j].pos + 2 / 3, abs: nxt + (nxt > walk[j].abs ? -1 : 1), dur: 0.3, vel: 0.55 });
                    }
                }
            }
            walk.forEach(w => bass.push(w));
        });
        finishBass();

        // Batterie : ride aux pulsations avec « a » (la troisième croche), pédale, plume ; variantes par phrase.
        const rideAt = [];
        for (let p = 0; p < bpb; p++) {
            rideAt.push([p, p === 0 ? 0.62 : 0.5]);
            if (mx.rideVar === 1 || (mx.rideVar === 0 && p % 2 === 1)) rideAt.push([p + 2 / 3, 0.36]);
            if (mx.rideVar === 2) { rideAt.push([p + 1 / 3, 0.3]); rideAt.push([p + 2 / 3, 0.38]); }
        }
        rideAt.forEach(([p, v]) => { if (p < fillFrom) dr(p, 'ride', v); });
        for (let p = 1; p < bpb; p++) if ((bpb === 3 || p % 2 === 1) && p < fillFrom) dr(p, 'pedal', 0.5);
        if (ph.feather) { for (let p = 0; p < bpb; p++) if (p < fillFrom) dr(p, 'kick', 0.16 + rng() * 0.06); }
        else dr(0, 'kick', 0.35);
        piano.filter(e => Math.abs(e.pos * 3 - Math.round(e.pos * 3)) < 0.01 && Math.abs(e.pos - Math.round(e.pos)) > 0.05 && e.pos < fillFrom).forEach(e => {
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
        const hits = []; // [croche, durée (croches), 'all' | 'upper' | 'note', vélocité, voix]
        if (pStyle === 'pad') {
            segs.forEach(sg => hits.push([sg.s * 3, (sg.e - sg.s) * 3 + 1, 'all', 0.62]));
            if (bpb >= 3 && !halves && rng() < 0.4) hits.push([6, 4, 'upper', 0.48]); // petite relance sur la troisième pulsation
        } else if (pStyle === 'ballad') {
            kinds.forEach((kd, k) => {
                const arp = lib.arp[kd][mx.arp[k] % lib.arp[kd].length];
                arp.forEach((v, j) => { if (v !== null) hits.push([unitStart[k] + j, 4, 'note', j === 0 ? 0.62 : (j % 3 === 0 ? 0.52 : 0.43), v]); });
            });
        } else {
            const useAlt = i > 0 && rng() > 0.6;
            kinds.forEach((kd, k) => (useAlt ? mx.compAlt : mx.comp)[k].forEach(h => hits.push([unitStart[k] + h[0], h[1], h[3], h[2]])));
        }
        ensureSegStarts(hits, sg => [sg.s * 3, 3, 'all', 0.7]);
        hits.sort((a, b) => a[0] - b[0]);
        const addPianoHits = () => hits.forEach(([e, d, part, v, vo]) => {
            const cs = csAt(q(e));
            const V = voiceFor(cs);
            if (!V.length) return;
            const n = V.length;
            let notes;
            if (part === 'note') notes = [V[Math.min(vo, n - 1)]];
            else if (part === 'upper' && n > 2) notes = V.slice(1);
            else notes = V;
            piano.push(mkEv(q(e), q(d), notes, v * pv, part === 'all' && pStyle === 'pad' ? { roll: 0.016 + rng() * 0.012 } : null));
        });
        addPianoHits();
        if (anticip) {
            dropFrom(piano, aPos);
            const Vn = voiceFor(nextStep);
            if (Vn.length) piano.push(mkEv(aPos, 1.3, Vn, 0.62 * pv));
        }

        const bKey = lib.bassCells[ph.bassStyle] ? ph.bassStyle : 'dotted';
        const bh = [];
        kinds.forEach((kd, k) => {
            const cells = lib.bassCells[bKey][kd];
            const cell = cells[((i === 2 && rng() < 0.5) ? mx.bassAlt : mx.bassIdx) % cells.length];
            cell.forEach(([e, tok, d, v]) => bh.push([unitStart[k] + e, tok, d, v]));
        });
        ensureSegStarts(bh, sg => [sg.s * 3, 'R', 3, 0.85]);
        const segInfo = segs.map((sg, si) => {
            const Tn = popBassTones(env, sg.cs);
            const follow = followOf(si);
            return { Tn, approach: follow ? popBassApproach(env, Tn.root, follow, rng) : null };
        });
        bh.forEach(([e, tok, d, v]) => {
            const pos = q(e);
            const { Tn, approach } = segInfo[segAt(pos)];
            let abs;
            switch (tok) {
                case 'F': abs = Tn.fifth; break;
                case 'T': abs = Tn.third; break;
                case 'A': abs = approach !== null ? approach : Tn.fifth; break;
                default: abs = Tn.root;
            }
            bass.push({ pos, abs, dur: q(d), tok, vel: Math.min(1, v * (0.82 + 0.22 * I)), wide: true });
        });
        if (anticip) {
            dropFrom(bass, aPos);
            bass.push({ pos: aPos, abs: popBassTones(env, nextStep).root, dur: 1.2, tok: 'N', vel: 0.76 * (0.85 + 0.2 * I), wide: true });
        }
        finishBass();

        const gr = lib.drums[bpb][mx.drumKey] || lib.drums[bpb].back;
        for (let e = 0; e < E; e++) {
            const pos = q(e);
            if (pos >= fillFrom) break;
            if (gr.hat === 'p' && e % 3 !== 0) continue;
            const open = gr.hat === 'e' && e === E - 1 && rng() < 0.25 * dens;
            de(e, open ? 'ohat' : 'hat', e % 3 === 0 ? 0.6 : 0.38);
        }
        gr.kick.forEach(([e, v]) => { if (q(e) < fillFrom) de(e, 'kick', v); });
        gr.snare.forEach(([e, v, d]) => { if (q(e) < fillFrom) de(e, d, v); });
        bass.forEach(b => { // la grosse caisse se cale parfois sur les attaques de la basse
            if (b.pos > 0.2 && b.pos < fillFrom && Math.abs(b.pos * 3 - Math.round(b.pos * 3)) < 0.01
                && !gr.kick.some(k => Math.abs(q(k[0]) - b.pos) < 0.05) && rng() < 0.22 * I) dr(b.pos, 'kick', 0.55);
        });
        if (doFill) fillDrums('pop');
        env.state.meterVoice = lastKey ? { key: lastKey, v: lastV } : null;
        return { piano, bass, drums };
    }

    // ------------------------------------------------------------------ LATIN
    if (style === 'latin') {
        const g = mx.g || 'bossa';
        anticip = changeNext && (g === 'afro' || rng() < 0.4 + 0.35 * I);
        const gv = (0.74 + 0.3 * I) * (0.92 + 0.08 * prog);
        const defs = lib[g];
        const def = defs[Math.min(mx.cellIdx, defs.length - 1)];
        const gh = [];
        kinds.forEach((kd, k) => {
            const src = kd === 'H' ? (((m + k) % 2 === 0) ? def.A : (def.B || def.A)) : def.PA;
            src.forEach(h => gh.push([unitStart[k] + h[0], h[1], h[2], h[3]]));
        });
        if (i > 0) { // petite variation : une frappe légère retirée, ou un accord étouffé ajouté
            const r = rng();
            if (r < 0.3 * (1.1 - I) && gh.length > 3) {
                const idxs = gh.map((h, k) => k).filter(k => gh[k][2] === 'U' || gh[k][2] === 'X');
                if (idxs.length) gh.splice(idxs[Math.floor(rng() * idxs.length)], 1);
            } else if (r < 0.3 + 0.3 * I) {
                const taken = new Set(gh.map(h => h[0]));
                const free = [];
                for (let e = 1; e < E - 1; e++) if (!taken.has(e)) free.push(e);
                if (free.length) gh.push([pick(free), 1, 'X', 0.32]);
            }
        }
        { const fr = []; for (let e = 1; e < E; e++) fr.push(e);
          const gd2 = latDetach(gh, rng, I, g, { free: fr, u: 1, keep: segs.map(sg => sg.s * 3) });
          gh.length = 0; gd2.forEach(h => gh.push(h)); }
        ensureSegStarts(gh, sg => [sg.s * 3, 3, 'TC', 0.7]);
        gh.sort((a, b) => a[0] - b[0]);
        const mkG = (pos, d, kind, v) => {
            const cs = csAt(pos);
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
                default: {
                    const k = parseInt(kind.slice(1), 10) || 0;
                    notes = [V[Math.min(k, V.length - 1)]];
                }
            }
            notes = notes.slice().sort((a, b) => a - b).filter((n, k, arr) => k === 0 || n !== arr[k - 1]);
            const n = notes.length;
            return {
                pos,
                dur: Math.max(kind === 'X' ? 0.1 : 0.15, Math.min(q(d), endOf(pos) - pos)),
                vel: Math.max(0.1, Math.min(1, v * gv)),
                rootIndex: 0, intervals: notes,
                noteVels: notes.map((_, k) => n === 1 ? 1 : (k === 0 ? 1 : (k === n - 1 ? 0.9 : 0.78))),
                dir, roll: n > 1 ? roll : 0,
                lay: 0.002 + rng() * 0.01
            };
        };
        gh.forEach(([e, d, kind, v]) => { const ev = mkG(q(e), d, kind, v); if (ev) piano.push(ev); });
        if (anticip) {
            dropFrom(piano, aPos);
            const a = mkG(aPos, 4, rng() < 0.5 ? 'tC' : 'C', 0.62);
            if (a) piano.push(a);
        }
        piano.sort((a, b) => a.pos - b.pos);

        const bh = [];
        kinds.forEach((kd, k) => {
            const cells = lib.bassCells[g][kd];
            const cell = cells[((i === 2 && rng() < 0.5) ? mx.bassAlt : mx.bassIdx) % cells.length];
            cell.forEach(([e, tok, d, v]) => bh.push([unitStart[k] + e, tok, d, v]));
        });
        ensureSegStarts(bh, sg => [sg.s * 3, 'R', 3, 0.85]);
        const segInfo = segs.map((sg, si) => {
            const T = latBassTones(env, sg.cs);
            const follow = followOf(si);
            return { T, approach: follow ? popBassApproach(env, T.root, follow, rng) : null };
        });
        bh.forEach(([e, tok, d, v]) => {
            const pos = q(e);
            const { T, approach } = segInfo[segAt(pos)];
            let abs;
            switch (tok) {
                case 'F': abs = T.fifth; break;
                case 'T': abs = T.third; break;
                case 'O': abs = T.octave; break;
                case 'A': abs = approach !== null ? approach : T.fifth; break;
                default: abs = T.root;
            }
            bass.push({ pos, abs, dur: q(d), tok, vel: Math.min(1, v * (0.82 + 0.22 * I) * (0.92 + 0.08 * prog)), wide: true });
        });
        if (anticip) {
            dropFrom(bass, aPos);
            bass.push({ pos: aPos, abs: latBassTones(env, nextStep).root, dur: 1.2, tok: 'N', vel: 0.76 * (0.85 + 0.2 * I), wide: true });
        }
        finishBass();

        const gd = lib.drums[g];
        for (let e = 0; e < E; e++) {
            if (q(e) >= fillFrom) break;
            const open = e === E - 1 && rng() < 0.2 * dens;
            de(e, open ? 'ohat' : 'hat', e % 3 === 0 ? 0.5 : 0.3);
        }
        kinds.forEach((kd, k) => {
            const u0 = unitStart[k];
            const kicks = kd === 'H' ? gd.kickH : gd.kickP;
            const rims = kd === 'H' ? (((m + k) % 2 === 0) ? gd.rimHA : gd.rimHB) : gd.rimP;
            kicks.forEach(([e, v]) => { if (q(u0 + e) < fillFrom) de(u0 + e, 'kick', v); });
            rims.forEach(e => { if (q(u0 + e) < fillFrom) de(u0 + e, 'rim', 0.55); });
        });
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
    const vcache = {};
    const clsV = (cs) => { const key = cs.rootIndex + ':' + cs.chordId; return vcache[key] || (vcache[key] = clsVoicing(env, cs, off)); };
    const mutateT = (slots) => {
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
    const items = []; // { e (croche), v | block, vel, max (croches) }
    const bassFam = fam === 'bassup';
    segs.forEach(sg => {
        const cs = sg.cs;
        if (Number.isInteger(cs.bassRootIndex) || bassFam || (ph.bassLow && fam !== 'blockarp' && fam !== 'quarter')) {
            items.push({ e: sg.s * 3, low: true, vel: bassFam ? 0.68 : 0.6, max: 6 });
        }
    });
    kinds.forEach((kd, k) => {
        const u0 = unitStart[k], len = unitLen[k];
        const useAlt = (i === 1 && rng() < 0.5) || i === 2;
        if (fam === 'roll') {
            const baseS = lib.eights[kd][mx.eight[k] % lib.eights[kd].length], altS = lib.eights[kd][mx.eightAlt[k] % lib.eights[kd].length];
            let slots = i % 2 === 1 ? (rng() < 0.5 ? baseS : altS) : baseS;
            if (i >= 2) slots = mutateT(rng() < 0.5 ? altS : baseS);
            slots.forEach((v, j) => { if (v !== null) items.push({ e: u0 + j, v, vel: j === 0 ? 0.76 : (j % 3 === 0 ? 0.6 : 0.47), max: 6 }); });
        } else if (fam === 'quarter') { // une note ou un accord léger par pulsation
            items.push({ e: u0, v: kd === 'H' ? 0 : 1, vel: u0 === 0 ? 0.76 : 0.6, max: 6 });
            if (kd === 'H') items.push(mx.pulseBlock ? { e: u0 + 3, block: 'up', vel: 0.54, max: 5 } : { e: u0 + 3, v: 2, vel: 0.56, max: 5 });
        } else if (fam === 'mixed') {
            const pat = lib.mixed[kd][(useAlt ? mx.mixedAlt[k] : mx.mixed[k]) % lib.mixed[kd].length];
            pat.forEach(([e, v]) => items.push({ e: u0 + e, v, vel: e === 0 ? 0.76 : (e % 3 === 0 ? 0.6 : 0.5), max: 5 }));
        } else if (fam === 'bassup') {
            const up = lib.upper[kd][(i === 2 ? mx.upperAlt[k] : mx.upper[k]) % lib.upper[kd].length];
            if (k > 0) items.push({ e: u0, low: true, vel: 0.5, max: 5 });
            up.forEach((v, j) => items.push({ e: u0 + 1 + j, v, vel: (j % 2 === 1 ? 0.55 : 0.47) + (v === 3 ? 0.04 : 0), max: 5 }));
        } else { // blockarp
            items.push({ e: u0, block: true, vel: k === 0 ? 0.62 : 0.5, max: len + 1 });
            lib.tail[kd][mx.tail[k] % lib.tail[kd].length].forEach((v, j) => items.push({ e: u0 + 2 + j, v, vel: j === 0 ? 0.56 : 0.5, max: 5 }));
        }
    });
    segs.forEach(sg => { // chaque accord doit s'entendre
        if (!items.some(it => q(it.e) >= sg.s - eps && q(it.e) < sg.e - eps)) items.push({ e: sg.s * 3, block: true, vel: 0.6, max: 5 });
    });
    // Dernière mesure de la phrase : le motif se « referme » (moins de notes, note aiguë tenue ou accord doux)
    let cur = items;
    if (isTurn && L > 1 && ph.endingOn) {
        const lim = E - 3;
        cur = items.filter(it => it.e < lim);
        segs.forEach(sg => { if (!cur.some(it => q(it.e) >= sg.s - eps && q(it.e) < sg.e - eps)) cur.push({ e: sg.s * 3, block: true, vel: 0.55, max: 5 }); });
        if (ph.ending === 0) cur.push({ e: lim, v: 3, vel: 0.62, max: 9 });
        else cur.push({ e: lim, block: true, vel: 0.5, max: 8 });
    }
    const ev = [];
    cur.sort((a, b) => a.e - b.e).forEach(it => {
        const pos = q(it.e);
        const si = segAt(pos);
        const cs = segs[si].cs;
        const V = clsV(cs);
        const n = V.length;
        if (!n) return;
        const note = (kk) => kk < n ? V[kk] : V[kk - n] + 12;
        const lastOne = si === segs.length - 1;
        const endPos = segs[si].e + ((lastOne && holdOn) ? 1.2 : 0.05);
        const dur = Math.max(0.2, Math.min(endPos - pos, q(it.max) + 0.1));
        let notes;
        if (it.low) notes = [clsLowNote(env, cs, off)];
        else if (it.block === 'up') notes = n > 2 ? V.slice(1) : V;
        else if (it.block) notes = V;
        else notes = [note(it.v)];
        const sorted = notes.slice().sort((a, b) => a - b).filter((x, kk, arr) => kk === 0 || x !== arr[kk - 1]);
        const c = sorted.length;
        ev.push({
            pos, dur, vel: Math.max(0.12, Math.min(1, it.vel * gvc)),
            rootIndex: 0, intervals: sorted,
            noteVels: sorted.map((_, kk) => c === 1 ? 1 : (kk === c - 1 ? 1 : (kk === 0 ? 0.9 : 0.84))),
            roll: c > 1 ? 0.012 + rng() * 0.012 : 0,
            lay: rng() * 0.008, wide: true, gainMul: 1.2
        });
    });
    return { piano: ev, bass: [], drums: [] };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ternaryPhraseExtras, buildTernaryPlan };
}
