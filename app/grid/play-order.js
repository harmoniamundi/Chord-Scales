// grid/play-order.js — ordre de lecture d'une grille d'accords : reprises (|: :|), 1re / 2e fin (voltas),
// plage de mesures jouée, bloc suivant. Fonctions pures sur le tableau `grid` (liste de blocs), sans DOM ni état :
// la mémoire des passages (`passes`) et les options de lecture sont passées en paramètres.
// Chargé par index.html via <script src="grid/play-order.js"> (après band/band-helpers.js) et testé par grid/play-order.test.js.
//
// Un bloc de la grille : { rootIndex, chordId, scaleId, measures, split?, repeatStart?, repeatEnd?, volta? }
//   repeatStart  début de reprise |:
//   repeatEnd    nombre de passages (2 à 4), porté par le bloc qui finit la reprise :|
//   volta        1 (1re fin) ou 2 (2e fin)
// Signes de renvoi, façon Real Book (voir « Signes de renvoi » plus bas) :
//   segno, coda  posés au début du bloc (𝄋 renvoi, ⊕ début de la coda)
//   toCoda, fine, jump ('dc', 'dcFine', 'dcCoda', 'ds', 'dsFine', 'dsCoda')  posés à la fin du bloc
//   fermata      point d'orgue 𝄐 sur le dernier accord du bloc (« last x » : seulement quand la lecture s'y termine)

// Sous Node, isSplit se charge ; en navigateur c'est un global (band/band-helpers.js).
if (typeof isSplit === 'undefined' && typeof require === 'function') {
    var { isSplit } = require('../band/band-helpers.js');
}

// Liste à plat des mesures (une entrée par mesure, numérotées à partir de 1).
function flatMeasureList(grid) {
    const list = [];
    let measureNumber = 1;
    grid.forEach((step, stepIndex) => {
        for (let m = 0; m < step.measures; m++) {
            list.push({
                measureNumber,
                stepIndex,
                measureInStep: m + 1,
                rootIndex: step.rootIndex,
                chordId: step.chordId,
                scaleId: step.scaleId,
                bassRootIndex: Number.isInteger(step.bassRootIndex) ? step.bassRootIndex : null,
                split: isSplit(step) ? { rootIndex: step.split.rootIndex, chordId: step.split.chordId, scaleId: step.split.scaleId, bassRootIndex: Number.isInteger(step.split.bassRootIndex) ? step.split.bassRootIndex : null, fnLabel: step.split.fnLabel || null, modKey: step.split.modKey || null } : null,
                harmonicFunction: step.harmonicFunction || null,
                fnLabel: step.fnLabel || null,
                modKey: step.modKey || null
            });
            measureNumber++;
        }
    });
    return list;
}

// Numéro (1-based) de la première mesure du bloc stepIndex.
function stepStartMeasure(grid, stepIndex) {
    let m = 1;
    for (let i = 0; i < stepIndex && i < grid.length; i++) {
        m += grid[i].measures;
    }
    return m;
}

// ===== Reprises : calcul de l'ordre de lecture =====
// Un bloc porte repeatStart (début |:), repeatEnd = nombre de passages (fin :|) et/ou volta = 1 ou 2
// (1re / 2e fin). La 1re fin est jouée au premier passage seulement ; au passage suivant on la saute.
// 1re fin « effective » de chaque bloc : une 1re fin couvre TOUTES les mesures depuis son indication jusqu'à
// celle qui porte le signe de reprise :| (la 1re fin se termine toujours sur la barre de reprise). Il suffit donc
// de marquer le début de la 1re fin ; les mesures jusqu'au :| en font partie, pour l'affichage comme pour la lecture.
// Retourne un tableau (un élément par bloc) : 0, 1 (1re fin) ou 2 (2e fin).
function effectiveVolta(grid) {
    const g = grid;
    const eff = g.map(st => st.volta || 0);
    let start = 0;
    for (let i = 0; i < g.length; i++) {
        if (g[i].repeatStart) start = i;
        if (g[i].repeatEnd) {
            let f = -1;
            for (let k = start; k <= i; k++) if (g[k].volta === 1) { f = k; break; }
            if (f >= 0) for (let k = f; k <= i; k++) if (!g[k].volta) eff[k] = 1;
            start = i + 1;
        }
    }
    return eff;
}

