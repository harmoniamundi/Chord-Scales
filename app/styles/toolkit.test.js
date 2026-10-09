// Tests de la boîte à outils des modèles de grille (styles/toolkit.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeStyleToolkit } = require('./toolkit.js');
const T = require('../theory.js');

const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const kit = (over = {}) => makeStyleToolkit({ keyRoot: 0, mainQuality: 'ionian', styleKey: 'swing', R: null, findChordObj, ...over });

describe('accords diatoniques (chord, chordJazz)', () => {
    test('en Do majeur : I, ii, V, vi', () => {
        const t = kit();
        assert.deepEqual(t.chord('I', 2, 'A', 'A1', 'tonic'), { r: 0, c: 'maj7', m: 2, s: 'ionian', section: 'A', phrase: 'A1', function: 'tonic' });
        assert.deepEqual([t.chord('ii'), t.chord('V'), t.chord('vi')].map(x => [x.r, x.c, x.s]), [[2, 'm7', 'dorian'], [7, '7', 'mixolydian'], [9, 'm7', 'aeolian']]);
    });
    test('chordJazz : la tonique est lydienne', () => {
        assert.equal(kit().chordJazz('I').s, 'lydian');
        assert.equal(kit().chord('I').s, 'ionian');
    });
    test('transposition : la tonique suit keyRoot', () => {
        const t = kit({ keyRoot: 5 });
        assert.equal(t.chord('I').r, 5);
        assert.equal(t.chord('V').r, 0);
    });
    test('keyRoot invalide → Do', () => {
        assert.equal(kit({ keyRoot: undefined }).keyRoot, 0);
        assert.equal(kit({ keyRoot: 'x' }).chord('I').r, 0);
    });
    test('mode choisi (dorien) : les degrés suivent le mode', () => {
        const t = kit({ mainQuality: 'dorian' });
        assert.equal(t.rotation, 1);
        assert.equal(t.chord('I').c, 'm7');
        assert.equal(t.chord('I').r, 0);
    });
    test('dominante secondaire : septième de dominante sur la quinte du degré visé', () => {
        const x = kit().secondary('V');
        assert.deepEqual([x.r, x.c, x.s, x.function], [2, '7', 'mixolydian', 'secondaryDominant']);
    });
});

describe('choix aléatoires (pick, libOK)', () => {
    test('sans générateur : toujours la première option', () => {
        const t = kit();
        assert.equal(t.pick(['a', 'b', 'c']), 'a');
    });
    test('avec générateur : l’indice suit le tirage', () => {
        const t = kit({ R: () => 0.99 });
        assert.equal(t.pick(['a', 'b', 'c']), 'c');
    });
    test('style écrit en degrés + mode non majeur : bibliothèques désactivées (première option)', () => {
        const t = kit({ R: () => 0.99, mainQuality: 'dorian', styleKey: 'swing' });
        assert.equal(t.libOK, false);
        assert.equal(t.pick(['a', 'b', 'c']), 'a');
    });
    test('style écrit en absolu : le mode est ignoré, les bibliothèques restent actives', () => {
        const t = kit({ R: () => 0.99, mainQuality: 'dorian', styleKey: 'bossa' });
        assert.equal(t.libOK, true);
        assert.equal(t.pick(['a', 'b', 'c']), 'c');
    });
});

describe('accords en absolu et cellules', () => {
    test('abs : gamme par défaut tirée du catalogue, fonction « color » par défaut', () => {
        const x = kit({ keyRoot: 2 }).abs(7, '7');
        assert.equal(x.r, 9);
        assert.equal(x.function, 'color');
        assert.ok(T.scalesDb[x.s]);
    });
    test('abs : décalage négatif ramené dans 0-11', () => {
        assert.equal(kit().abs(-2, 'm7').r, 10);
    });
    test('cells : la tonique est « tonic », les dominantes « dominant », le reste « predominant »', () => {
        const items = kit().cells([['m7', 0], ['D', 7, 2], ['hd', 2]], 'A', 'A1');
        assert.deepEqual(items.map(x => x.function), ['tonic', 'dominant', 'predominant']);
        assert.deepEqual(items.map(x => x.m), [1, 2, 1]);
        assert.deepEqual(items.map(x => x.c), ['m7', '7', 'm7b5']);
    });
    test('join : aplatit et copie (les originaux ne sont pas partagés)', () => {
        const t = kit();
        const a = [t.chord('I')];
        const out = t.join(a, [t.chord('V')]);
        assert.equal(out.length, 2);
        out[0].r = 99;
        assert.equal(a[0].r, 0);
    });
    test('cadence : ii-V-I, la tonique dure 2 mesures', () => {
        assert.deepEqual(kit().cadence('A', 'A1').map(x => [x.c, x.m]), [['m7', 1], ['7', 1], ['maj7', 2]]);
    });
    test('twinOf : copie jumelle avec ses propres étiquettes de section et de phrase', () => {
        const t = kit();
        const A = t.cadence('A', 'A1');
        const tw = t.twinOf(A, 'A2');
        assert.deepEqual(tw.map(x => x.section), ['A2', 'A2', 'A2']);
        assert.ok(tw.every(x => /^A2/.test(x.phrase)));
        assert.equal(A[0].section, 'A');
    });
    test('okAfter : après une dominante, on reprend sur la tonique ou vi', () => {
        const t = kit();
        const dom = [['D', 7]];
        const opts = [[['M', 3]], [['m', 0]], [['m', 9]]];
        assert.deepEqual(t.okAfter(dom, opts), [[['m', 0]], [['m', 9]]]);
        assert.equal(t.okAfter([['M', 0]], opts), opts); // pas de dominante : rien ne change
    });
    test('jbr : les ponts modulants portent leur tonalité traversée (kc)', () => {
        const items = kit().jbr(kit().JBR[1], 'B');
        assert.ok(items.every(x => Number.isInteger(x.kc)));
        assert.ok(items.some(x => x.kc === 5) && items.some(x => x.kc === 0));
    });
});
