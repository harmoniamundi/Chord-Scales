// Tests de l'onglet Carte de l'Entraînement (ui/scale-map.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('./scale-map.js');
const T = require('../theory.js');
const H = require('../grid/harmony.js');

const findChordObj = (id) => T.lookupChord(id) || T.chordTypes.maj[0];
const jazz = (id) => H.jazzChordNotation(id);
const entries = (rootName, chordId, extra = {}) =>
    M.scaleMapEntries({ rootIndex: T.rootNameToIndex(rootName), chordId, findChordObj, triads: false, rootLabels: T.ROOT_NAMES_DEFAULT, ...extra });
const where = (list, scaleId, tonicName) => list.find(e => e.scaleId === scaleId && e.tonicName === tonicName);
const count = (s, re) => (s.match(re) || []).length;

describe('gammes qui contiennent l\'accord', () => {
    test('CΔ : I de Do majeur (tonique) et IV de Sol majeur (sous-dominante)', () => {
        const list = entries('C', 'maj7');
        const doMaj = where(list, 'ionian', 'C'), solMaj = where(list, 'ionian', 'G');
        assert.equal(doMaj.label, 'I');
        assert.equal(doMaj.fn.name, 'Tonique');
        assert.equal(solMaj.label, 'IV');
        assert.equal(solMaj.fn.name, 'Sous-dominante');
        assert.equal(list.filter(e => e.scaleId === 'ionian').length, 2, 'CΔ n\'est dans que deux tonalités majeures');
    });
    test('CΔ aussi dans les modes : ♭III de La éolien, V de Fa lydien, ♭VII de Ré dorien…', () => {
        const list = entries('C', 'maj7');
        assert.equal(where(list, 'aeolian', 'A').label, '♭III');
        assert.equal(where(list, 'lydian', 'F').label, 'V');
        assert.equal(where(list, 'lydian', 'C').label, 'I');
        assert.equal(where(list, 'dorian', 'D').label, '♭VII');
        assert.equal(where(list, 'harmonicMajor', 'C').label, 'I');
    });
    test('l\'accord du degré est bien celui qu\'on cherche, à la bonne fondamentale', () => {
        const list = entries('C', 'maj7');
        list.forEach(e => {
            const at = e.items.find(x => x.degree === e.degree);
            assert.equal(at.rootIndex, 0);
            assert.equal(at.chordId, 'maj7');
            assert.equal(e.chordId, 'maj7');
        });
    });
    test('toutes les notes de l\'accord sont dans la gamme (tensions comprises)', () => {
        for (const [root, chordId] of [['C', 'maj9'], ['G', '9'], ['D', 'm11'], ['F', 'maj7sharp11'], ['B', 'm7b5'], ['A', '7b9']]) {
            const chordObj = findChordObj(chordId);
            entries(root, chordId).forEach(e => {
                const scale = T.scalesDb[e.scaleId].intervals;
                const off = (T.rootNameToIndex(root) - e.tonic + 12) % 12;
                chordObj.notes.forEach(n => assert.ok(scale.includes((off + n) % 12), `${root}${chordId} dans ${e.tonicName} ${e.scaleId}`));
            });
        }
    });
    test('CΔ9 : mêmes gammes que CΔ sauf celles où la neuvième manque ; CΔ#11 seulement là où le fa# existe', () => {
        const plain = entries('C', 'maj7').map(e => e.scaleId + e.tonic);
        entries('C', 'maj9').forEach(e => assert.ok(plain.includes(e.scaleId + e.tonic)));
        const sharp11 = entries('C', 'maj7sharp11');
        assert.ok(where(sharp11, 'lydian', 'C'), 'CΔ#11 est le I de Do lydien');
        assert.ok(where(sharp11, 'ionian', 'G'), 'CΔ#11 est le IV de Sol majeur (fa# dans la gamme)');
        assert.ok(!where(sharp11, 'ionian', 'C'), 'pas de fa# en Do majeur');
    });
    test('dominante : C7 est le V de Fa majeur, le V de Fa mineur harmonique, le I de Do mixolydien', () => {
        const list = entries('C', '7');
        assert.equal(where(list, 'ionian', 'F').label, 'V');
        assert.equal(where(list, 'ionian', 'F').fn.name, 'Dominante');
        assert.equal(where(list, 'harmonicMinor', 'F').label, 'V');
        assert.equal(where(list, 'mixolydian', 'C').label, 'I');
        assert.ok(!where(list, 'ionian', 'C'), 'C7 n\'est pas diatonique en Do majeur');
    });
    test('accord mineur et demi-diminué : chiffrage en minuscules, ø', () => {
        const m7 = entries('C', 'm7');
        assert.equal(where(m7, 'ionian', 'Bb').label, 'ii');
        assert.equal(where(m7, 'ionian', 'Eb').label, 'vi');
        assert.equal(where(m7, 'ionian', 'Ab').label, 'iii');
        assert.equal(where(m7, 'aeolian', 'C').label, 'i');
        const hdim = entries('B', 'm7b5');
        assert.equal(where(hdim, 'ionian', 'C').label, 'viiø');
        assert.equal(where(hdim, 'ionian', 'C').fn.name, 'Dominante');
    });
    test('structure respectée : CΔ ne figure pas dans une gamme où le degré donne autre chose', () => {
        // Do mélodique : C−Δ7 ; Do lydien augmenté : CΔ#5 ; ni l\'un ni l\'autre n\'est CΔ
        const list = entries('C', 'maj7');
        assert.ok(!where(list, 'melodicMinor', 'C'));
        assert.ok(!where(list, 'lydianAug', 'C'));
        const aug = entries('C', 'maj7sharp5');
        assert.ok(where(aug, 'lydianAug', 'C'));
        assert.ok(where(aug, 'harmonicMinor', 'A'));
    });
    test('un accord qui n\'est l\'harmonisation d\'aucune gamme (7alt) : liste vide', () => {
        assert.deepEqual(entries('C', '7alt'), []);
    });
    test('accords suspendus : seule la présence des notes compte', () => {
        const list = entries('C', '7sus4');
        assert.ok(list.length > 0);
        assert.equal(where(list, 'ionian', 'F').chordId, '7');
    });
    test('sixte : la sixte doit être dans la gamme (C6 : I de Do majeur, pas de Do mixolydien)', () => {
        const list = entries('C', '6');
        assert.equal(where(list, 'ionian', 'C').label, 'I');
        assert.ok(where(list, 'mixolydian', 'C'));
        assert.ok(!where(list, 'aeolian', 'C'));
    });
    test('accord construit (identifiant x:…) : même recherche que le catalogue', () => {
        const id = T.cbId({ third: 'm', fifth: 'P', sev: 'b7', ext: [] });
        assert.equal(id, 'm7');
        const built = 'x:M:P:M7:9,13';
        assert.ok(T.lookupChord(built), 'accord composé connu');
        const list = entries('C', built);
        assert.ok(where(list, 'ionian', 'C'));
    });
    test('en triades, l\'accord affiché est la triade du degré, mais la recherche est la même', () => {
        const sevenths = entries('C', 'maj7').map(e => e.scaleId + e.tonic);
        const triads = entries('C', 'maj7', { triads: true });
        assert.deepEqual(triads.map(e => e.scaleId + e.tonic), sevenths);
        triads.forEach(e => assert.equal(e.chordId, 'majTriad'));
        assert.equal(where(triads, 'ionian', 'G').items.map(x => x.rootName + jazz(x.chordId)).join(' '), 'G Am Bm C D Em F#dim');
    });
    test('une triade majeure se retrouve dans les gammes où elle est diatonique', () => {
        const list = entries('C', 'majTriad');
        assert.equal(where(list, 'ionian', 'F').label, 'V');
        assert.equal(where(list, 'ionian', 'G').label, 'IV');
        assert.equal(where(list, 'aeolian', 'E').label, '♭VI');
    });
});

