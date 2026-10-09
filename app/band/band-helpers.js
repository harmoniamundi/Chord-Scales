// band/band-helpers.js — utilitaires partagés par les générateurs d'accompagnement de la jam :
// registre et notes de la basse, notes d'approche, notes de gamme, petites montées conjointes.
// Fonctions pures. Tout ce qui dépendait de JamEngine (`this`) passe par l'objet `env` :
//   env.transOffset      décalage de transposition de l'instrument (_jamTransOffset())
//   env.findChordObj(id) objet accord du catalogue
// Chargé par index.html via <script src="band/band-helpers.js"> et testé par band/band-helpers.test.js.

// En navigateur, scalesDb est global (theory.js) ; sous Node on le charge.
const SCALES_DB = (typeof scalesDb !== 'undefined') ? scalesDb : require('../theory.js').scalesDb;
// stackIntervalsUp : global en navigateur (theory.js), à charger sous Node.
if (typeof stackIntervalsUp === 'undefined' && typeof require === 'function') {
    var { stackIntervalsUp } = require('../theory.js');
}
// Bibliothèques de patterns : globales en navigateur (band-patterns.js), à charger sous Node.
const HELPERS_PAT = (typeof BAND_PATTERNS !== 'undefined') ? { BAND_PATTERNS, METER_LIB } : require('../band-patterns.js');

// Ramène une note de basse (hauteur écrite) dans le registre de la basse (mi1 à ré#2 réels).
function popFoldBass(env, abs) {
    const off = env.transOffset;
    let a = abs;
    while (a + off > 3) a -= 12;
    while (a + off < -8) a += 12;
    return a;
}

// Hauteur (0 à 11) de la note que la basse joue pour cet accord : la basse choisie (accord sur basse) ou la fondamentale.
function bassPc(env, cs) {
    if (Number.isInteger(cs.bassRootIndex)) return cs.bassRootIndex;
    return (cs.rootIndex + (env.findChordObj(cs.chordId).notes[0] || 0)) % 12;
}

// Même note, placée à moins d'un triton de la fondamentale de l'accord (pour les lignes de basse « walking »).
function bassNear(env, cs) {
    const croot = cs.rootIndex + (env.findChordObj(cs.chordId).notes[0] || 0);
    if (!Number.isInteger(cs.bassRootIndex)) return croot;
    let d = (((cs.bassRootIndex - croot) % 12) + 12) % 12;
    if (d > 6) d -= 12;
    return croot + d;
}

function popBassTones(env, cs) {
    const off = env.transOffset;
    const t = env.findChordObj(cs.chordId).notes;
    const r0 = t[0] || 0;
    const croot = popFoldBass(env, cs.rootIndex + r0);   // fondamentale de l'accord, dans le registre de la basse
    const root = Number.isInteger(cs.bassRootIndex) ? popFoldBass(env, cs.bassRootIndex) : croot; // note jouée par la basse
    const fit = (x) => { let a = x; while (a + off > 11) a -= 12; while (a + off < -8) a += 12; return a; };
    const rel = (k, d) => ((((t[k] !== undefined ? t[k] : d) - r0) % 12) + 12) % 12;
    return {
        root,
        third: fit(croot + rel(1, 4)),
        fifth: fit(croot + rel(2, 7)),
        seventh: fit(croot + rel(3, 10)),
        octave: root + 12
    };
}

