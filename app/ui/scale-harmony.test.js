// Tests de l'onglet Harmonisation de l'Entraînement (ui/scale-harmony.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scaleHarmonyChosenHtml, scaleHarmony, scaleHarmonyHtml, scaleHarmonyLabel, scaleHarmonyNumeral } = require('./scale-harmony.js');
const T = require('../theory.js');
const H = require('../grid/harmony.js');

const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const jazz = (id) => H.jazzChordNotation(id);
const harm = (scaleId, rootName = 'C', triads = false) =>
    scaleHarmony({ intervals: T.scalesDb[scaleId].intervals, rootName, rootIndex: T.rootNameToIndex(rootName), triads, findChordObj });
const show = (items) => items.map(x => `${x.rootName}${jazz(x.chordId)}`).join(' ');
const labels = (items) => items.map(x => x.label).join(' ');
const count = (s, re) => (s.match(re) || []).length;

describe('gammes de sept notes : tierces superposées sur chaque degré', () => {
    test('ionien en septièmes : Δ −7 −7 Δ 7 −7 ø', () => {
        const h = harm('ionian');
        assert.equal(show(h), 'CΔ D−7 E−7 FΔ G7 A−7 Bø');
        assert.equal(labels(h), 'I ii iii IV V vi viiø');
    });
    test('ionien en triades', () => {
        const h = harm('ionian', 'C', true);
        assert.equal(show(h), 'C Ddim'.replace('Ddim', 'Dm') + ' Em F G Am Bdim');
        assert.equal(labels(h), 'I ii iii IV V vi vii°');
    });
    test('lydien : ♯IV et accords sur le degré', () => {
        const h = harm('lydian');
        assert.equal(show(h), 'CΔ D7 E−7 F#ø GΔ A−7 B−7');
        assert.equal(labels(h), 'I II iii ♯ivø V vi vii');
    });
    test('mineur harmonique : −Δ7, Δ#5, °', () => {
        const h = harm('harmonicMinor');
        assert.equal(show(h), 'C−Δ7 Dø EbΔ#5 F−7 G7 AbΔ B°');
        assert.equal(labels(h), 'i iiø ♭III+ iv V ♭VI vii°');
    });
    test('les notes de l\'accord sont écrites comme la gamme : fondamentales en lettres successives', () => {
        assert.equal(harm('ionian', 'F#').map(x => x.rootName).join(' '), 'F# G# A# B C# D# E#');
        assert.equal(harm('ionian', 'Db').map(x => x.rootName).join(' '), 'Db Eb F Gb Ab Bb C');
    });
    test('la fondamentale de chaque accord est la note de la gamme (indice 0 à 11)', () => {
        assert.deepEqual(harm('dorian', 'D').map(x => x.rootIndex), [2, 4, 5, 7, 9, 11, 0]);
    });
    test('toutes les gammes de sept notes donnent sept accords que la théorie connaît', () => {
        for (const [id, sc] of Object.entries(T.scalesDb)) {
            if (sc.intervals.filter(i => i < 12).length !== 7) continue;
            for (const triads of [false, true]) {
                const h = harm(id, 'C', triads);
                assert.equal(h.length, 7, `${id} (${triads ? 'triades' : '7es'}) : ${h.length} accords`);
                h.forEach(x => { assert.ok(T.lookupChord(x.chordId), `${id} : accord ${x.chordId} inconnu`); assert.ok(x.label, `${id} : chiffrage vide`); });
            }
        }
    });
    test('accord de chaque degré : ses notes sont toutes dans la gamme', () => {
        for (const id of ['ionian', 'altered', 'harmonicMajor', 'phrygianDominant', 'lydianAug', 'melodicMinor']) {
            const pcs = new Set(T.scalesDb[id].intervals);
            harm(id).forEach(x => T.lookupChord(x.chordId).notes.forEach(n => assert.ok(pcs.has((x.offset + n) % 12), `${id} : ${x.rootName} ${x.chordId}`)));
        }
    });
});

describe('autres gammes : accords dont toutes les notes sont dans la gamme', () => {
    test('pentatonique majeure : seuls C6 et A−7 sont possibles', () => {
        const h = harm('majorPentatonic');
        assert.equal(show(h), 'C6 A−7');
        assert.equal(labels(h), 'I vi');
    });
    test('deux accords au plus par degré, même pour les gammes diminuées', () => {
        for (const id of Object.keys(T.scalesDb)) {
            const per = {};
            harm(id).forEach(x => { per[x.degree] = (per[x.degree] || 0) + 1; });
            Object.values(per).forEach(n => assert.ok(n <= 2, `${id} : ${n} accords sur un degré`));
        }
    });
    test('aucun accord en double, tous connus de la théorie, pour chaque gamme et chaque mode', () => {
        for (const id of Object.keys(T.scalesDb)) {
            for (const triads of [false, true]) {
                const h = harm(id, 'Eb', triads);
                const keys = h.map(x => `${x.rootIndex}:${x.chordId}`);
                assert.equal(new Set(keys).size, keys.length, `${id} : doublon`);
                h.forEach(x => assert.ok(T.lookupChord(x.chordId)));
            }
        }
    });
    test('triades de la pentatonique majeure : C et Am', () => {
        assert.equal(show(harm('majorPentatonic', 'C', true)), 'C Am');
    });
    test('en septièmes, la triade d\'un accord plus complet n\'est pas répétée (C6 sans C)', () => {
        assert.equal(harm('majorPentatonic').filter(x => x.degree === 0).length, 1);
    });
});

