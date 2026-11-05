// Tests des cuivres Virtual Playing Orchestra (vpo-brass.js). Lancer : node --test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('./vpo-brass.js');

const ROOT = path.join(__dirname, '..', '..');

describe('vpoNoteToMidi', () => {
    test('C4 = 60, dièses, bémols et signes ♯ ♭', () => {
        assert.equal(V.vpoNoteToMidi('C4'), 60);
        assert.equal(V.vpoNoteToMidi('A4'), 69);
        assert.equal(V.vpoNoteToMidi('C#3'), 49);
        assert.equal(V.vpoNoteToMidi('Bb3'), 58);
        assert.equal(V.vpoNoteToMidi('B♭3'), 58);
        assert.equal(V.vpoNoteToMidi('F♯2'), 42);
        assert.equal(V.vpoNoteToMidi('E1'), 28);
    });
    test('nom invalide → null', () => {
        assert.equal(V.vpoNoteToMidi('H4'), null);
        assert.equal(V.vpoNoteToMidi(''), null);
        assert.equal(V.vpoNoteToMidi(undefined), null);
    });
});

describe('vpoNearestKey', () => {
    const keys = [56, 59, 62, 65];
    test('prend l\'échantillon le plus proche', () => {
        assert.equal(V.vpoNearestKey(keys, 59), 59);
        assert.equal(V.vpoNearestKey(keys, 60), 59);
        assert.equal(V.vpoNearestKey(keys, 61), 62);
        assert.equal(V.vpoNearestKey(keys, 30), 56);
        assert.equal(V.vpoNearestKey(keys, 99), 65);
    });
    test('à égalité, celui du dessus (on baisse la hauteur plutôt que de la monter)', () => {
        assert.equal(V.vpoNearestKey([56, 60], 58), 60);
    });
});

describe('vpoEnvelope', () => {
    const base = { gain: 1, attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 };
    test('note longue : attaque, chute vers le palier, palier jusqu\'à la fin', () => {
        const e = V.vpoEnvelope({ ...base, duration: 1 });
        assert.deepEqual(e.points, [{ t: 0, v: 0 }, { t: 0.1, v: 1 }, { t: 0.30000000000000004, v: 0.5 }, { t: 1, v: 0.5 }]);
        assert.equal(e.releaseAt, 1);
        assert.equal(e.releaseLevel, 0.5);
    });
    test('note plus courte que l\'attaque : le relâchement part du niveau atteint', () => {
        const e = V.vpoEnvelope({ ...base, duration: 0.05 });
        assert.equal(e.releaseAt, 0.05);
        assert.ok(Math.abs(e.releaseLevel - 0.5) < 1e-9);
        assert.equal(e.points.length, 2);
    });
    test('note finissant pendant la chute : niveau intermédiaire', () => {
        const e = V.vpoEnvelope({ ...base, duration: 0.2 });
        assert.ok(e.releaseLevel < 1 && e.releaseLevel > 0.5);
        assert.equal(e.points[e.points.length - 1].t, 0.2);
    });
    test('sans durée : tenue jusqu\'à stop()', () => {
        const e = V.vpoEnvelope({ ...base });
        assert.equal(e.releaseAt, null);
        assert.equal(e.points[e.points.length - 1].v, 0.5);
    });
});