// Régions de reprise : { start, end, times, owned } (owned : blocs « 1re fin » de la reprise).
function repeatRegions(grid) {
    const g = grid;
    const eff = effectiveVolta(g);
    const regions = [];
    let start = 0;
    for (let i = 0; i < g.length; i++) {
        if (g[i].repeatStart) start = i;
        if (g[i].repeatEnd) {
            // Blocs « 1re fin » de cette reprise : tous ceux marqués 1re fin entre le début de reprise et le signe :|
            // (où que le :| tombe dans la 1re fin, ou même juste après), plus la suite de 1re fin qui prolonge le bloc du :|.
            const owned = new Set();
            for (let k = start; k <= i; k++) if (eff[k] === 1) owned.add(k);
            if (eff[i] === 1) { let x = i; while (x + 1 < g.length && eff[x + 1] === 1) { x++; owned.add(x); } }
            regions.push({ start, end: i, times: g[i].repeatEnd, owned });
            start = i + 1;
        }
    }
    return regions;
}

// ===== Signes de renvoi (usage Real Book) =====
// Début de bloc : segno (𝄋, point de retour du D.S.) et coda (⊕, début de la coda).
// Fin de bloc   : toCoda (« To Coda ⊕ »), fine (« Fine ») et jump, le renvoi lui-même :
//   'dc' D.C. (retour au début)      'dcFine' D.C. al Fine      'dcCoda' D.C. al Coda
//   'ds' D.S. (retour au 𝄋)          'dsFine' D.S. al Fine      'dsCoda' D.S. al Coda
// Jeu (tempo, croches) : après un renvoi, il est relu au point d'arrivée, comme sur une partition (« Slow 4 » en tête de grille
// après un D.C., l'indication en vigueur au Segno après un D.S.) : un « double time » des solos ne déborde pas sur le thème.
// Lecture : au premier passage, Fine et To Coda sont ignorés ; arrivé au bout du bloc qui porte le renvoi (après ses reprises),
// on retourne au début ou au 𝄋. Ce renvoi n'est pris qu'une fois. Ensuite, comme sur un Real Book, les reprises ne sont plus
// refaites (on joue directement la dernière fin) ; « al Fine » (ou D.C. / D.S. seuls) s'arrête au Fine, « al Coda » saute du
// « To Coda » au ⊕. L'état du renvoi est rangé dans `passes` sous la clé NAV_KEY (remis à zéro avec les compteurs de reprise).
const NAV_KEY = 'nav';
const NAV_START_KEYS = ['segno', 'coda'];
const NAV_END_KEYS = ['toCoda', 'fine', 'jump', 'fermata']; // fermata : point d'orgue sur le dernier accord, joué seulement à la fin de la lecture
const NAV_JUMPS = {
    dc: { target: 'start', until: 'fine', label: 'D.C.' },
    dcFine: { target: 'start', until: 'fine', label: 'D.C. al Fine' },
    dcCoda: { target: 'start', until: 'coda', label: 'D.C. al Coda' },
    ds: { target: 'segno', until: 'fine', label: 'D.S.' },
    dsFine: { target: 'segno', until: 'fine', label: 'D.S. al Fine' },
    dsCoda: { target: 'segno', until: 'coda', label: 'D.S. al Coda' },
};
function isNavJump(v) { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(NAV_JUMPS, v); }
function hasNavMarks(st) { return !!st && (!!st.segno || !!st.coda || !!st.toCoda || !!st.fine || isNavJump(st.jump)); }
// Bloc de retour d'un renvoi posé sur le bloc i : début de la grille (D.C.), ou le 𝄋 le plus proche avant lui (sinon le premier).
function navTargetIndex(grid, i, kind) {
    if (NAV_JUMPS[kind].target === 'start') return 0;
    for (let k = Math.min(i, grid.length - 1); k >= 0; k--) if (grid[k].segno) return k;
    const f = grid.findIndex(st => st.segno);
    return f >= 0 ? f : 0;
}
// Bloc qui ouvre la coda (⊕) : le premier après le bloc i, sinon le premier de la grille ; -1 s'il n'y en a pas.
function codaIndex(grid, i) {
    for (let k = i + 1; k < grid.length; k++) if (grid[k].coda) return k;
    return grid.findIndex(st => st.coda);
}

