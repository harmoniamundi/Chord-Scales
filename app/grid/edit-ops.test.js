// Tests des opérations d'édition de grille (grid/edit-ops.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./edit-ops.js');
const { flatMeasureList } = require('./play-order.js');
const T = require('../theory.js');
const { buildStyleTemplate, STYLE_BUILDERS } = require('../styles/style-builders.js');
const G = require('./generation.js');

const st = (rootIndex, chordId, measures = 1, extra = {}) => ({ rootIndex, chordId, scaleId: 'ionian', measures, ...extra });
const total = (g) => g.reduce((s, x) => s + x.measures, 0);
const roots = (g) => flatMeasureList(g).map(m => m.rootIndex);
const clone = (x) => JSON.parse(JSON.stringify(x));
const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const styleGrid = (key) => buildStyleTemplate(key, { keyRoot: 0, mainQuality: 'ionian', R: null, findChordObj })
    .map(i => ({ rootIndex: i.r, chordId: i.c, measures: i.m, scaleId: i.s, ...(i.section ? { section: i.section } : {}), ...(i.split ? { split: { rootIndex: i.split.r, chordId: i.split.c, scaleId: i.split.s } } : {}) }));

describe('degrés en triades et changement de qualité', () => {
    const env = (o = {}) => ({ mainKey: 0, mainQuality: 'ionian', findChordObj, styleScaleFor: () => null, ...o });
    test('degrés à la septième (inchangé) puis en triades', () => {
        const d7 = E.diatonicDegrees(env());
        assert.deepEqual(d7.map(d => d.chordId), ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
        const d3 = E.diatonicDegrees(env({ triads: true }));
        assert.deepEqual(d3.map(d => d.chordId), ['majTriad', 'minTriad', 'minTriad', 'majTriad', 'majTriad', 'minTriad', 'dimTriad']);
        assert.deepEqual(d3.map(d => d.label), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
        assert.deepEqual(d3.map(d => d.rootIndex), d7.map(d => d.rootIndex));
    });
    test('en triades, chaque gamme contient les notes de l\'accord', () => {
        ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'].forEach(q => {
            E.diatonicDegrees(env({ triads: true, mainQuality: q })).forEach(d =>
                assert.ok(T.scaleFits(d.scaleId, d.chordId), `${q} ${d.label} ${d.chordId} ${d.scaleId}`));
        });
    });
    test('qualityTargetChord : une septième reste une septième, une triade reste une triade', () => {
        assert.deepEqual(E.qualityTargetChord('maj7', { c: 'm7', s: 'dorian' }, findChordObj), { chordId: 'm7', scaleId: 'dorian' });
        assert.deepEqual(E.qualityTargetChord('7', { c: 'maj7', s: 'ionian' }, findChordObj), { chordId: 'maj7', scaleId: 'ionian' });
        assert.deepEqual(E.qualityTargetChord('majTriad', { c: 'm7', s: 'phrygian' }, findChordObj), { chordId: 'minTriad', scaleId: 'phrygian' });
        assert.equal(E.qualityTargetChord('minTriad', { c: '7', s: 'mixolydian' }, findChordObj).chordId, 'majTriad');
        const vii = E.qualityTargetChord('majTriad', { c: 'm7b5', s: 'locrianSharp2' }, findChordObj);
        assert.equal(vii.chordId, 'dimTriad');
        assert.ok(T.scaleFits(vii.scaleId, 'dimTriad'));
    });
});