describe('fichiers de sons', () => {
    test('adresses relatives, une par instrument', () => {
        assert.deepEqual(V.VPO_BRASS_NAMES, ['trumpet', 'french_horn', 'trombone', 'tuba', 'tuba_stc']);
        V.VPO_BRASS_FILES.forEach(f => assert.ok(/^app\/sounds\/VPO\/[a-z_]+\.js$/.test(f), f));
    });
    V.VPO_BRASS_NAMES.forEach(name => {
        test(`${name} : fichier présent, échantillons mp3 cohérents`, () => {
            const code = fs.readFileSync(path.join(ROOT, V.VPO_BRASS_DIR, name + '.js'), 'utf8');
            const win = {};
            new Function('window', code)(win);
            const set = win.VPO_SAMPLES[name];
            assert.ok(set && set.g > 0 && set.g <= 1, 'gain g');
            const keys = Object.keys(set.s);
            assert.ok(keys.length >= 9, `${name} : ${keys.length} échantillons`);
            keys.forEach(k => {
                const e = set.s[k];
                assert.equal(String(e.k), k);
                assert.ok(e.k >= 24 && e.k <= 96);
                assert.match(e.d, /^data:audio\/mpeg;base64,/);
                if (name === 'tuba_stc') assert.equal(e.ls, undefined, 'notes courtes : pas de boucle');
                else assert.ok(e.ls > 0 && e.le > e.ls + 0.1, `${name} ${k} : boucle ${e.ls}–${e.le}`);
            });
        });
    });
});