// ===== Lecture d'une plage de mesures sélectionnée =====
// Premier / dernier numéro de mesure (1-based) du bloc idx
function stepSpan(grid, idx) {
    let first = 1;
    for (let i = 0; i < idx; i++) first += grid[i].measures;
    return { first, last: first + grid[idx].measures - 1 };
}

// Bloc et rang dans le bloc (1-based) de la mesure n
function stepOfMeasure(grid, n) {
    let c = 0;
    for (let i = 0; i < grid.length; i++) {
        if (n <= c + grid[i].measures) return { idx: i, measureInStep: n - c };
        c += grid[i].measures;
    }
    const last = grid.length - 1;
    return { idx: last, measureInStep: grid[last].measures };
}

// Plage jouée = la sélection { from, to } ; null (lecture normale) s'il n'y a pas de sélection ou si elle couvre toute la grille.
function computePlayRange(sel, total) {
    if (!sel) return null;
    if (!total) return null;
    const from = Math.max(1, Math.min(sel.from, total));
    const to = Math.max(from, Math.min(sel.to, total));
    if (from === 1 && to === total) return null;
    return { from, to };
}

// Bloc joué après le bloc i, et indication « la grille est terminée » (wrapped).
// `passes` : passages déjà effectués de chaque reprise (clé : index du bloc de fin). Il est MODIFIÉ en place :
// l'appelant passe son compteur réel pour une lecture réelle, une copie pour une simple consultation.
function nextStepInfo(grid, i, passes) {
    const len = grid.length;
    if (!len) return { idx: 0, wrapped: true };
    const regions = repeatRegions(grid);
    const wrap = () => ({ idx: 0, wrapped: true });

    // Aux passages suivants, toute la 1re fin (suite de blocs marqués « 1re fin ») est sautée : la lecture
    // continue au premier bloc qui la suit (2e fin). Si ce saut dépasse le signe :|, le compteur est remis à 1.
    const effV = effectiveVolta(grid);
    const skipFirstEnding = (j) => {
        for (const rg of regions) {
            if ((passes[rg.end] || 1) <= 1 || !rg.owned.has(j)) continue;
            let e = j;
            while (e + 1 < len && effV[e + 1] === 1) e++;
            if (e >= rg.end) passes[rg.end] = 1;
            return e + 1;
        }
        return j;
    };

    // Après un renvoi (D.C. / D.S.) : Fine termine la grille, To Coda saute au ⊕.
    const st = grid[i] || {};
    const nav = passes[NAV_KEY] || null;
    if (nav) {
        if (nav.until === 'fine' && st.fine) return wrap();
        if (nav.until === 'coda' && st.toCoda) {
            const c = codaIndex(grid, i);
            if (c >= 0 && c !== i) { passes[NAV_KEY] = { ...nav, coda: true }; return { idx: c, wrapped: false }; }
        }
    }

    // Fin de reprise : on retourne au début tant que tous les passages ne sont pas faits
    const r = regions.find(rg => rg.end === i);
    if (r) {
        const p = passes[r.end] || 1;
        if (p < r.times) {
            passes[r.end] = p + 1;
            const back = skipFirstEnding(r.start); // cas limite : le début de reprise est lui-même en 1re fin
            return back >= len ? wrap() : { idx: back, wrapped: false };
        }
        passes[r.end] = 1;
    }

    // Renvoi D.C. / D.S. (pris une seule fois, reprises du bloc terminées) : les reprises ne sont plus refaites ensuite,
    // chacune est marquée « dernier passage » (sa 1re fin sera sautée).
    if (!nav && isNavJump(st.jump)) {
        passes[NAV_KEY] = { from: i, until: NAV_JUMPS[st.jump].until };
        regions.forEach(rg => { passes[rg.end] = rg.times; });
        const back = skipFirstEnding(navTargetIndex(grid, i, st.jump));
        return back >= len ? wrap() : { idx: back, wrapped: false };
    }
    let j = i + 1;
    if (j >= len) return wrap();
    j = skipFirstEnding(j);
    if (j >= len) return wrap();
    return { idx: j, wrapped: false };
}

// Nombre de mesures jouées lors d'une lecture complète de la grille (reprises et 1re / 2e fins comprises), sans boucle.
function playedMeasureCount(grid) {
    let total = 0, i = 0, guard = 0;
    const passes = {};
    while (grid.length && i >= 0 && i < grid.length && guard++ < 100000) {
        total += Math.max(1, grid[i].measures || 1);
        const nx = nextStepInfo(grid, i, passes);
        if (nx.wrapped) break;
        i = nx.idx;
    }
    return total;
}

