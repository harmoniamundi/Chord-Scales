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

describe('chargement par <script> (page ouverte par double-clic, file://)', () => {
    // Faux navigateur minimal : un <script> « chargé » dépose ses échantillons dans MIDI.Soundfont[nom], puis déclenche onload.
    function fakeBrowser({ fail = false, empty = false } = {}) {
        const appended = [];
        global.window = { MIDI: { Soundfont: {} } };
        global.document = {
            createElement: () => ({ remove() { this.removed = true; } }),
            head: {
                appendChild(el) {
                    appended.push(el);
                    setImmediate(() => {
                        if (fail) return el.onerror();
                        if (!empty) { const name = /\/([a-z_0-9]+)-mp3\.js$/.exec(el.src)[1]; window.MIDI.Soundfont[name] = { A0: 'data:audio/mp3;base64,AAA' }; }
                        el.onload();
                    });
                }
            }
        };
        return appended;
    }
    const cleanup = () => { delete global.window; delete global.document; };

    test('isFileProtocol : vrai seulement pour file://', () => {
        assert.equal(L.isFileProtocol(), false); // Node : pas de location
        global.location = { protocol: 'file:' };
        assert.equal(L.isFileProtocol(), true);
        global.location = { protocol: 'https:' };
        assert.equal(L.isFileProtocol(), false);
        delete global.location;
    });
    test('renvoie les échantillons déposés par le fichier, puis nettoie la page', async () => {
        const appended = fakeBrowser();
        try {
            const bank = await L.localSoundfontViaScript('trumpet', 'MusyngKite', 'mp3');
            assert.deepEqual(bank, { A0: 'data:audio/mp3;base64,AAA' });
            assert.equal(appended.length, 1);
            assert.equal(appended[0].src, 'app/sounds/MusyngKite/trumpet-mp3.js');
            assert.equal(appended[0].removed, true, 'balise <script> retirée');
            assert.equal(window.MIDI.Soundfont.trumpet, undefined, 'échantillons non gardés en double dans MIDI.Soundfont');
        } finally { cleanup(); }
    });
    test('deux demandes simultanées du même fichier = un seul chargement (le piano est demandé deux fois)', async () => {
        const appended = fakeBrowser();
        try {
            const [a, b] = await Promise.all([
                L.localSoundfontViaScript('acoustic_grand_piano', 'FluidR3_GM'),
                L.localSoundfontViaScript('acoustic_grand_piano', 'FluidR3_GM')
            ]);
            assert.equal(appended.length, 1);
            assert.equal(a, b);
            // une fois terminé, une nouvelle demande recharge (la mémoire n'est pas retenue)
            await L.localSoundfontViaScript('acoustic_grand_piano', 'FluidR3_GM');
            assert.equal(appended.length, 2);
        } finally { cleanup(); }
    });
    test('fichier introuvable ou vide : promesse rejetée (l\'appli retombe sur son plan B)', async () => {
        fakeBrowser({ fail: true });
        try { await assert.rejects(L.localSoundfontViaScript('tuba', 'MusyngKite'), /introuvable/); } finally { cleanup(); }
        fakeBrowser({ empty: true });
        try { await assert.rejects(L.localSoundfontViaScript('violin', 'MusyngKite'), /vide/); } finally { cleanup(); }
    });
    test('useLocalSoundfonts choisit le chargement par <script> si demandé, sinon l\'adresse', () => {
        const seen = [];
        const mk = () => ({ instrument(ctx, name, opts) { seen.push(opts.nameToUrl); } });
        const a = L.useLocalSoundfonts(mk(), true); a.instrument('c', 'tuba');
        const b = L.useLocalSoundfonts(mk(), false); b.instrument('c', 'tuba');
        assert.equal(seen[0], L.localSoundfontViaScript);
        assert.equal(seen[1], L.localSoundfontUrl);
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
