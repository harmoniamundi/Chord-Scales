// Tests des pastilles de gamme (ui/pastilles.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../theory.js');
const { buildPastillesHtml } = require('./pastilles.js');

const chordObj = T.chordTypes.min.find(c => c.id === 'm7');
const scaleDef = T.scalesDb.dorian;
const fr = (a) => 'FR' + a;
const base = {
    visMode: 'letters', scaleDef, rootName: 'D', chordObj, avoidNotes: [], characteristicInterval: null,
    showTargetNotes: false, large: false, angloToFrench: fr, noteOnclick: (i) => `play(${i})`,
};
const labels = (html) => [...html.matchAll(/>([^<]+)<\/span>/g)].map(m => m[1]);
const clicks = (html) => [...html.matchAll(/onclick="([^"]*)"/g)].map(m => m[1]);

describe('pastilles : contenu', () => {
    test('une pastille par note de la gamme, plus l\'octave', () => {
        const html = buildPastillesHtml(base);
        assert.equal(labels(html).length, scaleDef.intervals.length + 1);
    });
    test('mode lettres : noms anglo-saxons depuis la fondamentale, octave comprise', () => {
        assert.deepEqual(labels(buildPastillesHtml(base)), ['D', 'E', 'F', 'G', 'A', 'B', 'C', 'D']);
    });
    test('mode notes : passe chaque nom par angloToFrench', () => {
        const l = labels(buildPastillesHtml({ ...base, visMode: 'notes' }));
        assert.ok(l.every(x => x.startsWith('FR')));
        assert.equal(l[0], 'FRD');
    });
    test('mode intervalles : étiquettes d\'intervalle de l\'accord', () => {
        const l = labels(buildPastillesHtml({ ...base, visMode: 'intervals' }));
        assert.equal(l.length, 8);
        assert.equal(l[0], T.getIntervalLabel(0, chordObj.notes));
        assert.equal(l[7], T.getIntervalLabel(12, chordObj.notes));
    });
    test('chaque pastille appelle noteOnclick avec son intervalle (octave = 12)', () => {
        assert.deepEqual(clicks(buildPastillesHtml(base)), ['play(0)', 'play(2)', 'play(3)', 'play(5)', 'play(7)', 'play(9)', 'play(10)', 'play(12)']);
    });
});

describe('pastilles : cerclage', () => {
    const ringOf = (html, k) => { const spans = html.split('<span').slice(1); return spans[k]; };
    test('sans option : aucun cerclage', () => {
        assert.ok(!buildPastillesHtml(base).includes('box-shadow'));
    });
    test('note à éviter : rouge, prioritaire sur caractéristique et cible', () => {
        const html = buildPastillesHtml({ ...base, avoidNotes: [3], characteristicInterval: 3, showTargetNotes: true });
        assert.ok(ringOf(html, 2).includes('#ff1744'));
    });
    test('note caractéristique : ambre', () => {
        const html = buildPastillesHtml({ ...base, characteristicInterval: 9 });
        assert.ok(ringOf(html, 5).includes('#ffab00'));
    });
    test('notes cibles : bleu seulement si showTargetNotes', () => {
        const targets = T.getTargetIntervals(chordObj);
        const on = buildPastillesHtml({ ...base, showTargetNotes: true });
        const off = buildPastillesHtml({ ...base, showTargetNotes: false });
        assert.ok(on.includes('#0a6cff') && !off.includes('#0a6cff'));
        assert.ok(targets.length > 0);
    });
    test('l\'octave (12) compte comme la fondamentale (0)', () => {
        const html = buildPastillesHtml({ ...base, avoidNotes: [0] });
        assert.ok(ringOf(html, 0).includes('#ff1744') && ringOf(html, 7).includes('#ff1744'));
    });
});

describe('pastilles : cadre', () => {
    test('taille de référence : plus grande en mode large', () => {
        assert.ok(buildPastillesHtml({ ...base, large: true }).includes('min(3.75rem'));
        assert.ok(buildPastillesHtml(base).includes('min(2.75rem'));
    });
    test('wrapperClass et wrapperAttrs sont insérés dans le cadre', () => {
        const html = buildPastillesHtml({ ...base, wrapperClass: 'xx-class', wrapperAttrs: 'data-k="v"' });
        assert.ok(html.includes('select-none xx-class"') && html.includes('data-k="v"'));
    });
});