describe('isoler une mesure', () => {
    test('au milieu d\'un bloc de 4 : trois blocs', () => {
        const g = [st(0, 'maj7', 4)];
        assert.equal(E.isolateMeasure(g, 2), 1);
        assert.deepEqual(g.map(x => x.measures), [1, 1, 2]);
    });
    test('en tête, en queue, bloc d\'une mesure, mesure absente', () => {
        const a = [st(0, 'maj7', 3)]; assert.equal(E.isolateMeasure(a, 1), 0); assert.deepEqual(a.map(x => x.measures), [1, 2]);
        const b = [st(0, 'maj7', 3)]; assert.equal(E.isolateMeasure(b, 3), 1); assert.deepEqual(b.map(x => x.measures), [2, 1]);
        const c = [st(0, 'maj7', 1), st(5, 'maj7', 1)]; assert.equal(E.isolateMeasure(c, 2), 1); assert.equal(c.length, 2);
        assert.equal(E.isolateMeasure(c, 9), -1);
    });
    test('début de reprise sur le premier morceau, fin et repère de partie aux bons endroits, mesure partagée perdue', () => {
        const g = [st(0, 'maj7', 4, { repeatStart: true, repeatEnd: 2, partStart: 'A', split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        E.isolateMeasure(g, 2);
        assert.equal(g[0].repeatStart, true); assert.equal(g[0].partStart, 'A');
        assert.ok(!g[1].repeatStart && !g[1].repeatEnd && !g[1].partStart);
        assert.equal(g[2].repeatEnd, 2);
        g.forEach(x => assert.equal(x.split, undefined));
    });
    test('isolateRange renvoie les blocs extrêmes', () => {
        const g = [st(0, 'maj7', 6)];
        assert.deepEqual(E.isolateRange(g, 2, 4), { i0: 1, i1: 3 });
        assert.deepEqual(g.map(x => x.measures), [1, 1, 1, 1, 2]);
    });
});

describe('couper et fusionner', () => {
    test('splitBeforeMeasure : deux blocs, reprises réparties', () => {
        const g = [st(0, 'maj7', 4, { repeatStart: true, repeatEnd: 3 })];
        E.splitBeforeMeasure(g, 3);
        assert.deepEqual(g.map(x => x.measures), [2, 2]);
        assert.equal(g[0].repeatStart, true); assert.equal(g[1].repeatEnd, 3);
        assert.ok(!g[0].repeatEnd && !g[1].repeatStart);
    });
    test('splitBeforeMeasure : sans effet en tête de bloc ou hors grille', () => {
        const g = [st(0, 'maj7', 2), st(5, 'maj7', 2)], snap = clone(g);
        E.splitBeforeMeasure(g, 1); E.splitBeforeMeasure(g, 3); E.splitBeforeMeasure(g, 99);
        assert.deepEqual(g, snap);
    });
    test('mergeAround fusionne les voisins identiques, pas ceux qui ont un repère de partie ni une mesure partagée', () => {
        const g = [st(0, 'maj7'), st(0, 'maj7'), st(0, 'maj7')];
        E.mergeAround(g, 0, 2);
        assert.deepEqual(g.map(x => x.measures), [3]);
        const p = [st(0, 'maj7'), st(0, 'maj7', 1, { partStart: 'B' })];
        E.mergeAround(p, 0, 1); assert.equal(p.length, 2);
        const sp = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
        const s = [st(0, 'maj7', 1, { split: sp }), st(0, 'maj7', 1, { split: sp })];
        E.mergeAround(s, 0, 1); assert.equal(s.length, 2);
    });
    test('mergeAround ne touche pas les blocs hors zone', () => {
        const g = [st(0, 'maj7'), st(0, 'maj7'), st(5, 'maj7'), st(5, 'maj7')];
        E.mergeAround(g, 2, 3);
        assert.deepEqual(g.map(x => x.measures), [1, 1, 2]);
    });
});

describe('copier, supprimer, insérer', () => {
    test('measureItems : mesures isolées, reprises/fin/partie/volta/fonction conservées sur les bonnes mesures', () => {
        const g = [st(0, 'maj7', 2, { repeatStart: true, partStart: 'A', fnLabel: 'I', modKey: { root: 0, minor: false } }),
            st(5, 'maj7', 2, { repeatEnd: 2, volta: 1, bassRootIndex: 9 })];
        const it = E.measureItems(g, 1, 4);
        assert.equal(it.length, 4);
        assert.equal(it[0].repeatStart, true); assert.equal(it[0].partStart, 'A'); assert.equal(it[1].repeatStart, undefined);
        assert.equal(it[3].repeatEnd, 2); assert.equal(it[2].repeatEnd, undefined);
        assert.equal(it[2].volta, 1); assert.equal(it[2].bassRootIndex, 9);
        assert.deepEqual(it[0].modKey, { root: 0, minor: false });
        it[0].modKey.root = 5; assert.equal(g[0].modKey.root, 0); // copie profonde
    });
    test('deleteRange supprime et refusionne', () => {
        const g = [st(0, 'maj7', 2), st(5, 'maj7', 2), st(0, 'maj7', 2)];
        const i0 = E.deleteRange(g, 3, 4);
        assert.equal(i0, 1);
        assert.deepEqual(roots(g), [0, 0, 0, 0]);
        assert.deepEqual(g.map(x => x.measures), [4]);
    });
    test('deleteRange : le repère de partie supprimé passe à la mesure suivante', () => {
        const g = [st(0, 'maj7', 1), st(5, 'maj7', 1, { partStart: 'B' }), st(7, '7', 1)];
        E.deleteRange(g, 2, 2);
        assert.equal(g[1].partStart, 'B');
        const g2 = [st(0, 'maj7', 1), st(5, 'maj7', 1, { partStart: 'B' }), st(7, '7', 1, { partStart: 'C' })];
        E.deleteRange(g2, 2, 2);
        assert.equal(g2[1].partStart, 'C');
    });
    test('deleteMeasureAt : une seule mesure, repère de partie reporté', () => {
        const g = [st(0, 'maj7', 3, { partStart: 'A' })];
        E.deleteMeasureAt(g, 1);
        assert.equal(total(g), 2); assert.equal(g[0].partStart, 'A');
    });
    test('insertItemsAfter : après une mesure, au début, dans une grille vide', () => {
        const g = [st(0, 'maj7', 2)];
        E.insertItemsAfter(g, 1, [{ rootIndex: 7, chordId: '7', scaleId: 'mixolydian' }]);
        assert.deepEqual(roots(g), [0, 7, 0]);
        E.insertItemsAfter(g, 0, [{ rootIndex: 5, chordId: 'maj7', scaleId: 'lydian' }]);
        assert.deepEqual(roots(g), [5, 0, 7, 0]);
        const e = []; E.insertItemsAfter(e, 0, [{ rootIndex: 2, chordId: 'm7', scaleId: 'dorian' }]);
        assert.deepEqual(roots(e), [2]);
        const n = clone(g); E.insertItemsAfter(g, 1, []); assert.deepEqual(g, n);
    });
    test('insertItemsAfter ne partage pas d\'objets avec les éléments collés', () => {
        const items = [{ rootIndex: 7, chordId: '7', scaleId: 'mixolydian', modKey: { root: 1, minor: false } }];
        const g = [st(0, 'maj7', 2)];
        E.insertItemsAfter(g, 2, items);
        g[g.length - 1].modKey.root = 9;
        assert.equal(items[0].modKey.root, 1);
    });
    test('copier-coller aller-retour : mesures identiques', () => {
        const g = styleGrid('swing');
        const items = E.measureItems(g, 1, 4);
        const g2 = clone(g);
        E.insertItemsAfter(g2, total(g2), items);
        assert.deepEqual(flatMeasureList(g2).slice(-4).map(m => [m.rootIndex, m.chordId]), items.map(i => [i.rootIndex, i.chordId]));
    });
    test('duplicateMeasureAfter : copie sans reprises ni repère de partie', () => {
        const g = [st(0, 'maj7', 2, { repeatStart: true, repeatEnd: 2, volta: 1, partStart: 'A' })];
        assert.equal(E.duplicateMeasureAfter(g, 1), 0);
        assert.equal(total(g), 3);
        assert.deepEqual(g[1], st(0, 'maj7', 1));
        assert.equal(E.duplicateMeasureAfter(g, 99), -1);
    });
    test('appendCopyOfLast : une mesure sans marques', () => {
        const g = [st(0, 'maj7', 1), st(5, 'maj7', 3, { repeatEnd: 2, fnLabel: 'IV', modKey: { root: 5, minor: false }, partStart: 'B', split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        E.appendCopyOfLast(g);
        assert.deepEqual(g[2], st(5, 'maj7', 1));
        const h = [st(5, 'maj7', 1, { split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        E.appendCopyOfLast(h);
        assert.ok(h[1].split);
    });
});

describe('mesure divisée', () => {
    test('split true : second accord identique ; false : retiré', () => {
        const g = [st(2, 'm7', 3)];
        const idx = E.setMeasureSplit(g, 2, true);
        assert.equal(idx, 1);
        assert.deepEqual(g[1].split, { rootIndex: 2, chordId: 'm7', scaleId: 'ionian' });
        E.setMeasureSplit(g, 2, false);
        assert.equal(g[1].split, undefined);
        assert.equal(E.setMeasureSplit(g, 99, true), -1);
    });
    test('un split existant n\'est pas écrasé', () => {
        const sp = { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' };
        const g = [st(0, 'maj7', 1, { split: sp })];
        E.setMeasureSplit(g, 1, true);
        assert.deepEqual(g[0].split, sp);
    });
});

describe('transposition', () => {
    test('fondamentales, basses, seconds accords et marqueurs décalés ; fonctions manuelles retirées', () => {
        const g = [st(0, 'maj7', 1, { bassRootIndex: 4, fnLabel: 'I', modKey: { root: 0, minor: false }, harmonicFunction: 'tonic', split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', fnLabel: 'V' } })];
        E.transposeRange(g, 1, 1, 3);
        assert.equal(g[0].rootIndex, 3); assert.equal(g[0].bassRootIndex, 7);
        assert.deepEqual(g[0].modKey, { root: 3, minor: false });
        assert.equal(g[0].split.rootIndex, 10);
        assert.ok(!('fnLabel' in g[0]) && !('harmonicFunction' in g[0]) && !('fnLabel' in g[0].split));
    });
    test('modulo 12 et blocs entiers conservés (pas de découpage inutile)', () => {
        const g = [st(10, 'maj7', 4, { repeatStart: true }), st(0, 'maj7', 4)];
        E.transposeRange(g, 1, 4, 5);
        assert.equal(g.length, 2);
        assert.equal(g[0].rootIndex, 3); assert.equal(g[0].repeatStart, true);
        assert.equal(g[1].rootIndex, 0);
    });
    test('plage au milieu d\'un bloc : découpe aux deux bords, puis refusion', () => {
        const g = [st(0, 'maj7', 6)];
        E.transposeRange(g, 3, 4, 2);
        assert.deepEqual(roots(g), [0, 0, 2, 2, 0, 0]);
        assert.deepEqual(g.map(x => x.measures), [2, 2, 2]);
        E.transposeRange(g, 3, 4, 10); // retour : tout se refusionne
        assert.deepEqual(g.map(x => x.measures), [6]);
    });
    test('transposer par delta puis 12 - delta redonne la grille d\'origine (mesures)', () => {
        const g = styleGrid('bossa'), n = total(g), r0 = roots(g);
        E.transposeRange(g, 1, n, 5); E.transposeRange(g, 1, n, 7);
        assert.deepEqual(roots(g), r0);
    });
});

describe('fonction tonale', () => {
    test('pose, tronque à 24 caractères et retire', () => {
        const g = [st(0, 'maj7', 3)];
        E.setFunctionLabel(g, 2, 0, 'x'.repeat(40));
        assert.equal(g[1].fnLabel.length, 24);
        E.setFunctionLabel(g, 2, 0, null);
        assert.deepEqual(g.map(x => x.measures), [3]); // refusionné
    });
    test('modKey valide posé, invalide ignoré, retiré avec le libellé', () => {
        const g = [st(0, 'maj7', 1), st(5, 'maj7', 1)];
        E.setFunctionLabel(g, 2, 0, 'I de F', { root: 5, minor: 0 });
        assert.deepEqual(g[1].modKey, { root: 5, minor: false });
        E.setFunctionLabel(g, 2, 0, 'I de F', { root: 12, minor: true });
        assert.equal(g[1].modKey, undefined);
        E.setFunctionLabel(g, 2, 0, 'x', { root: 3, minor: true });
        E.setFunctionLabel(g, 2, 0, null, { root: 3, minor: true });
        assert.equal(g[1].modKey, undefined);
    });
    test('2e moitié d\'une mesure partagée', () => {
        const g = [st(0, 'maj7', 1, { split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' } })];
        E.setFunctionLabel(g, 1, 1, 'V');
        assert.equal(g[0].split.fnLabel, 'V'); assert.equal(g[0].fnLabel, undefined);
        const h = [st(0, 'maj7', 1)];
        E.setFunctionLabel(h, 1, 1, 'V'); // pas de split : s'applique à la mesure
        assert.equal(h[0].fnLabel, 'V');
    });
    test('mesure absente : sans effet', () => {
        const g = [st(0, 'maj7', 1)], snap = clone(g);
        E.setFunctionLabel(g, 9, 0, 'x');
        assert.deepEqual(g, snap);
    });
});

describe('signes de reprise', () => {
    test('cycle de fin de reprise : ×2 → ×3 → ×4 → aucune', () => {
        const s = st(0, 'maj7');
        assert.deepEqual([1, 2, 3, 4].map(() => E.cycleRepeatEnd(s)), [2, 3, 4, 0]);
        assert.equal(s.repeatEnd, undefined);
    });
    test('début de reprise : bascule', () => {
        const s = st(0, 'maj7');
        E.toggleRepeatStart(s); assert.equal(s.repeatStart, true);
        E.toggleRepeatStart(s); assert.equal(s.repeatStart, undefined);
    });
    test('toggleVolta : posée, puis retirée si toutes l\'avaient', () => {
        const g = [st(0, 'maj7'), st(5, 'maj7'), st(7, '7')];
        E.toggleVolta(g, 0, 1, 1); assert.deepEqual(g.map(x => x.volta), [1, 1, undefined]);
        E.toggleVolta(g, 0, 1, 1); assert.deepEqual(g.map(x => x.volta), [undefined, undefined, undefined]);
        g[0].volta = 1; E.toggleVolta(g, 0, 1, 1); assert.deepEqual(g.map(x => x.volta), [1, 1, undefined]);
    });
    test('clearRepeats', () => {
        const g = [st(0, 'maj7', 1, { repeatStart: true, repeatEnd: 2, volta: 1 })];
        E.clearRepeats(g, 0, 0);
        assert.deepEqual(g, [st(0, 'maj7', 1)]);
    });
    test('withIsolatedRange isole, applique puis refusionne', () => {
        const g = [st(0, 'maj7', 4)];
        E.withIsolatedRange(g, 2, 3, (i0, i1) => { assert.deepEqual([i0, i1], [1, 2]); E.toggleRepeatStart(g[i0]); });
        assert.deepEqual(g.map(x => [x.measures, !!x.repeatStart]), [[1, false], [1, true], [2, false]]);
    });
    test('markMeasure : start / end / v1 / v2', () => {
        const g = [st(0, 'maj7', 3)];
        E.markMeasure(g, 2, 'start'); assert.equal(g[1].repeatStart, true);
        E.markMeasure(g, 2, 'end'); assert.equal(g[1].repeatEnd, 2);
        E.markMeasure(g, 2, 'v2'); assert.equal(g[1].volta, 2);
        E.markMeasure(g, 2, 'v2'); assert.equal(g[1].volta, undefined);
        E.markMeasure(g, 9, 'start'); // absente : sans effet
    });
});

describe('repères de partie automatiques', () => {
    test('une lettre à chaque changement de section', () => {
        const g = [st(0, 'maj7', 2, { section: 'A' }), st(5, 'maj7', 2, { section: 'A2' }), st(7, '7', 2, { section: 'B' }), st(0, 'maj7', 2, { section: 'A3' })];
        E.assignAutoParts(g);
        assert.deepEqual(g.map(x => x.partStart), ['A', 'A', 'B', 'A']); // A, A2, A3 → « A » à chaque changement de section
    });
    test('une seule section : aucun repère ; anciens repères effacés', () => {
        const g = [st(0, 'maj7', 2, { section: 'A', partStart: 'Z' }), st(5, 'maj7', 2, { section: 'A' })];
        E.assignAutoParts(g);
        assert.ok(g.every(x => x.partStart === undefined));
    });
    test('blocs sans section restent dans la partie en cours', () => {
        const g = [st(0, 'maj7', 1, { section: 'A' }), st(5, 'maj7', 1), st(7, '7', 1, { section: 'B' })];
        E.assignAutoParts(g);
        assert.deepEqual(g.map(x => x.partStart), ['A', undefined, 'B']);
    });
    test('partLabelOfMeasure : seulement en tête de bloc et pour un repère valide', () => {
        const g = [st(0, 'maj7', 2, { partStart: 'A' }), st(5, 'maj7', 1, { partStart: 'zzz' })];
        const flat = flatMeasureList(g);
        assert.equal(E.partLabelOfMeasure(g, flat[0]), 'A');
        assert.equal(E.partLabelOfMeasure(g, flat[1]), '');
        assert.equal(E.partLabelOfMeasure(g, flat[2]), '');
        assert.equal(E.partLabelOfMeasure(g, undefined), '');
    });
});

describe('degrés diatoniques', () => {
    const env = (over = {}) => ({ mainKey: 0, mainQuality: 'ionian', findChordObj, styleScaleFor: () => null, ...over });
    test('majeur : I ii iii IV V vi viiø', () => {
        const d = E.diatonicDegrees(env());
        assert.deepEqual(d.map(x => x.label), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viiø']);
        assert.deepEqual(d.map(x => x.rootIndex), [0, 2, 4, 5, 7, 9, 11]);
        assert.deepEqual(d.map(x => x.chordId), ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
    });
    test('mode dorien en ré : tonique ré mineur', () => {
        const d = E.diatonicDegrees(env({ mainKey: 2, mainQuality: 'dorian' }));
        assert.equal(d[0].rootIndex, 2); assert.equal(d[0].chordId, 'm7'); assert.equal(d[0].label, 'i');
    });
    test('la gamme du style prime quand elle existe', () => {
        const d = E.diatonicDegrees(env({ styleScaleFor: (c) => c === '7' ? 'bluesScale' : null }));
        assert.equal(d[4].scaleId, 'bluesScale');
        assert.notEqual(d[0].scaleId, 'bluesScale');
    });
    test('mineur : jazz = ♭III ♭VI ♭VII (par défaut), classique = III VI VII', () => {
        const labels = (o) => E.diatonicDegrees(env({ mainKey: 9, mainQuality: 'aeolian', triads: true, ...o })).map(x => x.label);
        assert.deepEqual(labels({}), ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII']);
        assert.deepEqual(labels({ convention: 'jazz' }), ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII']);
        assert.deepEqual(labels({ convention: 'classic' }), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
        const sevenths = E.diatonicDegrees(env({ mainKey: 9, mainQuality: 'aeolian', convention: 'classic' })).map(x => x.label);
        assert.deepEqual(sevenths, ['i', 'iiø', 'III', 'iv', 'v', 'VI', 'VII']);
    });
    test('les autres modes : altération lue par rapport à la gamme majeure (jazz) ou au mode à tierce mineure (classique)', () => {
        const L = (q, convention) => E.diatonicDegrees(env({ mainQuality: q, convention, triads: true })).map(x => x.label);
        assert.deepEqual(L('dorian', 'jazz'), ['i', 'ii', '♭III', 'IV', 'v', 'vi°', '♭VII']);
        assert.deepEqual(L('dorian', 'classic'), ['i', 'ii', 'III', 'IV', 'v', '♯vi°', 'VII']);
        assert.deepEqual(L('phrygian', 'classic'), ['i', '♭II', 'III', 'iv', 'v°', 'VI', 'vii']);
        assert.deepEqual(L('locrian', 'jazz'), ['i°', '♭II', '♭iii', 'iv', '♭V', '♭VI', '♭vii']);
        assert.deepEqual(L('locrian', 'classic'), ['i°', '♭II', 'iii', 'iv', '♭V', 'VI', 'vii']);
        for (const q of ['ionian', 'lydian', 'mixolydian']) assert.deepEqual(L(q, 'classic'), L(q, 'jazz'), `${q} : identique`);
        assert.deepEqual(L('lydian', 'jazz'), ['I', 'II', 'iii', '♯iv°', 'V', 'vi', 'vii']);
    });
    test('mode inconnu : traité comme ionien', () => {
        assert.deepEqual(E.diatonicDegrees(env({ mainQuality: 'xx' })).map(x => x.label), E.diatonicDegrees(env()).map(x => x.label));
    });
});

describe('invariants sur les grilles des styles', () => {
    test('isoler n\'importe quelle mesure ne change ni le nombre de mesures ni les accords', () => {
        for (const key of ['swing', 'blues', 'valsejazz', 'tango', 'bebop']) {
            const base = styleGrid(key), n = total(base), r0 = roots(base);
            for (let k = 1; k <= n; k += 3) {
                const g = clone(base);
                E.isolateMeasure(g, k);
                assert.equal(total(g), n, key + k);
                assert.deepEqual(roots(g), r0, key + k);
            }
        }
    });
    test('supprimer puis réinsérer une plage redonne les mêmes accords', () => {
        for (const key of ['swing', 'pop', 'bossa']) {
            const g = styleGrid(key), n = total(g), r0 = roots(g);
            const items = E.measureItems(g, 3, 6);
            E.deleteRange(g, 3, 6);
            assert.equal(total(g), n - 4);
            E.insertItemsAfter(g, 2, items);
            assert.deepEqual(roots(g), r0, key);
        }
    });
    test('toutes les grilles de style survivent à une chaîne d\'opérations', () => {
        for (const key of Object.keys(STYLE_BUILDERS)) {
            const g = styleGrid(key); let n = total(g);
            if (n < 6) continue;
            E.transposeRange(g, 2, 4, 7); E.withIsolatedRange(g, 3, 3, (i0) => E.toggleRepeatStart(g[i0]));
            E.setFunctionLabel(g, 1, 0, 'I'); E.duplicateMeasureAfter(g, 2); n += 1;
            E.deleteRange(g, 5, 5); n -= 1;
            assert.equal(total(g), n, key);
            g.forEach(x => assert.ok(x.measures >= 1 && Number.isInteger(x.rootIndex)));
        }
    });
});


describe('occurrences suivantes d\'un même accord', () => {
    const g = () => [st(1, '7alt'), st(0, 'maj7', 2), st(1, '7alt', 1, { split: { rootIndex: 1, chordId: '7alt', scaleId: 'altered' } }), st(1, 'm7'), st(1, '7alt')];
    test('mêmes fondamentale et type, après la position donnée, moitiés de mesure comprises', () => {
        assert.deepEqual(E.laterChordOccurrences(g(), 1, 0), [
            { measureNumber: 4, half: 0 }, { measureNumber: 4, half: 1 }, { measureNumber: 6, half: 0 }]);
        assert.deepEqual(E.laterChordOccurrences(g(), 4, 0), [{ measureNumber: 4, half: 1 }, { measureNumber: 6, half: 0 }]);
        assert.deepEqual(E.laterChordOccurrences(g(), 6, 0), []);
        assert.deepEqual(E.laterChordOccurrences(g(), 99, 0), []);
    });
    test('une autre fondamentale ou un autre type ne comptent pas', () => {
        assert.deepEqual(E.laterChordOccurrences([st(1, '7alt'), st(2, '7alt'), st(1, '7'), st(1, '7alt')], 1), [{ measureNumber: 4, half: 0 }]);
    });
    test('applyFunctionLabelToLater : pose la lecture sur toutes les occurrences suivantes, pas sur les précédentes ni sur les autres accords', () => {
        const grid = [st(1, '7alt'), st(0, 'maj7'), st(1, '7alt'), st(1, '7'), st(1, '7alt', 1, { split: { rootIndex: 1, chordId: '7alt', scaleId: 'altered' } })];
        E.setFunctionLabel(grid, 1, 0, 'subV');
        assert.equal(E.applyFunctionLabelToLater(grid, 1, 0, 'subV'), 3);
        const flat = flatMeasureList(grid);
        assert.deepEqual(flat.map(m => m.fnLabel), ['subV', null, 'subV', null, 'subV']);
        assert.equal(flat[4].split.fnLabel, 'subV');
        assert.equal(total(grid), 5);
    });
    test('applyFunctionLabelToLater : telle quelle, même sur une occurrence qui avait déjà un choix manuel, et dans des blocs de plusieurs mesures', () => {
        const grid = [st(7, '7', 2), st(0, 'maj7', 2), st(7, '7', 1, { fnLabel: 'V7' }), st(7, '7', 2), st(0, 'maj7')];
        assert.equal(E.applyFunctionLabelToLater(grid, 1, 0, 'subV7/♯IV'), 4);
        const lab = flatMeasureList(grid).map(m => m.fnLabel);
        const L = 'subV7/♯IV';   // mesure 1 = l'accord de départ (non posé ici) ; la 2e mesure de son bloc compte comme suivante
        assert.deepEqual(lab, [null, L, null, null, L, L, L, null]);
        assert.equal(total(grid), 8);
    });
    test('applyFunctionLabelToLater : une lecture de modulation pose aussi la nouvelle tonalité sur chaque occurrence', () => {
        const grid = [st(1, '7alt'), st(5, 'maj7'), st(1, '7alt'), st(1, '7alt')];
        assert.equal(E.applyFunctionLabelToLater(grid, 1, 0, 'V7 de Gb', { root: 6, minor: false }), 2);
        const f = flatMeasureList(grid);
        assert.deepEqual(f[2].modKey, { root: 6, minor: false });
        assert.deepEqual(f[3].modKey, { root: 6, minor: false });
        assert.equal(f[1].modKey, null);
    });
    test('applyFunctionLabelToLater : label null = retour au calcul automatique sur les occurrences suivantes', () => {
        const grid = [st(1, '7alt'), st(1, '7alt', 1, { fnLabel: 'subV' }), st(1, '7alt', 1, { fnLabel: 'bII7', modKey: { root: 1, minor: false } })];
        assert.equal(E.applyFunctionLabelToLater(grid, 1, 0, null), 2);
        flatMeasureList(grid).forEach(m => { assert.equal(m.fnLabel, null); assert.equal(m.modKey, null); });
    });
    test('applyFunctionLabelToLater : à partir de la 2e moitié d\'une mesure ; aucune occurrence = 0', () => {
        const grid = [st(1, '7alt', 1, { split: { rootIndex: 1, chordId: '7alt', scaleId: 'altered' } }), st(1, '7alt')];
        assert.equal(E.applyFunctionLabelToLater(grid, 1, 1, 'subV'), 1);
        const f = flatMeasureList(grid);
        assert.equal(f[0].fnLabel, null); assert.equal(f[0].split.fnLabel, null); assert.equal(f[1].fnLabel, 'subV');
        assert.equal(E.applyFunctionLabelToLater([st(1, '7alt'), st(2, '7alt')], 1, 0, 'x'), 0);
    });
});

describe('accords à proposer en premier pour une fondamentale', () => {
    const grid = [st(1, '7alt'), st(0, 'maj7'), st(1, 'm7'), st(1, '7alt'), st(1, '9', 1, { split: { rootIndex: 1, chordId: '13b9', scaleId: 'x' } })];
    test('seulement les accords de la grille ayant cette fondamentale, sans doublon, hors position éditée', () => {
        // ordre de repli : du plus proche de la fin vers le début → 13b9 (2e moitié de m5), 9, 7alt, m7 ; limite 2 par défaut
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 1, null, [], 10), ['13b9', '9', '7alt', 'm7']);
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 1), ['13b9', '9']);
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 1, { measureNumber: 5, half: 1 }, [], 10), ['9', '7alt', 'm7']);
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 0, null, [], 10), ['maj7']);
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 6, null, [], 10), []);
    });
    test('l\'accord que la mesure éditée est seule à porter n\'est pas proposé (il est déjà choisi)', () => {
        assert.deepEqual(E.chordSuggestionsForRoot([st(1, '7alt'), st(2, 'm7')], 1, { measureNumber: 1, half: 0 }), []);
    });
    test('les accords récemment choisis dans l\'éditeur passent devant, mais seulement s\'ils sont dans la grille', () => {
        const recent = [{ rootIndex: 1, chordId: 'm7' }, { rootIndex: 1, chordId: 'absent' }, { rootIndex: 0, chordId: 'maj7' }, { rootIndex: 1, chordId: '7alt' }];
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 1, null, recent, 10), ['m7', '7alt', '13b9', '9']);
        assert.deepEqual(E.chordSuggestionsForRoot(grid, 1, null, recent), ['m7', '7alt']);
    });
    test('grille d\'une autre session : un accord mémorisé mais absent de CETTE grille n\'est jamais proposé', () => {
        assert.deepEqual(E.chordSuggestionsForRoot([st(1, 'maj7')], 1, null, [{ rootIndex: 1, chordId: '7alt' }]), ['maj7']);
    });
    test('rememberChord : en tête, sans doublon, plafonné', () => {
        let r = E.rememberChord([], 1, '7alt');
        r = E.rememberChord(r, 1, 'm7');
        r = E.rememberChord(r, 1, '7alt');
        assert.deepEqual(r, [{ rootIndex: 1, chordId: '7alt' }, { rootIndex: 1, chordId: 'm7' }]);
        for (let i = 0; i < 100; i++) r = E.rememberChord(r, 2, `c${i}`);
        assert.equal(r.length, 60);
        assert.equal(r[0].chordId, 'c99');
    });
});

describe('annotations de mesure (onglet Annotations)', () => {
    const noteOf = (g, n) => { const m = flatMeasureList(g).find(x => x.measureNumber === n); return g[m.stepIndex].note || null; };
    test('une annotation isole la mesure, sans rien changer d\'autre', () => {
        const g = [st(0, 'maj7', 4)];
        const idx = E.setMeasureNote(g, 2, 'Jouer doux');
        assert.equal(idx, 1);
        assert.deepEqual(g.map(b => b.measures), [1, 1, 2]);
        assert.deepEqual([1, 2, 3, 4].map(n => noteOf(g, n)), [null, 'Jouer doux', null, null]);
        assert.deepEqual(roots(g), [0, 0, 0, 0]);
    });
    test('retirer l\'annotation (texte vide) refusionne les blocs', () => {
        const g = [st(0, 'maj7', 4)];
        E.setMeasureNote(g, 3, 'x');
        E.setMeasureNote(g, 3, '   \n');
        assert.deepEqual(g, [st(0, 'maj7', 4)]);
    });
    test('texte vide sur une mesure sans annotation : la grille n\'est pas touchée', () => {
        const g = [st(0, 'maj7', 4)];
        assert.equal(E.setMeasureNote(g, 2, ''), 0);
        assert.deepEqual(g, [st(0, 'maj7', 4)]);
    });
    test('les espaces de fin sont retirés, le texte est limité à 600 signes, mesure inconnue → -1', () => {
        const g = [st(0, 'maj7', 2)];
        E.setMeasureNote(g, 1, 'ligne 1\nligne 2  \n');
        assert.equal(noteOf(g, 1), 'ligne 1\nligne 2');
        E.setMeasureNote(g, 2, 'a'.repeat(900));
        assert.equal(noteOf(g, 2).length, 600);
        assert.equal(E.setMeasureNote(g, 9, 'x'), -1);
    });
    test('deux mesures voisines identiques avec des annotations différentes ne fusionnent pas', () => {
        const g = [st(0, 'maj7', 2)];
        E.setMeasureNote(g, 1, 'A');
        E.setMeasureNote(g, 2, 'B');
        assert.equal(g.length, 2);
        E.setMeasureNote(g, 2, 'A');
        assert.equal(g.length, 1); // même texte, même accord : un seul bloc de 2 mesures
        assert.equal(g[0].measures, 2);
    });
    test('l\'annotation suit sa mesure quand on supprime, insère ou copie des mesures', () => {
        const g = [st(0, 'maj7', 1), st(2, 'm7', 1), st(7, '7', 1)];
        E.setMeasureNote(g, 3, 'Finir sur la tierce');
        E.deleteRange(g, 1, 1);
        assert.equal(noteOf(g, 2), 'Finir sur la tierce');
        assert.equal(flatMeasureList(g)[1].rootIndex, 7);
        const items = E.measureItems(g, 2, 2);
        assert.equal(items[0].note, 'Finir sur la tierce'); // copier / couper emporte l'annotation
        E.insertItemsAfter(g, 1, items);
        assert.equal(noteOf(g, 2), 'Finir sur la tierce');
        assert.equal(noteOf(g, 3), 'Finir sur la tierce');
    });
    test('dupliquer garde l\'annotation, ajouter une mesure en fin de grille ne la recopie pas', () => {
        const g = [st(0, 'maj7', 1), st(2, 'm7', 1)];
        E.setMeasureNote(g, 2, 'Rubato');
        E.appendCopyOfLast(g);
        assert.equal(noteOf(g, 3), null);
        E.duplicateMeasureAfter(g, 1);
        E.setMeasureNote(g, 1, 'Intro');
        E.duplicateMeasureAfter(g, 1);
        assert.equal(noteOf(g, 2), 'Intro');
    });
    test('transposer ne perd pas l\'annotation', () => {
        const g = [st(0, 'maj7', 2)];
        E.setMeasureNote(g, 2, 'Octave haute');
        E.transposeRange(g, 1, 2, 2);
        assert.equal(noteOf(g, 2), 'Octave haute');
        assert.deepEqual(roots(g), [2, 2]);
    });
});