describe('ordre : de la gamme la plus courante à la moins courante', () => {
    test('les gammes suivent SM_SCALE_ORDER', () => {
        const list = entries('C', '7');
        const ranks = list.map(e => M.SM_SCALE_ORDER.indexOf(e.scaleId));
        assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
        assert.ok(ranks.every(r => r >= 0));
    });
    test('majeur, mineur naturel, mineur harmonique, mineur mélodique en tête', () => {
        assert.deepEqual(M.SM_SCALE_ORDER.slice(0, 4), ['ionian', 'aeolian', 'harmonicMinor', 'melodicMinor']);
    });
    test('toutes les gammes de la liste sont des gammes de sept notes connues, sans doublon', () => {
        assert.equal(new Set(M.SM_SCALE_ORDER).size, M.SM_SCALE_ORDER.length);
        M.SM_SCALE_ORDER.forEach(id => assert.equal(T.scalesDb[id].intervals.filter(i => i < 12).length, 7, id));
    });
    test('les dix-sept gammes de sept notes du catalogue sont toutes proposées', () => {
        const seven = Object.keys(T.scalesDb).filter(id => T.scalesDb[id].intervals.filter(i => i < 12).length === 7);
        assert.deepEqual([...seven].sort(), [...M.SM_SCALE_ORDER].sort());
    });
    test('même gamme : I avant IV (CΔ en Do majeur puis en Sol majeur)', () => {
        const ionian = entries('C', 'maj7').filter(e => e.scaleId === 'ionian');
        assert.deepEqual(ionian.map(e => e.tonicName), ['C', 'G']);
    });
    test('même gamme, tonalité mineure : III (relatif majeur) avant VI', () => {
        const aeolian = entries('C', 'maj7').filter(e => e.scaleId === 'aeolian');
        assert.deepEqual(aeolian.map(e => e.label), ['♭III', '♭VI']);
    });
});

