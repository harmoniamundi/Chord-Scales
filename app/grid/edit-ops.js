// grid/edit-ops.js — opérations d'édition sur une grille d'accords, sans DOM ni état d'interface :
// isoler une mesure dans son bloc, fusionner les blocs voisins identiques, supprimer / insérer / dupliquer / transposer des mesures,
// poser des signes de reprise, enregistrer une fonction tonale, repères de partie automatiques.
// Toutes les fonctions reçoivent le tableau `grid` (liste de blocs) et le MODIFIENT en place, comme le faisait le moteur ;
// sélection, pile d'annulation et rafraîchissement de l'écran restent dans index.html.
// Un bloc : { rootIndex, chordId, scaleId, measures, split?, bassRootIndex?, repeatStart?, repeatEnd?, volta?, partStart?, fnLabel?, modKey? }
// Les mesures sont numérotées à partir de 1 (comme flatMeasureList). Chargé par index.html via <script src="grid/edit-ops.js">
// (après grid/play-order.js et grid/grid-format.js) et testé par grid/edit-ops.test.js.

// Sous Node, les dépendances se chargent ; en navigateur ce sont des globaux (autres fichiers de grid/ et band/).
if (typeof flatMeasureList === 'undefined' && typeof require === 'function') {
    var { flatMeasureList, effectiveVolta } = require('./play-order.js');
}
// isPartLabel est une constante globale (grid/grid-format.js) : on la reprend sous un nom propre à ce fichier.
const EDIT_IS_PART_LABEL = (typeof isPartLabel !== 'undefined') ? isPartLabel : require('./grid-format.js').isPartLabel;
if (typeof isSplit === 'undefined' && typeof require === 'function') {
    var { isSplit } = require('../band/band-helpers.js');
}

const cloneStep = (o) => JSON.parse(JSON.stringify(o));

// Repère de partie porté par la mesure m (liste à plat), seulement si elle ouvre son bloc ; '' sinon.
function partLabelOfMeasure(grid, m) {
    if (!m) return '';
    const st = grid[m.stepIndex];
    if (!st || m.measureInStep !== 1) return '';
    return EDIT_IS_PART_LABEL(st.partStart) ? st.partStart : '';
}

// Copie profonde des mesures from..to (numéros 1-based) sous forme de mesures isolées.
function measureItems(grid, from, to) {
    const effVolta = effectiveVolta(grid);
    return flatMeasureList(grid).slice(from - 1, to).map(m => {
        const it = { rootIndex: m.rootIndex, chordId: m.chordId, scaleId: m.scaleId };
        const stp = grid[m.stepIndex];
        if (stp.repeatStart && m.measureInStep === 1) it.repeatStart = true;
        if (stp.partStart && m.measureInStep === 1) it.partStart = stp.partStart;
        if (stp.repeatEnd && m.measureInStep === stp.measures) it.repeatEnd = stp.repeatEnd;
        if (effVolta[m.stepIndex]) it.volta = effVolta[m.stepIndex];
        if (stp.fnLabel) it.fnLabel = stp.fnLabel;
        if (stp.modKey) it.modKey = { ...stp.modKey };
        if (Number.isInteger(m.bassRootIndex)) it.bassRootIndex = m.bassRootIndex;
        if (m.harmonicFunction) it.harmonicFunction = m.harmonicFunction;
        if (m.split) it.split = { rootIndex: m.split.rootIndex, chordId: m.split.chordId, scaleId: m.split.scaleId };
        if (m.split && m.split.fnLabel) it.split.fnLabel = m.split.fnLabel;
        if (m.split && m.split.modKey) it.split.modKey = { ...m.split.modKey };
        if (m.split && Number.isInteger(m.split.bassRootIndex)) it.split.bassRootIndex = m.split.bassRootIndex;
        return it;
    });
}

// Isole une mesure dans son propre bloc (un bloc de 4 mesures devient jusqu'à 3 blocs) et renvoie l'index de ce bloc (-1 si absente).
function isolateMeasure(grid, measureNumber) {
    const m = flatMeasureList(grid).find(x => x.measureNumber === measureNumber);
    if (!m) return -1;
    const s = grid[m.stepIndex];
    if (s.measures === 1) return m.stepIndex;
    const base = cloneStep(s);
    delete base.split;
    const before = m.measureInStep - 1;
    const after = s.measures - m.measureInStep;
    const parts = [];
    if (before > 0) parts.push({ ...base, measures: before });
    const editedPos = parts.length;
    parts.push({ ...base, measures: 1 });
    if (after > 0) parts.push({ ...base, measures: after });
    // Début de reprise : seulement sur la première partie ; fin de reprise : seulement sur la dernière.
    parts.forEach(pt => { delete pt.repeatStart; delete pt.repeatEnd; });
    if (s.repeatStart) parts[0].repeatStart = true;
    // Repère de partie : seulement sur la première partie du bloc éclaté
    parts.forEach(pt => { delete pt.partStart; });
    if (s.partStart) parts[0].partStart = s.partStart;
    if (s.repeatEnd) parts[parts.length - 1].repeatEnd = s.repeatEnd;
    grid.splice(m.stepIndex, 1, ...parts);
    return m.stepIndex + editedPos;
}

