// grid/play-order.js — ordre de lecture d'une grille d'accords : reprises (|: :|), 1re / 2e fin (voltas),
// plage de mesures jouée, bloc suivant. Fonctions pures sur le tableau `grid` (liste de blocs), sans DOM ni état :
// la mémoire des passages (`passes`) et les options de lecture sont passées en paramètres.
// Chargé par index.html via <script src="grid/play-order.js"> (après band/band-helpers.js) et testé par grid/play-order.test.js.
//
// Un bloc de la grille : { rootIndex, chordId, scaleId, measures, split?, repeatStart?, repeatEnd?, volta? }
//   repeatStart  début de reprise |:
//   repeatEnd    nombre de passages (2 à 4), porté par le bloc qui finit la reprise :|
//   volta        1 (1re fin) ou 2 (2e fin)

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
    let j = i + 1;
    if (j >= len) return wrap();
    j = skipFirstEnding(j);
    if (j >= len) return wrap();
    return { idx: j, wrapped: false };
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { flatMeasureList, stepStartMeasure, effectiveVolta, repeatRegions, stepSpan, stepOfMeasure,
        computePlayRange, nextStepInfo, peekNextIndex, sameChordStep, peekNextDisplayIndex };
}
