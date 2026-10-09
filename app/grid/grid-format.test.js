// Tests de la lecture sécurisée des grilles et réglages importés (grid/grid-format.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const F = require('./grid-format.js');
const T = require('../theory.js');

const step = (over = {}) => ({ rootIndex: 2, chordId: 'm7', scaleId: 'dorian', measures: 1, ...over });

describe('sanitizeImportedGrid : refus', () => {
    test('pas un tableau, vide ou trop long → null', () => {
        for (const bad of [null, undefined, {}, 'x', 5, [], Array.from({ length: 65 }, () => step())]) assert.equal(F.sanitizeImportedGrid(bad), null);
    });
    test('64 blocs : accepté', () => {
        assert.equal(F.sanitizeImportedGrid(Array.from({ length: 64 }, () => step())).length, 64);
    });
    test('un seul bloc invalide rejette toute la grille', () => {
        assert.equal(F.sanitizeImportedGrid([step(), null]), null);
        assert.equal(F.sanitizeImportedGrid([step(), 5]), null);
        assert.equal(F.sanitizeImportedGrid([step(), step({ chordId: 'inconnu' })]), null);
    });
    test('fondamentale hors 0-11 ou non entière', () => {
        for (const rootIndex of [-1, 12, 3.5, 'x', undefined, NaN]) assert.equal(F.sanitizeImportedGrid([step({ rootIndex })]), null, String(rootIndex));
    });
    test('mesures hors 1-16 ou non entières', () => {
        for (const measures of [0, 17, 1.5, 'x', undefined, -2]) assert.equal(F.sanitizeImportedGrid([step({ measures })]), null, String(measures));
    });
    test('accord inconnu ou non textuel', () => {
        for (const chordId of ['nope', 42, null, undefined]) assert.equal(F.sanitizeImportedGrid([step({ chordId })]), null);
    });
    test('second accord invalide → toute la grille refusée', () => {
        assert.equal(F.sanitizeImportedGrid([step({ split: { rootIndex: 99, chordId: '7' } })]), null);
        assert.equal(F.sanitizeImportedGrid([step({ split: { rootIndex: 7, chordId: 'nope' } })]), null);
    });
});

describe('sanitizeImportedGrid : valeurs conservées ou corrigées', () => {
    test('nombres écrits en texte acceptés', () => {
        const [s] = F.sanitizeImportedGrid([step({ rootIndex: '5', measures: '2' })]);
        assert.deepEqual([s.rootIndex, s.measures], [5, 2]);
    });
    test('gamme inconnue → première gamme de l’accord', () => {
        for (const scaleId of ['???', null, 5, undefined]) {
            const [s] = F.sanitizeImportedGrid([step({ scaleId })]);
            assert.equal(s.scaleId, T.lookupChord('m7').scales[0].id);
        }
    });
    test('gamme connue conservée', () => {
        assert.equal(F.sanitizeImportedGrid([step({ scaleId: 'aeolian' })])[0].scaleId, 'aeolian');
    });
    test('champs inconnus supprimés', () => {
        const [s] = F.sanitizeImportedGrid([step({ evil: '<script>', __proto__x: 1 })]);
        assert.deepEqual(Object.keys(s).sort(), ['chordId', 'measures', 'rootIndex', 'scaleId']);
    });
    test('basse : 0-11 seulement', () => {
        assert.equal(F.sanitizeImportedGrid([step({ bassRootIndex: 7 })])[0].bassRootIndex, 7);
        assert.equal(F.sanitizeImportedGrid([step({ bassRootIndex: 0 })])[0].bassRootIndex, 0);
        for (const b of [12, -1, null, undefined, 'x', 2.5]) assert.equal('bassRootIndex' in F.sanitizeImportedGrid([step({ bassRootIndex: b })])[0], false, String(b));
    });
    test('textes tronqués : section et phrase 80 caractères, fnLabel 24', () => {
        const [s] = F.sanitizeImportedGrid([step({ section: 'x'.repeat(200), phrase: 'p'.repeat(200), harmonicFunction: 'h'.repeat(200), fnLabel: 'f'.repeat(50) })]);
        assert.equal(s.section.length, 80);
        assert.equal(s.phrase.length, 80);
        assert.equal(s.harmonicFunction.length, 80);
        assert.equal(s.fnLabel.length, 24);
    });
    test('textes non textuels ignorés', () => {
        const [s] = F.sanitizeImportedGrid([step({ section: 5, phrase: {}, fnLabel: '' })]);
        assert.deepEqual(Object.keys(s).sort(), ['chordId', 'measures', 'rootIndex', 'scaleId']);
    });
    test('modKey : { root 0-11, minor }', () => {
        assert.deepEqual(F.sanitizeImportedGrid([step({ modKey: { root: 5, minor: true, x: 1 } })])[0].modKey, { root: 5, minor: true });
        assert.deepEqual(F.sanitizeImportedGrid([step({ modKey: { root: 5, minor: 'oui' } })])[0].modKey, { root: 5, minor: false });
        for (const mk of [{ root: 12 }, { root: -1 }, 'k', null]) assert.equal('modKey' in F.sanitizeImportedGrid([step({ modKey: mk })])[0], false);
    });
});