describe('chiffrage', () => {
    test('triton : ♯IV si la gamme a une quinte juste sans quarte juste, ♭V sinon', () => {
        assert.equal(scaleHarmonyNumeral(6, [0, 2, 4, 6, 7, 9, 11]), '♯IV');
        assert.equal(scaleHarmonyNumeral(6, [0, 1, 3, 5, 6, 8, 10]), '♭V');
    });
    test('minuscule pour une tierce mineure, ° ø + selon la famille', () => {
        assert.equal(scaleHarmonyLabel(2, 'm7', [0, 2]), 'ii');
        assert.equal(scaleHarmonyLabel(11, 'm7b5', [0, 11]), 'viiø');
        assert.equal(scaleHarmonyLabel(11, 'dimTriad', [0, 11]), 'vii°');
        assert.equal(scaleHarmonyLabel(11, 'dim7', [0, 11]), 'vii°');
        assert.equal(scaleHarmonyLabel(3, 'maj7sharp5', [0, 3]), '♭III+');
        assert.equal(scaleHarmonyLabel(7, '7', [0, 7]), 'V');
    });
});

describe('HTML de la carte', () => {
    const html = (over = {}) => scaleHarmonyHtml({
        intervals: T.scalesDb.ionian.intervals, rootName: 'C', rootIndex: 0, triads: false, findChordObj, jazz,
        selected: { rootIndex: 0, chordId: 'maj7' }, onclick: (r, id) => `app.playHarmonyChord(${r}, '${id}')`,
        onArpeggio: (r, id) => `app.playHarmonyArpeggio(${r}, '${id}')`, ...over
    });
    test('un bouton par accord, avec nom et chiffrage', () => {
        const h = html();
        assert.equal(count(h, /class="jm-chip th-chip/g), 7);
        assert.ok(h.includes('<span class="th-name">CΔ</span><small>I</small>'));
        assert.ok(h.includes('<span class="th-name">Bø</span><small>viiø</small>'));
    });
    test('le clic joue l\'accord et ne joue pas la gamme', () => {
        const h = html();
        assert.ok(h.includes("app.playHarmonyChord(7, '7'); event.stopPropagation();"));
    });
    test('chaque case a son chevron « >> » : un clic joue l\'arpège, pas l\'accord plaqué', () => {
        const h = html();
        assert.equal(count(h, /class="th-arp"/g), 7);
        assert.ok(h.includes("app.playHarmonyArpeggio(7, '7'); event.stopPropagation();\">&gt;&gt;</span>"));
        assert.equal(count(html({ onArpeggio: undefined }), /th-arp/g), 0);
        assert.ok(h.includes('« &gt;&gt; » : arpège'));
    });
    test('l\'accord choisi dans le sélecteur est allumé (une seule case)', () => {
        const h = html();
        assert.equal(count(h, /th-chip is-on/g), 1);
        assert.ok(/th-chip is-on" data-chord="0:maj7"/.test(h));
        assert.equal(count(html({ selected: { rootIndex: 5, chordId: 'm7' } }), /is-on/g), 0);
    });
    test('mention sous les accords : quatre sons / triades / gamme sans sept notes', () => {
        assert.ok(html().includes('Accords de quatre sons par tierces'));
        assert.ok(html({ triads: true }).includes('Triades par tierces'));
        assert.ok(html({ intervals: T.scalesDb.majorPentatonic.intervals }).includes('n\'a pas sept notes'));
    });
    test('toutes les gammes produisent un HTML sans erreur', () => {
        for (const sc of Object.values(T.scalesDb)) assert.ok(html({ intervals: sc.intervals }).includes('th-wrap'));
    });
});

describe('accord choisi, en haut de la carte', () => {
    const chosen = (over = {}) => scaleHarmonyChosenHtml({
        intervals: T.scalesDb.ionian.intervals, rootName: 'C', rootIndex: 0, triads: false, findChordObj, jazz,
        selected: { rootIndex: 7, chordId: '7' }, badgeClass: 'badge',
        onArpeggio: (r, id) => `app.playHarmonyArpeggio(${r}, '${id}')`, onNote: (r, i) => `app.playHarmonyNote(${r}, ${i})`, ...over
    });
    test('nom de l\'accord (clic = arpège) suivi de ses notes (clic = la note)', () => {
        const h = chosen();
        assert.ok(h.includes('data-chord="7:7"'));
        assert.ok(h.includes("app.playHarmonyArpeggio(7, '7'); event.stopPropagation();\">G7</span>"));
        assert.deepEqual([...h.matchAll(/class="badge"[^>]*>([^<]+)</g)].map(m => m[1]), ['G', 'B', 'D', 'F']);
        // intervalles empilés vers le haut depuis la fondamentale : 0, 4, 7, 10
        assert.deepEqual([...h.matchAll(/app\.playHarmonyNote\(7, (\d+)\)/g)].map(m => Number(m[1])), [0, 4, 7, 10]);
    });
    test('notes orthographiées selon la fondamentale (Db : bémols)', () => {
        const h = chosen({ rootName: 'Db', rootIndex: 1, selected: { rootIndex: 1, chordId: 'maj7' } });
        assert.deepEqual([...h.matchAll(/class="badge"[^>]*>([^<]+)</g)].map(m => m[1]), ['Db', 'F', 'Ab', 'C']);
    });
    test('rien si l\'accord choisi n\'est pas proposé pour cette gamme', () => {
        assert.equal(chosen({ selected: { rootIndex: 5, chordId: 'm7' } }), '');
        assert.equal(chosen({ selected: undefined }), '');
    });
});