// Index du bloc suivant pour l'affichage / la basse ; -1 s'il n'y en a pas
// (fin de grille ou de plage sélectionnée, sans boucle).
// opts : { playRange: { from, to } | null, loopEnabled: boolean, passes: {} } (passes n'est pas modifié).
function peekNextIndex(grid, i, opts) {
    const rg = opts.playRange;
    const pk = nextStepInfo(grid, i, { ...opts.passes });
    if (!rg) return (pk.wrapped && !opts.loopEnabled) ? -1 : pk.idx;
    const span = stepSpan(grid, i);
    const nm = stepSpan(grid, pk.idx).first;
    const inside = !pk.wrapped && nm >= rg.from && nm <= rg.to;
    const back = opts.loopEnabled ? stepOfMeasure(grid, rg.from).idx : -1;
    if (rg.to >= span.first && rg.to <= span.last) {
        // la plage se termine dans ce bloc ; une reprise qui renvoie à l'intérieur de la plage est honorée
        return (span.last === rg.to && inside) ? pk.idx : back;
    }
    if (inside) return pk.idx;
    // un saut (reprise) qui quitterait la plage est ignoré : on continue avec le bloc suivant
    return (span.last + 1 <= rg.to) ? i + 1 : back;
}

// Même accord (fondamentale, type, gamme, éventuel second accord) ?
function sameChordStep(a, b) {
    if (!a || !b) return false;
    if (a.rootIndex !== b.rootIndex || a.chordId !== b.chordId || a.scaleId !== b.scaleId) return false;
    if (!!a.split !== !!b.split) return false;
    return !a.split || (a.split.rootIndex === b.split.rootIndex && a.split.chordId === b.split.chordId && a.split.scaleId === b.split.scaleId);
}

// Bloc « suivant » AFFICHÉ (carte de gamme « Suivante », accord suivant) : un accord répété sur plusieurs
// mesures ou blocs consécutifs compte pour UN seul accord. Dès la première mesure de la répétition, le suivant
// affiché est donc le premier accord DIFFÉRENT qui suit ; si la répétition va jusqu'à la fin de la grille, c'est le
// premier accord de la grille en boucle, et rien sans boucle. La basse de l'orchestre continue d'utiliser
// peekNextIndex (le vrai bloc suivant), sinon elle annoncerait trop tôt le changement d'accord.
function peekNextDisplayIndex(grid, i, opts) {
    const first = peekNextIndex(grid, i, opts);
    const cur = grid[i];
    if (first < 0 || !cur) return first;
    let n = first;
    const seen = new Set([i]);
    while (n >= 0 && sameChordStep(grid[n], cur)) {
        if (seen.has(n)) return first; // grille entièrement répétée : on garde le suivant immédiat
        seen.add(n);
        n = peekNextIndex(grid, n, opts);
    }
    return n;
}

// ===== Indications de jeu : croches (Droit / Swing) et tempo (♩ = N, a tempo) =====
// Un bloc peut porter, au début de sa première mesure :
//   feel  = 'straight' (« Droit ») | 'swing' (« Swing » : retour au swing général)       pour tous les passages
//   tempo = 30 à 300 (♩ = N) | 'base' (« a tempo » : retour au tempo général)             pour tous les passages
//   byPass = { 1: { feel?, tempo? }, 2: { … }, … } : indications propres à un passage de la reprise (« 1x Droit ♩=80 · 2x Swing »),
//            comme sur un lead sheet ; elles remplacent, pour ce passage, celles écrites pour tous les passages.
// Une indication vaut jusqu'à la suivante rencontrée en jouant (comme un musicien qui lit la grille).
const TEMPO_MARK_MIN = 30, TEMPO_MARK_MAX = 300, PASS_MARK_MAX = 4;
function isTempoMark(v) { return v === 'base' || (Number.isInteger(v) && v >= TEMPO_MARK_MIN && v <= TEMPO_MARK_MAX); }
function isFeelMark(v) { return v === 'straight' || v === 'swing'; }

