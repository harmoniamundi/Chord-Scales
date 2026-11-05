// Tests des instruments rock (audio/rock-synths.js : ampli de guitare, orgue, cordes) avec un faux contexte audio. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./rock-synths.js');

const PARAMS = ['frequency', 'gain', 'Q', 'detune', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release'];
function fakeCtx() {
    const nodes = [];
    const mkParam = () => ({ value: 0, calls: [], setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; }, linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); },
        exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); }, setTargetAtTime(v, t) { this.calls.push(['target', v, t]); }, cancelScheduledValues() {} });
    const mk = (kind) => {
        const n = { kind, out: [], started: null, stopped: null };
        PARAMS.forEach(p => { n[p] = mkParam(); });
        n.connect = (to) => { n.out.push(to); return to; };
        n.disconnect = () => {};
        n.start = (t) => { n.started = t; };
        n.stop = (t) => { n.stopped = t; };
        nodes.push(n);
        return n;
    };
    const ctx = { sampleRate: 8000, currentTime: 0, nodes };
    ['Oscillator', 'Gain', 'BiquadFilter', 'BufferSource', 'WaveShaper', 'DynamicsCompressor', 'Delay'].forEach(k => { ctx['create' + k] = () => mk(k); });
    ctx.createBuffer = (ch, len) => { const n = mk('Buffer'); n.getChannelData = () => new Float32Array(len); return n; };
    return ctx;
}
const sink = (ctx) => ctx.createGain();
const reaches = (from, to, seen = new Set()) => { if (from === to) return true; if (!from || seen.has(from)) return false; seen.add(from); return (from.out || []).some(n => reaches(n, to, seen)); };

describe('noms de notes', () => {
    test('rsNoteToMidi : C4 = 60, dièses et bémols, entrées invalides', () => {
        assert.equal(R.rsNoteToMidi('C4'), 60);
        assert.equal(R.rsNoteToMidi('A4'), 69);
        assert.equal(R.rsNoteToMidi('C#3'), 49);
        assert.equal(R.rsNoteToMidi('Bb2'), 46);
        assert.equal(R.rsNoteToMidi(64), 64);
        assert.equal(R.rsNoteToMidi('xyz'), null);
        assert.equal(R.rsNoteToMidi(undefined), null);
    });
    test('rsMidiToFreq : La 440 et l\'octave', () => {
        assert.equal(R.rsMidiToFreq(69), 440);
        assert.ok(Math.abs(R.rsMidiToFreq(81) - 880) < 1e-9);
    });
});

describe('ampli de guitare', () => {
    test('courbe de saturation : bornée, croissante, plus forte avec k', () => {
        const c = R.makeAmpCurve(5);
        assert.equal(c.length, 1024);
        for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1]);
        assert.ok(c.every(v => Math.abs(v) <= 1.2));
        const mid = (k) => Math.abs(R.makeAmpCurve(k)[600]);
        assert.ok(mid(9) > mid(1));
    });
    test('cinq sons : propre, crunch, saturé, lourd, surf ; le niveau de sortie est calé', () => {
        assert.deepEqual(Object.keys(R.AMP_TONES).sort(), ['clean', 'crunch', 'drive', 'heavy', 'surf']);
        Object.values(R.AMP_TONES).forEach(t => { assert.ok(t.level > 0 && t.level < 3); assert.ok(t.trim > 0); });
    });
    test('l\'entrée atteint la destination, le son est réglable, un nom inconnu donne le son propre', () => {
        const ctx = fakeCtx(); const dest = sink(ctx);
        const amp = R.createGuitarAmp(ctx, dest, { tone: 'crunch' });
        assert.ok(reaches(amp.input, dest));
        assert.equal(amp.tone, 'crunch');
        amp.setTone('heavy'); assert.equal(amp.tone, 'heavy');
        amp.setTone('nimportequoi'); assert.equal(amp.tone, 'clean');
    });
    test('niveau minimal : pas d\'écho', () => {
        const a = fakeCtx(); R.createGuitarAmp(a, sink(a), { tier: 0 });
        const b = fakeCtx(); R.createGuitarAmp(b, sink(b), { tier: 2 });
        assert.ok(b.nodes.length < a.nodes.length);
        assert.ok(!b.nodes.some(n => n.kind === 'Delay'));
    });
});