describe('sanitizeImportedGrid : second accord, reprises, parties', () => {
    test('second accord valide conservé avec ses champs', () => {
        const [s] = F.sanitizeImportedGrid([step({ split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', bassRootIndex: 2, fnLabel: 'V', modKey: { root: 1 } } })]);
        assert.deepEqual(s.split, { rootIndex: 7, chordId: '7', scaleId: 'mixolydian', bassRootIndex: 2, fnLabel: 'V', modKey: { root: 1, minor: false } });
    });
    test('second accord ignoré si le bloc dure plus d’une mesure', () => {
        const [s] = F.sanitizeImportedGrid([step({ measures: 2, split: { rootIndex: 7, chordId: '7' } })]);
        assert.equal('split' in s, false);
    });
    test('gamme du second accord par défaut', () => {
        const [s] = F.sanitizeImportedGrid([step({ split: { rootIndex: 7, chordId: '7' } })]);
        assert.equal(s.split.scaleId, T.lookupChord('7').scales[0].id);
    });
    test('signes de reprise : repeatStart true seulement, repeatEnd 2-4, volta 1-2', () => {
        const [s] = F.sanitizeImportedGrid([step({ repeatStart: true, repeatEnd: 3, volta: 2 })]);
        assert.deepEqual([s.repeatStart, s.repeatEnd, s.volta], [true, 3, 2]);
        const [t] = F.sanitizeImportedGrid([step({ repeatStart: 'true', repeatEnd: 5, volta: 3 })]);
        assert.equal('repeatStart' in t || 'repeatEnd' in t || 'volta' in t, false);
        assert.equal('repeatEnd' in F.sanitizeImportedGrid([step({ repeatEnd: 1 })])[0], false);
    });
    test('repères de partie : liste proposée ou lettre A-Z', () => {
        for (const p of ['A', 'in', "B'", 'out', 'Z']) assert.equal(F.sanitizeImportedGrid([step({ partStart: p })])[0].partStart, p);
        for (const p of ['AA', '', 5, 'a', 'inx']) assert.equal('partStart' in F.sanitizeImportedGrid([step({ partStart: p })])[0], false, String(p));
        assert.equal(F.PART_LABELS.length, 16);
    });
    test('idempotent : une grille déjà propre ne change pas', () => {
        const grid = [step({ repeatStart: true, bassRootIndex: 7, section: 'A' }), step({ measures: 1, split: { rootIndex: 7, chordId: '7', scaleId: 'mixolydian' }, repeatEnd: 2 })];
        const once = F.sanitizeImportedGrid(grid);
        assert.deepEqual(F.sanitizeImportedGrid(once), once);
    });
});

describe('sanitizeImportedSettings', () => {
    test('entrées invalides → objet vide', () => {
        for (const bad of [null, undefined, 5, 'x', []]) assert.deepEqual(F.sanitizeImportedSettings(bad), {});
    });
    test('tonalité 0-11, mode connu, orthographe valide', () => {
        assert.deepEqual(F.sanitizeImportedSettings({ key: 7, quality: 'dorian', spell: 'sssss' }), { key: 7, quality: 'dorian', spell: 'sssss' });
        assert.deepEqual(F.sanitizeImportedSettings({ key: 12, quality: 'bad', spell: 'nope' }), {});
    });
    test('tempo borné à 50-220 et arrondi', () => {
        assert.equal(F.sanitizeImportedSettings({ bpm: 10 }).bpm, 50);
        assert.equal(F.sanitizeImportedSettings({ bpm: 999 }).bpm, 220);
        assert.equal(F.sanitizeImportedSettings({ bpm: 120.6 }).bpm, 121);
        assert.equal(F.sanitizeImportedSettings({ bpm: '130' }).bpm, 130);
        assert.equal('bpm' in F.sanitizeImportedSettings({ bpm: 'x' }), false);
    });
    test('signature : valeurs reconnues seulement (anciens fichiers : 2, 3, 4)', () => {
        for (const [v, k] of [['3/4', '3/4'], ['12/8', '12/8'], [3, '3/4'], ['4', '4/4'], [' 6/8 ', '6/8']]) assert.equal(F.sanitizeImportedSettings({ timeSignature: v }).timeSignature, k, String(v));
        for (const v of ['7/8', 'x', 99, true, {}]) assert.equal('timeSignature' in F.sanitizeImportedSettings({ timeSignature: v }), false, String(v));
    });
    test('orchestre : style connu, rythme imposé, volumes et reverb bornés à 0-1', () => {
        const { orchestration: o } = F.sanitizeImportedSettings({ orchestration: { style: 'pop', groove: 'samba', volumes: { piano: 2, bass: -1, drums: 0.5, violin: 'x', guitar: null }, reverb: 0.4 } });
        assert.equal(o.style, 'pop');
        assert.equal(o.groove, 'samba');
        assert.deepEqual(o.volumes, { piano: 1, bass: 0, drums: 0.5 });
        assert.equal(o.reverb, 0.4);
    });
    test('anciens fichiers : mode « arpeges » → style classique', () => {
        assert.equal(F.sanitizeImportedSettings({ orchestration: { mode: 'arpeges', style: 'swing' } }).orchestration.style, 'classic');
    });
    test('anciens fichiers : Brasil + rythme afro → style Cuba', () => {
        assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'latin', groove: 'afro' } }).orchestration.style, 'cuba');
    });
    test('style ou rythme inconnus ignorés', () => {
        assert.deepEqual(F.sanitizeImportedSettings({ orchestration: { style: 'bad', groove: 'x' } }).orchestration, {});
    });
    test('tous les rythmes imposés par un style sont acceptés', () => {
        for (const g of F.IMPORT_GROOVES) assert.equal(F.sanitizeImportedSettings({ orchestration: { style: 'brass', groove: g } }).orchestration.groove, g);
    });
});

