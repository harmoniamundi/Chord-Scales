// Tests des sons locaux (local-soundfonts.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./local-soundfonts.js');

const ROOT = path.join(__dirname, '..', '..');

describe('localSoundfontUrl', () => {
    test('même nommage que soundfont-player, mais dans app/sounds/', () => {
        assert.equal(L.localSoundfontUrl('trumpet', 'MusyngKite', 'mp3'), 'app/sounds/MusyngKite/trumpet-mp3.js');
        assert.equal(L.localSoundfontUrl('acoustic_bass', 'FluidR3_GM'), 'app/sounds/FluidR3_GM/acoustic_bass-mp3.js');
    });
    test('banque absente → MusyngKite (défaut de la bibliothèque) ; ogg seulement si demandé', () => {
        assert.equal(L.localSoundfontUrl('tuba'), 'app/sounds/MusyngKite/tuba-mp3.js');
        assert.equal(L.localSoundfontUrl('tuba', undefined, 'ogg'), 'app/sounds/MusyngKite/tuba-ogg.js');
        assert.equal(L.localSoundfontUrl('tuba', 'Inconnue', 'wav'), 'app/sounds/MusyngKite/tuba-mp3.js');
    });
    test('adresse relative (marche sous /Chord-Scales/ comme à la racine)', () => {
        L.LOCAL_SOUNDFONT_FILES.forEach(f => assert.ok(!f.startsWith('/') && !/^[a-z]+:/.test(f), f));
    });
});

describe('useLocalSoundfonts', () => {
    test('ajoute nameToUrl à chaque appel, sans écraser les autres options', () => {
        const calls = [];
        const fake = { instrument(ctx, name, opts) { calls.push({ ctx, name, opts }); return Promise.resolve('ok'); } };
        L.useLocalSoundfonts(fake);
        fake.instrument('CTX', 'violin', { soundfont: 'MusyngKite', destination: 'D' });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].ctx, 'CTX');
        assert.equal(calls[0].opts.soundfont, 'MusyngKite');
        assert.equal(calls[0].opts.destination, 'D');
        assert.equal(calls[0].opts.nameToUrl('violin', 'MusyngKite', 'mp3'), 'app/sounds/MusyngKite/violin-mp3.js');
    });
    test('appel sans options, et nameToUrl explicite prioritaire', () => {
        const calls = [];
        const fake = { instrument(ctx, name, opts) { calls.push(opts); } };
        L.useLocalSoundfonts(fake);
        fake.instrument('c', 'tuba');
        const mine = () => 'x';
        fake.instrument('c', 'tuba', { nameToUrl: mine });
        assert.equal(typeof calls[0].nameToUrl, 'function');
        assert.equal(calls[1].nameToUrl, mine);
    });
    test('idempotent : un second appel n\'empile pas un second enrobage', () => {
        let n = 0;
        const fake = { instrument() { n++; } };
        L.useLocalSoundfonts(fake);
        L.useLocalSoundfonts(fake);
        fake.instrument('c', 'tuba');
        assert.equal(n, 1);
    });
    test('bibliothèque absente : ne plante pas', () => {
        assert.equal(L.useLocalSoundfonts(undefined), undefined);
        assert.deepEqual(L.useLocalSoundfonts({}), {});
    });
});

describe('fichiers de sons', () => {
    test('chaque instrument de la liste existe dans app/sounds/ et est un fichier de soundfont', () => {
        L.LOCAL_SOUNDFONT_FILES.forEach(f => {
            const p = path.join(ROOT, f);
            assert.ok(fs.existsSync(p), `fichier manquant : ${f}`);
            const head = fs.readFileSync(p, 'utf8').slice(0, 200);
            assert.ok(/MIDI\.Soundfont\./.test(head), `${f} n'est pas un fichier de soundfont`);
        });
    });
    test('pas de doublon dans la liste', () => {
        assert.equal(new Set(L.LOCAL_SOUNDFONT_FILES).size, L.LOCAL_SOUNDFONT_FILES.length);
    });
    test('chaque instrument demandé par index.html (banque en premier choix) figure dans la liste', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const listed = new Set(L.LOCAL_SOUNDFONT_INSTRUMENTS.map(([, n]) => n));
        // noms passés à Soundfont.instrument / _loadInstrumentShared / load('clé', 'nom')
        const names = new Set();
        for (const m of html.matchAll(/(?:Soundfont\.instrument|_loadInstrumentShared)\(\s*[\w.]+,\s*'([a-z_0-9]+)'/g)) names.add(m[1]);
        for (const m of html.matchAll(/\bload\('\w+',\s*'([a-z_0-9]+)'/g)) names.add(m[1]);
        // cuivres : tableau [['trumpet', 'trumpet'], …] → le second élément est le nom d'instrument
        for (const m of html.matchAll(/\['(\w+)',\s*'(trumpet|french_horn|trombone|tuba)'\]/g)) names.add(m[2]);
        assert.ok(names.size >= 10, `seulement ${names.size} noms repérés : ${[...names]}`);
        const missing = [...names].filter(n => !listed.has(n));
        assert.deepEqual(missing, [], `instruments absents de LOCAL_SOUNDFONT_INSTRUMENTS : ${missing.join(', ')}`);
    });
});