describe('orgue à tirettes', () => {
    test('quatre registrations de neuf tirettes', () => {
        assert.equal(R.ORGAN_DRAWBAR_RATIOS.length, 9);
        Object.values(R.ORGAN_REGISTRATIONS).forEach(r => { assert.equal(r.length, 9); assert.ok(r.every(v => v >= 0 && v <= 8)); });
    });
    test('le bus a une entrée reliée à la destination et un Leslie lent / rapide', () => {
        const ctx = fakeCtx(); const dest = sink(ctx);
        const bus = R.createOrganBus(ctx, dest, { drive: true });
        assert.ok(reaches(bus.input, dest));
        bus.setSpeed('fast'); assert.equal(bus.speed, 'fast');
        bus.setSpeed('slow'); assert.equal(bus.speed, 'slow');
    });
    test('une note : oscillateurs démarrés à l\'instant demandé, un par tirette tirée au plus, enveloppe positive', () => {
        const ctx = fakeCtx(); const bus = R.createOrganBus(ctx, sink(ctx));
        const org = R.createOrganInstrument(ctx, bus, { registration: 'rock' });
        const before = ctx.nodes.length;
        const h = org.play('A3', 2, { duration: 1, gain: 0.8 });
        const oscs = ctx.nodes.slice(before).filter(n => n.kind === 'Oscillator');
        assert.ok(oscs.length >= 3 && oscs.length <= 12);
        oscs.forEach(o => assert.ok(o.started >= 2 - 1e-9));
        assert.equal(typeof h.stop, 'function');
        h.stop(); h.stop(3);   // l'arrêt sans argument (le moteur) et avec un instant
        oscs.forEach(o => assert.ok(o.stopped !== null));
    });
    test('note invalide : ne plante pas', () => {
        const ctx = fakeCtx(); const org = R.createOrganInstrument(ctx, R.createOrganBus(ctx, sink(ctx)));
        assert.doesNotThrow(() => org.play('?', 0, {}).stop());
    });
    test('niveau minimal : moins d\'oscillateurs par note', () => {
        const count = (tier) => { const ctx = fakeCtx(); const org = R.createOrganInstrument(ctx, R.createOrganBus(ctx, sink(ctx), { tier }), { tier, registration: 'full' }); const n0 = ctx.nodes.length; org.play('C3', 0, { duration: 1 }); return ctx.nodes.slice(n0).filter(n => n.kind === 'Oscillator').length; };
        assert.ok(count(2) < count(0));
    });
});

describe('cordes (string machine)', () => {
    test('le bus a une entrée reliée à la destination', () => {
        const ctx = fakeCtx(); const dest = sink(ctx);
        assert.ok(reaches(R.createStringsBus(ctx, dest).input, dest));
        const c2 = fakeCtx(); const d2 = sink(c2);
        assert.ok(reaches(R.createStringsBus(c2, d2, { tier: 1 }).input, d2));
    });
    test('une note : plusieurs scies, attaque lente par défaut, arrêt sans argument accepté', () => {
        const ctx = fakeCtx(); const bus = R.createStringsBus(ctx, sink(ctx));
        const st = R.createStringsInstrument(ctx, bus);
        const n0 = ctx.nodes.length;
        const h = st.play('E4', 1, { duration: 2, gain: 0.6 });
        const oscs = ctx.nodes.slice(n0).filter(n => n.kind === 'Oscillator');
        assert.ok(oscs.length >= 2);
        oscs.forEach(o => assert.equal(o.started, 1));
        assert.doesNotThrow(() => h.stop());
    });
    test('note invalide : ne plante pas', () => {
        const ctx = fakeCtx(); const st = R.createStringsInstrument(ctx, R.createStringsBus(ctx, sink(ctx)));
        assert.doesNotThrow(() => st.play('', 0, {}).stop());
    });
});
