// band/pop-plan.js — orchestre piano / basse / batterie du style Pop de la jam. Chargé par index.html via
// <script src="band/pop-plan.js"> (après band-patterns.js et band/band-helpers.js) et testé par band/pop-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.state   mémoire entre deux mesures, modifiée en place : popVoice, popRunAt, bandLastFill
// Les fonctions du moteur sont appelées avec `env` en premier paramètre.

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof popBassTones === 'undefined' && typeof require === 'function') {
    var { popBassTones, popBassApproach, popLineNote, popRun, popVoicing, popSusVoicing } = require('./band-helpers.js');
}
// Tables rythmiques : globales en navigateur (band-patterns.js), à charger sous Node.
const POP_PAT = (typeof POP_BASS !== 'undefined')
    ? { POP_ARP, POP_BASS, POP_COMP }
    : require('../band-patterns.js');

// Caractère d'une phrase pop : énergie, instrumentation du piano / de la basse, feeling de batterie.
function popPhraseExtras(rng, prev, index) {
    const prevI = (prev && prev.style === 'pop' && typeof prev.intensity === 'number') ? prev.intensity : 0.5;
    let I = index === 0 ? 0.38 + rng() * 0.2 : prevI + (0.62 - prevI) * 0.25 + (rng() - 0.5) * 0.55;
    I = Math.max(0.25, Math.min(1, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    return {
        intensity: I,
        lift: index > 0 && I - prevI > 0.18,
        pianoStyle: pickW([['pad', I < 0.45 ? 3 : 0.6], ['ballad', I < 0.75 ? 3 : 1.5], ['comp', 1 + 3 * I]]),
        bassStyle: pickW([['long', I < 0.45 ? 3 : 0.6], ['melodic', 2], ['dotted', 1.5 + 2 * I], ['eighths', I > 0.62 ? 3 * I : 0.4]]),
        arpPattern: POP_PAT.POP_ARP[Math.floor(rng() * POP_PAT.POP_ARP.length)],
        compIdx: Math.floor(rng() * POP_PAT.POP_COMP.length),
        bassSeed: rng(),
        feel: I < 0.42 ? 'quarter' : (I < 0.72 ? 'eighths' : 'drive'),
        halfTime: I > 0.35 && I < 0.7 && rng() < 0.16,
        hat16: rng() < 0.35,
        fill: rng() < 0.55,
        fillKind: Math.floor(rng() * 4)
    };
}

function buildPopPlan(env, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const prog = L > 1 ? i / (L - 1) : 0;
    const pv = (0.7 + 0.36 * I) * (0.9 + 0.1 * prog); // échelle de vélocité du piano (crescendo dans la phrase)
    const segs = halves
        ? [{ s: 0, e: 2, cs: halves[0] }, { s: 2, e: 4, cs: halves[1] }]
        : [{ s: 0, e: 4, cs: step }];
    const lastSeg = segs[segs.length - 1];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    // Anticipation : la basse (et souvent le piano) joue l'accord suivant sur le « et » du temps 4
    const anticip = changeNext && rng() < 0.2 + 0.4 * I;

    // ---- conduite des voix : un voicing par accord, calculé dans l'ordre chronologique ----
    const cache = {};
    let lastV = env.state.popVoice ? env.state.popVoice.v : null;
    let lastKey = env.state.popVoice ? env.state.popVoice.key : null;
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        const v = (env.state.popVoice && env.state.popVoice.key === key) ? env.state.popVoice.v : popVoicing(env, cs, lastV);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const peekVoice = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        if (env.state.popVoice && env.state.popVoice.key === key) return env.state.popVoice.v;
        return popVoicing(env, cs, lastV);
    };

    // ---- piano ----
    const piano = [];
    const csAtPos = (pos) => (anticip && pos >= 3.5) ? nextStep : (halves && pos >= 2 ? segs[1].cs : segs[0].cs);
    // Fin de tenue d'une note : le changement d'accord coupe la « pédale » ; sinon la note résonne jusqu'à la fin
    const endOf = (pos) => {
        if (anticip && pos >= 3.5) return 4.9;
        if (halves && pos < 2) return 2.05;
        return anticip ? 3.55 : 4.05;
    };
    const mk = (pos, dur, notes, vel, roll) => {
        const n = notes.length;
        return {
            pos,
            dur: Math.max(0.15, Math.min(dur, endOf(pos) - pos)),
            vel: Math.max(0.1, Math.min(1, vel)),
            rootIndex: 0, intervals: notes,
            noteVels: notes.map((_, k) => n === 1 ? 1 : (k === n - 1 ? 1.1 : (k === 0 ? 0.8 : 0.9))),
            roll: n > 1 ? (roll !== undefined ? roll : 0.008 + rng() * 0.014) : 0,
            lay: 0.003 + rng() * 0.012,
            wide: true
        };
    };
    const hit = (pos, maxDur, vel, part) => {
        const V = voiceFor(csAtPos(pos));
        if (!V.length) return;
        piano.push(mk(pos, maxDur, (part === 'upper' && V.length > 2) ? V.slice(1) : V, vel * pv));
    };
    const dropFrom = (p) => {
        for (let k = piano.length - 1; k >= 0; k--) if (piano[k].pos >= p - 1e-6) piano.splice(k, 1);
    };

    const ps = ph.pianoStyle;
    let susUsed = false;
    if (ps === 'pad') {
        // Nappe : accord tenu, ré-attaque douce à mi-mesure, parfois retard sus4 → 3 et note de couleur conjointe
        segs.forEach(sg => {
            const len = sg.e - sg.s;
            const V0 = voiceFor(sg.cs);
            if (!V0.length) return;
            const upper = V0.length > 2 ? V0.slice(1) : V0;
            const sus = (len >= 4 && !isTurn && rng() < 0.3) ? popSusVoicing(env, sg.cs, V0) : null;
            if (sus) {
                susUsed = true;
                const rp = sg.s + (rng() < 0.5 ? 1.5 : 2);
                piano.push(mk(sg.s, rp - sg.s + 0.1, sus.sus, 0.66 * pv));
                piano.push(mk(rp, 4, sus.resolved, 0.5 * pv)); // résolution : la tierce arrive
            } else {
                piano.push(mk(sg.s, 4, V0, 0.62 * pv));
                if (len >= 4 && rng() < 0.5) piano.push(mk(sg.s + 2, 4, upper, 0.4 * pv));
            }
            if (len >= 4 && rng() < 0.45) {
                const p = rng() < 0.5 ? 2.5 : 3;
                const n = popLineNote(env, sg.cs, V0[V0.length - 1], rng, 0);
                piano.push(mk(p, 0.9, [n], 0.5 * pv));
            }
        });
    } else if (ps === 'ballad') {
        // Arpège lié : toutes les notes résonnent jusqu'au changement d'accord (effet de pédale),
        // accents sur les temps, respirations, voix aiguë légèrement en avant
        const pat = ph.arpPattern;
        segs.forEach(sg => {
            const V = voiceFor(sg.cs);
            if (!V.length) return;
            const n = V.length;
            const steps = Math.round((sg.e - sg.s) * 2);
            for (let k = 0; k < steps; k++) {
                const idx = pat[k % 8];
                if (idx === null || idx === undefined) continue;
                if (k % 2 === 1 && rng() < 0.06 + 0.1 * (1 - I)) continue;
                const note = V[idx % n] + (idx >= n ? 12 : 0);
                const strong = k % 4 === 0 ? 0.66 : (k % 2 === 0 ? 0.52 : 0.44);
                piano.push(mk(sg.s + k * 0.5, 4, [note], (strong + (idx % n === n - 1 ? 0.05 : 0)) * pv));
            }
        });
    } else {
        // Comping syncopé : accords complets et voix aiguës en alternance, durées liées au rythme
        segs.forEach(sg => {
            let idx = ph.compIdx;
            if (i > 0 && rng() > 0.6) idx = (ph.compIdx + 1 + Math.floor(rng() * (POP_PAT.POP_COMP.length - 1))) % POP_PAT.POP_COMP.length;
            const tpl = POP_PAT.POP_COMP[idx].filter(h => (sg.e - sg.s) >= 4 || h[0] < 2);
            tpl.forEach(([p, d, v, part], k) => {
                if (k > 0 && part === 'upper' && rng() < 0.15 * (1 - I)) return;
                hit(sg.s + p, d * 1.25, v, part);
            });
        });
        // Note de « chant » conjointe sur un temps libre
        if (!halves && rng() < 0.3 + 0.35 * I) {
            const cand = [0.5, 1, 1.5, 2.5, 3].filter(p => piano.every(e => Math.abs(e.pos - p) >= 0.49));
            if (cand.length) {
                const p = cand[Math.floor(rng() * cand.length)];
                const V = voiceFor(step);
                if (V.length) piano.push(mk(p, 0.45, [popLineNote(env, step, V[V.length - 1], rng, 0)], 0.46 * pv));
            }
        }
    }

    // Petite phrase mélodique conjointe qui amène l'accord suivant (fin de phrase ou changement d'accord)
    let ran = false;
    if (!susUsed && env.state.popRunAt !== m - 1 && (isTurn || changeNext) && rng() < (isTurn ? 0.42 : 0.2) * (0.55 + 0.6 * I)) {
        const fromV = voiceFor(lastSeg.cs);
        const tcs = changeNext ? nextStep : lastSeg.cs;
        const tV = changeNext ? peekVoice(nextStep) : fromV;
        if (fromV.length && tV.length) {
            const count = rng() < 0.5 ? 3 : 4;
            const sixteenth = count === 4 && rng() < 0.5;
            const startPos = sixteenth ? 3 : 4 - count * 0.5;
            const notes = popRun(env, tcs, fromV[fromV.length - 1], tV[tV.length - 1], count);
            if (notes.length === count) {
                dropFrom(startPos);
                piano.forEach(e => { if (e.pos < startPos) e.dur = Math.min(e.dur, startPos - e.pos + 0.1); });
                const sl = sixteenth ? 0.25 : 0.5;
                notes.forEach((n, k) => piano.push(mk(startPos + k * sl, k === count - 1 ? sl * 1.4 : sl * 1.1, [n], (0.42 + 0.3 * (k / (count - 1))) * pv)));
                ran = true;
                env.state.popRunAt = m;
            }
        }
    }
    if (anticip && !ran && (ps !== 'ballad' || rng() < 0.4)) {
        dropFrom(3.5);
        hit(3.5, 1.4, 0.6, 'all');
    }
    piano.sort((a, b) => a.pos - b.pos);

    // ---- basse ----
    const bass = [];
    const tpls = POP_PAT.POP_BASS[ph.bassStyle];
    const tplIdx = (i === 0 || rng() < 0.6) ? Math.floor(ph.bassSeed * tpls.length) : Math.floor(rng() * tpls.length);
    segs.forEach((sg, si) => {
        const T = popBassTones(env, sg.cs);
        const len = sg.e - sg.s;
        const follow = si < segs.length - 1 ? segs[si + 1].cs : (changeNext ? nextStep : null);
        const approach = follow ? popBassApproach(env, T.root, follow, rng) : null;
        const resolve = (tok) => {
            switch (tok) {
                case 'F': return T.fifth;
                case 'T': return T.third;
                case '7': return T.seventh;
                case 'O': return T.octave;
                case 'A': return approach !== null ? approach : (rng() < 0.5 ? T.fifth : T.root);
                default: return T.root;
            }
        };
        const tpl = len >= 4
            ? tpls[tplIdx]
            : [[0, 'R', 1.9, 0.86]].concat(follow && rng() < 0.5 ? [[1.5, 'A', 0.45, 0.64]] : []);
        tpl.forEach(([p, tok, d, v], k) => {
            if (ph.bassStyle === 'eighths' && len >= 4 && k % 2 === 1 && rng() < 0.4 * (1 - I) + 0.05) return;
            let abs = resolve(tok);
            const prevB = bass[bass.length - 1];
            if (tok === 'A' && follow && prevB && prevB.abs === abs) { // pas de note répétée avant la liaison
                for (let t = 0; t < 4 && abs === prevB.abs; t++) abs = popBassApproach(env, T.root, follow, rng);
                if (abs === prevB.abs) abs = T.fifth;
            }
            bass.push({
                pos: sg.s + p, abs, dur: d, tok,
                vel: Math.min(1, v * (0.8 + 0.25 * I) * (0.92 + 0.08 * prog)), wide: true
            });
        });
    });
    if (anticip) {
        for (let k = bass.length - 1; k >= 0; k--) if (bass[k].pos >= 3.5 - 1e-6) bass.splice(k, 1);
        bass.push({ pos: 3.5, abs: popBassTones(env, nextStep).root, dur: 1.2, tok: 'nR', vel: 0.74 * (0.85 + 0.2 * I), wide: true });
    }
    bass.sort((a, b) => a.pos - b.pos);
    // Legato : une note de basse tient jusqu'à la suivante (sans chevauchement notable)
    bass.forEach((b, k) => {
        const nx = bass[k + 1];
        const limit = nx ? nx.pos - b.pos + 0.03 : (b.tok === 'nR' ? 1.2 : 4 - b.pos - 0.03);
        b.dur = Math.max(0.12, Math.min(b.dur, limit));
    });

    const drums = buildPopDrums(env, ph, i, L, isTurn, bass, rng, I);
    env.state.popVoice = lastKey ? { key: lastKey, v: lastV } : null;
    return { piano, bass, drums };
}

// Batterie pop : feeling choisi par phrase (noires douces + cross-stick / croches / drive), dynamique qui
// monte dans la phrase, grosse caisse calée sur la basse, fantômes, demi-tempo, quatre types de fills.
function buildPopDrums(env, ph, i, L, isTurn, bass, rng, I) {
    const d = [];
    const prog = L > 1 ? i / (L - 1) : 0;
    const dv = (0.7 + 0.35 * I) * (0.9 + 0.1 * prog);
    const doFill = isTurn && ph.fill;
    const kind = ph.fillKind;
    const fillFrom = doFill ? (kind === 2 ? 2.5 : 3) : 99;
    const add = (pos, drum, vel) => d.push({
        pos, drum,
        vel: Math.max(0.06, Math.min(1, vel * dv)),
        lay: (drum === 'snare' || drum === 'rim') ? 0.006 : 0
    });
    const jit = () => (rng() - 0.5) * 0.08;

    if (i === 0) {
        const want = env.state.bandLastFill ? 0.7 : (ph.lift ? 0.5 : 0);
        if (want && rng() < want) add(0, 'crash', 0.85);
        env.state.bandLastFill = false;
    }
    if (isTurn) env.state.bandLastFill = doFill;

    const feel = ph.feel;
    const half = !!ph.halfTime;
    if (feel === 'quarter') {
        [0, 1, 2, 3].forEach(p => { if (p < fillFrom) add(p, 'hat', [0.5, 0.34, 0.44, 0.34][p] + jit()); });
        [0.5, 1.5, 2.5, 3.5].forEach(p => { if (p < fillFrom && rng() < 0.2) add(p, 'hat', 0.2 + rng() * 0.05); });
    } else {
        const HC = feel === 'drive'
            ? [0.66, 0.4, 0.55, 0.42, 0.62, 0.4, 0.55, 0.44]
            : [0.58, 0.32, 0.46, 0.34, 0.54, 0.32, 0.46, 0.36];
        for (let k = 0; k < 8; k++) {
            const p = k * 0.5;
            if (p >= fillFrom) break;
            if (k % 2 === 1 && rng() < 0.07) continue; // petit trou : le charleston respire
            const open = (p === 3.5 && rng() < 0.18 + 0.25 * I) || (feel === 'drive' && p === 1.5 && rng() < 0.12);
            add(p, open ? 'ohat' : 'hat', HC[k] + jit());
        }
        if (feel === 'drive' && ph.hat16) {
            for (let p = 0.25; p < 4; p += 0.5) if (p < fillFrom && rng() < 0.7) add(p, 'hat', 0.16 + rng() * 0.06);
        }
    }

    const useRim = feel === 'quarter' && rng() < 0.75;
    (half ? [2] : [1, 3]).filter(p => p < fillFrom)
        .forEach(p => add(p, useRim ? 'rim' : 'snare', (p === 3 ? 0.88 : 0.84) + (rng() - 0.5) * 0.1));
    if (!useRim && I > 0.55 && rng() < 0.4) {
        const gp = half ? 1.75 : [0.75, 2.75][Math.floor(rng() * 2)];
        if (gp < fillFrom) add(gp, 'ghost', 0.42 + rng() * 0.08);
    }

    // Grosse caisse : toujours sur le 1, puis sur certaines attaques de fondamentale de la basse
    const kicks = [0];
    bass.forEach(b => {
        if (b.pos <= 0 || b.pos >= fillFrom) return;
        if (b.tok !== 'R' && b.tok !== 'nR' && b.tok !== 'O') return;
        if (!half && (b.pos === 1 || b.pos === 3)) return;
        if (half && b.pos === 2) return;
        const pK = (feel === 'quarter' ? 0.25 : 0.4) + 0.4 * I;
        if (b.tok === 'nR' ? rng() < 0.75 : rng() < pK) kicks.push(b.pos);
    });
    [...new Set(kicks)].sort((a, b) => a - b).slice(0, feel === 'quarter' ? 2 : 4)
        .forEach(p => add(p, 'kick', p === 0 ? 0.95 : 0.7 + rng() * 0.12));

    if (doFill) {
        const fills = {
            0: [[3, 'snare', 0.5], [3.25, 'tom1', 0.62], [3.5, 'tom2', 0.72], [3.75, 'tom3', 0.82]],
            1: [[3, 'snare', 0.45], [3.25, 'snare', 0.52], [3.5, 'snare', 0.66], [3.75, 'snare', 0.82]],
            2: [[2.5, 'tom1', 0.6], [3, 'tom2', 0.68], [3.5, 'tom3', 0.8], [3.5, 'kick', 0.7]],
            3: [[3, 'snare', 0.5], [3.5, 'snare', 0.66], [3.75, 'snare', 0.86], [3.5, 'kick', 0.8]]
        };
        (fills[kind] || []).forEach(([p, dr, v]) => add(p, dr, v));
    }
    return d;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { popPhraseExtras, buildPopPlan, buildPopDrums };
}