// Isole chaque mesure de la plage dans son propre bloc ; renvoie l'index des blocs extrêmes.
function isolateRange(grid, from, to) {
    for (let n = to; n >= from; n--) isolateMeasure(grid, n);
    const flat = flatMeasureList(grid);
    return { i0: flat[from - 1].stepIndex, i1: flat[to - 1].stepIndex };
}

// Coupe le bloc qui contient la mesure n juste avant elle (n devient la première mesure d'un bloc).
function splitBeforeMeasure(grid, n) {
    const m = flatMeasureList(grid).find(x => x.measureNumber === n);
    if (!m || m.measureInStep === 1) return;
    const st = grid[m.stepIndex];
    const base = cloneStep(st);
    delete base.split;
    const before = m.measureInStep - 1;
    const parts = [{ ...base, measures: before }, { ...base, measures: st.measures - before }];
    parts.forEach(pt => { delete pt.repeatStart; delete pt.repeatEnd; });
    if (st.repeatStart) parts[0].repeatStart = true;
    if (st.repeatEnd) parts[1].repeatEnd = st.repeatEnd;
    parts.forEach(pt => { delete pt.partStart; });
    if (st.partStart) parts[0].partStart = st.partStart;
    grid.splice(m.stepIndex, 1, ...parts);
}

// Fusionne les blocs voisins identiques autour d'une zone modifiée (évite l'éparpillement en blocs d'1 mesure).
function mergeAround(grid, i0, i1) {
    // Le repère de partie ne compte pas dans la comparaison, mais un bloc qui ouvre une partie
    // n'est jamais absorbé par le précédent (sinon son repère serait perdu).
    const strip = (o) => { const c = { ...o }; delete c.measures; delete c.partStart; return JSON.stringify(c); };
    let i = Math.max(0, i0 - 1);
    let end = Math.min(grid.length - 1, i1 + 1);
    while (i < end && i < grid.length - 1) {
        const a = grid[i], b = grid[i + 1];
        if (!a.split && !b.split && !b.partStart && strip(a) === strip(b)) {
            a.measures += b.measures;
            grid.splice(i + 1, 1);
            end--;
        } else i++;
    }
}

// Supprime les mesures from..to. Un repère de partie supprimé passe à la mesure suivante si celle-ci n'en porte pas.
// Renvoie l'index du bloc qui occupe maintenant la place de la plage.
function deleteRange(grid, from, to) {
    const flat0 = flatMeasureList(grid);
    let lost = '';
    for (let n = from; n <= to; n++) { const lab = partLabelOfMeasure(grid, flat0[n - 1]); if (lab) lost = lab; }
    const nextM = flat0[to];
    const carry = (lost && nextM && !partLabelOfMeasure(grid, nextM)) ? lost : '';
    const { i0, i1 } = isolateRange(grid, from, to);
    grid.splice(i0, i1 - i0 + 1);
    if (carry && grid[i0]) grid[i0].partStart = carry;
    mergeAround(grid, i0 - 1, i0);
    return i0;
}

// Supprime une seule mesure (éditeur de mesure) : comme deleteRange, sans refusion des blocs voisins.
function deleteMeasureAt(grid, measureNumber) {
    const flat0 = flatMeasureList(grid);
    const lost = partLabelOfMeasure(grid, flat0[measureNumber - 1]);
    const nextM = flat0[measureNumber];
    const carry = (lost && nextM && !partLabelOfMeasure(grid, nextM)) ? lost : '';
    const idx = isolateMeasure(grid, measureNumber);
    if (idx >= 0) {
        grid.splice(idx, 1);
        if (carry && grid[idx]) grid[idx].partStart = carry;
    }
}

