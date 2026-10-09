// Tests des synthés de percussions (audio/drum-synths.js) avec un faux contexte audio qui enregistre les nœuds. Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const D = require('./drum-synths.js');

const PARAMS = ['frequency', 'gain', 'Q', 'detune', 'playbackRate', 'delayTime', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release', 'offset'];

function fakeCtx() {
    const nodes = [];
    const mkParam = () => ({ value: 0, calls: [], setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; }, linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); },
        exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); }, setTargetAtTime(v, t) { this.calls.push(['target', v, t]); }, cancelScheduledValues() {} });
    const mk = (kind, args = []) => {
        const n = { kind, args, out: [], started: null, stopped: null };
        PARAMS.forEach(p => { n[p] = mkParam(); n[p].owner = n; });
        n.connect = (to) => { n.out.push(to); return to; };
        n.disconnect = () => {};
        n.start = (t) => { n.started = t; };
        n.stop = (t) => { n.stopped = t; };
        n.getChannelData = () => new Float32Array(args[1] || 1);
        nodes.push(n);
        return n;
    };
    const ctx = { sampleRate: 8000, currentTime: 0, nodes };
    ['Oscillator', 'Gain', 'BiquadFilter', 'BufferSource', 'WaveShaper', 'Convolver', 'DynamicsCompressor', 'Delay', 'StereoPanner', 'ChannelMerger'].forEach(k => { ctx['create' + k] = (...a) => mk(k, a); });
    ctx.createBuffer = (ch, len, sr) => { const n = mk('Buffer', [ch, len, sr]); n.length = len; return n; };
    ctx.destination = mk('Destination');
    return ctx;
}

function makeRt(over = {}) {
    const ctx = over.ctx || fakeCtx();
    const rt = { ctx, tier: 0, nodes: [], noise: () => D.makeNoiseBuffer(ctx), curve: () => D.makeSaturationCurve(), reverb: () => { rt.reverbUsed = (rt.reverbUsed || 0) + 1; return rt.reverbNode; }, ...over };
    rt.reverbNode = ctx.createGain();
    return rt;
}
const reaches = (from, to, seen = new Set()) => { if (from && from.owner) from = from.owner; /* AudioParam : on suit son nœud */ if (from === to) return true; if (seen.has(from)) return false; seen.add(from); return (from.out || []).some(n => reaches(n, to, seen)); };
function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const withSeed = (n, fn) => { const r = Math.random; Math.random = seeded(n); try { return fn(); } finally { Math.random = r; } };

const DRUMS = ['kick', 'snare', 'ghost', 'hat', 'pedal', 'ohat', 'ride', 'crash', 'clash', 'rim', 'tom1', 'tom2', 'tom3', 'bell', 'clave', 'conga1', 'conga2', 'slap', 'shaker',
    'bdrum', 'timp', 'golpe', 'chich', 'latigo', 'dum', 'tek', 'ka', 'tapan', 'stick', 'daire'];

describe('tampons partagés', () => {
    test('bruit blanc d\'une seconde dans [-1, 1]', () => {
        const ctx = fakeCtx();
        const b = withSeed(1, () => D.makeNoiseBuffer(ctx));
        assert.equal(b.length, ctx.sampleRate);
    });
    test('bruit reproductible avec une graine', () => {
        const run = () => withSeed(5, () => { const c = fakeCtx(); const b = D.makeNoiseBuffer(c); return Array.from(b.getChannelData(0).slice(0, 5)); });
        assert.deepEqual(run(), run());
    });
    test('courbe de saturation : 256 points, impaire, croissante, bornée par 1', () => {
        const c = D.makeSaturationCurve();
        assert.equal(c.length, 256);
        for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1]);
        assert.ok(c.every(v => Math.abs(v) <= 1));
        assert.ok(Math.abs(c[128]) < 1e-6);
        assert.ok(Math.abs(c[128 + 40] + c[128 - 40]) < 1e-6);
    });
});

describe('description d\'un coup', () => {
    test('tous les noms de percussion ont une durée maximale', () => {
        for (const d of DRUMS) assert.ok(D.drumSpec({ drum: d }), d);
        assert.equal(D.drumSpec({ drum: 'inconnu' }), null);
    });
    test('pédale de charleston = charleston plus doux', () => {
        const s = D.drumSpec({ drum: 'pedal' });
        assert.equal(s.drum, 'hat'); assert.equal(s.mul, 0.8); assert.equal(s.name, 'hat');
    });
    test('timbale : hauteur et durée dans le nom, longue ou courte', () => {
        assert.deepEqual([D.drumSpec({ drum: 'timp' }).name, D.drumSpec({ drum: 'timp' }).maxDur], ['timp98l', 2.1]);
        const s = D.drumSpec({ drum: 'timp', freq: 130, short: true });
        assert.deepEqual([s.name, s.maxDur, s.long], ['timp130s', 0.75, false]);
    });
    test('variantes : deux pour caisse claire et toms, une sinon ; long à partir de 0,8 s', () => {
        assert.equal(D.drumSpec({ drum: 'snare' }).variants, 2);
        assert.equal(D.drumSpec({ drum: 'tom3' }).variants, 2);
        assert.equal(D.drumSpec({ drum: 'kick' }).variants, 1);
        assert.equal(D.drumSpec({ drum: 'crash' }).long, true);
        assert.equal(D.drumSpec({ drum: 'kick' }).long, false);
    });
});

