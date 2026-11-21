// band/classic-eras-plan.js — orchestre « Classique » (piano seul) : une écriture par époque, imposée par les styles de grille
// de la famille « Musique classique » (rythmes c-renaissance, c-chaconne, c-nocturne, c-romantic, c-impression, c-satie,
// c-neoclassic, c-minimal), et choisie aussi dans le pop-up Orchestre (« Classique : nocturne »…). Sans DOM. Fonctions pures :
//   env.transOffset, env.findChordObj(id)   comme dans band/band-helpers.js
//   env.bpm        tempo ;  env.splitBeat  temps où change l'accord d'une mesure à deux accords
//   env.density    curseur « Densité » (0 à 1 ; 0,5 = écriture d'origine) ; absent = écriture d'origine
// Toutes les signatures régulières (2, 3 ou 4 temps, binaires ou composées : en 6/8, 9/8, 12/8 un temps = une noire pointée)
// sont jouées ; le style Baroque d'origine (c-baroque) reste dans band/classic-plan.js.
// Chargé par index.html via <script src="band/classic-eras-plan.js"> (après band/band-helpers.js, avant band/classic-plan.js)
// et testé par band/classic-eras-plan.test.js.

if (typeof clsVoicing === 'undefined' && typeof require === 'function') {
    var { clsVoicing, clsLowNote, popScaleNotes } = require('./band-helpers.js');
}

const CLASSIC_ERA_GROOVES = ['c-renaissance', 'c-chaconne', 'c-nocturne', 'c-romantic', 'c-impression', 'c-satie', 'c-neoclassic', 'c-minimal'];
// Rythme d'époque applicable (ou null : jeu Classique ordinaire, ou Baroque).
function classicEraGroove(groove) { return CLASSIC_ERA_GROOVES.includes(groove) ? groove : null; }

// Ordre des variations d'une basse obstinée : chaque énoncé du ground (huit mesures = deux phrases) change d'écriture,
// du plus simple au plus brillant, comme dans une chaconne de Bach ou une passacaille de Haendel.
const CE_CHACONNE_ORDER = ['sarabande', 'eighths', 'dotted', 'sixteenths', 'scales', 'chords'];
// Motifs d'ostinato du minimalisme (rangs dans l'accord ; au-delà du nombre de notes, l'octave supérieure)
const CE_MIN_PATTERNS = [[0, 1, 2, 1], [0, 1, 2, 3, 2, 1], [0, 2, 1, 2], [0, 1, 2, 0, 1, 2, 0, 1], [0, 1, 2, 3]];
// Cellules de doubles-croches d'un temps (chaconne) : rangs dans l'accord
const CE_CELLS = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [3, 2, 1, 0], [2, 1, 0, 1]];

function cePickW(rng, opts) {
    const tot = opts.reduce((a, o) => a + o[1], 0);
    let r = rng() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[opts.length - 1][0];
}