describe('fonction tonale', () => {
    test('degrés en tonalité majeure : T SD T SD D T D', () => {
        assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(d => M.scaleMapFunction(d, false).key), ['T', 'SD', 'T', 'SD', 'D', 'T', 'D']);
    });
    test('en tonalité à tierce mineure, le VI joue la sous-dominante', () => {
        assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(d => M.scaleMapFunction(d, true).key), ['T', 'SD', 'T', 'SD', 'D', 'SD', 'D']);
    });
    test('noms complets', () => {
        assert.equal(M.scaleMapFunction(0, false).name, 'Tonique');
        assert.equal(M.scaleMapFunction(3, false).name, 'Sous-dominante');
        assert.equal(M.scaleMapFunction(4, false).name, 'Dominante');
    });
    test('chaque entrée porte la fonction de son degré', () => {
        entries('C', 'm7').forEach(e => assert.equal(e.fn.key, M.scaleMapFunction(e.degree, e.minorThird).key));
    });
});

describe('nom de la tonique', () => {
    const scaleOf = (id) => T.scalesDb[id].intervals;
    test('évite les doubles dièses : Ré# majeur s\'écrit Mi♭, La# majeur Si♭', () => {
        assert.equal(M.scaleMapTonicName(3, scaleOf('ionian'), T.ROOT_NAMES_DEFAULT), 'Eb');
        assert.equal(M.scaleMapTonicName(10, scaleOf('ionian'), T.ROOT_NAMES_DEFAULT), 'Bb');
        assert.equal(M.scaleMapTonicName(3, scaleOf('ionian'), T.ROOT_NAMES_SHARP), 'Eb');
    });
    test('à égalité, l\'écriture choisie par l\'utilisateur', () => {
        assert.equal(M.scaleMapTonicName(6, scaleOf('ionian'), T.ROOT_NAMES_SHARP), 'F#');
        const flats = T.ROOT_NAMES_DEFAULT.slice(); flats[6] = 'Gb';
        assert.equal(M.scaleMapTonicName(6, scaleOf('ionian'), flats), 'Gb');
    });
    test('mineur : Sol# mineur (5 dièses) plutôt que La♭ mineur (7 bémols)', () => {
        assert.equal(M.scaleMapTonicName(8, scaleOf('aeolian'), T.ROOT_NAMES_DEFAULT), 'G#');
    });
});