// Note de liaison vers la fondamentale de l'accord suivant : degré conjoint de sa gamme (dessous ou dessus),
// chromatique, ou quinte inférieure — jamais le même chromatisme systématique.
function popBassApproach(env, fromRoot, nextCs, rng) {
    const off = env.transOffset;
    const nt = env.findChordObj(nextCs.chordId).notes;
    let target = popFoldBass(env, bassPc(env, nextCs));
    while (target - fromRoot > 6) target -= 12;
    while (fromRoot - target > 6) target += 12;
    const sc = (SCALES_DB[nextCs.scaleId] && SCALES_DB[nextCs.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
    const inScale = (n) => sc.includes((((n - nextCs.rootIndex) % 12) + 12) % 12);
    const below = [-1, -2].map(d => target + d).find(inScale);
    const above = [1, 2].map(d => target + d).find(inScale);
    const r = rng();
    let n;
    if (r < 0.5 && below !== undefined) n = below;
    else if (r < 0.75 && above !== undefined) n = above;
    else if (r < 0.9) n = target - 1;
    else n = target - 5;
    while (n + off > 6) n -= 12;
    while (n + off < -9) n += 12;
    return n;
}

function popScaleNotes(cs, lo, hi) {
    const sc = (SCALES_DB[cs.scaleId] && SCALES_DB[cs.scaleId].intervals) || [0, 2, 4, 5, 7, 9, 11];
    const out = [];
    for (let n = Math.ceil(lo); n <= hi; n++) {
        if (sc.includes((((n - cs.rootIndex) % 12) + 12) % 12)) out.push(n);
    }
    return out;
}

// Note voisine (par degré conjoint de la gamme) d'une note de départ : le « chant » du piano.
function popLineNote(env, cs, from, rng, dir) {
    const off = env.transOffset;
    const S = popScaleNotes(cs, from - 7, from + 7)
        .filter(n => n !== from && n + off >= 0 && n + off <= 19);
    if (!S.length) return from;
    const near = S.filter(n => (dir > 0 ? n > from : dir < 0 ? n < from : true) && Math.abs(n - from) <= 3);
    const pool = (near.length ? near : S).slice().sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    return pool[Math.min(pool.length - 1, rng() < 0.7 ? 0 : 1)];
}

// Petite montée / descente conjointe qui se termine juste à côté de la note visée (haut du prochain accord).
function popRun(env, cs, startAbs, targetAbs, count) {
    const off = env.transOffset;
    const S = popScaleNotes(cs, -2 - off, 21 - off);
    if (S.length < count + 2) return [];
    let ti = 0;
    S.forEach((n, k) => { if (Math.abs(n - targetAbs) < Math.abs(S[ti] - targetAbs)) ti = k; });
    const mk = (dir) => {
        const arr = [];
        for (let k = count; k >= 1; k--) {
            const idx = ti - dir * k;
            if (idx < 0 || idx >= S.length) return null;
            arr.push(S[idx]);
        }
        return arr;
    };
    const opts = [mk(1), mk(-1)].filter(Boolean);
    if (!opts.length) return [];
    opts.sort((a, b) => Math.abs(a[0] - startAbs) - Math.abs(b[0] - startAbs));
    return opts[0];
}

// Basse latine : fondamentale grave, quinte placée sous la fondamentale quand elle serait trop haute.
function latBassTones(env, cs) {
    const off = env.transOffset;
    const T = popBassTones(env, cs);
    const fifth = (T.fifth + off > 4) ? T.fifth - 12 : T.fifth;
    const octave = (T.root + off + 12 <= 8) ? T.root + 12 : fifth;
    return { root: T.root, third: T.third, fifth, seventh: T.seventh, octave };
}

// Pendant la jam, un accord doit toujours être joué avec 4 notes,
// quel que soit le nombre de notes qui le composent.
// Convention des données : notes = [fondamentale, tierce, quinte, septième, ...tensions]
// On garde fondamentale, tierce, septième et la tension la plus haute (la dernière listée),
// en retirant la quinte et les éventuelles tensions intermédiaires.
function jamChordPlaybackNotes(chordObj) {
    const notes = chordObj.notes;
    if (notes.length <= 4) return notes;
    return [notes[0], notes[1], notes[3], notes[notes.length - 1]];
}

// Voicing du piano (hauteurs écrites) : parmi les renversements de l'accord, celui qui bouge le moins
// par rapport au précédent (conduite des voix), dans un registre médium (la3 à fa4 réels environ).
function popVoicing(env, cs, prev, range) {
    const off = env.transOffset;
    const notes = jamChordPlaybackNotes(env.findChordObj(cs.chordId));
    const pcs = [];
    notes.forEach(iv => {
        const pc = (((cs.rootIndex + iv) % 12) + 12) % 12;
        if (!pcs.includes(pc)) pcs.push(pc);
    });
    if (!pcs.length) return [];
    const rg = range || { lo: -3, hi: 17, centre: 7, soft: 14 };
    const LO = rg.lo - off, HI = rg.hi - off;
    let cands = [];
    for (const slack of [0, 5, 12]) {
        for (let r = 0; r < pcs.length; r++) {
            const order = pcs.slice(r).concat(pcs.slice(0, r));
            for (let oct = 0; oct <= 12; oct += 12) {
                let cur = LO + ((((order[0] - LO) % 12) + 12) % 12) + oct;
                const v = [cur];
                for (let k = 1; k < order.length; k++) {
                    cur += ((((order[k] - cur) % 12) + 12) % 12) || 12;
                    v.push(cur);
                }
                if (v[v.length - 1] <= HI + slack) cands.push(v);
            }
        }
        if (cands.length) break;
    }
    if (!cands.length) return [];
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const centre = rg.centre - off;
    let best = cands[0], bestCost = Infinity;
    cands.forEach(v => {
        let c = 0.3 * Math.abs(mean(v) - centre) + Math.max(0, v[v.length - 1] - (rg.soft - off)) * 0.6;
        if (prev && prev.length) {
            const n = Math.min(v.length, prev.length);
            for (let j = 0; j < n; j++) c += Math.abs(v[v.length - 1 - j] - prev[prev.length - 1 - j]);
        }
        // Pas de seconde serrée dans le grave (son brouillé) : elle écarte les renversements « boueux »
        for (let k = 0; k + 1 < v.length; k++) {
            const gap = v[k + 1] - v[k];
            if (gap > 2) continue;
            const low = v[k] + off;
            if (low < 5) c += gap === 1 ? 8 : 5;
            else if (low < 8) c += gap === 1 ? 4 : 2;
        }
        if (c < bestCost - 1e-9) { bestCost = c; best = v; }
    });
    return best;
}

// Retard de la tierce par la quarte (sus4 → 3), très pop ; null si l'accord ne s'y prête pas.
function popSusVoicing(env, cs, V) {
    const t = env.findChordObj(cs.chordId).notes;
    if (t[1] !== 3 && t[1] !== 4) return null;
    if (t.some((iv, k) => k > 0 && (iv % 12) === 5)) return null;
    const third = (((cs.rootIndex + t[1]) % 12) + 12) % 12;
    const idx = V.findIndex(x => (((x % 12) + 12) % 12) === third);
    if (idx < 0) return null;
    const sus = V.slice();
    sus[idx] = V[idx] + (5 - t[1]);
    return { sus, resolved: V };
}

// Notes du pouce de la guitare (même hauteur écrite que la basse, mais à l'octave de la guitare).
function latThumb(env, cs) {
    const T = latBassTones(env, cs);
    return { root: T.root, fifth: T.fifth };
}

// Petite variation d'une cellule de guitare : une frappe légère retirée, ou un accord étouffé ajouté.
function latVary(cell, rng, I, i) {
    const out = cell.map(h => h.slice());
    if (i === 0) return out;
    const r = rng();
    if (r < 0.3 * (1.1 - I) && out.length > 3) {
        const idx = out.map((h, k) => k).filter(k => out[k][2] === 'U' || out[k][2] === 'X');
        if (idx.length) out.splice(idx[Math.floor(rng() * idx.length)], 1);
    } else if (r < 0.3 + 0.3 * I) {
        const taken = new Set(out.map(h => h[0]));
        const free = [0.5, 1, 1.5, 2.5, 3, 3.5].filter(p => !taken.has(p));
        if (free.length) out.push([free[Math.floor(rng() * free.length)], 0.2, 'X', 0.32]);
    }
    return out.sort((a, b) => a[0] - b[0]);
}

// Notes détachées : remplace une partie des accords pleins (TC, tC, C, U) par des notes isolées de la guitare
// (pouce seul, note d'arpège), et ajoute quelques notes seules sur les croches libres.
// o = { free: positions libres, u: durée d'une croche dans l'unité de la cellule, keep: positions à ne pas toucher }
function latDetach(cell, rng, I, g, o) {
    const marcato = g === 'tango' || g === 'piazzolla';
    const pConv = marcato ? 0.32 : 0.6;
    const u = o.u;
    const keep = o.keep || [];
    const isKept = (p) => keep.some(k => Math.abs(k - p) < 0.01);
    const out = cell.map(h => h.slice());
    const aN = () => 'a' + (1 + Math.floor(rng() * 3)); // voix 1 à 3 (médium / aigu)
    out.forEach(h => {
        if (isKept(h[0]) || rng() >= pConv) return;
        switch (h[2]) {
            case 'TC': h[2] = 'T'; h[1] = Math.min(h[1], 4 * u); break;
            case 'tC': h[2] = 't'; h[1] = Math.min(h[1], 4 * u); break;
            case 'C': h[2] = aN(); h[1] = Math.max(h[1], 2 * u); h[3] = Math.min(h[3], 0.62); break;
            case 'U': h[2] = 'a3'; h[1] = Math.max(h[1], 2 * u); break;
            default: break;
        }
    });
    const taken = new Set(out.map(h => h[0]));
    const free = (o.free || []).filter(p => !taken.has(p) && !isKept(p));
    const nAdd = Math.round((marcato ? 0.5 : 1.6) * (0.6 + 0.8 * I) * (0.5 + rng()));
    for (let k = 0; k < nAdd && free.length; k++) {
        const p = free.splice(Math.floor(rng() * free.length), 1)[0];
        out.push([p, 2 * u, aN(), 0.4 + rng() * 0.12]);
    }
    return out.sort((a, b) => a[0] - b[0]);
}

// Répartit les notes d'un voicing (hauteurs écrites, du grave à l'aigu) entre six pupitres :
// trombone basse (t2) et ténor (t1), cors 1 (h1) et 2 (h2), cornets 2 (c2) et 1 (c1, une octave au-dessus).
function brassParts(V) {
    const iv = (V || []).slice().sort((x, y) => x - y);
    const n = iv.length;
    if (!n) return [];
    const P = (v, slot) => ({ iv: v, slot });
    if (n === 1) return [P(iv[0], 'h2'), P(iv[0], 'c1')];
    if (n === 2) return [P(iv[0], 't2'), P(iv[1], 't1'), P(iv[1], 'h2'), P(iv[1], 'c1'), P(iv[0], 'c2')];
    return [P(iv[0], 't2'), P(iv[1], 't1'), P(iv[n - 2], 'h1'), P(iv[n - 1], 'h2'), P(iv[n - 1], 'c1'), P(iv[n - 2], 'c2')];
}

// --- Mesure à deux accords ---
// Un pas de grille d'une mesure peut porter un second accord (step.split) : le premier accord
// occupe les temps 1-2, le second les temps 3-4. La durée reste un nombre entier de mesures,
// ce qui garde les barres de mesure alignées.
function isSplit(step) {
    return !!(step && step.split && step.measures === 1);
}

// Vrai si les deux moitiés sonnent différemment (sinon la mesure est jouée comme une mesure normale).
function isSplitEffective(step) {
    const bs = (o) => Number.isInteger(o.bassRootIndex) ? o.bassRootIndex : -1;
    return isSplit(step) && !(step.split.rootIndex === step.rootIndex && step.split.chordId === step.chordId && bs(step.split) === bs(step));
}

function getStepHalves(step) {
    const first = { rootIndex: step.rootIndex, chordId: step.chordId, scaleId: step.scaleId };
    if (Number.isInteger(step.bassRootIndex)) first.bassRootIndex = step.bassRootIndex;
    if (!isSplit(step)) return [first];
    const second = { rootIndex: step.split.rootIndex, chordId: step.split.chordId, scaleId: step.split.scaleId };
    if (Number.isInteger(step.split.bassRootIndex)) second.bassRootIndex = step.split.bassRootIndex;
    return [first, second];
}

// ---------------------------------------------------------------------------------------------
// Rythme : swing, tirage pondéré, bibliothèque de patterns selon la signature
// ---------------------------------------------------------------------------------------------

// Rapport de swing : triolet au départ, qui se rapproche des croches droites quand le tempo monte.
// Seul le style « swing » swingue ; les autres jouent des croches droites (0.5).
function bandSwing(style, bpm) {
    if (style !== 'swing') return 0.5;
    return Math.max(0.58, Math.min(0.667, 0.667 - (bpm - 140) * 0.001));
}

// Décale vers le triolet les croches placées sur un « et » (x.5).
function swingPos(pos, swing) {
    const base = Math.floor(pos + 1e-6);
    return Math.abs(pos - base - 0.5) < 1e-6 ? base + swing : pos;
}

// Tire une cellule { w, ... } dans la liste, proportionnellement à son poids w.
function pickWeighted(list, rng) {
    const total = list.reduce((s, c) => s + c.w, 0);
    let r = rng() * total;
    for (const c of list) { r -= c.w; if (r <= 0) return c; }
    return list[list.length - 1];
}

// Signature courante : '2/4', '3/4', '4/4', '6/8', '9/8' ou '12/8'.
function meterKey(beatsPerBar, ternary) {
    return ternary ? ({ 2: '6/8', 3: '9/8', 4: '12/8' })[beatsPerBar] : (beatsPerBar + '/4');
}

// Bibliothèque de patterns d'un style pour une signature (4/4 ou signature sans motif propre : bibliothèque 4/4).
function patternLib(key, style) {
    return (key !== '4/4' && HELPERS_PAT.METER_LIB[key] && HELPERS_PAT.METER_LIB[key][style]) || HELPERS_PAT.BAND_PATTERNS[style];
}

// ---------------------------------------------------------------------------------------------
// Piano : intervalles joués pour une frappe
// ---------------------------------------------------------------------------------------------

// Note « guide » utilisée pour les interventions en notes détachées du piano :
// tierce / quinte / septième (ou tension la plus haute).
function pianoGuideInterval(chordObj, which) {
    const t = chordObj.notes;
    if (which === 'third') return t[1] !== undefined ? t[1] : t[0];
    if (which === 'fifth') return t[2] !== undefined ? t[2] : 7;
    return t.length >= 4 ? t[3] : t[t.length - 1]; // 'color' (7e / tension la plus haute)
}

// Intervalles (au-dessus de la fondamentale) joués pour une frappe de piano.
// Les notes sont empilées vers l'aigu (une 9e est jouée au-dessus de la 7e, pas en cluster).
function pianoHitIntervals(chordObj, kind, voicing, rng) {
    const stack = (arr) => {
        let prev = -99;
        return arr.map(iv => { let v = iv; while (v <= prev) v += 12; prev = v; return v; });
    };
    const full = jamChordPlaybackNotes(chordObj);
    if (kind === 'C') {
        if (voicing === 'rootless') { // position sans fondamentale : la basse la joue déjà
            const a = full.slice(1);
            if (a.length < 3) a.push(full[0] + 12);
            return stack(a);
        }
        return stack(full);
    }
    if (kind === 'S') {
        return stack([pianoGuideInterval(chordObj, 'third'), pianoGuideInterval(chordObj, 'color')]);
    }
    if (kind === 'N') {
        const which = ['third', 'fifth', 'color'][Math.floor(rng() * 3)];
        return [pianoGuideInterval(chordObj, which) + (rng() < 0.3 ? 12 : 0)];
    }
    if (typeof kind === 'number') return [stack(full)[kind % full.length]];
    return stack(full);
}

// ---------------------------------------------------------------------------------------------
// Style Classique : voicing médium, note grave, variation d'un motif d'arpège
// ---------------------------------------------------------------------------------------------

// Notes de l'accord (hauteurs écrites croissantes), dans un registre médium stable quel que soit l'accord.
function clsVoicing(env, cs, off) {
    const notes = jamChordPlaybackNotes(env.findChordObj(cs.chordId));
    let base = cs.rootIndex;
    while (base + off > 6) base -= 12;
    while (base + off < -5) base += 12;
    return stackIntervalsUp(notes).map(iv => base + iv);
}

// Note grave sous l'arpège : la basse de l'accord (basse choisie ou fondamentale), à l'octave inférieure.
function clsLowNote(env, cs, off) {
    let b = bassPc(env, cs);
    while (b + off > -6) b -= 12;
    while (b + off < -17) b += 12;
    return b;
}

// Petite variation d'un motif en croches : deux notes voisines échangées, un silence, ou une voix décalée d'un rang.
function clsMutate(slots, rng) {
    const o = slots.slice();
    const r = rng();
    if (r < 0.4) {
        const k = 1 + Math.floor(rng() * 6);
        const t = o[k]; o[k] = o[k + 1]; o[k + 1] = t;
    } else if (r < 0.7) {
        o[[3, 5, 7][Math.floor(rng() * 3)]] = null;
    } else {
        const k = 1 + Math.floor(rng() * 7);
        if (o[k] !== null) o[k] = Math.max(0, Math.min(3, o[k] + (rng() < 0.5 ? -1 : 1)));
    }
    return o;
}


if (typeof module !== 'undefined' && module.exports) {
    module.exports = { popFoldBass, bassPc, bassNear, popBassTones, popBassApproach, popScaleNotes, popLineNote, popRun, latBassTones,
        jamChordPlaybackNotes, popVoicing, popSusVoicing, latThumb, latVary, latDetach,
        brassParts, isSplit, isSplitEffective, getStepHalves,
        bandSwing, swingPos, pickWeighted, meterKey, patternLib, pianoGuideInterval, pianoHitIntervals,
        clsVoicing, clsLowNote, clsMutate };
}