// Faux contexte audio : enregistre ce que fait play().
function fakeCtx() {
    const log = { sources: [], gains: [] };
    const param = () => { const calls = []; return { calls, value: 0,
        setValueAtTime(v, t) { calls.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { calls.push(['lin', v, t]); },
        exponentialRampToValueAtTime(v, t) { calls.push(['exp', v, t]); }, setTargetAtTime(v, t, c) { calls.push(['target', v, t, c]); },
        cancelScheduledValues(t) { calls.push(['cancel', t]); } }; };
    return { log, currentTime: 1, destination: { name: 'out' },
        createBufferSource() { const s = { playbackRate: { value: 1 }, connect(n) { s.to = n; }, start(t) { s.started = t; }, stop(t) { s.stopped = t; } }; log.sources.push(s); return s; },
        createGain() { const g = { gain: param(), connect(n) { g.to = n; }, disconnect() {} }; log.gains.push(g); return g; },
        createBiquadFilter() { const f = { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect(n) { f.to = n; } }; (log.filters = log.filters || []).push(f); return f; } };
}

describe('instrument (play)', () => {
    // On court-circuite le chargement : un jeu d'échantillons factice injecté par un faux <script>.
    function load(ctx, name, set) {
        global.window = { VPO_SAMPLES: { [name]: set } };
        global.document = { createElement: () => ({ remove() {} }), head: { appendChild(el) { setImmediate(() => el.onload()); } } };
        global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
        ctx.decodeAudioData = (buf, ok) => { ok({ duration: 3, tag: 'buf' + buf.byteLength }); };
        return V.vpoLoadBrass(ctx, name, { destination: { name: 'bus' } });
    }
    const SET = { g: 0.1, s: {
        60: { k: 60, c: 0, d: 'data:audio/mpeg;base64,AAAA', ls: 1, le: 2 },
        67: { k: 67, c: -50, d: 'data:audio/mpeg;base64,AAAA', ls: 0.5, le: 1.5 }
    } };
    const cleanup = () => { delete global.window; delete global.document; delete global.atob; };

    test('hauteur : écart en demi-tons au plus proche échantillon, accord propre et désaccord de la frappe', async () => {
        const ctx = fakeCtx();
        try {
            const inst = await load(ctx, 'trumpet', SET);
            inst.play('D4', 2, { duration: 1, gain: 1 });            // 62 → échantillon 60, +2 demi-tons
            inst.play('G4', 2, { duration: 1, gain: 1, cents: 10 });   // 67 → échantillon 67 (tune −50), +10 cents
            const [a, b] = ctx.log.sources;
            assert.ok(Math.abs(a.playbackRate.value - Math.pow(2, 2 / 12)) < 1e-9);
            assert.ok(Math.abs(b.playbackRate.value - Math.pow(2, (-50 + 10) / 1200)) < 1e-9);
        } finally { cleanup(); }
    });
    test('boucle réglée sur l\'échantillon choisi ; sortie = destination de l\'instrument', async () => {
        const ctx = fakeCtx();
        try {
            const inst = await load(ctx, 'trumpet', SET);   // sans filtre de timbre : sortie directe
            inst.play('C4', 2, { duration: 1 });
            const s = ctx.log.sources[0];
            assert.equal(s.loop, true);
            assert.equal(s.loopStart, 1);
            assert.equal(s.loopEnd, 2);
            assert.equal(s.started, 2);
            assert.equal(ctx.log.gains[0].to.name, 'bus');
        } finally { cleanup(); }
    });
    test('le gain de la frappe est multiplié par le gain de l\'instrument ; la note s\'arrête après son relâchement', async () => {
        const ctx = fakeCtx();
        try {
            const inst = await load(ctx, 'tuba', SET);
            inst.play('C4', 2, { duration: 1, gain: 2, attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.4 });
            const calls = ctx.log.gains[0].gain.calls;
            const peak = calls.find(c => c[0] === 'lin');
            assert.ok(Math.abs(peak[1] - 0.2) < 1e-9, 'pic = 2 × 0.1');
            assert.ok(ctx.log.sources[0].stopped > 2 + 1 + 0.4, 'arrêt de la source après le relâchement');
            assert.ok(calls.some(c => c[0] === 'exp'), 'relâchement exponentiel');
        } finally { cleanup(); }
    });
    test('instant passé : la note part tout de suite ; nom invalide : rien n\'est joué', async () => {
        const ctx = fakeCtx();
        try {
            const inst = await load(ctx, 'trumpet', SET);
            inst.play('C4', 0, { duration: 1 });
            assert.equal(ctx.log.sources[0].started, 1);
            assert.equal(inst.play('???', 0, {}), null);
            assert.equal(ctx.log.sources.length, 1);
        } finally { cleanup(); }
    });
    test('stop() coupe la note par un fondu court', async () => {
        const ctx = fakeCtx();
        try {
            const inst = await load(ctx, 'trumpet', SET);
            const node = inst.play('C4', 2, {});
            node.stop();
            const calls = ctx.log.gains[0].gain.calls;
            assert.ok(calls.some(c => c[0] === 'target' && c[1] === 0));
            assert.ok(ctx.log.sources[0].stopped >= 1);
        } finally { cleanup(); }
    });
    test('timbre : le trombone et le cor passent par deux passe-bas en série (le buzz du trombone ff), la trompette par aucun', async () => {
        const ctx = fakeCtx();
        try {
            const trombone = await load(ctx, 'trombone', SET);
            const filters = ctx.log.filters;
            assert.equal(filters.length, 2);
            filters.forEach(f => { assert.equal(f.type, 'lowpass'); assert.equal(f.frequency.value, V.VPO_TONE_LOWPASS.trombone); });
            assert.equal(filters[0].to, filters[1], 'en série');
            assert.equal(filters[1].to.name, 'bus', 'puis vers la destination de l\'instrument');
            trombone.play('C4', 2, { duration: 1 });
            assert.equal(ctx.log.gains[0].to, filters[0], 'les notes entrent dans la chaîne de filtres');
            const ctx2 = fakeCtx();
            await load(ctx2, 'trumpet', SET);
            assert.equal((ctx2.log.filters || []).length, 0);
        } finally { cleanup(); }
    });
    test('les fréquences de coupure sont des nombres raisonnables, jamais sous 1 kHz (son étouffé) ni au-dessus de 4 kHz', () => {
        Object.entries(V.VPO_TONE_LOWPASS).forEach(([n, fc]) => { if (fc) assert.ok(fc >= 1000 && fc <= 4000, n + ' ' + fc); });
        assert.ok(V.VPO_TONE_LOWPASS.trombone < V.VPO_TONE_LOWPASS.french_horn, 'le trombone ff est le plus brillant : il est le plus filtré');
    });
    test('fichier introuvable : promesse rejetée (l\'appli retombe sur les anciens sons)', async () => {
        global.window = { VPO_SAMPLES: {} };
        global.document = { createElement: () => ({ remove() {} }), head: { appendChild(el) { setImmediate(() => el.onerror()); } } };
        try { await assert.rejects(V.vpoLoadBrass(fakeCtx(), 'trumpet'), /introuvable/); } finally { cleanup(); }
    });
});