describe('unpackSavedEntry et parseMeter', () => {
    test('anciennes sauvegardes (simple tableau) et nouvelles { grid, settings }', () => {
        assert.deepEqual(F.unpackSavedEntry([1, 2]), { grid: [1, 2], settings: null });
        assert.deepEqual(F.unpackSavedEntry({ grid: [1], settings: { key: 3 } }), { grid: [1], settings: { key: 3 } });
        assert.deepEqual(F.unpackSavedEntry({ grid: [1] }), { grid: [1], settings: null });
    });
    test('entrées invalides → null', () => {
        for (const bad of [null, undefined, 'x', 5, {}, { grid: 5 }]) assert.equal(F.unpackSavedEntry(bad), null);
    });
    test('parseMeter : signatures connues, anciens nombres, repli sur 4/4', () => {
        assert.deepEqual(F.parseMeter('6/8'), { key: '6/8', bpb: 2, ternary: true });
        assert.deepEqual(F.parseMeter('12/8'), { key: '12/8', bpb: 4, ternary: true });
        assert.deepEqual(F.parseMeter(3), { key: '3/4', bpb: 3, ternary: false });
        assert.deepEqual(F.parseMeter('7/8'), { key: '4/4', bpb: 4, ternary: false });
        assert.deepEqual(F.parseMeter(undefined), { key: '4/4', bpb: 4, ternary: false });
    });
});
