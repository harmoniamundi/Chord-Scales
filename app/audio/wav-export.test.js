// Tests de l'export audio (audio/wav-export.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const W = require('./wav-export.js');

describe('wavJoinChunks', () => {
    test('réunit les blocs dans l\'ordre', () => {
        const out = W.wavJoinChunks([Int16Array.from([1, 2]), Int16Array.from([3]), new Int16Array(0), Int16Array.from([4, 5])]);
        assert.deepEqual([...out], [1, 2, 3, 4, 5]);
    });
});

describe('wavTrimSilence', () => {
    const rate = 1000; // 1 ms par échantillon : marges de 3 et 80 échantillons
    test('coupe le silence avant (marge 3 ms) et après (marge 80 ms)', () => {
        const L = new Int16Array(1000), R = new Int16Array(1000);
        L[200] = 500; R[600] = -400;
        const t = W.wavTrimSilence(L, R, rate);
        assert.equal(t.left.length, (600 + 1 + 80) - (200 - 3));
        assert.equal(t.left[3], 500);
        assert.equal(t.right.length, t.left.length);
    });
    test('un enregistrement muet est rendu tel quel ; les marges ne dépassent pas les bords', () => {
        const z = new Int16Array(50);
        assert.equal(W.wavTrimSilence(z, z, rate).left.length, 50);
        const L = new Int16Array(100); L[0] = 900; L[99] = 900;
        assert.equal(W.wavTrimSilence(L, new Int16Array(100), rate).left.length, 100);
    });
});

describe('wavEncode16', () => {
    test('en-tête WAV PCM 16 bits stéréo et échantillons entrelacés', () => {
        const buf = W.wavEncode16(Int16Array.from([1, -2, 3]), Int16Array.from([10, 20, -30]), 48000);
        const v = new DataView(buf);
        const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
        assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
        assert.equal(buf.byteLength, 44 + 3 * 4);
        assert.equal(v.getUint32(4, true), buf.byteLength - 8);
        assert.equal(v.getUint16(20, true), 1);       // PCM
        assert.equal(v.getUint16(22, true), 2);       // stéréo
        assert.equal(v.getUint32(24, true), 48000);
        assert.equal(v.getUint32(28, true), 48000 * 4);
        assert.equal(v.getUint16(34, true), 16);
        assert.equal(v.getUint32(40, true), 12);
        assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => v.getInt16(44 + i * 2, true)), [1, 10, -2, 20, 3, -30]);
    });
    test('longueurs inégales : la plus courte l\'emporte', () => {
        assert.equal(W.wavEncode16(new Int16Array(5), new Int16Array(3), 44100).byteLength, 44 + 12);
    });
});

describe('wavDurationLabel', () => {
    test('secondes puis minutes', () => {
        assert.equal(W.wavDurationLabel(8.4), '8 s');
        assert.equal(W.wavDurationLabel(72), '1 min 12 s');
        assert.equal(W.wavDurationLabel(125), '2 min 05 s');
    });
});