// Indications d'un bloc pour le passage `pass` (1 = premier) : { feel?, tempo? }.
function marksAt(st, pass) {
    const out = {};
    if (!st) return out;
    if (isFeelMark(st.feel)) out.feel = st.feel;
    if (isTempoMark(st.tempo)) out.tempo = st.tempo;
    const bp = st.byPass && typeof st.byPass === 'object' ? st.byPass[pass] : null;
    if (bp) {
        if (isFeelMark(bp.feel)) out.feel = bp.feel;
        if (isTempoMark(bp.tempo)) out.tempo = bp.tempo;
    }
    return out;
}

// Passage en cours (1, 2…) de la reprise qui contient le bloc i, d'après les compteurs de lecture `passes` (voir nextStepInfo).
// Hors reprise : 1. Un bloc de 2e fin (après le :|) est joué au dernier passage de la reprise qui le précède.
function passOfStep(grid, i, passes) {
    const regions = repeatRegions(grid);
    for (const rg of regions) if ((i >= rg.start && i <= rg.end) || rg.owned.has(i)) return (passes && passes[rg.end]) || 1;
    if (effectiveVolta(grid)[i] === 2) {
        let prev = null;
        for (const rg of regions) if (rg.end < i) prev = rg;
        if (prev) return prev.times;
    }
    return 1;
}

// Applique des indications à un état de jeu { feel: 'straight' | 'swing' | null, tempo: N | null } (null = réglage général ;
// 'swing' = croches swing même si le réglage général est droit).
function applyMarks(state, mk) {
    if (mk.feel) state.feel = mk.feel;
    if (mk.tempo !== undefined) state.tempo = mk.tempo === 'base' ? null : mk.tempo;
    return state;
}

// État de jeu en arrivant sur le bloc i, en relisant la grille dans l'ordre écrit jusqu'à lui avec les compteurs de reprise en cours.
function markStateAt(grid, i, passes) {
    const s = { feel: null, tempo: null };
    for (let j = 0; j <= i && j < grid.length; j++) applyMarks(s, marksAt(grid[j], passOfStep(grid, j, passes || {})));
    return s;
}

// Indication de croches en vigueur sur chaque bloc au premier passage, dans l'ordre écrit : 'straight', 'swing' ou null (aucune).
function feelByStep(grid) {
    let cur = null;
    return (grid || []).map(st => { const mk = marksAt(st, 1); if (mk.feel) cur = mk.feel; return cur; });
}

// Tempo en vigueur sur chaque bloc au premier passage, dans l'ordre écrit : un nombre (♩ = N) ou null (tempo général).
function tempoByStep(grid) {
    let cur = null;
    return (grid || []).map(st => { const mk = marksAt(st, 1); if (mk.tempo !== undefined) cur = mk.tempo === 'base' ? null : mk.tempo; return cur; });
}

// Durée en secondes d'une lecture complète (reprises comprises, sans boucle) : chaque mesure à son tempo, passage par passage.
// barUnits = noires (ou pulsations) par mesure ; baseBpm = tempo général de la grille.
function playedSeconds(grid, barUnits, baseBpm) {
    let state = { feel: null, tempo: null };
    let total = 0, i = 0, guard = 0, reread = false;
    const passes = {};
    while (grid.length && i >= 0 && i < grid.length && guard++ < 100000) {
        // Après un renvoi, le jeu est relu au point d'arrivée (voir markStateAt), comme le fait le moteur.
        if (reread) { state = markStateAt(grid, i, passes); reread = false; }
        else applyMarks(state, marksAt(grid[i], passOfStep(grid, i, passes)));
        total += Math.max(1, grid[i].measures || 1) * barUnits * 60 / (state.tempo || baseBpm);
        const navBefore = passes[NAV_KEY];
        const nx = nextStepInfo(grid, i, passes);
        if (passes[NAV_KEY] !== navBefore) reread = true;
        if (nx.wrapped) break;
        i = nx.idx;
    }
    return total;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { feelByStep, tempoByStep, isTempoMark, isFeelMark, marksAt, passOfStep, applyMarks, markStateAt, playedSeconds, TEMPO_MARK_MIN, TEMPO_MARK_MAX, PASS_MARK_MAX, flatMeasureList, stepStartMeasure, effectiveVolta, repeatRegions, stepSpan, stepOfMeasure,
        computePlayRange, nextStepInfo, NAV_KEY, NAV_START_KEYS, NAV_END_KEYS, NAV_JUMPS, isNavJump, hasNavMarks, navTargetIndex, codaIndex, playedMeasureCount, peekNextIndex, sameChordStep, peekNextDisplayIndex };
}
