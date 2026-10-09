// Tests des cartes de gammes de la Jam (ui/scale-cards.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./scale-cards.js');

const scaleDef = { name: 'Dorian', category: 'Modes', desc: 'Mineur lumineux', intervals: [0, 2, 3, 5, 7, 9, 10] };
const base = { startMeasure: 5, rootName: 'D', scaleDef, showScaleInfo: false, chordNameHtml: '<i>Dm7</i>', vizHtml: '<viz/>' };

describe('classes de carte', () => {
    test('carte active : bordure verte ; inactive : discrète', () => {
        assert.ok(C.scaleCardClass(true).includes('border-emerald-400'));
        assert.ok(C.scaleCardClass(false).includes('hover:border-[#555555]'));
        assert.ok(!C.scaleCardClass(false).includes('emerald'));
    });
    test('carte simple cliquable, carte à deux accords non', () => {
        assert.ok(C.scaleCardClass(false).includes('cursor-pointer'));
        assert.ok(!C.splitCardClass(false).includes('cursor-pointer'));
        assert.ok(C.splitCardClass(true).includes('gap-3') && C.splitCardClass(true).includes('border-emerald-400'));
    });
});

describe('identifiants', () => {
    test('accord simple (half null) : suffixe « single »', () => {
        assert.deepEqual(C.playingCardIds(3, null, 'dorian'), {
            id: 'jam-scale-card-play-3-single', canvasId: 'jam-vexflow-canvas-play-3-single', scaleKey: 'jam-scale-3-dorian'
        });
    });
    test('moitiés : suffixes a / b', () => {
        assert.equal(C.playingCardIds(2, 0, 'x').id, 'jam-scale-card-play-2-a');
        assert.equal(C.playingCardIds(2, 1, 'x').canvasId, 'jam-vexflow-canvas-play-2-b');
        assert.equal(C.playingCardIds(2, 1, 'lydian').scaleKey, 'jam-scale-2-b-lydian');
    });
    test('carte à deux accords', () => {
        assert.equal(C.halfScaleKey(4, 0, 'dorian'), 'jam-scale-4-a-dorian');
        assert.equal(C.halfScaleKey(4, 1, 'dorian'), 'jam-scale-4-b-dorian');
        assert.equal(C.halfCanvasId(4, 0), 'jam-vexflow-canvas-4');
        assert.equal(C.halfCanvasId(4, 1), 'jam-vexflow-canvas-4-b');
    });
});

describe('HTML', () => {
    test('nom d\'accord cliquable', () => {
        const h = C.chordNameHtml(2, 'm7', 'D', { name: 'm7' });
        assert.ok(h.includes("app.playJamChord(2, 'm7')") && h.includes('>Dm7<'));
    });
    test('pastille de moitié', () => {
        assert.ok(C.halfLabelHtml('1re moitié').includes('>1re moitié<'));
    });
    test('carte de lecture : badge Active / Suivante, mesure, étiquette de moitié', () => {
        const on = C.playingCardHtml({ ...base, halfLabel: '', isCurrent: true });
        const off = C.playingCardHtml({ ...base, halfLabel: '<b>½</b>', isCurrent: false });
        assert.ok(on.includes('>Active<') && !on.includes('Suivante'));
        assert.ok(off.includes('>Suivante<') && off.includes('<b>½</b>'));
        assert.ok(on.includes('m.5') && on.includes('D Dorian') && on.includes('<viz/>') && on.includes('<i>Dm7</i>'));
    });
    test('infos de gamme (catégorie + description) seulement si showScaleInfo', () => {
        for (const f of [C.playingCardHtml, C.idleCardHtml]) {
            assert.ok(!f({ ...base, halfLabel: '' }).includes('Mineur lumineux'));
            const h = f({ ...base, halfLabel: '', showScaleInfo: true });
            assert.ok(h.includes('Mineur lumineux') && h.includes('>Modes<'));
        }
    });
    test('carte de la vue complète : pas de badge', () => {
        const h = C.idleCardHtml(base);
        assert.ok(!h.includes('Active') && !h.includes('Suivante'));
        assert.ok(h.includes('m.5') && h.includes('<i>Dm7</i>') && h.includes('<viz/>'));
    });
    test('bloc d\'une moitié : en cours = bordure verte, index et moitié en data-', () => {
        const on = C.halfBlockHtml({ ...base, half: 1, idx: 7, on: true, halfLabelText: '2e' });
        assert.ok(on.includes('border-emerald-400') && on.includes('data-half="1"') && on.includes('data-jam-step-index="7"') && on.includes('>2e<'));
        assert.ok(!C.halfBlockHtml({ ...base, half: 0, idx: 7, on: false, halfLabelText: '1re' }).includes('emerald'));
    });
    test('carte à deux accords : en-tête, badge Active conditionnel, blocs', () => {
        const a = C.splitCardHtml({ startMeasure: 9, isActive: true, blocksHtml: '<BLOCKS/>' });
        assert.ok(a.includes('2 accords dans la mesure') && a.includes('>Active<') && a.includes('<BLOCKS/>') && a.includes('m.9'));
        assert.ok(!C.splitCardHtml({ startMeasure: 9, isActive: false, blocksHtml: '' }).includes('Active'));
    });
});

describe('staffTask', () => {
    test('tâche de dessin d\'une portée', () => {
        assert.deepEqual(C.staffTask('cv', scaleDef, 'D', [1], 3, { n: 1 }, true), {
            canvasId: 'cv', intervals: scaleDef.intervals, rootName: 'D', isDesc: false, avoidNotes: [1], characteristicInterval: 3, chordObj: { n: 1 }, showTargetNotes: true
        });
    });
});

describe('scalesSignature', () => {
    const grid = [{ rootIndex: 2, chordId: 'm7', scaleId: 'dorian' }, { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', split: { rootIndex: 0, chordId: 'maj7', scaleId: 'ionian' } }];
    const mk = (extra = {}) => ({
        grid, currentItem: { idx: 0, half: null }, nextItem: { idx: 1, half: 0 }, halvesOf: (st) => [st, st.split],
        flags: [false, false, false, false, 'staff', false], startMeasureOf: (i) => i * 4 + 1, frenchSharp: 'do#', frenchFlat: 'sib', ...extra
    });
    test('stable pour un même état', () => assert.equal(C.scalesSignature(mk()), C.scalesSignature(mk())));
    test('change avec l\'accord, la moitié, les réglages ou la notation', () => {
        const s = C.scalesSignature(mk());
        assert.notEqual(s, C.scalesSignature(mk({ currentItem: { idx: 1, half: 1 } })));
        assert.notEqual(s, C.scalesSignature(mk({ nextItem: { idx: 1, half: 1 } })));
        assert.notEqual(s, C.scalesSignature(mk({ flags: [true, false, false, false, 'staff', false] })));
        assert.notEqual(s, C.scalesSignature(mk({ frenchSharp: 'réb' })));
        assert.notEqual(s, C.scalesSignature(mk({ startMeasureOf: (i) => i * 4 + 2 })));
    });
    test('pas d\'accord suivant : signature valide ; bloc absent ou moitié absente reconnus', () => {
        assert.ok(C.scalesSignature(mk({ nextItem: null })).startsWith('0,,2,m7,dorian,1|-|'));
        assert.ok(C.scalesSignature(mk({ currentItem: { idx: 9, half: null } })).startsWith('x|'));
        assert.ok(C.scalesSignature(mk({ currentItem: { idx: 0, half: 1 } })).startsWith('y|'));
    });
});