// Insère les mesures « items » (mesures isolées) juste après la mesure afterMeasure (0 = au début).
function insertItemsAfter(grid, afterMeasure, items) {
    if (!items.length) return;
    let at = 0;
    if (flatMeasureList(grid).length > 0 && afterMeasure >= 1) {
        const idx = isolateMeasure(grid, afterMeasure);
        at = idx + 1;
    }
    const steps = items.map(it => ({ ...cloneStep(it), measures: 1 }));
    grid.splice(at, 0, ...steps);
    mergeAround(grid, at - 1, at + steps.length);
}

// Copie de la mesure n insérée juste après elle (sans signes de reprise ni repère de partie) ; renvoie l'index isolé, ou -1.
function duplicateMeasureAfter(grid, measureNumber) {
    const idx = isolateMeasure(grid, measureNumber);
    if (idx < 0) return -1;
    const cp = cloneStep(grid[idx]);
    delete cp.repeatStart; delete cp.repeatEnd; delete cp.volta; delete cp.partStart;
    grid.splice(idx + 1, 0, cp);
    return idx;
}

// Ajoute en fin de grille une mesure copiée de la dernière (sans reprises, fonction tonale ni repère de partie).
function appendCopyOfLast(grid) {
    const last = cloneStep(grid[grid.length - 1]);
    if (last.measures !== 1) delete last.split;
    delete last.repeatStart; delete last.repeatEnd; delete last.volta; delete last.fnLabel; delete last.modKey; delete last.partStart;
    last.measures = 1;
    grid.push(last);
}

// Mesure divisée en deux accords (split = true : le 2e accord démarre identique) ou entière. Renvoie l'index du bloc, ou -1.
function setMeasureSplit(grid, measureNumber, split) {
    const idx = isolateMeasure(grid, measureNumber);
    if (idx < 0) return -1;
    const step = grid[idx];
    if (split) {
        if (!step.split) step.split = { rootIndex: step.rootIndex, chordId: step.chordId, scaleId: step.scaleId };
    } else delete step.split;
    return idx;
}

// Transpose les mesures from..to de delta demi-tons (0..11) : fondamentales, second accord d'une mesure divisée et basse.
// Les fonctions tonales choisies à la main sont retirées (elles étaient relatives à l'ancienne position).
function transposeRange(grid, from, to, delta) {
    const shift = (o) => {
        if (Number.isInteger(o.rootIndex)) o.rootIndex = (o.rootIndex + delta) % 12;
        if (Number.isInteger(o.bassRootIndex)) o.bassRootIndex = (o.bassRootIndex + delta) % 12;
        if (o.modKey) o.modKey = { ...o.modKey, root: (o.modKey.root + delta) % 12 };
        delete o.fnLabel;
    };
    // On ne coupe un bloc que là où la plage commence ou se termine en son milieu : les blocs
    // entièrement transposés gardent leur nombre de mesures, leurs reprises et leurs fins.
    splitBeforeMeasure(grid, to + 1);
    splitBeforeMeasure(grid, from);
    const flat = flatMeasureList(grid);
    const i0 = flat[from - 1].stepIndex, i1 = flat[to - 1].stepIndex;
    for (let k = i0; k <= i1; k++) {
        const st = grid[k];
        shift(st);
        delete st.harmonicFunction;
        if (st.split) shift(st.split);
    }
    mergeAround(grid, i0 - 1, i1 + 1);
}

// Enregistre (ou retire, label = null) la fonction tonale choisie pour une mesure ou une moitié de mesure.
// mod : { root, minor } = lecture de type modulation (nouvelle tonalité jusqu'au marqueur suivant).
function setFunctionLabel(grid, measureNumber, half, label, mod = null) {
    const idx = isolateMeasure(grid, measureNumber);
    if (idx < 0) return;
    const step = grid[idx];
    const target = (half === 1 && isSplit(step)) ? step.split : step;
    if (label) target.fnLabel = String(label).slice(0, 24); else delete target.fnLabel;
    if (label && mod && Number.isInteger(mod.root) && mod.root >= 0 && mod.root <= 11) target.modKey = { root: mod.root, minor: !!mod.minor };
    else delete target.modKey;
    mergeAround(grid, idx - 1, idx + 1);
}

