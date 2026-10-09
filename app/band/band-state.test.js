// Tests des états de départ de l'orchestre (band/band-state.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./band-state.js');

describe('bandVoiceState', () => {
    test('toutes les mémoires de voix sont vides ou à leur valeur neutre', () => {
        assert.deepEqual(S.bandVoiceState(), {
            _bandPhrase: null, _bandPlan: null,
            _latVoice: null, _latTie: false, _latRunAt: -9,
            _meterVoice: null, _popVoice: null, _popRunAt: -9,
            _brassVoice: null, _brassPrevKey: null, _brassLines: null,
            _balkanVoice: null, _balkanMel: null,
            _pzState: null,
        });
    });
    test('un nouvel objet à chaque appel', () => {
        assert.notEqual(S.bandVoiceState(), S.bandVoiceState());
    });
    test('appliqué à un moteur « sale », tout est remis à zéro sans toucher au reste', () => {
        const engine = { _bandPhrase: { a: 1 }, _popVoice: [60], _pzState: { x: 1 }, _latTie: true, bpm: 120, bandStyle: 'pop' };
        Object.assign(engine, S.bandVoiceState());
        assert.equal(engine._bandPhrase, null);
        assert.equal(engine._popVoice, null);
        assert.equal(engine._pzState, null);
        assert.equal(engine._latTie, false);
        assert.equal(engine.bpm, 120);
        assert.equal(engine.bandStyle, 'pop');
    });
});

describe('bandMeterResetState', () => {
    test('plan, phrase et voicing de mesure irrégulière seulement', () => {
        assert.deepEqual(S.bandMeterResetState(), { _bandPlan: null, _bandPhrase: null, _meterVoice: null });
    });
});

describe('bandRunState et newBandSeed', () => {
    test('compteurs de lecture', () => {
        assert.deepEqual(S.bandRunState(123), { _bandMeasureCounter: 0, _bandSeed: 123, _bandLastFill: false });
    });
    test('graine : entier de 0 à 999999', () => {
        assert.equal(S.newBandSeed(() => 0), 0);
        assert.equal(S.newBandSeed(() => 0.5), 500000);
        assert.equal(S.newBandSeed(() => 0.9999999), 999999);
        for (let i = 0; i < 50; i++) {
            const s = S.newBandSeed();
            assert.ok(Number.isInteger(s) && s >= 0 && s <= 999999);
        }
    });
    test('un seul appel à rand par graine', () => {
        let n = 0;
        S.newBandSeed(() => { n++; return 0.1; });
        assert.equal(n, 1);
    });
    test('les deux états ne se recouvrent pas', () => {
        const a = Object.keys(S.bandRunState(0));
        const b = Object.keys(S.bandVoiceState());
        assert.ok(a.every(k => !b.includes(k)));
    });
});
