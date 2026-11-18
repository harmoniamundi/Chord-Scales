// Tests de l'affichage de la grille (ui/grid-view.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const V = require('./grid-view.js');
const G = require('../grid/grid-format.js');

const scalesDb = { ionian: { name: 'Ionian (Major)' }, dorian: { name: 'Dorian mode' }, mixolydian: { name: 'Mixolydian' } };
const blk = (o = {}) => ({ rootIndex: 0, chordId: 'maj7', scaleId: 'ionian', measures: 1, ...o });
// liste à plat minimale (mêmes champs que getFlatMeasureList)
function flatten(grid) {
    const out = [];
    grid.forEach((st, stepIndex) => {
        for (let k = 1; k <= st.measures; k++) out.push({ ...st, stepIndex, measureInStep: k, measureNumber: out.length + 1 });
    });
    return out;
}
function ctx(grid, extra = {}) {
    const flat = flatten(grid);
    return {
        grid, flat, effV: {}, scalesDb, bpb: 4, splitBeat: 2, currentBeat: 0, currentMeasureNum: 0,
        showHarmonicFunctions: false, editBarOpen: false, sel: null, mainKey: 0,
        symbolHtml: (c) => `<b>${c.rootIndex}${c.chordId}</b>`, chordSymbol: (c) => `${c.rootIndex}${c.chordId}`,
        fnLabel: (c, f, i, half = 0) => `F${i}.${half}`,
        partLabelOf: (m) => m.partStart || null, measureKey: (m) => `${m.rootIndex}|${m.chordId}|${m.split ? m.split.rootIndex : ''}`,
        ...extra
    };
}

describe('layoutRows', () => {
    const flat = (n) => Array.from({ length: n }, (_, i) => ({ measureNumber: i + 1 }));
    test('lignes de 4 mesures', () => {
        assert.deepEqual(V.layoutRows(flat(10), () => null).map(r => r.length), [4, 4, 2]);
        assert.deepEqual(V.layoutRows(flat(8), () => null).map(r => r.length), [4, 4]);
        assert.deepEqual(V.layoutRows([], () => null), []);
    });
    test('une nouvelle partie ouvre une nouvelle ligne, mais pas la toute première mesure', () => {
        const rows = V.layoutRows(flat(7), (m) => (m.measureNumber === 1 || m.measureNumber === 3) ? 'A' : null);
        assert.deepEqual(rows.map(r => r.map(m => m.measureNumber)), [[1, 2], [3, 4, 5, 6], [7]]);
    });
});