describe('HTML de la carte', () => {
    const entry = where(entries('C', 'maj7'), 'ionian', 'G');
    const html = M.scaleMapHtml({ ...entry, jazz,
        onclick: (r, c) => `app.playHarmonyChord(${r}, '${c}')`, onArpeggio: (r, c) => `app.playHarmonyArpeggio(${r}, '${c}')` });
    test('sept accords, un seul en noir sur blanc (celui qu\'on cherche)', () => {
        assert.equal(count(html, /class="jm-chip th-chip/g), 7);
        assert.equal(count(html, /data-hit=/g), 1);
        assert.equal(count(html, /th-hit th-hit-0/g), 1);
        const hit = /<button[^>]*th-hit[^>]*>([\s\S]*?)<\/button>/.exec(html)[1];
        assert.match(hit, /C<span class="jam-glyph">Δ<\/span>/);
        assert.match(hit, /<small>IV<\/small>/);
    });
    test('clic = accord plaqué, « >> » = arpège, sans déclencher la carte', () => {
        assert.ok(html.includes("app.playHarmonyChord(0, 'maj7')"));
        assert.equal(count(html, /app\.playHarmonyArpeggio/g), 7);
        assert.equal(count(html, /event\.stopPropagation\(\)/g), 14);
    });
    test('l\'en-tête donne le chiffrage et la fonction', () => {
        const fn = M.scaleMapFunctionHtml(entry);
        assert.match(fn, /tm-fn-SD/);
        assert.match(fn, /<b>IV<\/b>/);
        assert.match(fn, /Sous-dominante/);
    });
    test('clé de carte : gamme + tonique', () => {
        assert.equal(M.scaleMapKey(entry), 'map-ionian-7');
    });
});

describe('mode entonnoir : accords supplémentaires', () => {
    const idx = (n) => T.rootNameToIndex(n);
    const withExtra = (root, chordId, extra, more = {}) => entries(root, chordId, { extra, ...more });
    test('CΔ + G7 : seules les gammes qui contiennent les deux accords restent', () => {
        const list = withExtra('C', 'maj7', [{ rootIndex: idx('G'), chordId: '7' }]);
        assert.ok(list.length > 0 && list.length < entries('C', 'maj7').length);
        assert.ok(where(list, 'ionian', 'C'), 'CΔ (I) et G7 (V) en Do majeur');
        assert.ok(!where(list, 'ionian', 'G'), 'en Sol majeur, G est le I (GΔ), pas G7');
        list.forEach(e => {
            assert.equal(e.hits.length, 2);
            assert.equal(e.items.find(x => x.degree === e.hits[1]).rootIndex, idx('G'));
        });
    });
    test('CΔ + G7 + Dm7 : on continue de réduire (Do majeur seulement)', () => {
        const two = withExtra('C', 'maj7', [{ rootIndex: idx('G'), chordId: '7' }]);
        const three = withExtra('C', 'maj7', [{ rootIndex: idx('G'), chordId: '7' }, { rootIndex: idx('D'), chordId: 'm7' }]);
        assert.ok(three.length <= two.length);
        assert.ok(where(three, 'ionian', 'C'));
        assert.deepEqual(three[0].hits, [0, 4, 1]);
    });
    test('les accords supplémentaires s\'affichent comme l\'accord principal avec un gris de plus en plus soutenu', () => {
        const e = withExtra('C', 'maj7', [{ rootIndex: idx('G'), chordId: '7' }, { rootIndex: idx('D'), chordId: 'm7' }])[0];
        const html = M.scaleMapHtml({ ...e, jazz, onclick: (r, c, h) => `x(${r},'${c}',${h})`, onArpeggio: null });
        assert.equal(count(html, /data-hit=/g), 3);
        assert.match(html, /th-hit th-hit-0/); assert.match(html, /th-hit th-hit-1/); assert.match(html, /th-hit th-hit-2/);
        assert.match(html, /data-hit="1"/);
    });
    test('le rang de la case est transmis au clic (principal 0, supplémentaires 1…, autres -1)', () => {
        const e = withExtra('C', 'maj7', [{ rootIndex: idx('G'), chordId: '7' }])[0];
        const html = M.scaleMapHtml({ ...e, jazz, onclick: (r, c, h) => `pick(${r},'${c}',${h})`, onArpeggio: null });
        assert.ok(html.includes("pick(0,'maj7',0)"));
        assert.ok(html.includes("pick(7,'7',1)"));
        assert.equal(count(html, /,-1\)/g), 5);
    });
    test('deux accords qui n\'ont aucune gamme commune : liste vide', () => {
        assert.deepEqual(withExtra('C', 'maj7', [{ rootIndex: idx('C#'), chordId: '7' }, { rootIndex: idx('F#'), chordId: 'maj7' }, { rootIndex: idx('A#'), chordId: 'm7' }, { rootIndex: idx('D'), chordId: '7' }]), []);
    });
    test('accord supplémentaire inconnu : liste vide, pas d\'erreur', () => {
        assert.deepEqual(withExtra('C', 'maj7', [{ rootIndex: 0, chordId: 'nope' }]), []);
    });
    test('sans accord supplémentaire : même résultat qu\'avant', () => {
        assert.deepEqual(withExtra('C', 'maj7', []).map(e => e.scaleId + e.tonic), entries('C', 'maj7').map(e => e.scaleId + e.tonic));
    });
});

describe('robustesse', () => {
    test('accord inconnu : liste vide, pas d\'erreur', () => {
        assert.deepEqual(M.scaleMapEntries({ rootIndex: 0, chordId: 'nope', findChordObj: () => null, triads: false }), []);
    });
    test('chaque accord du catalogue et chaque fondamentale : aucune erreur, entrées cohérentes', () => {
        const ids = Object.values(T.chordTypes).flat().map(c => c.id);
        for (const chordId of ids) {
            for (let r = 0; r < 12; r += 3) {
                entries(T.ROOT_NAMES_DEFAULT[r], chordId).forEach(e => {
                    assert.ok(e.label && e.fn && e.items.length === 7, `${chordId} ${r}`);
                    assert.equal(e.items.filter(x => x.degree === e.degree).length, 1);
                });
            }
        }
    });
});
