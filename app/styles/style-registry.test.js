// Tests des fiches de styles (styles/style-registry.js) : les trois endroits d'un style (fiche, générateur, menu) restent d'accord,
// et chaque fiche ne cite que des valeurs connues du moteur. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('./style-registry.js');
const { STYLE_BUILDERS } = require('./style-builders.js');
const C = require('../band/band-catalog.js');
const { parseMeter } = require('../grid/grid-format.js');

const KEYS = Object.keys(R.STYLE_REGISTRY);
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const menuOrder = (() => {
    const a = html.indexOf('id="jam-style-select"');
    const sel = html.slice(a, html.indexOf('</select>', a));
    return [...sel.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]).filter(v => v !== 'custom');
})();
const REHARM_OPS = ['iiV', 'secDom', 'tritone', 'backdoor', 'dim', 'colour', 'sus', 'subdom', 'chrom'];

describe('fiches de styles : cohérence', () => {
    test('une fiche par générateur de grille, et inversement', () => {
        assert.deepEqual(KEYS.slice().sort(), Object.keys(STYLE_BUILDERS).sort());
    });
    test('le menu Jukebox d\'index.html propose exactement ces styles, dans le même ordre', () => {
        assert.deepEqual(menuOrder, KEYS);
    });
    test('orchestre connu ; rythme connu d\'au moins un orchestre', () => {
        const all = C.bandAllGrooves().concat(['piazzolla', 'afro', 'tango']);   // anciens rythmes relus (voir band-catalog.js)
        KEYS.forEach(k => {
            const e = R.STYLE_REGISTRY[k];
            assert.ok(Object.prototype.hasOwnProperty.call(C.BAND_FORMATIONS, e.band), `${k} : orchestre ${e.band}`);
            if (e.groove !== undefined) assert.ok(all.includes(e.groove), `${k} : rythme ${e.groove}`);
        });
    });
    test('tempo, signature, gammes, tonalité, longueur : valeurs valides', () => {
        KEYS.forEach(k => {
            const e = R.STYLE_REGISTRY[k];
            assert.ok(Number.isFinite(e.bpm) && e.bpm >= 30 && e.bpm <= 220, `${k} : bpm ${e.bpm}`);
            assert.equal(parseMeter(e.meter).key, e.meter, `${k} : mesure ${e.meter}`);
            assert.ok(['jazz', 'classic', 'blues', 'funk', 'balkan', 'flamenco'].includes(e.scales), `${k} : gammes ${e.scales}`);
            if (e.key !== undefined) assert.ok(Number.isInteger(e.key) && e.key >= 0 && e.key <= 11, `${k} : tonalité ${e.key}`);
            if (e.bars !== undefined) assert.ok(Number.isInteger(e.bars) && e.bars >= 2 && e.bars <= 64, `${k} : ${e.bars} mesures`);
            Object.keys(e).forEach(f => assert.ok(['band', 'groove', 'bpm', 'meter', 'scales', 'key', 'bars', 'gen'].includes(f), `${k} : champ inconnu ${f}`));
        });
    });
    test('réharmonisation : profil nommé ou opérations connues', () => {
        KEYS.forEach(k => {
            const g = R.STYLE_REGISTRY[k].gen;
            if (g === undefined) return;
            if (typeof g === 'string') { assert.ok(R.STYLE_GEN_PRESETS[g], `${k} : profil ${g}`); return; }
            Object.keys(g.w || {}).forEach(op => assert.ok(REHARM_OPS.includes(op), `${k} : opération ${op}`));
        });
        Object.values(R.STYLE_GEN_PRESETS).forEach(p => Object.keys(p.w).forEach(op => assert.ok(REHARM_OPS.includes(op), op)));
    });
});

describe('lectures des fiches', () => {
    test('styleEntry, styleKeyRoot, styleBars, styleGenProfile ; clés inconnues sans effet', () => {
        assert.equal(R.styleKeyRoot('i-got-rythm'), 10);
        assert.equal(R.styleKeyRoot('swing'), null);
        assert.equal(R.styleKeyRoot('constructor'), null);
        assert.equal(R.styleEntry('custom'), null);
        assert.equal(R.styleBars('blues'), 12);
        assert.equal(R.styleBars('zzz'), 16);
        assert.equal(R.styleGenProfile('swing'), R.STYLE_GEN_PRESETS.jazz);
        assert.equal(R.styleGenProfile('zzz'), R.STYLE_GEN_DEFAULT);
        assert.deepEqual(R.styleField('key').manouche, 9);
    });
});