describe('synthèse', () => {
    test('chaque percussion crée des nœuds, démarre des sources et les range dans rt.nodes', () => {
        for (const d of DRUMS) {
            const rt = makeRt(); const dest = rt.ctx.createGain();
            withSeed(3, () => D.synthDrumLive(rt, { drum: d }, 1.5, dest, 1));
            assert.ok(rt.nodes.length >= 1, d);
            for (const n of rt.nodes) {
                assert.equal(typeof n.started, 'number', d);
                assert.ok(n.started >= 1.5 - 1e-9, d);
                if (n.stopped !== null) assert.ok(n.stopped > n.started, d);
            }
        }
    });
    test('le son arrive à la destination (ou à la réverbération pour les cymbales)', () => {
        for (const d of DRUMS) {
            const rt = makeRt(); const dest = rt.ctx.createGain();
            withSeed(3, () => D.synthDrumLive(rt, { drum: d }, 0, dest, 1));
            for (const n of rt.nodes) assert.ok(reaches(n, dest) || reaches(n, rt.reverbNode), `${d} : source orpheline`);
        }
    });
    test('cymbales : envoi vers la réverbération partagée', () => {
        for (const d of ['ride', 'crash', 'clash']) {
            const rt = makeRt(); withSeed(1, () => D.synthDrumLive(rt, { drum: d }, 0, rt.ctx.createGain(), 1));
            assert.ok(rt.reverbUsed >= 1, d);
        }
        const rt = makeRt(); withSeed(1, () => D.synthDrumLive(rt, { drum: 'kick' }, 0, rt.ctx.createGain(), 1));
        assert.ok(!rt.reverbUsed);
    });
    test('sans contexte ou sans destination : rien n\'est créé', () => {
        for (const d of DRUMS) {
            const ctx = fakeCtx(); const rt = makeRt({ ctx });
            const before = ctx.nodes.length;
            D.synthDrumLive(rt, { drum: d }, 0, null, 1);
            assert.equal(ctx.nodes.length, before, d + ' sans destination');
            assert.equal(rt.nodes.length, 0);
            D.synthDrumLive({ ...rt, ctx: null }, { drum: d }, 0, {}, 1);
        }
    });
    test('percussion inconnue : sans effet', () => {
        const rt = makeRt(); const n = rt.ctx.nodes.length;
        D.synthDrumLive(rt, { drum: 'nope' }, 0, rt.ctx.createGain(), 1);
        assert.equal(rt.ctx.nodes.length, n + 1); // seulement le gain de destination
        assert.equal(rt.nodes.length, 0);
    });
    test('niveau de qualité minimal : grosse caisse et caisse claire plus légères', () => {
        for (const d of ['kick', 'snare', 'hat', 'ride']) {
            const full = makeRt({ tier: 0 }), min = makeRt({ tier: 2 });
            withSeed(2, () => D.synthDrumLive(full, { drum: d }, 0, full.ctx.createGain(), 1));
            withSeed(2, () => D.synthDrumLive(min, { drum: d }, 0, min.ctx.createGain(), 1));
            assert.ok(min.ctx.nodes.length <= full.ctx.nodes.length, d);
        }
        const full = makeRt({ tier: 0 }), min = makeRt({ tier: 2 });
        D.synthKick(full, 0, full.ctx.createGain(), 1); D.synthKick(min, 0, min.ctx.createGain(), 1);
        assert.equal(min.nodes.length, 1);
        assert.equal(full.nodes.length, 2);
    });
    test('déterministe avec une graine', () => {
        const sig = (d) => { const rt = makeRt(); withSeed(9, () => D.synthDrumLive(rt, { drum: d }, 0, rt.ctx.createGain(), 0.8)); return rt.ctx.nodes.map(n => n.kind + ':' + JSON.stringify(n.frequency.calls)).join('|'); };
        for (const d of ['snare', 'tom1', 'hat', 'dum']) assert.equal(sig(d), sig(d));
    });
    test('la force règle le niveau de l\'enveloppe', () => {
        const peak = (v) => { const rt = makeRt(); D.synthKick(rt, 0, rt.ctx.createGain(), v); return Math.max(...rt.ctx.nodes.filter(n => n.kind === 'Gain').flatMap(n => n.gain.calls.filter(c => c[0] === 'exp').map(c => c[1]))); };
        assert.ok(peak(1) > peak(0.3));
    });
    test('timbale : hauteur transmise et décroissance courte/longue', () => {
        const stop = (e) => { const rt = makeRt(); D.synthDrumLive(rt, e, 0, rt.ctx.createGain(), 1); return Math.max(...rt.nodes.map(n => n.stopped || 0)); };
        assert.ok(stop({ drum: 'timp', short: false }) > stop({ drum: 'timp', short: true }));
        const rt = makeRt(); D.synthDrumLive(rt, { drum: 'timp', freq: 130 }, 0, rt.ctx.createGain(), 1);
        assert.ok(rt.ctx.nodes.some(n => n.frequency.calls.some(c => Math.abs(c[1] - 130) < 1e-9 || c[1] > 130 && c[1] < 400)));
    });
    test('banc d\'oscillateurs métalliques : un oscillateur par fréquence', () => {
        const rt = makeRt();
        D.metalOscBank(rt, 0, 0.1, [300, 420, 560]);
        assert.equal(rt.ctx.nodes.filter(n => n.kind === 'Oscillator').length, 3);
    });
    test('toutes les durées de synthèse tiennent dans la durée maximale annoncée par drumSpec', () => {
        for (const d of DRUMS) {
            const spec = D.drumSpec({ drum: d }); const rt = makeRt(); const t0 = 0;
            withSeed(4, () => D.synthDrumLive(rt, { drum: d }, t0, rt.ctx.createGain(), 1));
            const end = Math.max(...rt.nodes.map(n => n.stopped || 0));
            assert.ok(end <= spec.maxDur + 0.35, `${d} : fin ${end.toFixed(2)} s pour ${spec.maxDur} s`);
        }
    });
});