describe('measureCellModel', () => {
    test('mesure simple : accord, gamme abrégée, pas de reprise', () => {
        const g = [blk()];
        const c = V.measureCellModel(ctx(g), flatten(g)[0]);
        assert.equal(c.showSplit, false); assert.equal(c.repeat, false);
        assert.equal(c.scaleLabel, 'Ionian');
        assert.ok(c.centerHtml.includes('<b>0maj7</b>'));
        assert.equal(c.bottomHtml, '');
        assert.deepEqual([c.hasRS, c.hasRE, c.sv, c.voltaFirst], [false, false, undefined, false]);
    });
    test('« % » quand la mesure répète la précédente, sauf si elle ouvre une partie', () => {
        const g = [blk({ measures: 2 })];
        const f = flatten(g);
        assert.ok(V.measureCellModel(ctx(g), f[1]).centerHtml.includes('>%<'));
        const gp = [blk({ measures: 1 }), blk({ partStart: 'B' })];
        assert.ok(!V.measureCellModel(ctx(gp), flatten(gp)[1]).centerHtml.includes('>%<'));
    });
    test('deux accords : moitié active selon le temps courant', () => {
        const g = [blk({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        const m = flatten(g)[0];
        const at = (beat) => V.measureCellModel(ctx(g, { currentMeasureNum: 1, currentBeat: beat }), m);
        assert.equal(at(0).activeHalf, 0); assert.equal(at(1).activeHalf, 0);
        assert.equal(at(2).activeHalf, 1); assert.equal(at(3).activeHalf, 1);
        assert.equal(V.measureCellModel(ctx(g, { currentMeasureNum: 5 }), m).activeHalf, -1);
        assert.equal(at(0).scaleLabel, 'Ionian · Mixolydian');
        assert.ok(at(2).centerHtml.includes('jam-half jam-half-active" data-half="1"'));
        assert.equal(at(0).ts3, false);
        assert.equal(V.measureCellModel(ctx(g, { bpb: 3 }), m).ts3, true);
        assert.equal(V.measureCellModel(ctx(g, { bpb: 3, aksak: true }), m).ts3, false);   // 7/8 : moitiés égales
    });
    test('gamme inconnue : étiquette vide', () => {
        const g = [blk({ scaleId: 'zz' })];
        assert.equal(V.measureCellModel(ctx(g), flatten(g)[0]).scaleLabel, '');
    });
    test('fonctions harmoniques : une étiquette, ou deux pour une mesure à deux accords', () => {
        const g = [blk(), blk({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        const v = ctx(g, { showHarmonicFunctions: true });
        const f = v.flat;
        assert.ok(V.measureCellModel(v, f[0]).bottomHtml.includes('F0.0'));
        const b = V.measureCellModel(v, f[1]).bottomHtml;
        assert.ok(b.includes('F1.0') && b.includes('F1.1') && b.includes('data-fhalf="1"'));
    });
    test('reprises : début sur la 1re mesure du bloc, fin sur la dernière, ×N', () => {
        const g = [blk({ measures: 3, repeatStart: true, repeatEnd: 3 })];
        const cs = flatten(g).map(m => V.measureCellModel(ctx(g), m));
        assert.deepEqual(cs.map(c => c.hasRS), [true, false, false]);
        assert.deepEqual(cs.map(c => c.hasRE), [false, false, true]);
        assert.ok(V.cellInnerHtml(cs[2]).includes('×3'));
        assert.ok(!V.cellInnerHtml({ ...cs[2], repeatEnd: 2 }).includes('×2'));
    });
    test('1re / 2e fin : le libellé n\'apparaît qu\'à la première mesure de la fin', () => {
        const g = [blk({ measures: 2 }), blk()];
        const v = ctx(g, { effV: { 0: 1, 1: 2 } });
        const cs = flatten(g).map(m => V.measureCellModel(v, m));
        assert.deepEqual(cs.map(c => c.voltaFirst), [true, false, true]);
        assert.ok(V.cellInnerHtml(cs[0]).includes('1re'));
        assert.ok(V.cellInnerHtml(cs[2]).includes('2e'));
        assert.ok(!V.cellInnerHtml(cs[1]).includes('rp-vtxt'));
    });
    test('sélection', () => {
        const g = [blk({ measures: 4 })];
        const cs = flatten(g).map(m => V.measureCellModel(ctx(g, { sel: { from: 2, to: 3 } }), m));
        assert.deepEqual(cs.map(c => c.selected), [false, true, true, false]);
    });
});

describe('HTML des cases', () => {
    test('classes : case active en bleu, inactive en blanc', () => {
        assert.ok(V.cellClassName(true).includes('bg-blue-600'));
        assert.ok(V.cellClassName(false).includes('bg-white'));
        assert.ok(V.cellClassName(false).startsWith('jam-cell '));
    });
    test('classes additionnelles dans l\'ordre', () => {
        assert.deepEqual(V.cellExtraClasses({ selected: true, hasRS: true, hasRE: true, sv: 1, ts3: true }), ['jam-sel', 'rp-has-l', 'rp-has-r', 'rp-has-v', 'jam-ts3']);
        assert.deepEqual(V.cellExtraClasses({}), []);
    });
    test('bouton d\'édition seulement en mode édition ; second arpège seulement avec deux accords', () => {
        const base = { measureNumber: 3, isActive: false, scaleLabel: 'X', centerHtml: '', bottomHtml: '' };
        assert.ok(!V.cellInnerHtml(base).includes('jam-edit-btn'));
        assert.ok(V.cellInnerHtml({ ...base, editBarOpen: true }).includes('jam-edit-btn'));
        assert.ok(!V.cellInnerHtml(base).includes('jam-arp-btn-b'));
        assert.ok(V.cellInnerHtml({ ...base, showSplit: true }).includes('jam-arp-btn-b'));
        assert.ok(V.cellInnerHtml(base).includes('|3'));
    });
    test('barres de reprise et de fin', () => {
        assert.equal(V.cellMarksHtml({}), '');
        assert.equal(V.cellMarksHtml({ hasRS: true }), '<span class="rp-l" title="Début de reprise"></span>');
        const m = V.cellMarksHtml({ hasRE: true, sv: 2, voltaFirst: true });
        assert.ok(m.includes('rp-r') && m.includes('rp-vl') && m.includes('rp-vt'));
        assert.ok(!V.cellMarksHtml({ sv: 2, voltaFirst: false }).includes('rp-vt'));
    });
});

describe('sequenceFingerprint', () => {
    const g = [blk(), blk({ rootIndex: 7, chordId: '7' })];
    const fp = (extra) => V.sequenceFingerprint(ctx(g, extra), (c) => `${c.rootIndex}${c.chordId}`);
    test('change quand la grille, la tonalité, l\'édition, la sélection ou les fonctions changent', () => {
        const base = fp({});
        assert.notEqual(base, fp({ mainKey: 5 }));
        assert.notEqual(base, fp({ editBarOpen: true }));
        assert.notEqual(base, fp({ sel: { from: 1, to: 2 } }));
        assert.notEqual(base, fp({ showHarmonicFunctions: true }));
        assert.notEqual(base, fp({ bpb: 3 }));
        assert.notEqual(base, V.sequenceFingerprint(ctx([blk()]), () => 'x'));
    });
    test('ne dépend pas de la mesure en cours', () => {
        assert.equal(fp({ currentBeat: 3, currentMeasureNum: 2 }), fp({}));
    });
});

describe('impression', () => {
    test('repères de reprise : barres, ×N, fins', () => {
        const g = [blk({ measures: 2, repeatStart: true, repeatEnd: 3 })];
        const f = flatten(g);
        const a = V.printMarks(g, {}, f[0], f), b = V.printMarks(g, {}, f[1], f);
        assert.equal(a.cls, ' has-rs'); assert.ok(a.html.includes('jam-print-rs'));
        assert.equal(b.cls, ' has-re'); assert.ok(b.html.includes('×3'));
        const v = V.printMarks(g, { 0: 1 }, f[0], f);
        assert.ok(v.html.includes('jam-print-vl') && v.html.includes('1.'));
        assert.ok(!V.printMarks(g, { 0: 1 }, f[1], f).html.includes('jam-print-vt'));
    });
    test('page : lignes complétées à 4 cases, % pour les répétitions, symboles encodés', () => {
        const g = [blk({ measures: 2 }), blk({ rootIndex: 7, chordId: '7' })];
        const html = V.printGridHtml(ctx(g));
        assert.equal((html.match(/jam-print-row/g) || []).length, 1);
        assert.equal((html.match(/jam-print-cell-empty/g) || []).length, 1);
        assert.ok(html.includes(`data-symbol="${encodeURIComponent('%')}"`));
        assert.ok(html.includes(`data-symbol="${encodeURIComponent('7' + '7')}"`));
        assert.ok(!html.includes('has-parts'));
    });
    test('parties : gouttière et repère de partie', () => {
        const g = [blk({ partStart: 'A', measures: 4 }), blk({ partStart: "A'" })];
        const html = V.printGridHtml(ctx(g));
        assert.ok(html.includes('has-parts') && html.includes('jam-print-gutter'));
        assert.ok(html.includes('jam-print-part">A<'));
        assert.ok(html.includes(`jam-print-part jam-part-long">A'<`));
    });
    test('parties : nom libre imprimé au-dessus de la ligne (texte échappé), sans gouttière s\'il n\'y a pas de repère court', () => {
        const g = [blk({ partStart: 'Couplet', measures: 4 }), blk({ partStart: 'Refrain <b>&' })];
        const html = V.printGridHtml(ctx(g));
        assert.ok(html.includes('<div class="jam-print-partname">Couplet</div>'));
        assert.ok(html.includes('Refrain &lt;b&gt;&amp;'));
        assert.ok(!html.includes('<b>'));
        assert.ok(!html.includes('has-parts'));
        const mixed = V.printGridHtml(ctx([blk({ partStart: 'A', measures: 4 }), blk({ partStart: 'Pont' })]));
        assert.ok(mixed.includes('has-parts') && mixed.includes('jam-print-partname with-gutter'));
    });
    test('analyse fonctionnelle : chiffrage imprimé seulement si fnHtml est fourni', () => {
        const g = [blk({}), blk({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        assert.ok(!V.printGridHtml(ctx(g)).includes('jam-print-fn'));
        const html = V.printGridHtml({ ...ctx(g), fnHtml: (c, f, i, half) => (half ? 'V' : 'I') + i });
        assert.ok(html.includes('<span class="jam-print-fn">I0</span>'));
        assert.ok(html.includes('jam-print-fn jam-print-fn-a">I1<') && html.includes('jam-print-fn jam-print-fn-b">V1<'));
        assert.equal((html.match(/has-fn/g) || []).length, 2);
    });
    test('en-tête : tempo, swing et tonalité', () => {
        const a = V.printInfoParts({ keyName: 'Bb', qualityLabel: 'Majeur', bpm: 120, ternary: false, swingAvailable: true, swing: 0.667 });
        assert.deepEqual(a, { tempo: '♩ = 120', feel: 'Swing', key: 'Tonalité : Bb majeur' });
        assert.equal(V.printInfoParts({ keyName: 'D', qualityLabel: 'Mineur', bpm: 90, swingAvailable: true, swing: 0.5 }).feel, '');
        const t = V.printInfoParts({ keyName: 'A', qualityLabel: 'Dorien', bpm: 60, ternary: true, swingAvailable: false, swing: 0.67 });
        assert.equal(t.tempo, '♩. = 60'); assert.equal(t.feel, ''); assert.equal(t.key, 'Tonalité : A dorien');
        assert.ok(V.printGridHtml(ctx([blk({})])).includes('jam-print-info'));
    });
    test('titre d\'une annotation de mesure', () => {
        assert.equal(V.measureNoteTitle({ startMeasure: 5, endMeasure: 5 }), 'Mesure 5');
        assert.equal(V.measureNoteTitle({ startMeasure: 9, endMeasure: 12 }), 'Mesures 9–12');
    });
    test('deux accords : cellule double, variante 3/4', () => {
        const g = [blk({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        assert.ok(V.printGridHtml(ctx(g)).includes('jam-print-split'));
        assert.ok(!V.printGridHtml(ctx(g)).includes('jam-print-split-3'));
        assert.ok(V.printGridHtml(ctx(g, { bpb: 3 })).includes('jam-print-split-3'));
    });
});

describe('position, sélection et défilement', () => {
    const grid = [{ measures: 2 }, { measures: 1 }, { measures: 3 }];

    test('currentMeasureNumber : mesures des blocs précédents + mesure dans le bloc', () => {
        assert.equal(V.currentMeasureNumber(grid, 0, 0, 4), 1);
        assert.equal(V.currentMeasureNumber(grid, 0, 5, 4), 2);
        assert.equal(V.currentMeasureNumber(grid, 1, 0, 4), 3);
        assert.equal(V.currentMeasureNumber(grid, 2, 9, 4), 6);
        assert.equal(V.currentMeasureNumber(grid, 2, 5, 3), 5);
    });
    test('currentMeasureNumber : 1 si aucun bloc en cours', () => {
        assert.equal(V.currentMeasureNumber(grid, -1, 7, 4), 1);
        assert.equal(V.currentMeasureNumber(grid, 3, 0, 4), 1);
        assert.equal(V.currentMeasureNumber([], 0, 0, 4), 1);
    });

    test('selectionFix : sélection entièrement hors grille effacée', () => {
        assert.deepEqual(V.selectionFix({ from: 7, to: 9 }, null, 6), { clearSel: true, newTo: null, clearAnchor: false });
    });
    test('selectionFix : fin ramenée à la dernière mesure', () => {
        assert.deepEqual(V.selectionFix({ from: 3, to: 9 }, null, 6), { clearSel: false, newTo: 6, clearAnchor: false });
    });
    test('selectionFix : sélection valide intacte, bornes incluses', () => {
        assert.deepEqual(V.selectionFix({ from: 3, to: 6 }, null, 6), { clearSel: false, newTo: null, clearAnchor: false });
        assert.deepEqual(V.selectionFix({ from: 6, to: 6 }, 6, 6), { clearSel: false, newTo: null, clearAnchor: false });
    });
    test('selectionFix : ancre hors grille effacée, sans sélection', () => {
        assert.deepEqual(V.selectionFix(null, 7, 6), { clearSel: false, newTo: null, clearAnchor: true });
        assert.deepEqual(V.selectionFix(null, null, 6), { clearSel: false, newTo: null, clearAnchor: false });
    });

    test('nom libre : cadre au-dessus de la ligne, pas dans la gouttière ; repère de 3 caractères au plus : dans la gouttière', () => {
        assert.equal(V.gutterMark('Couplet'), null);
        assert.deepEqual(V.partBanner('Couplet'), { className: 'jam-part-banner', text: 'Couplet', title: 'Partie Couplet' });
        assert.equal(V.partBanner('A'), null);
        assert.equal(V.partBanner('A1'), null);
        assert.ok(V.gutterMark('A1'));
        assert.equal(V.partBanner(null), null);
    });
    test('gutterMark : rien sans partie', () => {
        assert.equal(V.gutterMark(null), null);
        assert.equal(V.gutterMark(''), null);
    });
    test('gutterMark : classes selon la longueur et titres', () => {
        assert.deepEqual(V.gutterMark('A'), { className: 'jam-part-mark', text: 'A', title: 'Partie A' });
        assert.deepEqual(V.gutterMark("A'"), { className: 'jam-part-mark jam-part-long', text: "A'", title: "Partie A'" });
        assert.equal(V.gutterMark('C22').className, 'jam-part-mark jam-part-long jam-part-l3');
        assert.equal(V.gutterMark('in').title, 'Introduction');
        assert.equal(V.gutterMark('out').title, 'Conclusion (outro)');
    });

    test('rowFillers : lignes intermédiaires = zones vides de fin de partie', () => {
        assert.deepEqual(V.rowFillers(2, 0, 3, true), ['gap', 'gap']);
        assert.deepEqual(V.rowFillers(4, 0, 3, true), []);
    });
    test('rowFillers : dernière ligne = « + » puis cases vides, en mode édition à l\'arrêt', () => {
        assert.deepEqual(V.rowFillers(1, 2, 3, true), ['add', 'empty', 'empty']);
        assert.deepEqual(V.rowFillers(3, 0, 1, true), ['add']);
    });
    test('rowFillers : sans édition, cases vides seulement', () => {
        assert.deepEqual(V.rowFillers(2, 0, 1, false), ['empty', 'empty']);
    });
    test('needsAddRow : seulement si l\'édition est possible et la dernière ligne pleine', () => {
        assert.equal(V.needsAddRow(true, 4), true);
        assert.equal(V.needsAddRow(true, 3), false);
        assert.equal(V.needsAddRow(false, 4), false);
    });

    test('clickPosition : bloc, mesure et moitié cliquée', () => {
        const m = { stepIndex: 2, measureInStep: 3 };
        assert.deepEqual(V.clickPosition(m, 0, 4, 2), { stepIndex: 2, beat: 8 });
        assert.deepEqual(V.clickPosition(m, 1, 4, 2), { stepIndex: 2, beat: 10 });
        assert.deepEqual(V.clickPosition({ stepIndex: 0, measureInStep: 1 }, 1, 2, 1), { stepIndex: 0, beat: 1 });
    });
    test('playRangeAfterClick : un clic hors plage l\'abandonne', () => {
        const rg = { from: 3, to: 5 };
        assert.equal(V.playRangeAfterClick(rg, 2), null);
        assert.equal(V.playRangeAfterClick(rg, 6), null);
        assert.equal(V.playRangeAfterClick(rg, 3), rg);
        assert.equal(V.playRangeAfterClick(rg, 5), rg);
        assert.equal(V.playRangeAfterClick(null, 4), null);
    });
    test('halfToHighlight : -1 hors mesure en cours, sinon la moitié selon le temps', () => {
        assert.equal(V.halfToHighlight(false, 3, 4, 2), -1);
        assert.equal(V.halfToHighlight(true, 1, 4, 2), 0);
        assert.equal(V.halfToHighlight(true, 2, 4, 2), 1);
        assert.equal(V.halfToHighlight(true, 6, 4, 2), 1);
        assert.equal(V.halfToHighlight(true, 4, 4, 2), 0);
    });
    test('neighborStop : ← → s\'arrêtent sur chacun des deux accords d\'une mesure scindée, dans l\'ordre de lecture', () => {
        const rows = [[{ measureNumber: 1 }, { measureNumber: 2 }, { measureNumber: 3 }, { measureNumber: 4 }], [{ measureNumber: 5 }]];
        const two = (n) => n === 2 || n === 5;
        const go = (n, half, key) => V.neighborStop(rows, { n, half }, key, two);
        assert.deepEqual(go(1, 0, 'ArrowRight'), { n: 2, half: 0 });
        assert.deepEqual(go(2, 0, 'ArrowRight'), { n: 2, half: 1 });   // second accord de la même mesure
        assert.deepEqual(go(2, 1, 'ArrowRight'), { n: 3, half: 0 });
        assert.deepEqual(go(3, 0, 'ArrowLeft'), { n: 2, half: 1 });    // en reculant : d'abord le second accord
        assert.deepEqual(go(2, 1, 'ArrowLeft'), { n: 2, half: 0 });
        assert.deepEqual(go(2, 0, 'ArrowLeft'), { n: 1, half: 0 });
        assert.deepEqual(go(5, 0, 'ArrowRight'), { n: 5, half: 1 });   // dernière mesure : on va encore au second accord
        assert.deepEqual(go(5, 1, 'ArrowRight'), { n: 5, half: 1 });   // puis bord de la grille
        assert.deepEqual(go(1, 0, 'ArrowLeft'), { n: 1, half: 0 });
        assert.deepEqual(go(2, 1, 'ArrowDown'), { n: 5, half: 0 });    // changement de ligne : premier accord
        assert.deepEqual(go(1, 1, 'ArrowRight'), { n: 2, half: 0 });   // moitié 1 sur une mesure à un accord : ignorée
    });
    test('neighborMeasure : ← → passent à la mesure voisine, d\'une ligne à l\'autre, sans dépasser les bords', () => {
        const rows = V.layoutRows(Array.from({ length: 10 }, (_, i) => ({ measureNumber: i + 1 })), () => null);
        assert.equal(V.neighborMeasure(rows, 3, 'ArrowRight'), 4);
        assert.equal(V.neighborMeasure(rows, 4, 'ArrowRight'), 5);
        assert.equal(V.neighborMeasure(rows, 5, 'ArrowLeft'), 4);
        assert.equal(V.neighborMeasure(rows, 1, 'ArrowLeft'), 1);
        assert.equal(V.neighborMeasure(rows, 10, 'ArrowRight'), 10);
    });
    test('neighborMeasure : ↑ ↓ gardent la colonne, la dernière case si la ligne est plus courte, et s\'arrêtent aux bords', () => {
        const rows = V.layoutRows(Array.from({ length: 10 }, (_, i) => ({ measureNumber: i + 1 })), () => null); // 4 + 4 + 2
        assert.equal(V.neighborMeasure(rows, 2, 'ArrowDown'), 6);
        assert.equal(V.neighborMeasure(rows, 6, 'ArrowDown'), 10);   // 3e ligne : 2 mesures seulement
        assert.equal(V.neighborMeasure(rows, 8, 'ArrowDown'), 10);
        assert.equal(V.neighborMeasure(rows, 10, 'ArrowUp'), 6);
        assert.equal(V.neighborMeasure(rows, 3, 'ArrowUp'), 3);
        assert.equal(V.neighborMeasure(rows, 10, 'ArrowDown'), 10);
        assert.equal(V.neighborMeasure(rows, 99, 'ArrowRight'), 99);
    });
    test('neighborMeasure : une nouvelle partie commence une nouvelle ligne, ↑ ↓ suivent ces lignes', () => {
        const flat = Array.from({ length: 6 }, (_, i) => ({ measureNumber: i + 1 }));
        const rows = V.layoutRows(flat, (m) => (m.measureNumber === 3 ? 'B' : null)); // [1 2] [3 4 5 6]
        assert.equal(V.neighborMeasure(rows, 1, 'ArrowDown'), 3);
        assert.equal(V.neighborMeasure(rows, 2, 'ArrowDown'), 4);
        assert.equal(V.neighborMeasure(rows, 6, 'ArrowUp'), 2);
        assert.equal(V.neighborMeasure(rows, 2, 'ArrowRight'), 3);
    });
    test('scrollTargetFor : ligne visible → pas de défilement', () => {
        assert.equal(V.scrollTargetFor(100, 300, 150, 50), null);
        assert.equal(V.scrollTargetFor(100, 300, 100, 300), null);
    });
    test('scrollTargetFor : ligne au-dessus → son haut ; en dessous → son bas aligné en bas', () => {
        assert.equal(V.scrollTargetFor(100, 300, 40, 50), 40);
        assert.equal(V.scrollTargetFor(100, 300, 380, 50), 130);
    });
    test('scrollTargetFor : jamais négatif', () => {
        assert.equal(V.scrollTargetFor(50, 100, -10, 20), 0);
        assert.equal(V.scrollTargetFor(0, 100, 0, 150), 50);
    });
});