// ===== Signes de reprise =====
// Isole les mesures from..to, applique fn(i0, i1) sur les blocs obtenus, puis refusionne les voisins.
function withIsolatedRange(grid, from, to, fn) {
    const { i0, i1 } = isolateRange(grid, from, to);
    fn(i0, i1);
    mergeAround(grid, i0 - 1, i1 + 1);
}
function toggleRepeatStart(step) { if (step.repeatStart) delete step.repeatStart; else step.repeatStart = true; }
// Fin de reprise : aucune → ×2 → ×3 → ×4 → aucune. Renvoie le nouveau nombre de passages (0 = retirée).
function cycleRepeatEnd(step) {
    const t = step.repeatEnd || 0;
    const nt = t === 0 ? 2 : (t >= 4 ? 0 : t + 1);
    if (nt) step.repeatEnd = nt; else delete step.repeatEnd;
    return nt;
}
// 1re / 2e fin sur les blocs i0..i1 : posée, ou retirée si tous l'avaient déjà.
function toggleVolta(grid, i0, i1, v) {
    let all = true;
    for (let i = i0; i <= i1; i++) if (grid[i].volta !== v) all = false;
    for (let i = i0; i <= i1; i++) { if (all) delete grid[i].volta; else grid[i].volta = v; }
}
function clearRepeats(grid, i0, i1) {
    for (let i = i0; i <= i1; i++) { delete grid[i].repeatStart; delete grid[i].repeatEnd; delete grid[i].volta; }
}
// Depuis le pop-up d'une mesure : kind = 'start' | 'end' | 'v1' | 'v2'.
function markMeasure(grid, measureNumber, kind) {
    const idx = isolateMeasure(grid, measureNumber);
    if (idx < 0) return;
    const st = grid[idx];
    if (kind === 'start') toggleRepeatStart(st);
    else if (kind === 'end') cycleRepeatEnd(st);
    else {
        const v = kind === 'v1' ? 1 : 2;
        if (st.volta === v) delete st.volta; else st.volta = v;
    }
    mergeAround(grid, idx - 1, idx + 1);
}

// Grilles générées : un repère de partie à chaque changement de section du style (A, A2, A3 → « A »).
// Aucun repère si la grille n'a qu'une seule section (une lettre unique n'apporterait rien).
function assignAutoParts(grid) {
    grid.forEach(st => { delete st.partStart; });
    const marks = [];
    let cur = '';
    grid.forEach((st, i) => {
        if (!st.section) return; // un bloc sans section reste dans la partie en cours
        if (st.section !== cur) {
            const m = /^([A-Z])\d*$/.exec(String(st.section));
            if (m) marks.push({ i, letter: m[1] });
        }
        cur = st.section;
    });
    if (marks.length < 2) return;
    marks.forEach(({ i, letter }) => { grid[i].partStart = letter; });
}

// Accords diatoniques de la tonalité et du mode en cours : fondamentale + accord + gamme de chaque degré.
// env : { mainKey, mainQuality, findChordObj, styleScaleFor(chordId, rootIndex) → gamme du style ou null }.
function diatonicDegrees(env) {
    const T = [
        { off: 0,  c: 'maj7', s: 'ionian' },
        { off: 2,  c: 'm7',   s: 'dorian' },
        { off: 4,  c: 'm7',   s: 'phrygian' },
        { off: 5,  c: 'maj7', s: 'lydian' },
        { off: 7,  c: '7',    s: 'mixolydian' },
        { off: 9,  c: 'm7',   s: 'aeolian' },
        { off: 11, c: 'm7b5', s: 'locrianSharp2' }
    ];
    const ROT = { ionian: 0, dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, aeolian: 5, locrian: 6 };
    const rot = ROT[env.mainQuality] ?? 0;
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    return numerals.map((num, i) => {
        const target = T[(rot + i) % 7];
        const off = (target.off - T[rot].off + 12) % 12;
        const lower = target.c === 'm7' || target.c === 'm7b5';
        let label = lower ? num.toLowerCase() : num;
        if (target.c === 'm7b5') label += 'ø';
        const co = env.findChordObj(target.c);
        let scaleId = (co && co.scales.some(sc => sc.id === target.s)) ? target.s : (co ? co.scales[0].id : target.s);
        const rootIndex = (env.mainKey + off) % 12;
        scaleId = env.styleScaleFor(target.c, rootIndex) || scaleId; // gamme adaptée au style en cours
        return { label, rootIndex, chordId: target.c, scaleId };
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { partLabelOfMeasure, measureItems, isolateMeasure, isolateRange, splitBeforeMeasure, mergeAround, deleteRange,
        deleteMeasureAt, insertItemsAfter, duplicateMeasureAfter, appendCopyOfLast, setMeasureSplit, transposeRange, setFunctionLabel,
        withIsolatedRange, toggleRepeatStart, cycleRepeatEnd, toggleVolta, clearRepeats, markMeasure, assignAutoParts, diatonicDegrees };
}
