const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./band-presets.js');

const state = {
    band: 'swing', groove: 'bossa', instruments: { swing: { harmony: 'organ', bass: 'electric' }, balkan: { harmony: 'guitar' } },
    volumes: { piano: 0.4, bass: 0.9, drums: 0.3, organ: 2, zzz: 0.5 }, reverb: 0.25, swing: 0.62, density: 0.7
};

describe('band-presets : orchestres personnalisés', () => {
    test('bandPresetName : nom propre, borné, vide si invalide', () => {
        assert.equal(P.bandPresetName('  Mon   trio\tjazz '), 'Mon trio jazz');
        assert.equal(P.bandPresetName('a\u0000b'), 'a b');
        assert.equal(P.bandPresetName('x'.repeat(80)).length, P.BP_NAME_MAX);
        [null, undefined, 3, '   ', {}].forEach(v => assert.equal(P.bandPresetName(v), ''));
    });

    test('bandPresetFrom : le son seulement (formation, rythme valable, instruments de la formation, volumes, réverb, swing, densité)', () => {
        const p = P.bandPresetFrom(state);
        assert.deepEqual(p, { band: 'swing', instruments: { harmony: 'organ', bass: 'electric' },
            volumes: { piano: 0.4, bass: 0.9, drums: 0.3, organ: 1 }, reverb: 0.25, swing: 0.62, density: 0.7 });
        assert.equal(p.groove, undefined, 'la bossa ne vaut pas pour le Jazz');
        assert.ok(!('bpm' in p) && !('meter' in p) && !('key' in p), 'ni tempo, ni mesure, ni tonalité');
        const q = P.bandPresetFrom({ band: 'cuba', groove: 'cu-son', swing: null });
        assert.deepEqual(q, { band: 'cuba', groove: 'cu-son' });
        assert.equal(P.bandPresetFrom({ band: 'zzz' }).band, 'swing');
    });

    test('bandPresetSanitize : formation inconnue refusée, valeurs bornées, instruments inconnus retirés', () => {
        assert.equal(P.bandPresetSanitize({ band: 'zzz' }), null);
        assert.equal(P.bandPresetSanitize(null), null);
        assert.equal(P.bandPresetSanitize([]), null);
        assert.deepEqual(P.bandPresetSanitize({ band: 'balkan', groove: 'bk-sevdah', instruments: { harmony: 'guitar', bass: 'violon' },
            volumes: { piano: -1, bass: '0.5', drums: true }, reverb: 9, swing: 0.1, density: 'x', bpm: 120 }),
            { band: 'balkan', groove: 'bk-sevdah', instruments: { harmony: 'guitar' }, volumes: { piano: 0, bass: 0.5 }, reverb: 1, swing: 0.5 });
    });

    test('bandPresetsSanitize : noms propres, sans doublon, plafonnés', () => {
        const raw = { ' A ': { band: 'swing' }, 'A': { band: 'pop' }, '': { band: 'pop' }, 'B': { band: 'zzz' }, 'C': { band: 'cumbia' } };
        assert.deepEqual(Object.keys(P.bandPresetsSanitize(raw)), ['A', 'C']);
        const many = {};
        for (let i = 0; i < 80; i++) many['o' + i] = { band: 'swing' };
        assert.equal(Object.keys(P.bandPresetsSanitize(many)).length, P.BP_MAX);
        [null, 'x', []].forEach(v => assert.deepEqual(P.bandPresetsSanitize(v), {}));
    });

    test('bandPresetsMerge : même nom et même son ignoré ; même nom, son différent : renommé ; l\'original n\'est pas modifié', () => {
        const list = { Trio: { band: 'swing' } };
        const r = P.bandPresetsMerge(list, { Trio: { band: 'swing' }, 'Trio ': { band: 'pop' }, Fanfare: { band: 'brass' } });
        assert.deepEqual(list, { Trio: { band: 'swing' } });
        assert.deepEqual(r.added, ['Fanfare']);   // « Trio  » se nettoie en « Trio » : doublon dans le fichier, le premier l'emporte
        const r2 = P.bandPresetsMerge(r.list, { Trio: { band: 'pop' } });
        assert.deepEqual(r2.added, ['Trio (2)']);
        assert.deepEqual(r2.list['Trio (2)'], { band: 'pop' });
        const r3 = P.bandPresetsMerge(r2.list, { Trio: { band: 'cuba' } });
        assert.deepEqual(r3.added, ['Trio (3)']);
        // nom long : le suffixe tient dans la longueur maximale
        const long = 'x'.repeat(P.BP_NAME_MAX);
        const r4 = P.bandPresetsMerge({ [long]: { band: 'swing' } }, { [long]: { band: 'pop' } });
        assert.ok(r4.added[0].endsWith(' (2)') && r4.added[0].length === P.BP_NAME_MAX);
    });

    test('fichier : aller-retour, et refus d\'un fichier qui n\'est pas un fichier d\'orchestres', () => {
        const list = { 'Mon trio': P.bandPresetFrom(state), Fanfare: { band: 'brass', groove: 'b-chorale' } };
        const file = JSON.parse(JSON.stringify(P.bandPresetsFile(list)));
        assert.equal(file.type, P.BP_FILE_TYPE);
        assert.deepEqual(P.bandPresetsFromFile(file), list);
        assert.equal(P.bandPresetsFromFile({ grid: [] }), null);
        assert.equal(P.bandPresetsFromFile({ type: P.BP_FILE_TYPE, orchestres: {} }), null);
        assert.equal(P.bandPresetsFromFile(null), null);
    });
});
