// grid/generation.js — génération de grille d'accords : variations d'un modèle de style, réharmonisation par grammaire,
// sections jumelles (AABA), fin résolue, écriture compacte avec signes de reprise. Fonctions pures, sans DOM :
// tout ce qui dépendait du moteur passe par l'objet `ctx` :
//   ctx.findChordObj(id)   objet accord du catalogue
//   ctx.triadsOnly         style limité aux triades (« Chanson simple ») : aucune septième ajoutée
//   ctx.generationVariant  compteur du bouton « Générer » (0 : forme de référence)
//   ctx.seedBase           graine de la session
//   ctx.recentGrids        dernières grilles produites [{ style, keys }] : la proposition doit en différer
// Un modèle est une liste de blocs { r, c, m, s, section, phrase, function, split? } (voir styles/toolkit.js).
// Chargé par index.html via <script src="grid/generation.js"> (après theory.js) et testé par grid/generation.test.js.

// Sous Node, la théorie se charge ; en navigateur ce sont des globaux (theory.js).
const GEN_THEORY = (typeof scalesDb !== 'undefined')
    ? { scalesDb, lookupChord, chordInfo, chordTypes }
    : require('../theory.js');

// Générateur pseudo-aléatoire déterministe (PCG-like), seedé par le compteur de
// génération et le style : reproductible pour un même clic, mais différent à chaque
// nouvel appui sur « Générer ».
function makeVariationRng(variant, styleKey, seedBase) {
    let seed = (variant * 2654435761 + (seedBase || 0) + [...styleKey].reduce((a, ch) => a + ch.charCodeAt(0), 0)) >>> 0;
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function gridSignature(grid) {
    return grid.map(item => `${item.rootIndex}:${item.chordId}:${item.measures}:${item.scaleId}`).join('|');
}

// Génération harmonique par grammaire : les variations se font au niveau des
// fonctions et des phrases, jamais par déplacement chromatique arbitraire d'un accord.
// ===== Génération renouvelée (bouton « Générer ») =====
// Principe : à chaque appui, on construit plusieurs propositions à partir de bibliothèques de cellules harmoniques
// propres au style, on les enrichit par des réharmonisations qui respectent la fonction des accords (ii-V d'approche,
// dominantes secondaires, substitutions de triton, accords diminués de passage, turnarounds…), on écarte celles qui
// enfreignent les règles musicales, puis on retient une proposition qui diffère nettement de la précédente
// (au moins 35 % de mesures différentes) et des dernières grilles produites.
function styleProfile(styleKey) {
    const jazz = { turn: true, alt: true, w: { iiV: 3, secDom: 2, tritone: 2.5, backdoor: 1, dim: 1.5, colour: 3, sus: 1.2, subdom: 1.5, chrom: 0.8 } };
    const light = { turn: false, alt: true, w: { iiV: 2, secDom: 1, tritone: 2, dim: 0.8, colour: 3, sus: 1.5, subdom: 1, chrom: 0.8 } };
    const classical = { turn: false, w: { secDom: 3, subdom: 2, dim: 1, colour: 1, iiV: 0.8 } };
    const table = {
        'ii-v-i': jazz, anatole: jazz, swing: jazz, hardbop: jazz, 'i-got-rythm': jazz,
        // BeBop : harmonie dense (ii-V enchaînés, substitutions de triton, diminués de passage)
        bebop: { turn: true, alt: true, w: { iiV: 4.5, secDom: 2.5, tritone: 3.5, backdoor: 1, dim: 2, colour: 2.5, sus: 0.4, subdom: 1, chrom: 1.5 } },
        // Tango, Piazzolla, Samba
        tango: { turn: false, w: { secDom: 3, subdom: 2, dim: 1.5, colour: 1.5, iiV: 1 } },
        piazzolla: { turn: false, alt: true, w: { secDom: 2.5, dim: 2, colour: 3, tritone: 1.5, sus: 1.5, chrom: 1.5, iiV: 1.5 } },
        // Milonga lyrique : harmonie douce et colorée, peu de tritons, couleurs et dominantes secondaires
        milongalyrique: { turn: false, alt: true, w: { colour: 2.5, iiV: 1.2, secDom: 1.5, dim: 1.2, sus: 1.2, chrom: 1.2, tritone: 0.5, subdom: 1 } },
        samba: { turn: false, alt: true, w: { iiV: 2, secDom: 1, tritone: 1.5, colour: 3, sus: 1, subdom: 1 } },
        ballad: light, bossa: light, latin: light,
        baroque: classical, mozart: classical, trad: classical,
        chansonsimple: { turn: false, w: {} }, // triades seules : aucune réharmonisation
        dixieland: { turn: false, w: { secDom: 3, subdom: 2, dim: 1, colour: 1, iiV: 1.5 } },
        blues: { turn: false, w: { colour: 4, tritone: 2, sus: 2 } },
        pop: { turn: false, w: { colour: 4 } }, funk: { turn: false, w: { colour: 4 } }, modal: { turn: false, w: { colour: 4 } },
        fusion: { turn: false, w: { colour: 3, tritone: 1 } },
        valsejazz: jazz, afro68: { turn: false, w: { colour: 1.2, sus: 0.6, secDom: 0.4 } }, blues128: { turn: false, w: { colour: 4, tritone: 2, sus: 2 } },
        ballad128: { turn: false, alt: true, w: { iiV: 2, secDom: 1, tritone: 2, dim: 0.8, colour: 5, sus: 1, subdom: 1 } },
        valsemusette: classical, valseviennoise: { turn: false, w: { secDom: 1.5, subdom: 1 } }, menuet: { turn: false, w: { secDom: 2, subdom: 1.5 } },
        barcarolle: classical, tarentelle: classical,
        valsecountry: { turn: false, w: { secDom: 1, subdom: 1 } }, jig: { turn: false, w: { secDom: 1.5, subdom: 1 } }, slipjig: { turn: false, w: { secDom: 1.5, subdom: 1 } },
        gospel: { turn: false, w: { secDom: 2, subdom: 1, colour: 3 } },
        // Brass band : harmonie de triades et de dominantes, dominantes secondaires et sous-dominantes, aucune couleur de jazz
        brasshymn: { turn: false, w: { secDom: 2, subdom: 1.5 } },
        brasscantique: { turn: false, w: { secDom: 1.5, subdom: 1.5 } },
        // Balkans : triades et dominante V7(b9), aucune réharmonisation (la couleur est dans le mode, pas dans les accords)
        balkan: { turn: false, w: {} }, balkan98: { turn: false, w: {} }
    };
    return table[styleKey] || { turn: false, w: { colour: 3 } };
}

// Une grille doit finir par une résolution : la dernière mesure est l'accord de tonique, précédé de sa dominante.
// (Les formes à tourneur - V7 en dernière mesure - sont celles d'une boucle ; ici la fin est conclusive.)
// Retourne true si la fin a été réécrite.
function resolveEnding(ctx, S) {
    const n = S.length;
    if (n < 2) return false;
    const mod = (x) => ((x % 12) + 12) % 12;
    const fam = (c) => chordFamily(c);
    const tonic = S.find(x => x.function === 'tonic') || S[0];
    const T = { r: tonic.r, c: tonic.c, s: tonic.s };
    const last = S[n - 1];
    if ((last.split || last).r === T.r) return false; // déjà sur la tonique
    const fresh = { ...last };
    delete fresh.split; delete fresh.bassRootIndex;
    S[n - 1] = Object.assign(fresh, { r: T.r, c: T.c, s: T.s, function: 'tonic' });
    const resolvesToTonic = (sl) => { const ch = sl.split || sl; return fam(ch.c) === 'dom' && [5, 11, 2].includes(mod(T.r - ch.r)); };
    const prev = S[n - 2];
    const arrived = (prev.split || prev).r === T.r && n >= 3 && resolvesToTonic(S[n - 3]);
    if (!resolvesToTonic(prev) && !arrived && !ctx.triadsOnly) { // « Chanson simple » : jamais de septième ajoutée
        const minor = fam(T.c) === 'min';
        prev.split = { r: mod(T.r + 7), c: minor ? '7alt' : '7', s: minor ? 'altered' : 'mixolydian' };
        prev._dom = true; prev._mod = true;
    }
    return true;
}

// Version d'un modèle (liste de blocs) dont la fin est résolue ; le modèle est rendu tel quel si sa fin l'est déjà.
function withResolvedEnding(ctx, tpl) {
    const S = slotsFromTemplate(tpl);
    return resolveEnding(ctx, S) ? templateFromSlots(S) : tpl;
}

function slotsFromTemplate(tpl) {
    const S = [];
    tpl.forEach(it => {
        const m = Math.max(1, it.m || 1);
        for (let q = 0; q < m; q++) {
            const sl = { ...it, m: 1 };
            if (it.split) sl.split = { ...it.split };
            S.push(sl);
        }
    });
    return S;
}

function templateFromSlots(S) {
    const out = [];
    S.forEach(sl => {
        const c = { ...sl };
        Object.keys(c).forEach(key => { if (key[0] === '_') delete c[key]; });
        if (c.split) c.split = { ...c.split };
        const last = out[out.length - 1];
        const same = last && !last.split && !c.split && ['r', 'c', 's', 'function', 'section', 'phrase', 'bassRootIndex', 'kc'].every(key => last[key] === c[key]);
        if (same) last.m++; else out.push({ ...c, m: 1 });
    });
    return out;
}

// Les sections jumelles (identiques dans le modèle) : la racine est réharmonisée, les copies sont ensuite recopiées dessus.
function tagTwinSlots(S, tpl, twins) {
    const offs = [0];
    tpl.forEach(it => offs.push(offs[offs.length - 1] + Math.max(1, it.m || 1)));
    const ranges = [];
    twins.forEach((g, k) => {
        const root = [offs[g.root.a], offs[g.root.b]];
        for (let i = root[0]; i < root[1]; i++) S[i]._twRoot = k;
        S[root[0]]._lock = true; S[root[1] - 1]._lock = true;
        g.copies.forEach(cp => {
            const cr = [offs[cp.a], offs[cp.b]];
            for (let i = cr[0]; i < cr[1]; i++) S[i]._skip = true;
            ranges.push({ root, copy: cr });
        });
    });
    return ranges;
}

function copyTwinSlots(S, ranges) {
    (ranges || []).forEach(({ root, copy }) => {
        const len = root[1] - root[0];
        if (copy[1] - copy[0] !== len) return;
        const labels = S.slice(copy[0], copy[1]).map(x => ({ section: x.section, phrase: x.phrase }));
        for (let t = 0; t < len; t++) {
            const c = JSON.parse(JSON.stringify(S[root[0] + t]));
            delete c._twRoot; delete c._skip; delete c._lock;
            if (t === len - 1) { delete c._dom; delete c._pass; } // le suivant n'est plus le même : la relation d'origine du modèle est conservée
            c.section = labels[t].section; c.phrase = labels[t].phrase;
            S[copy[0] + t] = c;
        }
    });
}

function validateSlots(S) {
    const problems = [];
    const n = S.length;
    const mod = (x) => ((x % 12) + 12) % 12;
    const exists = (id) => !!GEN_THEORY.lookupChord(id);
    const ok = (c, s) => exists(c) && !!GEN_THEORY.scalesDb[s];
    S.forEach((sl, i) => {
        if (!Number.isInteger(sl.r) || !ok(sl.c, sl.s)) problems.push('chord' + i);
        if (sl.split && (!Number.isInteger(sl.split.r) || !ok(sl.split.c, sl.split.s))) problems.push('split' + i);
        const last = sl.split || sl;
        const nxt = S[(i + 1) % n];
        if (sl._dom && ![5, 11, 2].includes(mod(nxt.r - last.r))) problems.push('dom' + i);
        if (sl._pass && !(mod(nxt.r - last.r) === 1 && chordFamily(nxt.c) === 'min')) problems.push('pass' + i);
    });
    return problems;
}

function reharmonize(ctx, S, styleKey, k, rand, prof, boost = 0) {
    const n = S.length;
    const mod = (x) => ((x % 12) + 12) % 12;
    const fam = (c) => chordFamily(c);
    const scaleFor = (c) => { const o = ctx.findChordObj(c); return (o && o.scales && o.scales[0]) ? o.scales[0].id : 'ionian'; };
    const R = (x) => mod(x - k);
    const lastOf = (sl) => sl.split || sl;
    const sectionEnd = (i) => i === n - 1 || S[i + 1].section !== S[i].section;
    const domLike = (sl) => fam(lastOf(sl).c) === 'dom';
    const targetOfDom = (i) => i > 0 && domLike(S[i - 1]);
    const free = (i) => i > 0 && i < n - 1 && !S[i]._lock && !S[i]._skip && !S[i].split && !targetOfDom(i);
    const nextOf = (i) => S[(i + 1) % n];
    const rnd = (arr) => arr[Math.floor(rand() * arr.length)];
    const resolves = (i, ch) => [5, 11, 2].includes(mod(nextOf(i).r - ch.r));
    const isDomFn = (sl) => sl.function === 'dominant' || sl.function === 'secondaryDominant' || sl._dom;

    const TURN = {
        T0: [[0, 'maj7', 'lydian', 'tonic'], [9, 'm7', 'aeolian', 'predominant'], [2, 'm7', 'dorian', 'predominant'], [7, '7', 'mixolydian', 'dominant']],
        T1: [[0, 'maj7', 'lydian', 'tonic'], [9, '7', 'mixolydian', 'secondaryDominant'], [2, 'm7', 'dorian', 'predominant'], [7, '7', 'mixolydian', 'dominant']],
        T2: [[4, 'm7', 'phrygian', 'tonic'], [9, '7', 'mixolydian', 'secondaryDominant'], [2, 'm7', 'dorian', 'predominant'], [7, '7', 'mixolydian', 'dominant']],
        T3: [[0, 'maj7', 'lydian', 'tonic'], [1, 'dim7', 'wholeHalfDim', 'color'], [2, 'm7', 'dorian', 'predominant'], [7, '7', 'mixolydian', 'dominant']],
        T4: [[0, 'maj7', 'lydian', 'tonic'], [3, '7', 'mixolydian', 'color'], [8, '7', 'mixolydian', 'color'], [1, '7', 'lydianDominant', 'dominant']],
        T5: [[0, 'maj7', 'lydian', 'tonic'], [0, '7', 'mixolydian', 'color'], [5, 'maj7', 'lydian', 'predominant'], [5, 'm7', 'dorian', 'predominant']]
    };

    // --- Turnarounds I-vi-ii-V : remplacés par une autre cellule de 4 mesures ---
    const turnWindows = () => {
        let did = 0;
        for (let i = 0; i <= n - 4; i++) {
            const w = S.slice(i, i + 4);
            if (w.some(x => x.split || x._skip || x._mod)) continue;
            if (!(R(w[0].r) === 0 && fam(w[0].c) === 'maj' && R(w[1].r) === 9 && R(w[2].r) === 2 && fam(w[2].c) === 'min' && R(w[3].r) === 7 && fam(w[3].c) === 'dom')) continue;
            if (w[0].section !== w[3].section) continue;
            if (rand() > 0.8) continue;
            const next = nextOf(i + 3);
            const endsSection = sectionEnd(i + 3) && i + 3 !== n - 1;
            const nextTonic = next.r === k;
            const kinds = ['T0', 'T1', 'T3'];
            if (!endsSection && nextTonic) kinds.push('T4', 'T5');
            if (i > 0 && !S[i]._lock && !targetOfDom(i)) kinds.push('T2');
            const sig = w.map(x => x.r + x.c).join('|');
            const choices = kinds.filter(kd => TURN[kd].map(([o, c]) => mod(k + o) + c).join('|') !== sig);
            if (!choices.length) continue;
            const kind = rnd(choices);
            TURN[kind].forEach(([o, c, s, fn], t) => {
                const sl = S[i + t];
                delete sl.bassRootIndex; delete sl.split;
                sl.r = mod(k + o); sl.c = c; sl.s = s; sl.function = fn; sl._mod = true;
                if (fam(c) === 'dom' && t < 3) sl._dom = true; else delete sl._dom;
            });
            if (kind === 'T4') S[i + 3]._dom = true;
            const lastSl = S[i + 3];
            if (kind === 'T1' || kind === 'T2') { if (resolves(i + 3, lastSl)) lastSl._dom = true; else delete lastSl._dom; }
            if ((kind === 'T4' || kind === 'T5') && i + 4 < n) S[i + 4]._lock = true;
            if (kind === 'T0' || kind === 'T3') delete lastSl._dom;
            did++; i += 3;
        }
        return did;
    };

    const ops = {
        // ii-V d'approche : la mesure précédant une cible devient [ii | V7] de cette cible
        iiV: () => {
            const cand = [];
            for (let i = 1; i < n - 1; i++) {
                if (!free(i) || sectionEnd(i) || fam(S[i].c) === 'dom' || S[i].function === 'dominant' || S[i + 1].split) continue;
                const f = fam(S[i + 1].c);
                if (f === 'maj' || f === 'min') cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), T = S[i + 1], minorT = fam(T.c) === 'min';
            const iic = minorT ? 'm7b5' : 'm7';
            const vc = !prof.alt ? '7' : (minorT ? (rand() < 0.5 ? '7b9' : '7alt') : (rand() < 0.7 ? '7' : '7alt'));
            const sl = S[i];
            delete sl.bassRootIndex;
            sl.r = mod(T.r + 2); sl.c = iic; sl.s = scaleFor(iic); sl.function = 'predominant';
            sl.split = { r: mod(T.r + 7), c: vc, s: scaleFor(vc) };
            sl._dom = true; sl._mod = true; S[i + 1]._lock = true;
            return true;
        },
        // Dominante secondaire : l'accord précédant une cible diatonique devient son V7
        secDom: () => {
            const cand = [];
            for (let i = 1; i < n - 1; i++) {
                if (!free(i) || sectionEnd(i) || !['predominant', 'color'].includes(S[i].function) || fam(S[i].c) === 'dom' || S[i + 1].split) continue;
                const T = S[i + 1], f = fam(T.c);
                if ((f === 'maj' || f === 'min') && [2, 4, 5, 7, 9].includes(R(T.r))) cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), T = S[i + 1], sl = S[i];
            const c = rand() < 0.75 ? '7' : '9';
            delete sl.bassRootIndex;
            sl.r = mod(T.r + 7); sl.c = c; sl.s = scaleFor(c); sl.function = 'secondaryDominant';
            sl._dom = true; sl._mod = true; S[i + 1]._lock = true;
            return true;
        },
        // Substitution de triton d'une dominante qui résout une quinte plus bas
        tritone: () => {
            const cand = [];
            for (let i = 0; i < n; i++) {
                const sl = S[i];
                if (sl._skip || sl._tri || (sectionEnd(i) && i !== n - 1)) continue;
                const ch = lastOf(sl);
                if (fam(ch.c) !== 'dom' || ch.c === '7sus4' || !isDomFn(sl) || (sl.split && sl.c === '7sus4')) continue;
                if (mod(nextOf(i).r - ch.r) !== 5) continue;
                cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), sl = S[i], ch = lastOf(sl);
            ch.r = mod(ch.r + 6); ch.c = rand() < 0.7 ? '7' : '9'; ch.s = 'lydianDominant';
            if (!sl.split) delete sl.bassRootIndex;
            sl._dom = true; sl._tri = true; sl._mod = true;
            return true;
        },
        // Dominante « backdoor » (♭VII7) devant la tonique, éventuellement précédée du iv mineur
        backdoor: () => {
            const cand = [];
            for (let i = 1; i < n - 1; i++) {
                const sl = S[i];
                if (sl._skip || sl._tri || sl.split || sectionEnd(i) || sl.function !== 'dominant' || fam(sl.c) !== 'dom' || sl.c === '7sus4') continue;
                const nx = S[i + 1];
                if (fam(nx.c) === 'maj' && R(nx.r) === 0 && mod(nx.r - sl.r) === 5 && !nx.split) cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), sl = S[i], nx = S[i + 1];
            delete sl.bassRootIndex;
            if (rand() < 0.5) {
                sl.r = mod(nx.r + 5); sl.c = 'm7'; sl.s = 'dorian'; sl.function = 'predominant';
                sl.split = { r: mod(nx.r + 10), c: '7', s: 'mixolydian' };
            } else { sl.r = mod(nx.r + 10); sl.c = '7'; sl.s = 'mixolydian'; }
            sl._dom = true; sl._mod = true; nx._lock = true;
            return true;
        },
        // Accord diminué de passage entre un accord et le mineur situé un ton plus haut (I - #i°7 - ii)
        dim: () => {
            const cand = [];
            for (let i = 1; i < n - 1; i++) {
                if (!free(i) || sectionEnd(i) || S[i].function === 'dominant' || S[i + 1].split) continue;
                const f = fam(S[i].c), T = S[i + 1];
                if ((f === 'maj' || f === 'min') && fam(T.c) === 'min' && mod(T.r - S[i].r) === 2) cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), sl = S[i];
            sl.split = { r: mod(sl.r + 1), c: 'dim7', s: 'wholeHalfDim' };
            sl._pass = true; sl._mod = true; S[i + 1]._lock = true;
            return true;
        },
        // Suspension : V7sus4 puis V7 sur la même mesure (même fondamentale)
        sus: () => {
            const cand = [];
            for (let i = 0; i < n; i++) {
                const sl = S[i];
                if (sl._skip || sl._tri || sl.split || sl.c !== '7' || !isDomFn(sl) || !resolves(i, sl)) continue;
                cand.push(i);
            }
            if (!cand.length) return false;
            const sl = S[rnd(cand)];
            sl.split = { r: sl.r, c: sl.c, s: sl.s };
            sl.c = '7sus4'; sl.s = 'mixolydian'; sl._dom = true; sl._mod = true;
            return true;
        },
        // Substitution de sous-dominante devant la dominante : IV <-> ii, ou IV -> iv (emprunt)
        subdom: () => {
            const cand = [];
            for (let i = 1; i < n - 1; i++) {
                if (!free(i) || sectionEnd(i) || S[i].function !== 'predominant') continue;
                const nx = S[i + 1];
                if (fam(nx.c) !== 'dom' || R(nx.r) !== 7) continue;
                const r = R(S[i].r), f = fam(S[i].c);
                if ((r === 5 && f === 'maj') || (r === 2 && f === 'min')) cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), sl = S[i];
            delete sl.bassRootIndex;
            if (R(sl.r) === 5) {
                if (rand() < 0.65) { sl.r = mod(k + 2); sl.c = 'm7'; sl.s = 'dorian'; }
                else { sl.c = 'm7'; sl.s = 'dorian'; }
            } else { sl.r = mod(k + 5); sl.c = 'maj7'; sl.s = 'lydian'; }
            sl._mod = true;
            return true;
        },
        // Accord d'approche chromatique : même nature que la cible, un demi-ton au-dessus ou au-dessous
        chrom: () => {
            const cand = [];
            for (let i = 1; i < n - 1; i++) {
                if (!free(i) || sectionEnd(i) || S[i].function === 'dominant' || S[i + 1].split) continue;
                const f = fam(S[i].c), g = fam(S[i + 1].c);
                if ((f === 'maj' || f === 'min') && (g === 'maj' || g === 'min')) cand.push(i);
            }
            if (!cand.length) return false;
            const i = rnd(cand), sl = S[i], T = S[i + 1];
            sl.split = { r: mod(T.r + (rand() < 0.5 ? 1 : -1)), c: T.c, s: T.s };
            sl._mod = true; T._lock = true;
            return true;
        },
        // Couleur : extensions et altérations qui ne changent ni la fondamentale ni la fonction
        colour: () => {
            const cand = [];
            for (let i = 0; i < n; i++) { if (S[i]._skip || S[i]._tri) continue; cand.push([i, 0]); if (S[i].split) cand.push([i, 1]); }
            if (!cand.length) return false;
            const [i, h] = rnd(cand), sl = S[i], ch = h ? sl.split : sl, f = fam(ch.c);
            let nc = null;
            if (f === 'maj') { if (ch.c === 'maj7') nc = rand() < 0.5 ? '6' : 'maj9'; else if (ch.c === '6' || ch.c === 'maj9') nc = 'maj7'; }
            else if (f === 'min') { if (ch.c === 'm7') nc = rand() < 0.6 ? 'm9' : 'm11'; else if (ch.c === 'm9' || ch.c === 'm11') nc = 'm7'; }
            else if (f === 'dom') {
                if (ch.c === '7') nc = (prof.alt && isDomFn(sl) && resolves(i, ch) && rand() < 0.35) ? '7alt' : '9';
                else if (ch.c === '9' || ch.c === '7alt' || ch.c === '7b9') nc = '7';
            }
            if (!nc) return false;
            ch.c = nc; ch.s = scaleFor(nc); sl._mod = true;
            return true;
        }
    };

    if (prof.turn) turnWindows();
    const names = Object.keys(prof.w).filter(nm => ops[nm]);
    if (!names.length) return; // style sans réharmonisation (ex. « Chanson simple »)
    const total = names.reduce((t, nm) => t + prof.w[nm], 0);
    const pickOp = () => { let r = rand() * total; for (const nm of names) { r -= prof.w[nm]; if (r <= 0) return nm; } return names[names.length - 1]; };
    const goal = Math.max(2, Math.round(n * (0.10 + rand() * 0.20 + boost)));
    let applied = 0, guard = 0;
    while (applied < goal && guard++ < goal * 12) { if (ops[pickOp()]()) applied++; }
}

// Construit des propositions jusqu'à en trouver une qui diffère nettement de la précédente ; null si aucune n'est valide.
function renewTemplate(ctx, styleKey, buildTemplate, keyRoot, canonical) {
    const rand = makeVariationRng(ctx.generationVariant, styleKey, ctx.seedBase);
    const keysOf = (tpl) => {
        const a = [];
        tpl.forEach(it => { const key = `${it.r}:${it.c}` + (it.split ? `|${it.split.r}:${it.split.c}` : ''); for (let q = 0; q < (it.m || 1); q++) a.push(key); });
        return a;
    };
    const dist = (a, b) => { const L = Math.max(a.length, b.length); if (!L) return 0; let d = 0; for (let i = 0; i < L; i++) if (a[i] !== b[i]) d++; return d / L; };
    const norm = (tpl) => styleKey === 'i-got-rythm' ? tpl : normalizeGeneratedGrid(tpl, styleKey);
    const canonKeys = keysOf(norm(canonical.map(x => ({ ...x }))));
    const mem = (ctx.recentGrids || []).filter(e => e.style === styleKey);
    const prevKeys = mem.length ? mem[mem.length - 1].keys : canonKeys;
    const MIN_DIFF = 0.35, MIN_RECENT = 0.2;
    const prof = styleProfile(styleKey);
    let best = null, bestScore = -1;
    for (let attempt = 0; attempt < 60; attempt++) {
        const tpl = buildTemplate(rand);
        const twins = findTwinSections(tpl);
        const S = slotsFromTemplate(tpl);
        const twinRanges = tagTwinSlots(S, tpl, twins);
        reharmonize(ctx, S, styleKey, keyRoot, rand, prof, Math.min(0.3, Math.max(0, attempt - 12) * 0.012));
        copyTwinSlots(S, twinRanges);
        resolveEnding(ctx, S);
        if (isBrassStyle(styleKey)) simplifyBrass(S);
        if (validateSlots(S).length) continue;
        const out = norm(templateFromSlots(S));
        const keys = keysOf(out);
        const dPrev = dist(prevKeys, keys);
        const dRec = mem.reduce((m, e) => Math.min(m, dist(e.keys, keys)), 1);
        if (dPrev >= MIN_DIFF && dRec >= MIN_RECENT) return out;
        const score = Math.min(dPrev, MIN_DIFF) + 0.5 * Math.min(dRec, MIN_RECENT);
        if (score > bestScore) { bestScore = score; best = out; }
    }
    return best;
}

function isBrassStyle(styleKey) { return styleKey === 'brasshymn' || styleKey === 'brasscantique'; }

// Brass band : harmonie de triades et de dominantes septièmes. Les réharmonisations du bouton « Générer » (neuvièmes,
// septièmes majeures, accords altérés) sont ramenées à ce vocabulaire, sans changer fondamentales ni fonctions.
function simplifyBrass(S) {
    const fix = (ch) => {
        if (['maj7', '6', 'maj9', 'maj7sharp11', 'maj7sharp5'].includes(ch.c)) { ch.c = 'majTriad'; if (!['ionian', 'lydian'].includes(ch.s)) ch.s = 'ionian'; }
        else if (['m7', 'm9', 'm11', 'mmaj7'].includes(ch.c)) { ch.c = 'minTriad'; if (!['dorian', 'aeolian', 'harmonicMinor'].includes(ch.s)) ch.s = 'aeolian'; }
        else if (['9', '7alt', '7b9', '7sharp5', '7sus4'].includes(ch.c)) { ch.c = '7'; ch.s = ch.s === 'mixolydianFlat13' ? ch.s : 'mixolydian'; }
    };
    S.forEach(sl => { fix(sl); if (sl.split) fix(sl.split); });
}

function rememberGenerated(recent, styleKey, generated) {
    const keys = [];
    generated.forEach(it => {
        const key = `${it.rootIndex}:${it.chordId}` + (it.split ? `|${it.split.rootIndex}:${it.split.chordId}` : '');
        for (let q = 0; q < (it.measures || 1); q++) keys.push(key);
    });
    return (recent || []).concat([{ style: styleKey, keys }]).slice(-8);
}

function createStyleVariation(ctx, template, styleKey, keyRoot) {
    if (styleKey === 'i-got-rythm' || ctx.triadsOnly || isBrassStyle(styleKey)) return template.map(x => ({ ...x }));
    if (!template.length || ctx.generationVariant <= 0) return template.map(item => ({ ...item }));
    const rand = makeVariationRng(ctx.generationVariant, styleKey, ctx.seedBase);
    const out = template.map(item => ({ ...item }));
    // Sections consécutives identiques dans le modèle (ex. A A d'une forme AABA) : la variation est appliquée UNE fois,
    // puis recopiée sur la seconde section, pour que la répétition reste littérale (et s'écrive avec des signes de reprise).
    const twinGroups = findTwinSections(template);
    twinGroups.forEach((g, k) => {
        for (let i = g.root.a; i < g.root.b; i++) out[i]._twRoot = k;
        g.copies.forEach((cp, j) => { for (let i = cp.a; i < cp.b; i++) out[i]._twCopy = `${k}:${j}`; });
    });
    const byPhrase = new Map();
    out.forEach((item, i) => {
        const key = item.phrase || `p${i}`;
        if (!byPhrase.has(key)) byPhrase.set(key, []);
        byPhrase.get(key).push(i);
    });

    const chordCategory = (id) => {
        for (const cat in GEN_THEORY.chordTypes) if (GEN_THEORY.chordTypes[cat].some(c => c.id === id)) return cat;
        return 'other';
    };
    const scaleFor = (id) => {
        const obj = ctx.findChordObj(id);
        return obj && obj.scales && obj.scales[0] ? obj.scales[0].id : 'ionian';
    };
    const setChord = (i, r, c, s) => {
        out[i].r = (r + 12) % 12;
        out[i].c = c;
        out[i].s = s || scaleFor(c);
    };
    const isDominant = id => ['7','9','7alt','7b9','7sharp5','7sus4'].includes(id);
    const dominantOf = target => ({ r: (target + 7) % 12, c: '7', s: 'mixolydian' });

    // Une même cellule est modifiée de manière cohérente dans toutes ses occurrences
    // quand elle constitue une phrase répétée (A1/A2/A3, refrain, etc.).
    byPhrase.forEach((indices, phraseKey) => {
        const roll = rand();
        const first = out[indices[0]];
        const next = out[indices[indices.length - 1] + 1];

        // ii-V : couleur altérée sur la dominante, sans modifier sa fonction.
        if (styleKey !== 'pop' && styleKey !== 'funk' && styleKey !== 'modal' && roll < 0.24) {
            indices.forEach(i => {
                if (out[i].function === 'dominant' && isDominant(out[i].c) && rand() < 0.8) {
                    out[i].c = rand() < 0.5 ? '7alt' : '7b9';
                    out[i].s = scaleFor(out[i].c);
                }
            });
        }

        // Dominante secondaire : uniquement lorsqu'une cible diatonique existe réellement.
        if (!['pop','modal','funk'].includes(styleKey) && roll >= 0.24 && roll < 0.46) {
            for (let j = 0; j < indices.length - 1; j++) {
                const i = indices[j], n = indices[j + 1];
                if (out[n].function === 'tonic' || out[n].function === 'predominant' || out[n].function === 'target') {
                    if ((out[i].m || 1) >= 2 && rand() < 0.6) {
                        const d = dominantOf(out[n].r);
                        out[i].m = Math.max(1, out[i].m - 1);
                        out.splice(i + 1, 0, { ...d, m: 1, phrase: phraseKey, function: 'secondaryDominant' });
                        break;
                    }
                }
            }
        }

        // Substitution tritonique : seulement sur une dominante ayant une cible immédiate.
        if (['bebop','swing','hardbop','bossa','ballad','latin','fusion','anatole'].includes(styleKey) && roll >= 0.46 && roll < 0.66) {
            for (let j = 0; j < indices.length; j++) {
                const i = indices[j];
                const n = out[i + 1];
                if (out[i].function === 'dominant' && isDominant(out[i].c) && n) {
                    setChord(i, out[i].r + 6, rand() < 0.5 ? '7' : '7alt', rand() < 0.5 ? 'lydianDominant' : 'altered');
                    break;
                }
            }
        }

        // Variation de couleur sans changement de fonction.
        if (roll >= 0.66 && roll < 0.84) {
            indices.forEach(i => {
                const cat = chordCategory(out[i].c);
                if (cat === 'maj' && out[i].function === 'tonic' && rand() < 0.7) out[i].c = rand() < 0.5 ? 'maj7' : '6';
                else if (cat === 'min' && out[i].function === 'predominant' && rand() < 0.7) out[i].c = rand() < 0.5 ? 'm7' : 'm9';
                out[i].s = scaleFor(out[i].c);
            });
        }

        // Dans les styles modaux/funk/pop, la variation reste essentiellement rythmique ou
        // de couleur : on évite d'importer artificiellement le langage des dominantes du jazz.
        if (['modal','funk','pop'].includes(styleKey) && roll >= 0.84) {
            indices.forEach(i => {
                if (rand() < 0.5 && out[i].m > 1) {
                    const a = Math.ceil(out[i].m / 2), b = out[i].m - a;
                    out[i].m = a;
                    out.splice(i + 1, 0, { ...out[i], m: Math.max(1,b), phrase: phraseKey, function: out[i].function });
                }
            });
        }
    });

    // Garantie d'une nouvelle grille à chaque « Générer » : si les tirages n'ont
    // produit aucune différence, on applique une variation idiomatique minimale au style.
    const sameHarmonicContent = out.length === template.length && out.every((x,i) =>
        x.r === template[i].r && x.c === template[i].c && x.m === template[i].m && x.s === template[i].s
    );
    if (sameHarmonicContent) {
        const phase = ctx.generationVariant % 4;
        const first = out[0];
        if (styleKey === 'pop') {
            const candidates = out.filter(x => x.function === 'tonic' || x.function === 'predominant');
            if (candidates.length) {
                const x = candidates[phase % candidates.length];
                if (x.function === 'tonic') x.c = '6';
                else x.c = 'm7';
                x.s = scaleFor(x.c);
            }
        } else if (styleKey === 'funk') {
            const x = out.find(z => z.r === (keyRoot + 5) % 12) || out[1];
            if (x) { x.r = (x.r + (phase % 2 ? 10 : 5)) % 12; x.c = '7'; x.s = 'mixolydian'; }
        } else if (styleKey === 'modal') {
            const x = out[Math.min(2, out.length - 1)];
            if (x) x.r = (x.r + (phase % 2 ? 5 : 2)) % 12;
        } else if (styleKey === 'blues') {
            const x = out.find(z => z.r === (keyRoot + 5) % 12);
            if (x) x.c = phase % 2 ? '9' : '7';
        } else if (styleKey === 'baroque' || styleKey === 'mozart' || styleKey === 'trad') {
            if (styleKey === 'mozart') {
                const x = out.find(z => z.r === (keyRoot + 5) % 12 && z.function === 'predominant');
                if (x) { x.r = (keyRoot + 2) % 12; x.c = 'm7'; x.s = 'dorian'; }
            } else {
                const x = out.find(z => z.function === 'dominant');
                if (x) x.c = phase % 2 ? '7' : (styleKey === 'trad' ? 'maj7' : '7');
            }
            if (phase === 3 && out.length > 2) {
                const target = out.find(z => z.function === 'predominant');
                if (target) { const d = dominantOf(target.r); d.m = 1; d.section = target.section; d.phrase = target.phrase; out.splice(out.indexOf(target),0,d); target.m = Math.max(1,target.m-1); }
            }
        } else {
            const x = out.find(z => z.function === 'dominant');
            if (x) { x.r = (x.r + 6) % 12; x.c = '7alt'; x.s = 'altered'; }
            else if (first) first.m = Math.max(1, first.m);
        }
    }
    applyTwinCopies(out, template, twinGroups);
    return out;
}

// Groupes de sections consécutives de contenu identique dans un modèle : { root, copies:[…] } (plages [a, b[).
function findTwinSections(tpl) {
    const runs = [];
    tpl.forEach((it, i) => {
        const sec = it.section || '';
        const last = runs[runs.length - 1];
        if (last && last.sec === sec) last.b = i + 1; else runs.push({ a: i, b: i + 1, sec });
    });
    const sig = (r) => tpl.slice(r.a, r.b).map(x => JSON.stringify([x.r, x.c, x.m, x.s, x.split ? [x.split.r, x.split.c, x.split.s] : null, Number.isInteger(x.bassRootIndex) ? x.bassRootIndex : null])).join('|');
    const groups = [];
    let i = 0;
    while (i < runs.length) {
        let j = i + 1;
        while (j < runs.length && sig(runs[j]) === sig(runs[i])) j++;
        if (j > i + 1) groups.push({ root: runs[i], copies: runs.slice(i + 1, j) });
        i = j;
    }
    return groups;
}

// Après variation : chaque copie de section reprend le contenu varié de sa section d'origine (étiquettes section / phrase propres).
function applyTwinCopies(out, tpl, groups) {
    const rangeOf = (test) => {
        let a = -1, b = -1;
        out.forEach((x, i) => { if (test(x)) { if (a < 0) a = i; b = i; } });
        return a < 0 ? null : { a, b: b + 1 };
    };
    const total = (arr) => arr.reduce((t, x) => t + (x.m || 1), 0);
    groups.forEach((g, k) => {
        const rr = rangeOf(x => x._twRoot === k);
        if (!rr) return;
        const rootItems = tpl.slice(g.root.a, g.root.b);
        if (total(out.slice(rr.a, rr.b)) !== total(rootItems)) return; // la variation a changé la durée : on ne touche à rien
        g.copies.forEach((cp, j) => {
            const tag = `${k}:${j}`;
            const cr = rangeOf(x => x._twCopy === tag);
            if (!cr) return;
            const copyItems = tpl.slice(cp.a, cp.b);
            if (total(out.slice(cr.a, cr.b)) !== total(copyItems)) return;
            const phr = {};
            rootItems.forEach((x, i) => { if (x.phrase !== undefined && copyItems[i]) phr[x.phrase] = copyItems[i].phrase; });
            const fresh = out.slice(rr.a, rr.b).map(x => {
                const c = JSON.parse(JSON.stringify(x));
                delete c._twRoot; delete c._twCopy;
                c.section = cp.sec;
                if (c.phrase in phr) c.phrase = phr[c.phrase];
                return c;
            });
            const cr2 = rangeOf(x => x._twCopy === tag); // les indices ont pu bouger si la copie précède la racine (jamais en pratique)
            out.splice(cr2.a, cr2.b - cr2.a, ...fresh);
        });
    });
    out.forEach(x => { delete x._twRoot; delete x._twCopy; });
}

// ===== Écriture compacte d'une grille générée =====
// Les séquences de mesures qui se répètent sont écrites avec des signes de reprise (|: :|, ×N, 1re / 2e fin) au lieu
// d'être réécrites. L'ordre de lecture reste strictement celui de la grille complète.
// Règles : unité alignée sur les sections / phrases du style, 4 à 16 mesures, contenant au moins deux accords différents ;
// identité stricte (accord, gamme, second accord, basse) ; 2 à 4 énoncés identiques -> |: X :| (×N) ;
// deux énoncés à début commun d'au moins 4 mesures et fins différentes de 1 à 4 mesures -> 1re / 2e fin ;
// la plus grande unité d'abord, jamais de reprises imbriquées, rien autour de la grille entière.
function compactGridRepeats(grid) {
    if (!Array.isArray(grid) || !grid.length) return grid;
    const ms = [];
    let curSec = '', curPhr = '';
    grid.forEach((st, si) => {
        if (st.section) curSec = st.section;
        if (st.phrase) curPhr = st.phrase;
        const sp = st.split;
        const bass = (v) => Number.isInteger(v) ? v : null;
        const key = JSON.stringify([st.rootIndex, st.chordId, st.scaleId, bass(st.bassRootIndex),
            sp ? [sp.rootIndex, sp.chordId, sp.scaleId, bass(sp.bassRootIndex)] : null]);
        for (let q = 0; q < st.measures; q++) ms.push({ si, oi: ms.length, key, sec: curSec, phr: curPhr, rs: false, re: 0, volta: 0 });
    });
    const n = ms.length;
    if (n < 8) return grid;
    const isB = (i) => i <= 0 || i >= n || ms[i].sec !== ms[i - 1].sec || ms[i].phr !== ms[i - 1].phr;
    const eq = (a, b) => ms[a].key === ms[b].key;
    const nSec = (a, b) => new Set(ms.slice(a, b).map(x => x.sec)).size;
    const out = [];
    const put = (i, marks) => out.push({ ...ms[i], ...marks });
    let p = 0, changed = false;
    while (p < n) {
        let done = false;
        if (isB(p)) {
            for (let L = Math.min(16, Math.floor((n - p) / 2)); L >= 4 && !done; L--) {
                if (!isB(p + L) || !isB(p + 2 * L)) continue;
                if (new Set(ms.slice(p, p + L).map(x => x.key)).size < 2) continue; // un seul accord tenu : pas de reprise
                let c = 0;
                while (c < L && eq(p + c, p + L + c)) c++;
                if (c === L) {
                    let k = 2;
                    while (k < 4 && p + (k + 1) * L <= n && isB(p + (k + 1) * L)) {
                        let same = true;
                        for (let t = 0; t < L; t++) if (!eq(p + t, p + k * L + t)) { same = false; break; }
                        if (!same) break;
                        k++;
                    }
                    for (let t = 0; t < L; t++) put(p + t, { rs: t === 0, re: t === L - 1 ? k : 0 });
                    p += k * L; done = true; changed = true;
                } else if (c >= 4 && L - c <= 4 && nSec(p + c, p + L) === 1 && nSec(p + L + c, p + 2 * L) === 1) {
                    for (let t = 0; t < c; t++) put(p + t, { rs: t === 0 });
                    for (let t = c; t < L; t++) put(p + t, { volta: 1, re: t === L - 1 ? 2 : 0 });
                    for (let t = c; t < L; t++) put(p + L + t, { volta: 2 });
                    p += 2 * L; done = true; changed = true;
                }
            }
        }
        if (!done) { put(p, {}); p++; }
    }
    if (!changed) return grid;
    const res = [];
    let cur = null, prev = null;
    out.forEach(m => {
        const fresh = !cur || !prev || cur.si !== m.si || m.oi !== prev.oi + 1 || m.rs || prev.re || prev.volta !== m.volta;
        if (fresh) {
            if (cur) res.push(cur.step);
            const step = { ...grid[m.si], measures: 1 };
            delete step.repeatStart; delete step.repeatEnd; delete step.volta;
            if (m.rs) step.repeatStart = true;
            if (m.volta) step.volta = m.volta;
            cur = { si: m.si, step };
        } else cur.step.measures++;
        if (m.re) cur.step.repeatEnd = m.re;
        prev = m;
    });
    if (cur) res.push(cur.step);
    return res;
}

function normalizeGeneratedGrid(template, styleKey) {
    const targetMeasures = {
        'ii-v-i': 4, 'anatole': 8, 'i-got-rythm': 32, 'blues': 12, 'bebop': 32, 'swing': 32,
        'modal': 16, 'bossa': 32, 'pop': 16, 'ballad': 32, 'funk': 16,
        'hardbop': 16, 'dixieland': 16, 'latin': 16, 'fusion': 16,
        'baroque': 16, 'mozart': 16, 'trad': 16, 'chansonsimple': 16,
        'valsejazz': 32, 'valsemusette': 32, 'valseviennoise': 32, 'menuet': 32, 'valsecountry': 16,
        'jig': 32, 'afro68': 16, 'barcarolle': 16, 'tarentelle': 16, 'slipjig': 16,
        'blues128': 12, 'gospel': 16, 'ballad128': 32,
        'samba': 32, 'tango': 32, 'piazzolla': 16, 'milongalyrique': 32,
        'brasshymn': 16, 'brasscantique': 16,
        'balkan': 32, 'balkan98': 16
    }[styleKey] || 16;
    if (!template.length) return template;

    let normalized = [];
    let measures = 0;
    let sourceIndex = 0;
    while (measures < targetMeasures) {
        const source = template[sourceIndex % template.length];
        const remaining = targetMeasures - measures;
        const m = Math.min(Math.max(1, source.m || 1), remaining);
        normalized.push({ ...source, m });
        measures += m;
        sourceIndex++;
    }

    // Une grille doit rester dans une carrure stable : pas de découpage aléatoire d'une
    // phrase, sauf si cela est nécessaire pour obtenir un nombre pair de cellules.
    normalized = enforceChordRepeatLimits(normalized, styleKey === 'milongalyrique');
    if (normalized.length % 2 !== 0) {
        const splitIndex = normalized.findIndex(item => (item.m || 1) >= 2);
        if (splitIndex >= 0) {
            const item = normalized[splitIndex];
            const a = Math.max(1, Math.floor(item.m / 2));
            const b = Math.max(1, item.m - a);
            normalized.splice(splitIndex, 1,
                { ...item, m: a },
                { ...item, m: b, phrase: item.phrase ? `${item.phrase}-split` : undefined }
            );
        }
    }
    return normalized;
}

function enforceChordRepeatLimits(items, keepBass) {
    if (!items.length) return items;
    const same = (a,b) => a && b && !a.split && !b.split && a.r === b.r && a.c === b.c && a.section === b.section && a.kc === b.kc && (!keepBass || a.bassRootIndex === b.bassRootIndex); // ni mesure à deux accords, ni changement de section (ni de basse, pour la Milonga lyrique)
    const out = [];
    items.forEach(item => {
        const prev = out[out.length - 1];
        if (prev && same(prev, item) && prev.m < 4) prev.m += item.m;
        else out.push({ ...item });
    });
    return out;
}

function chordFamily(id) {
    const info = GEN_THEORY.chordInfo(id);
    return info ? info.fam : 'maj';
}

// ===== Fonction tonale : alternatives conformes à la théorie =====
function romanDeg(t, lower = false) {
    const R = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
    const x = R[((t % 12) + 12) % 12];
    return lower ? x.toLowerCase() : x;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeVariationRng, gridSignature, styleProfile, resolveEnding, withResolvedEnding, slotsFromTemplate, templateFromSlots,
        tagTwinSlots, copyTwinSlots, validateSlots, reharmonize, renewTemplate, isBrassStyle, simplifyBrass, rememberGenerated,
        createStyleVariation, findTwinSections, applyTwinCopies, compactGridRepeats, normalizeGeneratedGrid, enforceChordRepeatLimits,
        chordFamily, romanDeg };
}
