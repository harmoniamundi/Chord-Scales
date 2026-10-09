// Tests des constantes audio (audio-config.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./audio-config.js');

describe('masterGainFor (curseur Master 0–1 → gain)', () => {
    test('0 → silence, MASTER_UNITY → gain 1 (niveau d’origine)', () => {
        assert.equal(A.masterGainFor(0), 0);
        assert.equal(A.masterGainFor(A.MASTER_UNITY), 1);
    });
    test('sous le niveau d’origine : linéaire', () => {
        assert.equal(A.masterGainFor(0.25), 0.5);
    });
    test('curseur à fond → +12 dB (gain ≈ ×3,98)', () => {
        const dB = 20 * Math.log10(A.masterGainFor(1));
        assert.ok(Math.abs(dB - A.MASTER_MAX_DB) < 1e-9, `${dB} dB`);
    });
    test('croissant sur toute la course, sans saut au point d’unité', () => {
        let prev = -1;
        for (let i = 0; i <= 100; i++) {
            const g = A.masterGainFor(i / 100);
            assert.ok(g >= prev, `non monotone à ${i} %`);
            prev = g;
        }
        const eps = 1e-6;
        assert.ok(Math.abs(A.masterGainFor(A.MASTER_UNITY + eps) - A.masterGainFor(A.MASTER_UNITY - eps)) < 1e-4);
    });
});

describe('METRONOME_CLICK', () => {
    const bytes = Buffer.from(A.METRONOME_CLICK.pcm, 'base64');
    test('PCM 16 bits mono : nombre d’octets pair, durée de 120 ms', () => {
        assert.equal(bytes.length % 2, 0);
        const ms = (bytes.length / 2 / A.METRONOME_CLICK.rate) * 1000;
        assert.ok(Math.abs(ms - 120) < 0.5, `${ms} ms`);
    });
    test('le silence initial (`lead`) est plus court que le clic et l’attaque suit', () => {
        const n = bytes.length / 2;
        assert.ok(A.METRONOME_CLICK.lead > 0 && A.METRONOME_CLICK.lead < n);
        let peak = 0;
        for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i * 2)));
        assert.ok(peak > 1000, 'le clic n’est pas muet');
    });
    test('fondu final : le dernier échantillon est quasi nul (pas de clic parasite)', () => {
        const last = Math.abs(bytes.readInt16LE(bytes.length - 2));
        assert.ok(last < 200, `dernier échantillon : ${last}`);
    });
});

describe('constantes', () => {
    test('octave de lecture et durée de pas', () => {
        assert.equal(A.PLAY_BASE_OCTAVE, 3);
        assert.ok(A.NOTE_STEP_SECONDS > 0);
    });
    test('MASTER_KNEE est un seuil entre 0 et 1', () => {
        assert.ok(A.MASTER_KNEE > 0 && A.MASTER_KNEE < 1);
    });
});
