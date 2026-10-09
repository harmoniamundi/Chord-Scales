// band/brass-plan.js — orchestre Brass band (cornets, cors, trombones, tubas, caisse claire, timbales) de la jam :
// textures choral / marche / fanfare. Chargé par index.html via <script src="band/brass-plan.js">
// (après band/band-helpers.js) et testé par band/brass-plan.test.js.
// Fonctions pures : tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.splitBeat   temps où la mesure se coupe en deux accords (getSplitBeat())
//   env.bpm         tempo courant
//   env.bandCtx     contexte de la grille { measureInStep, next2 } (lecture seule), ou undefined
//   env.state       mémoire entre deux mesures, modifiée en place : brassVoice, brassLines
// Seule source d'aléa hors `ph.rng` : Math.random(), pour l'humanisation des entrées des pupitres (comportement d'origine conservé).
// brassPhraseExtras reçoit un petit contexte { groove } (rythme imposé par le style de grille, ex. 'b-chorale').

// Sous Node, les utilitaires partagés se chargent ; en navigateur ce sont des globaux (band/band-helpers.js).
if (typeof bassPc === 'undefined' && typeof require === 'function') {
    var { bassPc, popBassTones, popBassApproach, popLineNote, popVoicing, brassParts, isSplitEffective, getStepHalves } = require('./band-helpers.js');
}
// scalesDb : global en navigateur (theory.js), à charger sous Node.
const BRASS_SCALES_DB = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;

function brassPhraseExtras(ctx, rng, prev, index) {
    const pl = (prev && prev.style === 'brass') ? prev : null;
    const prevI = (pl && typeof pl.intensity === 'number') ? pl.intensity : 0.5;
    let I = index === 0 ? 0.4 + rng() * 0.2 : prevI + (0.6 - prevI) * 0.25 + (rng() - 0.5) * 0.5;
    I = Math.max(0.25, Math.min(0.95, I));
    const pickW = (opts) => {
        const tot = opts.reduce((a, o) => a + o[1], 0);
        let r = rng() * tot;
        for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
        return opts[opts.length - 1][0];
    };
    let texture;
    if (pl && pl.texture && rng() < 0.4) texture = pl.texture;
    else if (I < 0.4) texture = pickW([['chorale', 3], ['march', 2], ['fanfare', 0.5]]);
    else if (I < 0.7) texture = pickW([['march', 4], ['chorale', 1.5], ['fanfare', 1.5]]);
    else texture = pickW([['march', 3], ['fanfare', 3], ['chorale', 0.5]]);
    // Couleur imposée par un style de grille Brass band (hymne, cantique) : la texture suit le style, avec des écarts
    const feel = ctx.groove;
    if (feel === 'b-chorale') { I = Math.min(I, 0.6); if (rng() < 0.85) texture = pickW([['chorale', 6], ['march', 1], ['fanfare', 0.4]]); }
    return {
        intensity: I, texture,
        snareIdx: Math.floor(rng() * 4), snareAlt: Math.floor(rng() * 4),
        stabMode: rng() < 0.65 ? 0 : 1,   // 0 : accords sur les temps faibles ; 1 : sur les contretemps
        fanIdx: Math.floor(rng() * 3),
        cornetEcho: rng() < 0.5,
        timpOn: rng() < 0.75,
        fillOn: rng() < 0.7
    };
}

function buildBrassPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const I = ph.intensity;
    const tex = ph.texture;
    const off = env.transOffset;
    const spb = ternary ? 3 : 2;                    // subdivisions par pulsation
    const fast = env.bpm > 150;
    const splitAt = env.splitBeat;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: bpb, cs: halves[1] }]
        : [{ s: 0, e: bpb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changeNext = !!nextStep && isLastMeasureOfStep && !sameChord(lastSeg.cs, nextStep);
    const strong = bpb === 4 ? [0, 2] : [0];
    const prog = L > 1 ? i / (L - 1) : 0;
    const dyn = (0.7 + 0.3 * I) * (0.9 + 0.1 * prog);
    const lastSub = bpb - 1 / spb;                  // dernière croche de la mesure : levée vers l'accord suivant

    // ---- conduite des voix : un voicing par accord, dans l'ordre chronologique ----
    const range = { lo: -2, hi: 14, centre: 5, soft: 11 };
    const cache = {};
    let lastV = env.state.brassVoice ? env.state.brassVoice.v : null;
    let lastKey = env.state.brassVoice ? env.state.brassVoice.key : null;
    const keyOf = (cs) => cs.rootIndex + ':' + cs.chordId;
    const voiceFor = (cs) => {
        const key = keyOf(cs);
        if (cache[key]) return cache[key];
        const v = (env.state.brassVoice && env.state.brassVoice.key === key) ? env.state.brassVoice.v : popVoicing(env, cs, lastV, range);
        cache[key] = v; lastV = v; lastKey = key;
        return v;
    };
    const Vs = segs.map(sg => voiceFor(sg.cs));
    const nextV = changeNext ? voiceFor(nextStep) : null;
    env.state.brassVoice = lastKey ? { key: lastKey, v: lastV } : null;

    const piano = [], bass = [], drums = [];
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    // Rôles : trombones = harmonie tenue ; cors = contretemps détachés ; cornets = chant (notes longues, reprises,
    // levées) ; tuba = basse pulsée. Chaque pupitre joue donc autre chose que les autres.
    const TB = ['t2', 't1'], HN = ['h1', 'h2'], CN = ['c1', 'c2'], ALL = ['t2', 't1', 'h1', 'h2', 'c1', 'c2'];
    const partsOf = (V, slots) => brassParts(V).filter(p => slots.includes(p.slot));

    // ---------- notes tenues à travers les accords ----------
    // Chaque pupitre tenu (trombones, cors, cornets) a sa propre ligne, qui ne s'arrête pas avec l'accord : une note
    // reste tenue tant qu'elle convient aux accords qui suivent (note commune, ou tension de la gamme jamais à un
    // demi-ton au-dessus d'une note d'accord), parfois sur plusieurs mesures. Quand elle ne convient plus, la voix
    // change par degré conjoint, quelquefois après un retard (la note est alors tenue sur le nouvel accord puis
    // se résout d'un degré vers le bas). Les voix entrent et sortent à des moments différents.
    // L'état des lignes (env.state.brassLines) survit d'une mesure à l'autre ; la mesure absolue donne le repère commun.
    const lines = env.state.brassLines || (env.state.brassLines = {});
    const absStart = m * bpb;
    const busy = (slot, pos) => {
        const Ls = lines[slot];
        if (!Ls || Ls.silent) return false;
        const a = absStart + pos;
        return a >= Ls.s - 1e-6 && a < Ls.end - 1e-6;
    };
    const put = (pos, dur, vel, parts, art, own) => {
        const ps = own ? parts : (parts || []).filter(pt => !busy(pt.slot, pos)); // une voix tenue ne joue pas autre chose en même temps
        if (ps.length) piano.push({ pos, dur, vel: clampV(vel * dyn), rootIndex: 0, parts: ps, art });
    };
    const hit = (pos, dur, vel, V, art, slots) => put(pos, dur, vel, partsOf(V, slots || ALL), art);
    const tuba = (pos, dur, vel, abs, art) => bass.push({ pos, abs, dur, vel: clampV(vel * (0.85 + 0.2 * I)), art });
    // percussions : plus douces (le bus du brass band les adoucit encore)
    const dr = (pos, drum, vel, extra) => drums.push(Object.assign({ pos, drum, vel: Math.min(1, vel * 0.7) }, extra || {}));
    const timpF = (cs) => {
        const pc = ((((bassPc(env, cs) + off) % 12) + 12) % 12);
        return 65.406 * Math.pow(2, (((pc - 2 + 12) % 12) + 2) / 12);
    };
    const segAt = (pos) => { for (let k = segs.length - 1; k >= 0; k--) if (pos >= segs[k].s - 1e-6) return k; return 0; };
    const roll = (from, n, v0, v1, drum, freq) => {
        for (let k = 0; k < n; k++) {
            const pos = from + k * (bpb - from) / n;
            const v = v0 + (v1 - v0) * (n > 1 ? k / (n - 1) : 1);
            if (drum === 'timp') dr(pos, 'timp', v, { freq, short: true }); else dr(pos, drum, v);
        }
    };
    const rollN = fast ? spb : spb * 2;

    // Accords à venir (en temps depuis le début de cette mesure) : la mesure, la fin du bloc, puis les deux blocs suivants.
    const ahead = [];
    const pushAhead = (cs, a, b) => {
        const Lh = ahead[ahead.length - 1];
        if (Lh && sameChord(Lh.cs, cs) && Math.abs(Lh.e - a) < 1e-6) Lh.e = b; else ahead.push({ cs, s: a, e: b });
    };
    segs.forEach(sg => pushAhead(sg.cs, sg.s, sg.e));
    let tEnd = bpb;
    const bctx = env.bandCtx || {};
    const leftInStep = Math.max(0, (step.measures || 1) - 1 - (bctx.measureInStep || 0));
    for (let k = 0; k < leftInStep && tEnd < bpb * 4 - 1e-6; k++) { pushAhead(lastSeg.cs, tEnd, tEnd + bpb); tEnd += bpb; }
    const addStep = (st) => {
        if (!st || tEnd >= bpb * 4 - 1e-6) return;
        if (isSplitEffective(st)) {
            const hv = getStepHalves(st);
            pushAhead(hv[0], tEnd, tEnd + splitAt); pushAhead(hv[1], tEnd + splitAt, tEnd + bpb); tEnd += bpb;
        } else {
            for (let k = 0, n = Math.min(st.measures || 1, 4); k < n && tEnd < bpb * 4 - 1e-6; k++) { pushAhead(st, tEnd, tEnd + bpb); tEnd += bpb; }
        }
    };
    addStep(nextStep);
    if (nextStep) addStep(bctx.next2);
    const horizon = tEnd;
    const pcOf = (x) => ((x % 12) + 12) % 12;
    const fitInfo = {};
    const infoOf = (cs) => {
        const key = cs.rootIndex + ':' + cs.chordId + ':' + cs.scaleId;
        if (fitInfo[key]) return fitInfo[key];
        const chordT = new Set((env.findChordObj(cs.chordId).notes || [0, 4, 7]).map(t => pcOf(cs.rootIndex + t)));
        const sc = (BRASS_SCALES_DB[cs.scaleId] && BRASS_SCALES_DB[cs.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
        const scaleT = new Set(sc.map(t => pcOf(cs.rootIndex + t)));
        return (fitInfo[key] = { chordT, scaleT });
    };
    // Une note tenue convient à un accord si c'est une note de l'accord, ou une note de sa gamme qui n'est jamais
    // à un demi-ton au-dessus d'une note de l'accord (pas de neuvième mineure frottée).
    const fits = (x, cs) => {
        const inf = infoOf(cs), pc = pcOf(x);
        return inf.chordT.has(pc) || (inf.scaleT.has(pc) && !inf.chordT.has(pcOf(pc - 1)));
    };
    const ENTRY = { t2: 0, t1: 0.2, h1: 0.45, h2: 0.7, c2: 0.3, c1: 0.9 };   // entrées échelonnées (en temps)
    const CARRY = { t2: 0.5, t1: 0.7, h1: 0.7, h2: 0.6, c2: 0.65, c1: 0.5 };   // chance de garder la note sur un nouvel accord compatible
    const holdRun = (x, t, slot) => {
        let end = t, blocked = null;
        for (const a of ahead) {
            if (a.e <= t + 1e-6) continue;
            if (a.s > t + 1e-6 && (!fits(x, a.cs) || rng() > CARRY[slot])) { blocked = a; break; }
            end = a.e;
        }
        return { end: Math.min(end, horizon), blocked };
    };
    const startHold = (slot, t, fresh, o) => {
        if (t >= bpb - 0.3) return;
        const si = segAt(t);
        const part = brassParts(Vs[si]).find(pt => pt.slot === slot);
        if (!part) return;
        const prev = lines[slot];
        let x = part.iv;
        if (prev && Number.isFinite(prev.res) && fits(prev.res, segs[si].cs)) x = prev.res;
        const run = holdRun(x, t, slot);
        const minLen = Math.min(1.5, Math.max(0.5, run.end - t));
        const bounds = [];
        const addB = (b) => { if (b > t + minLen - 1e-6 && b <= run.end + 1e-6 && b <= t + o.maxM * bpb + 1e-6 && !bounds.some(q => Math.abs(q - b) < 1e-6)) bounds.push(b); };
        ahead.forEach(a => addB(a.e));
        for (let b = bpb; b <= run.end + 1e-6; b += bpb) addB(b);
        addB(run.end);
        bounds.sort((a, b) => a - b);
        let end = bounds.length ? (rng() < o.longP ? bounds[bounds.length - 1] : bounds[Math.floor(rng() * bounds.length)]) : Math.min(run.end, t + minLen);
        let res = null;
        // retard : la note forcée de quitter l'accord peut rester un moment sur le nouvel accord, puis descendre d'un degré
        if (run.blocked && Math.abs(end - run.blocked.s) < 1e-6 && !fits(x, run.blocked.cs)
            && run.blocked.e - run.blocked.s >= 1.5 && I > 0.3 && rng() < 0.4) {
            const inf = infoOf(run.blocked.cs);
            const d = [2, 1].find(dd => inf.chordT.has(pcOf(x - dd)) && (dd === 2 || inf.scaleT.has(pcOf(x))));
            if (d) { end = Math.min(run.blocked.e - 0.5, end + Math.min(1, run.blocked.e - run.blocked.s - 0.5)); res = x - d; }
        }
        const gap = 0.04 + Math.random() * 0.18;
        const dur = Math.max(0.4, end - t - gap);
        const art = (fresh && o.artFirst) ? o.artFirst : o.art;
        put(t, dur, o.vel * (slot[0] === 'c' ? 1.04 : 0.96) * (0.95 + Math.random() * 0.1), [{ iv: x, slot }], art, true);
        lines[slot] = { s: absStart + t, end: absStart + end, res };
    };
    const engine = (slots, o) => {
        slots.forEach(slot => {
            const Ls = lines[slot];
            let t = (Ls && Ls.end > absStart + 1e-6) ? Ls.end - absStart : 0;
            if (t >= bpb - 0.3) return;
            const fresh = !Ls || Ls.end <= absStart - 1e-6 || Ls.silent;
            const wasRest = !!(Ls && Ls.silent);
            // la voix vient de s'arrêter (ou entre pour la première fois) : retard d'entrée propre à chaque pupitre
            let delay;
            if (!Ls || (Ls.end <= absStart - bpb * 0.5 && !wasRest)) delay = ENTRY[slot] * o.entry * (0.6 + 0.8 * Math.random());
            else delay = Math.random() < 0.3 ? 0.4 + 0.5 * Math.random() : Math.random() * 0.2;
            for (let g = 0; g < 2; g++) {
                // une voix aiguë peut aussi se taire un moment (respiration), plutôt que de ne jamais s'arrêter
                if (o.restP && /^[ch]/.test(slot) && Ls && !wasRest && g === 0 && rng() < o.restP) {
                    lines[slot] = { s: absStart + t, end: absStart + t + bpb * (0.6 + rng() * 0.8), silent: true };
                    return;
                }
                startHold(slot, t + delay, fresh, o);
                const nl = lines[slot];
                if (!nl || nl.end - absStart >= bpb - 0.5) return;
                t = nl.end - absStart; delay = Math.random() * 0.2;
            }
        });
    };

    // ---------- basse : le tuba joue une ligne pulsée (fondamentale, quinte, notes de passage et d'approche) ----------
    const bassLine = (kind, accents) => {
        segs.forEach((sg, si) => {
            const T = popBassTones(env, sg.cs);
            const lastHere = si === segs.length - 1;
            const nxt = lastHere ? (changeNext ? nextStep : null) : segs[si + 1].cs;
            const apr = nxt ? popBassApproach(env, T.root, nxt, rng) : null;
            const nb = Math.max(1, Math.round(sg.e - sg.s));
            const R = T.root, F = T.fifth, Th = T.third, O = T.octave;
            const PAT = ternary
                ? [[R, F, F], [R, F, R], [R, Th, F]]
                : [[R, F, R, F], [R, F, O, F], [R, Th, F, Th], [R, F, R, Th]];
            const pat = PAT[(i + si + ph.fanIdx) % PAT.length];
            for (let b = 0; b < nb; b++) {
                const pos = sg.s + b;
                const lastB = b === nb - 1;
                let abs = pat[b % pat.length];
                let dur = ternary ? 0.62 : 0.74, art = 'puls';
                let vel = b === 0 ? 0.88 : (strong.includes(pos) ? 0.76 : 0.64);
                if (accents && accents.some(a => Math.abs(a - pos) < 1e-6)) vel = Math.min(1, vel + 0.12);
                if (kind === 'chorale') {
                    // choral : une note par deux temps, qui se lie à la suivante
                    if (b % 2 === 1 && !(lastB && apr !== null)) continue;
                    art = 'ten'; vel = 0.72;
                    dur = Math.max(0.5, Math.min(2, (lastB ? 1 : (apr !== null && b + 2 > nb - 1 ? nb - 1 - b : nb - b))) - 0.1);
                }
                if (lastB && apr !== null) { abs = apr; dur = Math.max(dur, 0.6); vel = Math.max(vel, 0.7); }
                tuba(pos, dur, vel, abs, art);
            }
        });
    };

    if (tex === 'chorale') {
        // ---------- choral : accords tenus par six lignes indépendantes, qui se relaient d'un accord à l'autre ----------
        const firstPhrase = (i === 0);
        engine(['t2', 't1', 'h1', 'h2', 'c2', 'c1'], { vel: 0.62 + 0.12 * I, art: 'ten', artFirst: firstPhrase ? 'swell' : null, maxM: 3, longP: 0.5, entry: 1.4, restP: 0.12 });
        bassLine('chorale');
        segs.forEach((sg, si) => {
            if (si === 0 && i === 0 && ph.timpOn) dr(0, 'timp', 0.5 + 0.2 * I, { freq: timpF(sg.cs) });
            if (I > 0.7 && si === 0 && i === 0) dr(0, 'bdrum', 0.3 + 0.2 * I);
        });
        if (isTurn && L > 1 && ph.timpOn) roll(bpb - 1, rollN, 0.28, 0.7, 'timp', timpF(lastSeg.cs));
    } else if (tex === 'march') {
        // ---------- marche : tuba pulsé, cors détachés (« pah »), trombones et cornets tenus à travers les accords ----------
        const SNARE_B = [
            [[0, 0.82], [0.5, 0.4], [0.75, 0.58]],
            [[0, 0.85], [0.25, 0.36], [0.5, 0.62], [0.75, 0.38]],
            [[0, 0.8], [0.5, 0.5]],
            [[0, 0.85], [0.75, 0.5]]
        ];
        const SNARE_T = [
            [[0, 0.8], [1 / 3, 0.38], [2 / 3, 0.55]],
            [[0, 0.82], [2 / 3, 0.5]],
            [[0, 0.8], [1 / 3, 0.45], [2 / 3, 0.45]],
            [[0, 0.85], [1 / 3, 0.35]]
        ];
        const cellFor = (k) => (ternary ? SNARE_T : SNARE_B)[(strong.includes(k) ? ph.snareIdx : ph.snareAlt) % 4];
        const pickupOn = changeNext || (ph.cornetEcho && i % 2 === 1 && I > 0.5 && !isTurn);
        // rôle des cornets, qui change d'une mesure à l'autre : 0 = notes tenues, 1 = silence puis levée, 2 = avec les cors
        const mode = (i + ph.snareIdx) % 3;
        engine(mode === 0 ? ['t2', 't1', 'c2', 'c1'] : ['t2', 't1'], { vel: 0.5 + 0.14 * I, art: 'pad', maxM: 2, longP: 0.55, entry: 1, restP: 0.15 });
        bassLine('march');
        const stabSlots = (mode === 2 && I > 0.5) ? HN.concat(['c1']) : HN;
        const stab = (pos, dur, vel, V, art) => hit(pos, dur, vel, V, art, stabSlots);
        segs.forEach((sg, si) => {
            const V = Vs[si];
            for (let k = Math.ceil(sg.s - 1e-6); k < sg.e - 1e-6; k++) {
                const room = (p) => Math.max(0.15, Math.min(0.45, sg.e - p - 0.05));
                const isStrong = ternary || k === sg.s || strong.includes(k);
                if (ternary) {
                    // « oom-pa-pa » : deux accords courts sur les deux dernières croches de la pulsation
                    if (I > 0.5 || (k + si) % 2 === 0) stab(k + 1 / 3, 0.28, 0.5, V, 'stac');
                    if (!(pickupOn && Math.abs(k + 2 / 3 - lastSub) < 1e-6)) stab(k + 2 / 3, 0.28, 0.58, V, 'stac');
                } else if (ph.stabMode === 0) {
                    if (!isStrong) stab(k, room(k) + 0.1, 0.62, V, I > 0.7 ? 'marc' : 'stac');
                } else if (!(pickupOn && Math.abs(k + 0.5 - lastSub) < 1e-6)) {
                    stab(k + 0.5, 0.35, 0.6, V, 'stac');
                }
                // caisse claire : surtout sur les temps forts, quelques notes fantômes seulement
                cellFor(k).forEach(([f, v]) => {
                    if (fast && !ternary && (f === 0.25 || f === 0.75)) return;
                    if (f === 0) { if (!(strong.includes(k) || k === 0 || rng() < 0.45)) return; }
                    else if (I < 0.55 || rng() > 0.45) return;
                    dr(k + f, 'snare', v * (strong.includes(k) ? 0.9 : 1) * (0.6 + 0.3 * I));
                });
                // grosse caisse : seulement au début de chaque accord, et parfois sur le troisième temps
                if (k === 0 || k === sg.s) dr(k, 'bdrum', (k === 0 ? 0.85 : 0.65) * (0.75 + 0.3 * I));
                else if (!ternary && strong.includes(k) && rng() < 0.5) dr(k, 'bdrum', 0.55 * (0.75 + 0.3 * I));
            }
        });
        const tgtV = changeNext ? nextV : Vs[segs.length - 1];
        if (pickupOn && tgtV && tgtV.length) hit(lastSub, 1 / spb, 0.72, tgtV, 'marc', ['h2', 'c1', 'c2']);
        // mode 1 : les cornets reprennent la parole sur la dernière pulsation, par une note voisine puis le but
        if (mode === 1 && tgtV && tgtV.length && lastSub - 1 / spb >= 1) {
            const nb = popLineNote(env, changeNext ? nextStep : lastSeg.cs, tgtV[tgtV.length - 1], rng, rng() < 0.5 ? -1 : 1);
            put(lastSub - 1 / spb, 0.9 / spb, 0.6, [{ iv: nb, slot: 'c1' }], 'stac');
            if (!pickupOn) hit(lastSub, 1 / spb, 0.66, tgtV, 'marc', ['c1']);
        }
        if (i === 0 && I > 0.6) dr(0, 'clash', 0.45 + 0.3 * I);
        if (isTurn && L > 1 && ph.fillOn) roll(bpb - 1, rollN, 0.32, 0.82, 'snare');
    } else {
        // ---------- fanfare : cornets marqués, cors sur les notes longues, trombones tenus, timbales et cymbales ----------
        const FAN = {
            4: [
                [[0, 1.4, 1], [1.5, 0.4, 0.7], [2, 1, 0.9], [3, 0.9, 0.75]],
                [[0, 0.9, 1], [1, 0.9, 0.75], [1.5, 0.4, 0.7], [2, 1.9, 0.95]],
                [[0, 0.45, 1], [0.5, 0.45, 0.7], [1, 0.9, 0.85], [2, 0.9, 0.9], [3, 0.45, 0.7], [3.5, 0.45, 0.8]]
            ],
            3: [
                [[0, 1.4, 1], [1.5, 0.4, 0.7], [2, 0.9, 0.85]],
                [[0, 0.9, 1], [1, 0.4, 0.7], [1.5, 0.4, 0.7], [2, 0.9, 0.85]],
                [[0, 0.45, 1], [0.5, 0.45, 0.7], [1, 0.9, 0.85], [2, 0.9, 0.8]]
            ],
            2: [
                [[0, 1.4, 1], [1.5, 0.45, 0.75]],
                [[0, 0.9, 1], [1, 0.9, 0.8]],
                [[0, 0.45, 1], [0.5, 0.45, 0.7], [1, 0.9, 0.85]]
            ]
        };
        const FAN_T = [          // par pulsation (ternaire) : long-court, tenu, trois courtes
            [[0, 0.62, 1], [2 / 3, 0.3, 0.65]],
            [[0, 0.95, 1]],
            [[0, 0.3, 0.9], [1 / 3, 0.3, 0.6], [2 / 3, 0.3, 0.7]]
        ];
        let cell = [];
        if (ternary) {
            for (let k = 0; k < bpb; k++) FAN_T[ph.fanIdx % 3].forEach(([p, d, v]) => cell.push([k + p, d, v * (k === 0 ? 1 : 0.88)]));
        } else {
            cell = FAN[bpb][ph.fanIdx % 3].map(c => c.slice());
        }
        // chaque accord doit s'entendre : une frappe au début de chaque segment
        segs.forEach(sg => { if (!cell.some(c => Math.abs(c[0] - sg.s) < 1e-6)) cell.push([sg.s, 0.9, 0.9]); });
        cell.sort((a, b) => a[0] - b[0]);
        // trombones : accent à l'attaque puis notes tenues sous les figures marquées, à travers les accords
        engine(['t2', 't1'], { vel: 0.62 + 0.16 * I, art: 'hold', maxM: 2, longP: 0.5, entry: 0.35, restP: 0 });
        bassLine('fanfare', cell.filter(c => Math.abs(c[0] - Math.round(c[0])) < 1e-6).map(c => c[0]));
        cell.forEach(([pos, d, v]) => {
            const si = segAt(pos);
            const sg = segs[si];
            if (pos >= sg.e - 1e-6) return;
            const dur = Math.max(0.15, Math.min(d, sg.e - pos - 0.05));
            const whole = Number.isInteger(pos) || Math.abs(pos - Math.round(pos)) < 1e-6;
            // les cornets jouent toute la figure ; les cors seulement ses notes longues
            hit(pos, dur, 0.78 * v, Vs[si], 'marc', d >= 0.85 ? HN.concat(CN) : CN);
            if (whole && (pos === sg.s || strong.includes(pos) || ternary)) {
                if (pos === 0 || pos === sg.s || rng() < 0.4) dr(pos, 'bdrum', 0.7 * v * (0.75 + 0.3 * I));
            } else if (!whole && rng() < 0.5) {
                dr(pos, 'snare', 0.5 * v);
            }
        });
        if (I > 0.6) for (let k = 1; k < bpb; k++) if (!strong.includes(k) && !ternary) dr(k, 'snare', 0.5 * (0.7 + 0.3 * I));
        if (ph.timpOn && (i === 0 || (I > 0.7 && i % 2 === 0))) dr(0, 'timp', 0.5 + 0.25 * I, { freq: timpF(segs[0].cs) });
        if (i === 0 && I > 0.45) dr(0, 'clash', 0.5 + 0.3 * I);
        if (changeNext && nextV && !cell.some(c => Math.abs(c[0] - lastSub) < 1e-6)) hit(lastSub, 1 / spb, 0.72, nextV, 'marc', ['h2', 'c1', 'c2']);
        if (isTurn && L > 1 && ph.fillOn) {
            roll(bpb - 1, rollN, 0.3, 0.85, 'snare');
            if (ph.timpOn) roll(bpb - 1, rollN, 0.3, 0.75, 'timp', timpF(lastSeg.cs));
        }
    }
    piano.sort((a, b) => a.pos - b.pos);
    bass.sort((a, b) => a.pos - b.pos);
    return { piano, bass, drums, brass: true };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { brassPhraseExtras, buildBrassPlan };
}