// Choix faits une fois par phrase (ajoutés aux choix du style Classique par classicPhraseExtras).
// prev : phrase précédente du même orchestre (ou null) ; index : rang de la phrase depuis le début de la jam.
function classicEraPhraseExtras(groove, bpm, rng, prev, index) {
    const g = classicEraGroove(groove);
    if (!g) return {};
    const pe = (prev && prev.cEra === g) ? prev : null;
    const idx = (n) => Math.floor(rng() * n);
    const out = { cEra: g, ceShift: Math.round((rng() - 0.5) * 4), ceOrn: rng() < 0.55, ceDouble: rng() < 0.5 };
    // ligne mélodique et accompagnement continus : l'état passe d'une phrase d'orchestre à la suivante
    if (pe && pe.ceM) out.ceM = { ...pe.ceM };
    if (pe && pe.ceAcc) out.ceAcc = { ...pe.ceAcc };
    if (g === 'c-renaissance') out.ceFam = (pe && rng() < 0.4) ? pe.ceFam : cePickW(rng, [['pavane', 3], ['choral', 2], ['lute', 2]]);
    else if (g === 'c-chaconne') {
        const k = Math.floor(index / 2);   // un énoncé du ground = deux phrases de quatre mesures
        out.ceVar = k < CE_CHACONNE_ORDER.length ? CE_CHACONNE_ORDER[k] : CE_CHACONNE_ORDER[1 + idx(CE_CHACONNE_ORDER.length - 1)];
        if (pe && index % 2 === 1) out.ceVar = pe.ceVar;   // les deux moitiés d'un énoncé gardent la même écriture
        out.ceCell = (pe && index % 2 === 1) ? pe.ceCell : idx(CE_CELLS.length);
        out.ceOct = rng() < 0.4;
    } else if (g === 'c-nocturne') out.ceFam = cePickW(rng, [['cantabile', 3], ['appog', 1.5]]);
    else if (g === 'c-romantic') out.ceFam = (pe && rng() < 0.35) ? pe.ceFam : cePickW(rng, [['battus', 3], ['surge', 2], ['choral', 2]]);
    else if (g === 'c-impression') out.ceFam = (pe && rng() < 0.3) ? pe.ceFam : cePickW(rng, [['arabesque', 3], ['melody', 3], ['ripple', 2], ['echo', 2], ['bells', 1.5], ['planing', 1]]);   // couleur dominante de la phrase (chaque mesure choisit ensuite son geste)
    else if (g === 'c-satie') {
        out.ceIntro = index === 0;   // comme dans les Gymnopédies : la main gauche seule d'abord
        out.ceRh = idx(3);
        out.ceDir = rng() < 0.5 ? 1 : -1;
    } else if (g === 'c-neoclassic') {
        out.ceFam = (pe && rng() < 0.35) ? pe.ceFam : cePickW(rng, [['march', 3], ['toccata', 2], ['pastiche', 2.5]]);
        out.ceMotif = idx(4);
        out.ceWrong = 1 + idx(6);
    } else if (g === 'c-minimal') {
        // l'ostinato tient deux phrases (huit mesures), puis change de motif
        if (pe && index % 2 === 1) { out.ceFam = pe.ceFam; out.ceP = pe.ceP; out.ceSize = pe.ceSize; }
        else { out.ceFam = cePickW(rng, [['glass', 4], ['triplets', 2], ['pulse', 1.5]]); out.ceP = idx(CE_MIN_PATTERNS.length); out.ceSize = rng() < 0.6 ? 3 : 4; }
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Outils de hauteur (hauteurs écrites ; réel = écrit + transOffset)
// ---------------------------------------------------------------------------------------------
const ceMod = (x) => ((x % 12) + 12) % 12;
// Classes de hauteur de l'accord (toutes ses notes, neuvièmes comprises)
function cePcs(env, cs) {
    const co = env.findChordObj(cs.chordId);
    const set = [];
    (co && co.notes ? co.notes : [0, 4, 7]).forEach(n => { const p = ceMod(cs.rootIndex + n); if (!set.includes(p)) set.push(p); });
    return set;
}
// Notes de l'accord entre deux hauteurs, en montant
function ceTonesIn(pcs, lo, hi) {
    const out = [];
    for (let p = Math.ceil(lo); p <= hi; p++) if (pcs.includes(ceMod(p))) out.push(p);
    return out;
}
// Accord en position serrée (size notes consécutives de l'accord) dont la note du haut est la plus proche de `center` ;
// les positions où deux voix voisines frottent d'un demi-ton (si - do d'une septième majeure) sont évitées quand c'est possible.
function ceVoiceNear(pcs, center, size, lo, hi) {
    const T = ceTonesIn(pcs, lo, hi);
    if (T.length <= size) return T.length ? T : [Math.round(center)];
    let best = null, bs = Infinity;
    for (let k = size - 1; k < T.length; k++) {
        const v = T.slice(k - size + 1, k + 1);
        let sc = Math.abs(v[v.length - 1] - center) + (v[v.length - 1] - v[0] > 14 ? 4 : 0);
        for (let j = 1; j < v.length; j++) if (v[j] - v[j - 1] === 1) sc += j === 1 ? 4 : 2.5;
        if (sc < bs) { bs = sc; best = v; }
    }
    return best;
}
// Note de passage du soprano : degré voisin (dir d'abord, sinon l'autre sens) qui ne fait ni demi-ton ni triton avec les
// autres voix ; à défaut, la note de départ (la voix reste en place).
function ceConsonantStep(cs, p, dir, others) {
    for (const d of [dir, -dir]) {
        const n = ceStep(cs, p, d);
        if (others.every(o => { const ic = ceMod(n - o); return ic !== 1 && ic !== 11 && ic !== 6; })) return n;
    }
    return p;
}
const ceNearest = (list, p) => list.reduce((b, x) => (b === null || Math.abs(x - p) < Math.abs(b - p)) ? x : b, null);
// Note voisine dans la gamme de l'accord (dir = +1 au-dessus, -1 au-dessous)
function ceStep(cs, p, dir) {
    const S = popScaleNotes(cs, p - 3, p + 3).filter(x => (x - p) * dir > 0);
    if (!S.length) return p + dir;
    return dir > 0 ? Math.min(...S) : Math.max(...S);
}

// ---------------------------------------------------------------------------------------------
// Plan d'une mesure
// ---------------------------------------------------------------------------------------------
// bpb : temps de la mesure ; ternary : mesure composée (un temps = trois croches) ; m : rang de la mesure depuis le début de la jam.
function buildClassicEraPlan(env, bpb, ternary, step, nextStep, isLastMeasureOfStep, halves, ph, i, L, isTurn, m) {
    const rng = ph.rng;
    const off = env.transOffset || 0;
    const nb = Math.max(1, bpb || 4);
    const splitAt = halves ? Math.max(0.5, Math.min(nb - 0.5, env.splitBeat || Math.ceil(nb / 2))) : nb;
    const segs = halves
        ? [{ s: 0, e: splitAt, cs: halves[0] }, { s: splitAt, e: nb, cs: halves[1] }]
        : [{ s: 0, e: nb, cs: step }];
    const sameChord = (a, b) => !!a && !!b && a.rootIndex === b.rootIndex && a.chordId === b.chordId
        && (Number.isInteger(a.bassRootIndex) ? a.bassRootIndex : -1) === (Number.isInteger(b.bassRootIndex) ? b.bassRootIndex : -1);
    const lastSeg = segs[segs.length - 1];
    const changes = isLastMeasureOfStep && !!nextStep && !sameChord(lastSeg.cs, nextStep);
    const holdOn = !changes && !!nextStep;
    const dens = Number.isFinite(env.density) ? Math.max(0, Math.min(1, env.density)) : 0.5;
    const up = Math.max(0, (dens - 0.5) / 0.5);     // 0 à 1 au-dessus de l'écriture d'origine
    const thin = Math.max(0, (0.5 - dens) / 0.5);   // 0 à 1 en dessous
    const prog = L > 1 ? i / (L - 1) : 0;
    const I = typeof ph.intensity === 'number' ? ph.intensity : 0.5;
    const gv = (0.72 + 0.3 * I) * (0.94 + 0.06 * prog);
    const bpm = env.bpm || 80;
    const e8 = ternary ? 1 / 3 : 0.5;        // croche, en temps
    const e16 = ternary ? 1 / 6 : 0.25;      // double-croche
    const beatSec = 60 / bpm;
    const fits = (unit) => unit * beatSec >= 0.085;   // assez lent pour des notes de cette valeur
    const ev = [];
    const clampV = (v) => Math.max(0.1, Math.min(1, v));
    const fold = (p) => { while (p + off > 31) p -= 12; while (p + off < -26) p += 12; return p; };

    // Accords de la mesure (et de la suivante) pour les lignes qui traversent la barre de mesure (impressionnisme, romantisme)
    // pcs : notes de l'accord, basse comprise (accord sur basse : C/E…), pour éviter qu'une note de la ligne ne frotte contre elle
    const withBass = (cs) => { const p = cePcs(env, cs); if (Number.isInteger(cs.bassRootIndex) && !p.includes(ceMod(cs.bassRootIndex))) p.push(ceMod(cs.bassRootIndex)); return p; };
    const segInfo = segs.map(sg => ({ s: sg.s, e: sg.e, cs: sg.cs, pcs: withBass(sg.cs) }));
    const nextCs = changes ? nextStep : (holdOn ? lastSeg.cs : null);
    // putM : frappe à l'échelle de la mesure ; une note peut déborder sur la mesure suivante (liaison) d'au plus 1,5 temps
    const putM = (pos, dur, pitches, vel, o = {}) => {
        if (!pitches || !pitches.length || pos >= nb - 1e-6 || pos < -1e-6) return;
        const ps = pitches.map(fold).sort((a, b) => a - b).filter((x, k, arr) => k === 0 || x !== arr[k - 1]);
        const c = ps.length;
        const evt = {
            pos, dur: Math.max(0.12, Math.min(nb + 1.5 - pos, dur)), vel: clampV(vel * gv), rootIndex: 0, intervals: ps,
            noteVels: o.nv ? ps.map((_, k) => (k === c - 1 ? 1 : o.nv)) : ps.map((_, k) => (c === 1 ? 1 : (k === c - 1 ? 1 : 0.84))),
            roll: c > 1 ? (o.roll !== undefined ? o.roll : 0.012 + rng() * 0.01) : 0,
            lay: rng() * 0.006, wide: true, gainMul: 1.2, opt: !!o.opt
        };
        ev.push(evt);
        return evt;
    };
    const ctx = { env, rng, ph, i, L, isTurn, nb, ternary, prog, I, up, thin, e8, e16, fits, bpm, m: m || 0, segInfo, nextCs, putM };
    const writer = CE_WRITERS[ph.cEra] || CE_WRITERS['c-nocturne'];
    segs.forEach((sg, si) => {
        const lastOne = si === segs.length - 1;
        const cs = sg.cs;
        const toCs = lastOne ? (changes ? nextStep : null) : segs[si + 1].cs;
        const endPos = sg.e + ((lastOne && holdOn) ? 1.2 : 0.05);
        const pcs = cePcs(env, cs);
        const low = clsLowNote(env, cs, off);
        // put(position dans la mesure, durée max en temps, hauteurs, vélocité, options { roll, nv, opt, ring })
        const put = (pos, max, pitches, vel, o = {}) => {
            if (!pitches || !pitches.length || pos >= sg.e - 1e-6 || pos < sg.s - 1e-6) return;
            const ps = pitches.map(fold).sort((a, b) => a - b).filter((x, k, arr) => k === 0 || x !== arr[k - 1]);
            const c = ps.length;
            ev.push({
                pos, dur: Math.max(0.12, Math.min(endPos - pos, max)), vel: clampV(vel * gv),
                rootIndex: 0, intervals: ps,
                noteVels: o.nv ? ps.map((_, k) => (k === c - 1 ? 1 : o.nv)) : ps.map((_, k) => (c === 1 ? 1 : (k === c - 1 ? 1 : 0.84))),
                roll: c > 1 ? (o.roll !== undefined ? o.roll : 0.012 + rng() * 0.01) : 0,
                lay: rng() * 0.006, wide: true, gainMul: 1.2, opt: !!o.opt
            });
        };
        writer({ ...ctx, sg, si, lastOne, cs, toCs, pcs, low, put, len: sg.e - sg.s, closing: isTurn && lastOne && L > 1 });
    });

    // Curseur « Densité » sous 0,5 : les notes d'ornement et de remplissage disparaissent (la basse et les temps forts restent)
    if (thin > 0) {
        for (let k = ev.length - 1; k >= 0; k--) if (ev[k].opt && rng() < 0.9 * thin) ev.splice(k, 1);
    }
    ev.forEach(e => { delete e.opt; });
    ev.sort((a, b) => a.pos - b.pos);
    return { piano: ev, bass: [], drums: [] };
}

// Positions régulières dans un segment (pas = unit), de s à e
function ceGrid(sg, unit) {
    const out = [];
    const n = Math.max(1, Math.round((sg.e - sg.s) / unit));
    for (let k = 0; k < n; k++) out.push(sg.s + k * unit);
    return out;
}

// ---------------------------------------------------------------------------------------------
// Ligne mélodique continue (impressionnisme, romantisme tardif)
// ---------------------------------------------------------------------------------------------
// La mélodie n'est plus écrite mesure par mesure : un état (ph.ceM, transmis d'une phrase d'orchestre à la suivante)
// garde la dernière note, la position de la prochaine attaque (qui peut tomber après la barre de mesure quand une note
// est liée), la phrase mélodique en cours (longueur en temps, sommet visé, sens) et la respiration à venir. Les phrases
// mélodiques durent de une à trois mesures et commencent ou finissent n'importe où dans la mesure (levées, notes liées).
// cfg : { lo, hi, center, vals [[durée, poids]…], runP, runUnits, leapP, appogP, len [min, max] (temps), breath [min, max],
//         vel, dbl(p) → hauteurs jouées, pool(cs, pcs) → réservoir de notes }
function ceFitsChord(cs, pcs, p) {
    const pc = ceMod(p);
    if (pcs.includes(pc)) return true;
    const S = popScaleNotes(cs, p, p);
    return S.length > 0 && !pcs.includes(ceMod(p - 1)) && !pcs.includes(ceMod(p + 1));
}
function ceMelody(c, cfg) {
    const { rng, ph, nb, segInfo, nextCs, putM, fits, env } = c;
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const segAt = (t) => segInfo.find(sg => t >= sg.s - 1e-6 && t < sg.e - 1e-6) || segInfo[segInfo.length - 1];
    const poolOf = (sg) => cfg.pool(sg.cs, sg.pcs).filter(p => p >= cfg.lo && p <= cfg.hi);
    const M = ph.ceM || (ph.ceM = { p: Math.round(cfg.center), t: 0, left: 0, rest: 0.5 + Math.floor(rng() * 3) * 0.5, tgt: cfg.center, dir: 1 });
    let t = M.t;
    let guard = 0;
    while (t < nb - 1e-6 && guard++ < 64) {
        if (M.rest > 1e-6) { const adv = Math.min(M.rest, nb - t); t += adv; M.rest -= adv; continue; }
        if (M.left <= 1e-6) {
            // nouvelle phrase mélodique : une à trois mesures, sommet tiré autour du centre du registre
            M.left = cfg.len[0] + rng() * (cfg.len[1] - cfg.len[0]);
            M.tgt = cfg.center + (rng() - 0.35) * 9;
            M.dir = M.tgt >= M.p ? 1 : -1;
            M.span = M.left;
        }
        const sg = segAt(t);
        const P = poolOf(sg);
        if (P.length < 3) { t = nb; break; }
        let j = Math.max(0, P.indexOf(ceNearest(P, M.p)));
        // sens : vers le sommet pendant la première moitié de la phrase, puis retour vers le centre
        const half = M.left < (M.span || 1) * 0.45;
        const goal = half ? cfg.center - 2 : M.tgt;
        const dir = Math.abs(P[j] - goal) < 1.5 ? (rng() < 0.5 ? 1 : -1) : (P[j] < goal ? 1 : -1);
        const prog = 1 - M.left / (M.span || 1);
        const arch = Math.sin(Math.PI * Math.max(0, Math.min(1, prog)));
        const vel = cfg.vel[0] + (cfg.vel[1] - cfg.vel[0]) * arch;
        const runUnit = cfg.runUnits.filter(u => fits(u))[0];
        if (runUnit && rng() < cfg.runP && M.left >= 1) {
            // trait (arabesque, gruppetto, ruissellement) : 3 à 7 notes rapides qui mènent à une note tenue
            const n = 3 + Math.floor(rng() * 5);
            let rd = dir, lastEv = null;
            for (let k = 0; k < n && t < nb - 1e-6; k++) {
                let nj = j + rd * (rng() < 0.8 ? 1 : 2);
                if (nj < 0 || nj >= P.length) { rd = -rd; nj = j + rd; }   // rebond en bout de registre (pas de note répétée)
                j = Math.max(0, Math.min(P.length - 1, nj));
                lastEv = putM(t, runUnit * 1.8, [P[j]], vel * (0.75 + 0.25 * k / n), { opt: k % 2 === 1 && k < n - 1 });
                t += runUnit; M.left -= runUnit;
            }
            // la dernière note du trait se pose et se tient jusqu'à la croche suivante : la ligne retombe sur la grille
            const g = c.ternary ? 1 / 3 : 0.5;
            const tal = Math.ceil((t - 1e-6) / g) * g;
            if (lastEv) { lastEv.dur = Math.max(lastEv.dur, tal - lastEv.pos + 0.6); lastEv.opt = false; }
            M.left -= (tal - t); t = tal;
            M.p = P[j];
            continue;
        }
        // une note ordinaire part toujours de la grille des croches (pas d'attaque flottante après un trait ou une liaison)
        const gq = c.ternary ? 1 / 3 : 0.5;
        const tq = Math.ceil((t - 1e-6) / gq) * gq;
        if (tq - t > 1e-6) { M.left -= (tq - t); t = tq; if (t >= nb - 1e-6) break; }
        let d = cePickW(rng, cfg.vals);
        if (d > M.left + 0.5) d = Math.max(0.5, Math.round(M.left * 2) / 2);
        // hauteur : degré conjoint le plus souvent, parfois un saut (quarte, quinte, sixte)
        const stp = rng() < cfg.leapP ? 2 + Math.floor(rng() * 2) : 1;
        j = Math.max(0, Math.min(P.length - 1, j + dir * stp));
        let note = P[j];
        const onBeat = Math.abs(t - Math.round(t)) < 1e-6;
        if (onBeat && !sg.pcs.includes(ceMod(note))) {
            const tn = ceTonesIn(sg.pcs, note - 2, note + 2).filter(x => x >= cfg.lo && x <= cfg.hi);
            if (tn.length) {
                const ch = ceNearest(tn, note);
                // appoggiature : la note étrangère sur le temps, résolue par degré vers la note de l'accord
                if (cfg.appogP && rng() < cfg.appogP && d >= 1 && Math.abs(ch - note) <= 2) {
                    putM(t, d * 0.5, cfg.dbl(note), vel * 1.05);
                    putM(t + d * 0.5, d * 0.5 + 0.2, cfg.dbl(ch), vel * 0.85);
                    M.p = ch; t += d; M.left -= d;
                    if (M.left <= 1e-6) M.rest = cfg.breath[0] + rng() * (cfg.breath[1] - cfg.breath[0]);
                    continue;
                }
                note = ch;
            }
        }
        // liaison par-dessus la barre : seulement si la note convient à l'accord suivant, sinon elle s'arrête à la barre
        let dd = d;
        if (t + d > sg.e + 1e-6) {
            const nxt = segInfo.find(x => x.s >= sg.e - 1e-6) || (nextCs ? { cs: nextCs, pcs: cePcs(env, nextCs) } : null);
            if (nxt && !ceFitsChord(nxt.cs, nxt.pcs, note)) dd = Math.max(0.5, sg.e - t);
        }
        putM(t, dd + 0.15, cfg.dbl(note), vel);
        M.p = note; t += dd; M.left -= dd;
        if (M.left <= 1e-6) M.rest = cfg.breath[0] + rng() * (cfg.breath[1] - cfg.breath[0]);
    }
    M.t = Math.max(0, t - nb);
}

const CE_WRITERS = {
    // ---------- Renaissance : consort à quatre voix ou luth (pavane, passamezzo) ----------
    'c-renaissance': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, prog, closing, e8 } = c;
        const tri = pcs.slice(0, 3);
        const center = 13 + ph.ceShift + 3 * Math.sin(Math.PI * prog);
        const V = c.env.findChordObj(cs.chordId);
        const isTriad = V && V.notes && V.notes.length === 3 && (V.notes[1] === 3 || V.notes[1] === 4);
        let Vc = ceVoiceNear(tri, center, 3, low + 9, 24);
        const top = Vc[Vc.length - 1];
        const s = sg.s;
        // Cadence de fin de phrase : retard de la quarte (4 - 3) sur l'accord, résolu à mi-mesure
        if (closing && isTriad && len >= 2) {
            const third = ceMod(cs.rootIndex + V.notes[1]);
            const sus = Vc.map(p => ceMod(p) === third ? p + (5 - V.notes[1]) : p);
            const h = len >= 4 ? 2 : len / 2;
            put(s, len, [low], 0.62);
            put(s, h, sus, 0.6, { nv: 0.8 });
            put(s + h, len - h, Vc, 0.5, { nv: 0.8 });
            return;
        }
        put(s, len, [low], 0.62);
        if (ph.ceFam === 'lute') {
            // luth : basse au pouce, accord brisé en noires aux doigts, divisions en croches quand la densité monte
            const ord = [Vc[1], Vc[2], Vc[0], Vc[2]];
            const q = Math.max(1, Math.floor(len));
            for (let b = 0; b < q; b++) {
                const p = b === 0 ? Vc : [ord[b % 4]];
                put(s + b, 1.6, p, b === 0 ? 0.55 : 0.48, { roll: 0.035, opt: b > 0 && b % 2 === 1 });
                if (up > 0.3 && rng() < up && b < q - 1) put(s + b + e8, 0.6, [ceConsonantStep(cs, ord[b % 4], rng() < 0.5 ? 1 : -1, [low])], 0.4, { opt: true });
            }
            return;
        }
        if (ph.ceFam === 'choral' || len < 3) {
            // demi-notes (blanches) : le soprano change de note de l'accord au milieu de la mesure (échange de voix)
            const h = len >= 4 ? 2 : len;
            put(s, h, Vc, 0.56, { nv: 0.82, roll: 0.006 });
            if (len >= 4) {
                const alt = ceTonesIn(tri, top - 5, top + 5).filter(p => p !== top);
                const t2 = alt.length ? ceNearest(alt, top + (rng() < 0.5 ? 2 : -2)) : top;
                put(s + 2, 2, ceVoiceNear(tri, t2, 3, low + 9, 24), 0.5, { nv: 0.82, roll: 0.006 });
            }
            return;
        }
        // pavane : rythme long - bref - bref (blanche, noire, noire), le soprano passe par degrés conjoints
        const dir = rng() < 0.5 ? 1 : -1;
        put(s, 2, Vc, 0.58, { nv: 0.82, roll: 0.006 });
        const others = [low].concat(Vc.slice(0, -1));
        const n2 = ceConsonantStep(cs, top, dir, others);
        put(s + 2, 1, Vc.slice(0, -1).concat([n2]), 0.48, { nv: 0.82, roll: 0.006 });
        if (len >= 4) put(s + 3, 1, Vc, 0.5, { nv: 0.82, roll: 0.006, opt: true });
        if (up > 0.4 && n2 !== top) put(s + 2 + e8, 0.5, [top], 0.4, { opt: true });
    },

    // ---------- Basse obstinée (chaconne, passacaille, folia) : le ground à la main gauche, une variation par énoncé ----------
    'c-chaconne': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, prog, e8, e16, fits, closing } = c;
        const s = sg.s;
        const bass = (ph.ceOct && low - 12 + c.env.transOffset >= -24) ? [low - 12, low] : [low];
        put(s, len, bass, 0.66);
        const center = 12 + ph.ceShift + 2 * Math.sin(Math.PI * prog);
        const V3 = ceVoiceNear(pcs, center, 3, low + 8, 24);
        const rank = (V, k) => { const n = V.length, q = Math.floor(k / n); return V[k - q * n] + 12 * q; };
        let kind = ph.ceVar || 'sarabande';
        if (kind === 'sixteenths' && !fits(e16)) kind = 'eighths';
        if (closing && kind !== 'chords') {   // fin d'énoncé : accord posé sur le dernier temps
            put(s, Math.max(1, len - 1), V3, 0.5, { roll: 0.015 });
            if (len >= 2) put(s + len - 1, 1.4, V3.concat([V3[V3.length - 1] + (rng() < 0.5 ? 0 : 12)]), 0.56, { roll: 0.02 });
            return;
        }
        if (kind === 'sarabande') {
            // accent sur le deuxième temps, comme une sarabande
            put(s, 1, V3, 0.48);
            if (len >= 2) put(s + 1, len - 1, V3.concat(up > 0.4 ? [V3[0] + 12] : []), 0.62, { roll: 0.018 });
        } else if (kind === 'eighths' || kind === 'sixteenths') {
            const unit = kind === 'eighths' ? e8 : e16;
            const cell = kind === 'eighths' ? [0, 1, 2, 1] : CE_CELLS[ph.ceCell || 0];
            ceGrid(sg, unit).forEach((p, k) => {
                const shift = Math.floor((p - s) + 1e-6) % 2;   // la figure monte d'un rang un temps sur deux (effet de séquence)
                put(p, unit * 1.9, [rank(V3, cell[k % cell.length] + shift)], k === 0 ? 0.58 : (Math.abs(p - Math.round(p)) < 1e-6 ? 0.52 : 0.44), { opt: k % 2 === 1 && kind === 'sixteenths' });
            });
        } else if (kind === 'dotted') {
            // rythmes pointés (style français) : longue - brève, la brève mène à la note suivante
            const q = Math.max(1, Math.floor(len));
            let note = V3[V3.length - 1];
            for (let b = 0; b < q; b++) {
                put(s + b, 0.75, b === 0 ? V3 : [note], b === 0 ? 0.6 : 0.54);
                const nx = ceStep(cs, note, b % 2 === 0 ? 1 : -1);
                put(s + b + 0.75, 0.25, [nx], 0.44, { opt: true });
                const pool = ceTonesIn(pcs, nx - 4, nx + 4);
                note = pool.length ? ceNearest(pool, nx) : nx;
            }
        } else if (kind === 'scales') {
            // gamme en croches qui traverse la mesure, montante ou descendante une mesure sur deux
            const dir = c.i % 2 === 0 ? 1 : -1;
            const S = popScaleNotes(cs, V3[0] - 7, V3[V3.length - 1] + 12);
            let j = S.indexOf(dir > 0 ? V3[0] : V3[V3.length - 1]);
            if (j < 0) j = Math.floor(S.length / 2);
            ceGrid(sg, e8).forEach((p, k) => {
                const jj = Math.max(0, Math.min(S.length - 1, j + dir * k));
                put(p, e8 * 1.8, [S[jj]], k === 0 ? 0.56 : 0.46, { opt: k % 2 === 1 && up < 0.2 && rng() < 0.3 });
            });
        } else {   // chords : accords pleins sur chaque temps (variation majestueuse)
            const V4 = V3.concat([V3[0] + 12]);
            const q = Math.max(1, Math.floor(len));
            for (let b = 0; b < q; b++) put(s + b, 1, b === 0 ? V4 : V3, b === 0 ? 0.68 : 0.56, { roll: 0.012, opt: b === q - 1 && q > 2 });
            if (up > 0.5 && fits(e8)) for (let b = 0; b < q; b++) put(s + b + e8, e8, [V3[V3.length - 1]], 0.42, { opt: true });
        }
    },

    // ---------- Nocturne (Chopin, Field) : grand arpège de la main gauche avec pédale, mélodie chantée ornée ----------
    'c-nocturne': (c) => {
        const { sg, cs, toCs, pcs, low, put, len, rng, ph, up, prog, e8, fits, closing, ternary, I } = c;
        const s = sg.s;
        // main gauche : fondamentale, quinte, dixième… sur deux octaves, en croches (triolets quand la densité monte)
        const T = ceTonesIn(pcs, low + 5, low + 26);
        const spread = [];
        let last = low;
        for (const p of T) { if (p - last >= 3 && spread.length < 4) { spread.push(p); last = p; } }
        while (spread.length < 3) spread.push((spread.length ? spread[spread.length - 1] : low) + 12);
        const wave = [low].concat(spread, spread.slice(0, -1).reverse());
        const unit = (!ternary && up > 0.6 && fits(1 / 3)) ? 1 / 3 : (c.thin > 0.6 ? 1 : e8);
        ceGrid(sg, unit).forEach((p, k) => {
            const note = wave[k % wave.length];
            put(p, Math.min(2.4, sg.e - p + 0.6), [note], k === 0 ? 0.56 : 0.36 + (note === spread[spread.length - 1] ? 0.05 : 0), { opt: k > 0 && k % 2 === 1 && unit < 0.5 });
        });
        // main droite : la mélodie suit un arc (monte au milieu de la phrase), sur les notes de l'accord
        const center = 16 + ph.ceShift + 4 * Math.sin(Math.PI * prog);
        const M = ceTonesIn(pcs, 10, 26);
        if (!M.length) return;
        const m0 = ceNearest(M, center);
        const dbl = (p) => {
            if (!(ph.ceDouble && I > 0.55)) return [p];
            const below = ceTonesIn(pcs, p - 9, p - 3);
            return below.length ? [below[below.length - 1], p] : [p];
        };
        const h = len >= 4 ? 2 : len;
        if (ph.ceFam === 'appog' && len >= 2 && !closing) {
            // appoggiature : la note voisine au-dessus, sur le temps, qui se résout en soupirant
            const ap = ceStep(cs, m0, 1);
            put(s, 0.5, [ap], 0.66);
            put(s + 0.5, h - 0.5, dbl(m0), 0.6, { nv: 0.7 });
        } else {
            put(s, closing ? len : h, dbl(m0), 0.68, { nv: 0.7 });
        }
        if (len >= 4 && !closing) {
            // deuxième note : vers l'accord suivant par degré conjoint, ou une autre note de l'accord
            let m1;
            if (toCs) {
                const nx = ceTonesIn(cePcs(c.env, toCs), m0 - 5, m0 + 5);
                const tgt = nx.length ? ceNearest(nx, m0) : m0;
                m1 = tgt === m0 ? ceStep(cs, m0, rng() < 0.5 ? 1 : -1) : ceStep(cs, tgt, tgt > m0 ? -1 : 1);
            } else {
                const alt = M.filter(p => p !== m0 && Math.abs(p - m0) <= 5);
                m1 = alt.length ? alt[Math.floor(rng() * alt.length)] : m0;
            }
            // gruppetto (note du dessus, note, note du dessous) avant la deuxième note, une mesure sur deux
            if (ph.ceOrn && c.i % 2 === 1 && fits(1 / 6)) {
                put(s + 2 - 0.5, 1 / 6, [ceStep(cs, m1, 1)], 0.5, { opt: true });
                put(s + 2 - 1 / 3, 1 / 6, [m1], 0.48, { opt: true });
                put(s + 2 - 1 / 6, 1 / 6, [ceStep(cs, m1, -1)], 0.48, { opt: true });
            }
            put(s + 2, 2, dbl(m1), 0.62, { nv: 0.7 });
            if (up > 0.5) put(s + 3 + e8 * (ternary ? 2 : 1), e8, [ceStep(cs, m1, -1)], 0.46, { opt: true });
        }
    },

    // ---------- Romantisme tardif (Wagner, Franck, Liszt) : ligne chantée continue sur un accompagnement qui coule ----------
    // La mélodie (ceMelody) traverse les barres de mesure : phrases d'une à trois mesures, notes liées, appoggiatures,
    // sauts expressifs, doublure à l'octave dans les moments intenses. L'accompagnement garde une même texture deux à quatre
    // mesures (accords battus dont la position change, grandes vagues d'arpèges, syncopes à la Schumann, rarement un choral)
    // et la poursuit sans repartir à chaque temps 1 ; la basse avance vers l'accord suivant.
    'c-romantic': (c) => {
        const { sg, si, cs, toCs, pcs, low, put, rng, ph, up, thin, fits, ternary, nb, I } = c;
        const len = c.len, s = sg.s, e = sg.e;
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        if (si === 0) {
            const A = ph.ceAcc;
            if (!A || A.bars >= A.dur) ph.ceAcc = { kind: cePickW(rng, [['battus', 3], ['wave', 3], ['synco', 2], ['choral', A && A.kind === 'choral' ? 0 : 0.8]].filter(([k]) => !A || k !== A.kind || rng() < 0.3)), k: A ? A.k : 0, bars: 0, dur: 2 + Math.floor(rng() * 3) };
            else A.bars++;
            ceMelody(c, {
                lo: 15, hi: 29, center: 21 + ph.ceShift,
                vals: [[1, 2], [1.5, 2], [0.5, 1.5], [2, 2], [3, 1.2], [4, 0.5]],
                runP: 0.07 + 0.08 * up, runUnits: ternary ? [1 / 6] : [1 / 6, 1 / 4], leapP: 0.3, appogP: 0.35,
                len: [nb, nb * 3], breath: [0.5, 1.25 + thin],
                vel: [0.5, 0.8],
                dbl: (p) => (ph.ceDouble && I > 0.5 && p - 12 >= 14) ? [p - 12, p] : [p],
                pool: (x) => popScaleNotes(x, 13, 31)
            });
        }
        const A = ph.ceAcc;
        const blk = (A.bars + s / nb) / Math.max(1, A.dur);                   // avancée dans le bloc de texture
        const dyn = 0.4 + 0.35 * Math.sin(Math.PI * Math.min(1, blk + 0.15));  // houle sur plusieurs mesures
        // ----- basse -----
        const oct = (low - 12 + c.env.transOffset >= -26) ? [low - 12, low] : [low, low + 12];
        const keep = c.lastOne === false ? false : (ph.ceBass === low && rng() < 0.45);   // même basse : on la laisse sonner
        if (!keep) put(s, len + 1.2, rng() < 0.6 ? oct : [low], 0.5 + 0.2 * dyn);
        ph.ceBass = low;
        if (len >= 3 && toCs) {
            // marche de basse vers l'accord suivant (note de passage sur le dernier temps)
            const nl = clsLowNote(c.env, toCs, c.env.transOffset || 0);
            if (Math.abs(nl - low) >= 3) {
                const LS = popScaleNotes(cs, Math.min(nl, low) - 2, Math.max(nl, low) + 2);
                const pass = ceNearest(LS.filter(p => p !== low && p !== nl), nl + (nl > low ? -1.5 : 1.5));
                if (pass !== null) put(e - 1, 1.1, [pass], 0.42 + 0.1 * dyn, { opt: rng() < 0.3 });
            }
        } else if (len >= 4 && !keep && rng() < 0.4) put(s + 2, 2, [low + 7 <= low + 12 ? low + 7 : low], 0.36, { opt: true });

        // ----- accompagnement -----
        const accHi = 21;
        if (A.kind === 'battus') {
            const unit = ternary ? 1 / 3 : (fits(1 / 3) ? 1 / 3 : 0.5);
            ceGrid(sg, unit).forEach((p) => {
                // la position de l'accord change tous les deux temps (voix intérieures qui bougent), sans accent de barre
                const half = Math.floor(p / 2 + 1e-6);
                const V = ceVoiceNear(pcs, 13 + ((half + A.k) % 2 ? 2 : -1), 3, low + 9, accHi);
                const onB = Math.abs(p - Math.round(p)) < 1e-6;
                put(p, unit * 1.05, V, (onB ? 0.33 : 0.27) + 0.18 * dyn, { roll: 0.004, opt: !onB && rng() < 0.35 });
            });
            A.k++;
        } else if (A.kind === 'wave') {
            // grandes vagues d'arpèges, qui continuent d'une mesure à l'autre
            const T = ceTonesIn(pcs, low + 7, low + 27).filter(p => p <= accHi + 3);
            if (T.length >= 3) {
                const unit = ternary ? 1 / 3 : (fits(1 / 3) ? 1 / 3 : 0.5);
                const per = 2 * (T.length - 1);
                ceGrid(sg, unit).forEach((p) => {
                    const r = A.k % per, idx = r < T.length ? r : per - r;
                    put(p, unit * 3, [T[idx]], 0.26 + 0.16 * dyn + (idx === 0 ? 0.04 : 0), { opt: idx > 0 && idx % 2 === 1 && thin > 0 });
                    A.k++;
                });
            }
        } else if (A.kind === 'synco') {
            // accords syncopés (contretemps), liés, sous la mélodie
            const V = ceVoiceNear(pcs, 14, 3, low + 9, accHi);
            const off8 = ternary ? 1 / 3 : 0.5;
            ceGrid(sg, 1).forEach((p, k) => {
                const V2 = k % 2 ? ceVoiceNear(pcs, 12, 3, low + 9, accHi) : V;
                put(p + off8, 1 - off8 + 0.35, V2, 0.3 + 0.18 * dyn, { roll: 0.012, opt: k % 2 === 1 && thin > 0 });
            });
        } else {
            // choral : accords tenus, une voix intérieure glisse vers l'accord suivant
            const V = ceVoiceNear(pcs, 14, 4, low + 9, accHi);
            const h = len >= 4 ? 2 : len;
            put(s + pick([0, 0, 0.5]), h, V, 0.36 + 0.2 * dyn, { roll: 0.025, nv: 0.85 });
            if (len >= 4) {
                let V2 = V.slice();
                if (toCs) {
                    const npcs = cePcs(c.env, toCs);
                    const k = V2.findIndex((p, ix) => ix > 0 && !npcs.includes(ceMod(p)));
                    if (k >= 0) V2[k] = npcs.includes(ceMod(V2[k] + 1)) ? V2[k] + 1 : (npcs.includes(ceMod(V2[k] - 1)) ? V2[k] - 1 : V2[k]);
                } else if (V2.length > 2) V2[1] = ceStep(cs, V2[1], rng() < 0.5 ? 1 : -1);
                put(s + 2, 2.4, V2, 0.32 + 0.18 * dyn, { roll: 0.025, nv: 0.85 });
            }
        }
    },

    // ---------- Impressionnisme (Debussy, Ravel) : ligne qui flotte par-dessus les barres, accompagnement en nappes ----------
    // Une mélodie continue (ceMelody) sur un réservoir sans demi-ton qui frotte (pentatonique de l'accord, neuvièmes,
    // sixtes) : phrases d'une à trois mesures, notes liées, levées, arabesques et ruissellements intégrés à la ligne,
    // respirations. Dessous, une nappe qui dure une à trois mesures : vague d'accord brisé (qui ne repart pas à chaque
    // mesure), accords arpégés tenus à des moments variés, ou quartes et quintes parallèles en contretemps. Main gauche
    // variée, et laissée sonner quand la basse ne change pas.
    'c-impression': (c) => {
        const { sg, si, cs, pcs, low, rng, ph, up, thin, fits, ternary, nb } = c;
        const len = c.len, s = sg.s, e = sg.e;
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        const jit = (amt = 0.04) => (rng() - 0.5) * amt;
        const seen = [];
        const put = (pos, max, pitches, vel, o) => {
            const ps = pitches.filter(p => !seen.some(([q, x]) => x === p && Math.abs(q - pos) < 0.1));
            if (!ps.length) return;
            ps.forEach(p => seen.push([pos, p]));
            c.put(pos, max, ps, vel, o);
        };
        const soft = (x) => popScaleNotes(x, 8, 32).filter(p => pcsOf(x).includes(ceMod(p)) || !pcsOf(x).includes(ceMod(p - 1)));
        const pcsOf = (x) => (x === cs ? pcs : cePcs(c.env, x));
        if (si === 0) {
            const A = ph.ceAcc;
            if (!A || A.bars >= A.dur) ph.ceAcc = { kind: cePickW(rng, [['wave', 3], ['pedal', 2.5], ['planing', 1.5]].filter(([k]) => !A || k !== A.kind || rng() < 0.25)), k: A ? A.k : 0, bars: 0, dur: 1 + Math.floor(rng() * 3), dir: rng() < 0.5 ? 1 : -1 };
            else A.bars++;
            ceMelody(c, {
                lo: 17, hi: 30, center: 22 + ph.ceShift,
                vals: [[1, 2], [1.5, 2.2], [2, 1.6], [3, 1], [0.5, 1.6], [2.5, 0.8]],
                runP: 0.15 + 0.12 * up, runUnits: ternary ? [1 / 6, 1 / 3] : [1 / 6, 1 / 4, 1 / 3], leapP: 0.28, appogP: 0,
                len: [3, nb * 2.5], breath: [0.5, 1.5 + thin],
                vel: [0.28, 0.42],
                dbl: (p) => [p],
                pool: (x, xp) => popScaleNotes(x, 14, 31).filter(p => xp.includes(ceMod(p)) || !xp.includes(ceMod(p - 1)))
            });
        }
        const A = ph.ceAcc;
        // ----- main gauche (laissée sonner si la basse ne change pas) -----
        const ninth = pcs.includes(ceMod(low + 2));
        if (!(ph.ceBass === low && rng() < 0.5)) {
            const lhKind = cePickW(rng, [['fifth', 2], ['single', 2], ['roll', 3]]);
            if (lhKind === 'fifth') put(s, len + 1.2, [low, low + 7], 0.36, { roll: 0.05 + rng() * 0.04, nv: 0.8 });
            else if (lhKind === 'single') put(s + (rng() < 0.3 ? 0.5 : 0), len + 1.2, [low], 0.4);
            else {
                const u = fits(0.25) ? (rng() < 0.5 ? 0.25 : 1 / 3) : 0.5;
                [low, low + 7, ninth ? low + 14 : low + 12].forEach((p, k) => put(s + k * u, len + 1.2 - k * u, [p], k === 0 ? 0.4 : 0.28));
            }
        }
        ph.ceBass = low;
        // ----- nappe d'accompagnement (sous la mélodie) -----
        const accLo = Math.max(low + 10, 4), accHi = 19;
        if (A.kind === 'wave') {
            const T = ceTonesIn(pcs, accLo, accHi + 2);
            if (T.length >= 3) {
                const unit = ternary ? 1 / 3 : (fits(1 / 3) && rng() < 0.6 ? 1 / 3 : 0.5);
                const per = 2 * (T.length - 1);
                ceGrid(sg, unit).forEach((p) => {
                    const r = A.k % per, idx = r < T.length ? r : per - r;
                    put(p + (p > s ? jit(0.03) : 0), unit * 3, [T[idx]], 0.2 + 0.05 * Math.sin(A.k / 3), { opt: idx % 2 === 1 && thin > 0 });
                    A.k++;
                });
            }
        } else if (A.kind === 'pedal') {
            const V = ceVoiceNear(pcs, 15 + Math.round(jit(4)), Math.min(4, pcs.length), accLo, accHi + 2);
            put(s + pick([0, 0.5, 1].filter(p => p < len)), len + 1.2, V, 0.26, { roll: 0.06 + rng() * 0.05, nv: 0.75 });
            if (len >= 4 && rng() < 0.5) put(s + pick([2, 2.5]), 2.5, V.slice(1), 0.2, { roll: 0.06, opt: true });
        } else {
            // quartes / quintes parallèles qui glissent par degrés, en contretemps
            let a = ceNearest(soft(cs).filter(p => p >= accLo && p <= accHi - 5), 11 + A.k % 3) ?? accLo;
            const offs = len >= 4 ? pick([[0.5, 1.5, 2.5], [1, 2, 3], [0.5, 2, 3.5]]) : [0.5].filter(p => p < len);
            offs.forEach((p, k) => {
                const b = ceStep(cs, ceStep(cs, ceStep(cs, a, 1), 1), 1);   // une quarte ou une quinte au-dessus (dans la gamme)
                put(s + p, 1.4, [a, b], 0.22, { roll: 0.02, opt: k === 2 });
                a = ceStep(cs, a, A.dir);
            });
            A.k++;
        }
    },

    // ---------- Satie, gymnopédie : basse grave sur le 1, accord sur le 2, mélodie lente et nue ----------
    'c-satie': (c) => {
        const { sg, cs, pcs, low, put, len, rng, ph, up, closing } = c;
        const s = sg.s;
        const deep = (low - 12 + c.env.transOffset >= -19) ? low - 12 : low;
        // accord sans fondamentale (la basse la donne) : si - ré - fa♯ sur sol, comme dans la première Gymnopédie
        const upper = pcs.length >= 4 ? pcs.slice(1, 4) : pcs;
        const V = ceVoiceNear(upper, 14, Math.min(3, upper.length), Math.max(low + 10, 2), 18);
        const q = Math.max(1, Math.floor(len));
        if (q >= 4) {   // 4/4 : basse - accord - basse (quinte) - accord
            put(s, 2, [deep], 0.5); put(s + 1, 1, V, 0.36, { roll: 0.008 });
            const fifth = ceTonesIn(pcs, deep + 5, deep + 9);
            put(s + 2, 2, [fifth.length ? fifth[0] : deep], 0.44, { opt: true }); put(s + 3, 1, V, 0.34, { roll: 0.008 });
        } else {
            put(s, len, [deep], 0.5);
            if (q >= 2) put(s + 1, len - 1, V, 0.36, { roll: 0.008 });
        }
        if (ph.ceIntro && !closing) return;
        // mélodie : une ou deux notes par mesure, par degrés conjoints, rebond aux bornes du registre
        if (typeof ph.ceMel !== 'number') ph.ceMel = ceNearest(ceTonesIn(pcs, 19, 26), 22) || 22;
        let mel = ph.ceMel;
        // sur le premier temps, la note se pose sur une note de l'accord ; ailleurs, une note de passage reste possible
        const nextMel = (strong) => {
            let n = ceStep(cs, mel, ph.ceDir);
            if (n > 28 || n < 18) { ph.ceDir = -ph.ceDir; n = ceStep(cs, mel, ph.ceDir); }
            const tones = ceTonesIn(pcs, n - 2, n + 2);
            if (tones.length && (strong || rng() < 0.55)) n = ceNearest(tones, n);
            mel = n; return n;
        };
        if (!pcs.includes(ceMod(mel))) { const tn = ceTonesIn(pcs, mel - 2, mel + 2); if (tn.length) mel = ceNearest(tn, mel); }
        const pats = q >= 3 ? [[[0, q]], [[0, 1], [1, q - 1]], [[1, q - 1]]] : [[[0, q]], [[0, q]], [[0, q]]];
        const pat = closing ? [[0, q]] : pats[(ph.ceRh + c.i) % pats.length];
        pat.forEach(([p, d], k) => put(s + p, d, [k === 0 && c.i % 2 === 0 ? mel : nextMel(p === 0)], 0.52, { opt: k > 0 && pat.length > 1 }));
        if (up > 0.5 && q >= 3 && !closing) put(s + q - 0.5, 0.5, [ceStep(cs, mel, -ph.ceDir)], 0.42, { opt: true });
        ph.ceMel = mel;
    },

    // ---------- Néoclassicisme (Stravinsky, Prokofiev, Poulenc) : gestes variés, articulations contrastées ----------
    // Chaque mesure combine une main gauche et une main droite tirées parmi plusieurs gestes (jamais deux fois de suite le
    // même) : pompe irrégulière, basse qui marche, Alberti, ostinato, accords décalés ou basse tenue ; motif piqué qui se
    // transforme (renversé, déplacé, raccourci), mélodie liée en grands intervalles, accords en 3 + 3 + 2, trait de gamme,
    // tierces parallèles, notes répétées. Les « fausses notes » restent rares, et la fin de phrase varie (tenue, arrêt sec,
    // trait qui enchaîne).
    'c-neoclassic': (c) => {
        const { sg, cs, pcs, low, rng, ph, up, thin, e8, fits, closing, I, ternary } = c;
        const len = c.len, s = sg.s, e = sg.e;
        const put = c.put;
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        const on = (p) => Math.abs(p - Math.round(p)) < 1e-6;
        const T = ceTonesIn(pcs, 12, 28);                         // notes de l'accord, registre de la main droite
        const S = popScaleNotes(cs, 11, 30);                      // gamme, même registre
        const Vlow = ceVoiceNear(pcs, 5, 3, low + 7, 13);
        const q = Math.max(1, Math.floor(len));
        const e8ok = fits(e8);
        // une fausse note d'un demi-ton, rare : une mesure sur trois environ, et seulement quand la phrase s'anime
        const wrongBar = I > 0.35 && rng() < 0.33;
        let wrongDone = false;
        const wrong = (p) => { if (!wrongBar || wrongDone || rng() < 0.6) return p; wrongDone = true; return p + (rng() < 0.5 ? 1 : -1); };
        const sIdx = (p) => Math.max(0, S.indexOf(ceNearest(S, p)));

        // ----- fin de phrase : trois façons de conclure -----
        if (closing) {
            const kind = cePickW(rng, [['held', 3], ['dry', 1.5], ['run', 2]]);
            const top = T.length ? T[T.length - 1] : 24;
            if (kind === 'held') {
                put(s, len + 0.5, [low, low + 12], 0.6);
                put(s + (rng() < 0.5 ? 0 : 0.5), len, Vlow.concat(T.slice(-2)), 0.54, { roll: 0.015 });
            } else if (kind === 'dry') {
                put(s, 0.45, [low, low + 12], 0.68); put(s, 0.4, Vlow.concat(T.slice(-2)), 0.62, { roll: 0.004 });
                if (len >= 3) put(s + len - (rng() < 0.5 ? 1 : 1.5), 0.45, [low + 12], 0.5);
            } else {
                // trait qui file vers la mesure suivante : basse tenue, gamme montante sur la fin de la mesure
                put(s, len, [low], 0.56); put(s, Math.min(2, len), Vlow, 0.42, { roll: 0.01 });
                const unit = fits(e8 / 2) && !ternary ? e8 / 2 : e8;
                let j = sIdx(top - 12);
                for (let p = s + Math.max(1, len - 2); p < e - 1e-6; p += unit) { put(p, unit * 1.1, [S[Math.min(S.length - 1, j++)]], 0.38 + 0.25 * ((p - s) / len), { opt: !on(p) && rng() < 0.3 }); }
            }
            return;
        }

        // ----- choix des gestes de la mesure -----
        const bias = { march: { pompe: 1.5, walking: 1.5 }, toccata: { ostinato: 1.5, stabs: 1.5 }, pastiche: { alberti: 1.5, legato: 1.5 } }[ph.ceFam] || {};
        const wl = { pompe: 2, walking: 2, alberti: e8ok ? 2 : 0, ostinato: e8ok ? 1.5 : 0, offbeat: 1.5, held: 1.5 };
        const wr = { motif: 3, legato: 2.5, stabs: 2, scale: len >= 2 ? 1.5 : 0, thirds: e8ok ? 1.5 : 0, repeat: e8ok ? 1 : 0, rest: 0.8 };
        Object.keys(bias).forEach(k => { if (k in wl) wl[k] += bias[k]; if (k in wr) wr[k] += bias[k]; });
        if (ph.ceLastL) wl[ph.ceLastL] *= 0.25;
        if (ph.ceLastR) wr[ph.ceLastR] *= 0.25;
        let lh = cePickW(rng, Object.entries(wl));
        let rh = cePickW(rng, Object.entries(wr));
        if (rh === 'rest' && (lh === 'held' || ph.ceLastR === 'rest')) rh = 'legato';   // jamais deux silences de suite
        if (rh === 'thirds' && lh === 'alberti' && rng() < 0.5) lh = 'held';
        ph.ceLastL = lh; ph.ceLastR = rh;
        const stac = () => 0.22 + rng() * 0.16;                  // piqué, plus ou moins sec

        // ----- main gauche -----
        if (lh === 'pompe') {
            // basse - accord, mais irrégulière : un temps sauté, un accord avancé d'une croche, une basse doublée
            const skip = q >= 4 && rng() < 0.4 ? 1 + Math.floor(rng() * (q - 1)) : -1;
            for (let b = 0; b < q; b++) {
                if (b === skip) continue;
                const early = b % 2 === 1 && e8ok && rng() < 0.25 ? -e8 : 0;
                if (b % 2 === 0) put(s + b, stac() + 0.1, [b === 0 ? low : (rng() < 0.5 ? low + 7 : low + 12)], b === 0 ? 0.62 : 0.52);
                else put(s + b + early, stac(), Vlow, 0.42, { roll: 0.003 });
            }
        } else if (lh === 'walking') {
            // basse qui marche en noires détachées, par degrés et notes de l'accord, vers l'accord suivant
            const LS = popScaleNotes(cs, low - 2, low + 12);
            let j = Math.max(0, LS.indexOf(ceNearest(LS, low)));
            const dir = rng() < 0.6 ? 1 : -1;
            for (let b = 0; b < q; b++) {
                put(s + b, b === q - 1 ? 0.8 : 0.55, [b === 0 ? low : LS[Math.max(0, Math.min(LS.length - 1, j))]], b === 0 ? 0.6 : 0.5);
                j += dir * (rng() < 0.7 ? 1 : 2);
            }
        } else if (lh === 'alberti') {
            const A = [low, Vlow[2] ?? low + 7, Vlow[1] ?? low + 3, Vlow[2] ?? low + 7];   // ?? : la hauteur 0 (do) est une vraie note
            ceGrid(sg, e8).forEach((p, k) => put(p, e8 * 0.85, [A[k % 4]], k % 4 === 0 ? 0.46 : 0.34, { opt: k % 2 === 1 && thin > 0 }));
        } else if (lh === 'ostinato') {
            // figure de deux ou trois notes qui tourne en croches, accentuée de façon asymétrique
            const fig = pick([[low, low + 7], [low, low + 12, low + 7], [low, low + 7, low + 12, low + 7]]);
            const acc = pick([[0, 3, 6], [0, 2, 5], [0, 3, 5]]);
            ceGrid(sg, e8).forEach((p, k) => put(p, e8 * 0.8, [fig[k % fig.length]], acc.includes(k % 8) ? 0.56 : 0.36, { opt: !acc.includes(k % 8) && k % 2 === 1 && thin > 0 }));
        } else if (lh === 'offbeat') {
            // basse sur le 1, accords sur les contretemps
            put(s, 1.2, [low], 0.6);
            const offs = ceGrid(sg, 1).map(p => p + (e8ok ? e8 : 0.5)).filter(p => p < e - 0.05);
            offs.forEach((p, k) => { if (k === 0 || rng() < 0.8) put(p, stac(), Vlow, 0.4, { roll: 0.004, opt: k === offs.length - 1 }); });
        } else {
            // basse tenue (respiration : la main gauche laisse sonner)
            put(s, len + 0.3, rng() < 0.5 ? [low, low + 12] : [low, low + 7], 0.5);
            if (len >= 3 && rng() < 0.5) put(s + Math.floor(len / 2), len / 2, Vlow, 0.32, { roll: 0.02, opt: true });
        }

        // ----- main droite -----
        if (rh === 'rest' || T.length < 3) return;
        if (rh === 'motif') {
            // un motif propre à la phrase (intervalles et rythme), transformé à chaque retour : renversé, déplacé, raccourci
            if (!ph.ceCell) {
                const n = 4 + Math.floor(rng() * 3);
                ph.ceCell = { steps: Array.from({ length: n }, () => pick([-2, -1, 1, 2, 3, -3])), rests: Array.from({ length: n }, () => rng() < 0.18) };
            }
            const inv = rng() < 0.35 ? -1 : 1;
            const shift = (e8ok && rng() < 0.35) ? e8 : 0;
            const cut = rng() < 0.3 ? 1 : 0;
            const unit = e8ok ? e8 : 1;
            let j = Math.max(0, T.indexOf(ceNearest(T, 16 + ph.ceShift + Math.round((rng() - 0.5) * 6))));
            const cell = ph.ceCell;
            for (let k = 0; k < cell.steps.length - cut; k++) {
                const p = s + shift + k * unit;
                if (p >= e - 0.05) break;
                if (!cell.rests[k]) put(p, k === cell.steps.length - cut - 1 ? 0.6 : stac(), [wrong(T[Math.max(0, Math.min(T.length - 1, j))])], k === 0 ? 0.6 : (on(p) ? 0.52 : 0.44), { opt: k % 2 === 1 && rng() < 0.25 });
                j += inv * cell.steps[k];
                if (j < 0 || j >= T.length) j = Math.max(0, Math.min(T.length - 1, j - 2 * inv * cell.steps[k]));
            }
        } else if (rh === 'legato') {
            // mélodie liée à la Poulenc : valeurs longues, grands intervalles, une note de passage
            const rhy = q >= 4 ? pick([[[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 1], [1, 1], [2, 1.5], [3.5, 0.5]], [[0, 3], [3, 1]], [[0.5, 1.5], [2, 2]]])
                : (q >= 3 ? pick([[[0, 2], [2, 1]], [[0, 1], [1, 2]]]) : [[0, len]]);
            let j = sIdx(17 + ph.ceShift);
            rhy.forEach(([p, d], k) => {
                if (k) j = Math.max(0, Math.min(S.length - 1, j + pick([-4, -2, -1, 1, 2, 4, 5])));
                let note = S[j];
                if (on(p)) { const tn = ceTonesIn(pcs, note - 2, note + 2); if (tn.length) { note = ceNearest(tn, note); j = sIdx(note); } }
                put(s + p, d * 0.95, [note], 0.5 + (k === 0 ? 0.06 : 0));
            });
        } else if (rh === 'stabs') {
            // accords secs, accents asymétriques (3 + 3 + 2, 2 + 3 + 3, 3 + 2 + 3)
            const V3 = ceVoiceNear(pcs, 18 + ph.ceShift, 3, 12, 28);
            const pats = q >= 4 ? [[0, 1.5, 3], [0, 1, 2.5], [0, 1.5, 2.5], [0.5, 2, 3]] : (q >= 3 ? [[0, 1.5], [0, 1, 2.5], [0.5, 2]] : [[0], [0.5]]);
            pick(pats).forEach((p, k) => { if (p < len) put(s + p, stac(), k === 1 ? V3.slice(0, -1).concat([wrong(V3[V3.length - 1])]) : V3, 0.66 - k * 0.04, { roll: 0.003 }); });
        } else if (rh === 'scale') {
            // trait de gamme vers une note tenue
            const unit = (!ternary && fits(e8 / 2)) ? e8 / 2 : e8;
            const dir = rng() < 0.65 ? 1 : -1;
            const start = s + (q >= 4 ? pick([0, 1, 2]) : 0);
            let j = sIdx(dir > 0 ? 13 : 26);
            const n = Math.min(Math.round((e - start) / unit) - 2, 6 + Math.floor(rng() * 5));
            for (let k = 0; k < n; k++) put(start + k * unit, unit * 1.1, [S[Math.max(0, Math.min(S.length - 1, j + dir * k))]], 0.38 + 0.2 * (k / n), { opt: k % 2 === 1 && thin > 0 });
            const endP = start + Math.max(0, n) * unit;
            const tgt = ceNearest(T, S[Math.max(0, Math.min(S.length - 1, j + dir * n))]);
            if (endP < e - 0.1) put(endP, e - endP + 0.3, [tgt], 0.58);
        } else if (rh === 'thirds') {
            // tierces (ou sixtes) parallèles en croches, liées deux par deux
            const sixth = rng() < 0.35;
            let j = sIdx(15 + ph.ceShift);
            const dir0 = rng() < 0.5 ? 1 : -1;
            ceGrid(sg, e8).forEach((p, k) => {
                const top = S[Math.max(0, Math.min(S.length - 1, j))];
                const lowV = S[Math.max(0, Math.min(S.length - 1, j - (sixth ? 5 : 2)))];
                put(p, k % 2 === 0 ? e8 * 1.6 : e8 * 0.7, [lowV, top], k % 2 === 0 ? 0.5 : 0.4, { roll: 0.002, opt: k % 2 === 1 && thin > 0 });
                j += (k % 4 < 2 ? dir0 : -dir0);
            });
        } else {
            // notes répétées (Prokofiev), avec une petite note avant l'accent
            const note = wrong(pick(T.slice(-3)));
            const G = ceGrid(sg, e8);
            G.forEach((p, k) => { if (k % 4 !== 3 || rng() < 0.4) put(p, e8 * 0.6, [note], k % 4 === 0 ? 0.58 : 0.4, { opt: k % 2 === 1 }); });
            if (ph.ceOrn && fits(1 / 8) && G.length > 4) put(s + 2 - 0.08, 0.08, [note + (rng() < 0.5 ? 1 : 2)], 0.42, { opt: true });
        }
        if (up > 0.5 && len >= 2 && rh !== 'scale') put(s + len - (e8ok ? e8 : 0.5), e8 * 0.8, [T[T.length - 1]], 0.46, { opt: true });
    },

    // ---------- Minimalisme (Glass, Reich) : ostinato immuable, basse tenue, pulsation ----------
    'c-minimal': (c) => {
        const { sg, pcs, low, put, len, ph, up, e8, e16, fits, ternary } = c;
        const s = sg.s;
        put(s, len, [low, low + 12], 0.4, { roll: 0.004 });
        const V = ceVoiceNear(pcs.slice(0, ph.ceSize || 3), 12, Math.min(ph.ceSize || 3, pcs.length), low + 10, 25);
        const rank = (k) => { const n = V.length, qq = Math.floor(k / n); return V[k - qq * n] + 12 * qq; };
        if (ph.ceFam === 'pulse') {
            // pulsation de l'accord entier en croches, avec une respiration (crescendo - decrescendo) sur la mesure
            const G = ceGrid(sg, e8);
            G.forEach((p, k) => put(p, e8 * 0.9, V, 0.28 + 0.24 * Math.sin(Math.PI * (k + 0.5) / G.length), { roll: 0.002, opt: k % 2 === 1 }));
            return;
        }
        let unit, P;
        if (ph.ceFam === 'triplets' && !ternary) { unit = fits(1 / 3) ? 1 / 3 : 0.5; P = [0, 1, 2]; }
        else { unit = (up > 0.5 && fits(e16)) ? e16 : e8; P = CE_MIN_PATTERNS[ph.ceP || 0]; }
        ceGrid(sg, unit).forEach((p, k) => {
            const grp = k % P.length === 0;
            put(p, unit * 0.95, [rank(P[k % P.length])], grp ? 0.5 : 0.42, { opt: k % 2 === 1 });
        });
        if (up > 0.6 && fits(e8)) ceGrid(sg, 1).forEach(p => put(p + e8, e8, [low + 7], 0.3, { opt: true }));   // main gauche en croches (quinte)
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CLASSIC_ERA_GROOVES, classicEraGroove, classicEraPhraseExtras, buildClassicEraPlan,
        ceVoiceNear, ceTonesIn, cePcs, CE_CHACONNE_ORDER, CE_MIN_PATTERNS };
}
