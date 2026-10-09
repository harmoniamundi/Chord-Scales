// Tests de la théorie musicale (theory.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('./theory.js');

const scale = (root, id) => T.getStrictSpelledNotes(root, T.scalesDb[id].intervals);
const chord = (root, id) => T.getSpelledChordNotes(root, T.lookupChord(id));


describe('rootNameToIndex', () => {
    test('notes naturelles et altérées', () => {
        assert.equal(T.rootNameToIndex('C'), 0);
        assert.equal(T.rootNameToIndex('F#'), 6);
        assert.equal(T.rootNameToIndex('Bb'), 10);
    });
    test('enharmoniques délicates (Cb, B#, doubles altérations)', () => {
        assert.equal(T.rootNameToIndex('Cb'), 11);
        assert.equal(T.rootNameToIndex('B#'), 0);
        assert.equal(T.rootNameToIndex('Fbb'), 3);
        assert.equal(T.rootNameToIndex('C##'), 2);
    });
    test('entrée invalide → -1', () => {
        assert.equal(T.rootNameToIndex('H'), -1);
        assert.equal(T.rootNameToIndex(''), -1);
        assert.equal(T.rootNameToIndex(undefined), -1);
    });
});

describe('orthographe des gammes (une lettre par degré)', () => {
    test('Fa# lydien : dièses jusqu’au Mi#', () => {
        assert.deepEqual(scale('F#', 'lydian'), ['F#', 'G#', 'A#', 'B#', 'C#', 'D#', 'E#']);
    });
    test('Do♭ majeur : Fa♭ et non Mi', () => {
        assert.deepEqual(scale('Cb', 'ionian'), ['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
    });
    test('Sol♭ majeur : Do♭ et non Si', () => {
        assert.deepEqual(scale('Gb', 'ionian'), ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
    });
    test('Si♭ dorien', () => {
        assert.deepEqual(scale('Bb', 'dorian'), ['Bb', 'C', 'Db', 'Eb', 'F', 'G', 'Ab']);
    });
    test('La mineur harmonique : sensible Sol#', () => {
        assert.deepEqual(scale('A', 'harmonicMinor'), ['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    });
    test('toute gamme à 7 notes a 7 lettres différentes (sauf l’altérée, traitée à part)', () => {
        for (const id of Object.keys(T.scalesDb)) {
            const iv = T.scalesDb[id].intervals;
            if (iv.length !== 7 || id === 'altered') continue;
            for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
                const letters = T.getStrictSpelledNotes(root, iv).map(n => n[0]);
                assert.equal(new Set(letters).size, 7, `${root} ${id} : ${letters}`);
            }
        }
    });
    test('les noms produits désignent bien les bonnes hauteurs', () => {
        for (const id of Object.keys(T.scalesDb)) {
            const iv = T.scalesDb[id].intervals;
            for (const root of ['C', 'Db', 'F#', 'Ab', 'Bb']) {
                const names = T.getStrictSpelledNotes(root, iv);
                const rootPc = T.rootNameToIndex(root);
                names.forEach((n, i) => {
                    assert.equal(T.rootNameToIndex(n), (rootPc + iv[i]) % 12, `${root} ${id} degré ${i} : ${n}`);
                });
            }
        }
    });
    test('altérée de La♭ : pas de Si♭♭ illisible', () => {
        assert.deepEqual(scale('Ab', 'altered'), ['Ab', 'A', 'B', 'C', 'D', 'E', 'Gb']);
    });
    test('blues de Fa# : Do (et non Si#)', () => {
        assert.deepEqual(scale('F#', 'bluesScale'), ['F#', 'A', 'B', 'C', 'C#', 'E']);
    });
    test('tons entiers : dièses sur fondamentale dièsée, bémols sinon', () => {
        assert.deepEqual(scale('C', 'wholeTone'), ['C', 'D', 'E', 'F#', 'G#', 'A#']);
        assert.deepEqual(scale('F#', 'wholeTone'), ['F#', 'G#', 'A#', 'C', 'D', 'E']);
    });
});

describe('orthographe des accords', () => {
    test('Do°7 : Si♭♭ (septième diminuée)', () => {
        assert.deepEqual(chord('C', 'dim7'), ['C', 'Eb', 'Gb', 'Bbb']);
    });
    test('Lab maj7', () => {
        assert.deepEqual(chord('Ab', 'maj7'), ['Ab', 'C', 'Eb', 'G']);
    });
    test('Mi maj7, Fa# 7', () => {
        assert.deepEqual(chord('E', 'maj7'), ['E', 'G#', 'B', 'D#']);
        assert.deepEqual(chord('F#', '7'), ['F#', 'A#', 'C#', 'E']);
    });
    test('#9 sur tierce majeure : Ré# et non Mi♭', () => {
        const names = T.getSpelledChordNotes('C', { notes: [0, 4, 7, 10, 3] });
        assert.deepEqual(names, ['C', 'E', 'G', 'Bb', 'D#']);
    });
});

describe('deriveSpelling', () => {
    test('Fa# majeur → tout en dièses', () => {
        assert.equal(T.deriveSpelling('F#', 'ionian'), 'sssss');
    });
    test('Mi♭ dorien (parent Ré♭ majeur) → tout en bémols', () => {
        assert.equal(T.deriveSpelling('Eb', 'dorian'), 'fffff');
    });
    test('Do majeur et nom invalide → orthographe par défaut', () => {
        assert.equal(T.deriveSpelling('C', 'ionian'), T.DEFAULT_SPELL);
        assert.equal(T.deriveSpelling('??', 'ionian'), T.DEFAULT_SPELL);
    });
});

describe('orthographe des touches (labelsForSpelling) — sans état global', () => {
    const labels = (sp) => T.labelsForSpelling(sp);
    test('orthographe par défaut', () => {
        assert.deepEqual(labels(T.DEFAULT_SPELL), T.ROOT_NAMES_DEFAULT);
        assert.equal(T.spellingOfLabels(labels(T.DEFAULT_SPELL)), 'ffsff');
    });
    test('tout dièses / tout bémols', () => {
        assert.equal(labels('sssss')[1], 'C#');
        assert.equal(labels('sssss')[10], 'A#');
        assert.equal(labels('fffff')[6], 'Gb');
    });
    test('valeur invalide → défaut', () => {
        assert.deepEqual(labels('nope'), T.ROOT_NAMES_DEFAULT);
    });
    test('aller-retour spellingOfLabels(labelsForSpelling(x)) === x', () => {
        for (const sp of ['ffsff', 'sssss', 'fffff', 'sfsfs']) assert.equal(T.spellingOfLabels(labels(sp)), sp);
    });
    test('chaque appel renvoie un nouveau tableau (pas d’état partagé)', () => {
        const a = labels('sssss');
        a[1] = 'X';
        assert.equal(labels('sssss')[1], 'C#');
        assert.equal(T.ROOT_NAMES_DEFAULT[1], 'Db');
    });
    test('chordRootName suit l’orthographe passée en paramètre', () => {
        assert.equal(T.chordRootName(1, 'maj7', labels('fffff')), 'Db');
        assert.equal(T.chordRootName(1, 'maj7', labels('sssss')), 'C#');
    });
    test('chordRootName : un accord diminué sur touche noire s’écrit en dièse', () => {
        assert.equal(T.chordRootName(1, 'dim7', labels('fffff')), 'C#');
    });
    test('bassNoteName : la basse suit la lettre du degré', () => {
        const l = labels('ffsff');
        assert.equal(T.bassNoteName(0, 'maj7', 4, l), 'E');
        assert.equal(T.bassNoteName(1, 'maj7', 5, l), 'F');
        assert.equal(T.bassNoteName(6, 'maj7', 10, labels('sssss')), 'A#');
    });
});

describe('étiquettes d’intervalles et notes cibles', () => {
    test('getIntervalLabel', () => {
        assert.equal(T.getIntervalLabel(0, [0, 4, 7]), '1');
        assert.equal(T.getIntervalLabel(6, [0, 4, 7, 6]), '#11');
        assert.equal(T.getIntervalLabel(6, [0, 3, 6]), 'b5');
        assert.equal(T.getIntervalLabel(9, [0, 3, 6, 9]), 'bb7');
        assert.equal(T.getIntervalLabel(9, [0, 4, 7, 9]), '6');
        assert.equal(T.getIntervalLabel(3, [0, 4, 7, 10]), '#9');
    });
    test('getTargetIntervals : tierce, septième, quinte', () => {
        assert.deepEqual(T.getTargetIntervals(T.lookupChord('7')), [4, 10, 7]);
        assert.deepEqual(T.getTargetIntervals(null), []);
    });
    test('stackIntervalsUp empile vers l’aigu', () => {
        assert.deepEqual(T.stackIntervalsUp([0, 4, 7, 2]), [0, 4, 7, 14]);
    });
});

describe('notes à éviter', () => {
    test('la quarte juste est à éviter sur maj7 en ionien, pas en lydien', () => {
        assert.deepEqual(T.getAvoidNotes('ionian', 'maj7'), [5]);
        assert.deepEqual(T.getAvoidNotes('lydian', 'maj7'), []);
    });
});

describe('catalogue d’accords', () => {
    test('lookupChord retrouve un accord du catalogue', () => {
        const c = T.lookupChord('maj7');
        assert.deepEqual(c.notes, [0, 4, 7, 11]);
    });
    test('id inconnu ou invalide → null', () => {
        assert.equal(T.lookupChord('nope'), null);
        assert.equal(T.lookupChord(42), null);
    });
    test('chordInfo décrit la structure', () => {
        const info = T.chordInfo('maj7');
        assert.equal(info.fam, 'maj');
        assert.equal(info.minorish, false);
    });
    test('chaque accord du catalogue a des gammes qui existent', () => {
        for (const cat of Object.values(T.chordTypes)) {
            for (const c of cat) {
                for (const s of c.scales) assert.ok(T.scalesDb[s.id], `${c.id} → gamme inconnue ${s.id}`);
            }
        }
    });
});
