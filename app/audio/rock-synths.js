// audio/rock-synths.js — instruments de l'orchestre Pop-Rock / Rock, en Web Audio pur (aucune dépendance au moteur ni au DOM) :
//   · ampli de guitare électrique (propre, crunch, saturé, lourd, surf) : le même échantillon de guitare passe dans une chaîne
//     préampli → saturation → haut-parleur, avec écho « slapback » pour le surf ;
//   · orgue à tirettes (type Hammond) : synthèse additive, percussion, claquement de touche, cabine Leslie (lente / rapide) ;
//   · ensemble de cordes (type « string machine » des années 70) : scies désaccordées, attaque lente, chœur d'ensemble.
// Les trois « instruments » ont la même interface que ceux de soundfont-player : play(note, quand, options) → { stop(quand) },
// avec les options déjà utilisées par l'appli (duration, gain, attack, release, cents).
// Chaque fabrique reçoit un contexte audio et une destination ; `tier` (0 complet, 1 allégé, 2 minimal) allège la synthèse.
// Chargé par index.html via <script src="app/audio/rock-synths.js"> et testé par audio/rock-synths.test.js (faux contexte audio).

// Nom de note (« C#4 », « Bb3 ») → numéro MIDI (C4 = 60), ou null.
function rsNoteToMidi(name) {
    if (typeof name === 'number') return Number.isFinite(name) ? name : null;
    const m = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(String(name || '').trim());
    if (!m) return null;
    const pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
    const acc = (m[2] === '#' || m[2] === '♯') ? 1 : (m[2] ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + pc + acc;
}
function rsMidiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// ---------------------------------------------------------------------------------------------------------------------
// Ampli de guitare
// ---------------------------------------------------------------------------------------------------------------------

// Courbe de saturation d'ampli à lampes : tanh, un peu asymétrique (la demi-onde négative sature plus tard : harmoniques paires,
// son plus « chaud »). k = gain de saturation.
function makeAmpCurve(k, asym = 0.18, n = 1024) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / (n - 1) - 1;
        c[i] = x >= 0 ? Math.tanh(k * x) : Math.tanh(k * (1 - asym) * x) / (1 - asym * 0.5);
    }
    return c;
}

// Réglages de chaque son d'ampli : dry = part propre, wet = part saturée (après trim), pre = gain avant saturation, k = saturation,
// hp = filtre de « serrage » des graves avant saturation (les graves saturés boueux), post = passe-bas après saturation,
// scoop = creux des médiums (dB à 700 Hz), bite = présence (dB à 2,6 kHz), air = aigus (dB à 3,5 kHz), slap = niveau de l'écho.
const AMP_TONES = {
    clean:  { dry: 1,    wet: 0,    pre: 1,    k: 1,  hp: 90,  post: 6500, scoop: 0,  bite: 1.5, air: 0,   slap: 0,    trim: 1,     level: 1.35 },
    crunch: { dry: 0.22, wet: 0.78, pre: 3.4,  k: 3,  hp: 150, post: 5200, scoop: 0,  bite: 3,   air: -1,  slap: 0,    trim: 0.268, level: 0.85 },
    drive:  { dry: 0,    wet: 1,    pre: 6.5,  k: 5,  hp: 190, post: 4800, scoop: -1, bite: 3.5, air: -2,  slap: 0,    trim: 0.10,  level: 0.62 },
    heavy:  { dry: 0,    wet: 1,    pre: 12,   k: 9,  hp: 260, post: 4300, scoop: -4, bite: 4,   air: -3,  slap: 0,    trim: 0.072, level: 0.6 },
    surf:   { dry: 1,    wet: 0,    pre: 1,    k: 1,  hp: 120, post: 7800, scoop: 0,  bite: 2.5, air: 5,   slap: 0.34, trim: 1,     level: 1.35 }
};

// Construit la chaîne d'ampli ; tout le son de la guitare entre par `input` et sort vers `destination`.
// Renvoie { input, setTone(nom), tone, nodes }.
function createGuitarAmp(ctx, destination, opts = {}) {
    const tier = opts.tier || 0;
    const mkF = (type, freq, gain, q) => {
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq;
        if (gain !== undefined) f.gain.value = gain;
        if (q !== undefined) f.Q.value = q;
        return f;
    };
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const pre = ctx.createGain();
    const tight = mkF('highpass', 150, undefined, 0.7);
    const shaper = ctx.createWaveShaper();
    shaper.oversample = tier >= 1 ? 'none' : '2x';
    const postLP = mkF('lowpass', 5000, undefined, 0.7);
    const wet = ctx.createGain();
    const sum = ctx.createGain();
    input.connect(dry); dry.connect(sum);
    input.connect(pre); pre.connect(tight); tight.connect(shaper); shaper.connect(postLP); postLP.connect(wet); wet.connect(sum);
    // haut-parleur : graves nettoyés, corps, médiums, présence, aigus tamisés
    const cabHP = mkF('highpass', 85, undefined, 0.7);
    const body = mkF('peaking', 120, 2.5, 1);
    const mid = mkF('peaking', 700, 0, 0.8);
    const bite = mkF('peaking', 2600, 3, 0.9);
    const air = mkF('highshelf', 3500, 0);
    const cabLP = mkF('lowpass', 6200, undefined, 0.6);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.2;
    const out = ctx.createGain();
    sum.connect(cabHP); cabHP.connect(body); body.connect(mid); mid.connect(bite); bite.connect(air); air.connect(cabLP); cabLP.connect(comp); comp.connect(out);
    out.connect(destination);
    // écho « slapback » (surf) : un seul retard avec un peu de réinjection
    const nodes = [input, dry, pre, tight, shaper, postLP, wet, sum, cabHP, body, mid, bite, air, cabLP, comp, out];
    let slap = null;
    if (tier < 2) {
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = 0.13;
        const fb = ctx.createGain(); fb.gain.value = 0.3;
        slap = ctx.createGain(); slap.gain.value = 0;
        cabLP.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(slap); slap.connect(out);
        nodes.push(delay, fb, slap);
    }
    const curves = {};
    const api = {
        input, nodes, tone: null,
        setTone(name) {
            const t = AMP_TONES[name] || AMP_TONES.clean;
            if (api.tone === name) return;
            api.tone = name in AMP_TONES ? name : 'clean';
            if (!curves[t.k]) curves[t.k] = makeAmpCurve(t.k);
            shaper.curve = curves[t.k];
            dry.gain.value = t.dry; pre.gain.value = t.pre; wet.gain.value = t.wet * t.trim;
            tight.frequency.value = t.hp; postLP.frequency.value = t.post;
            mid.gain.value = t.scoop; bite.gain.value = t.bite; air.gain.value = t.air;
            if (slap) slap.gain.value = t.slap;
            out.gain.value = t.level;
        }
    };
    api.setTone(opts.tone || 'clean');
    return api;
}

// ---------------------------------------------------------------------------------------------------------------------
// Orgue à tirettes (Hammond)
// ---------------------------------------------------------------------------------------------------------------------

// Rapports de fréquence des neuf tirettes : 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1'.
const ORGAN_DRAWBAR_RATIOS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
// Registrations (niveau de chaque tirette, 0 à 8) : « 888000000 » du rock, jazz « 888600000 », plein jeu « 888888888 », doux « 008400000 ».
const ORGAN_REGISTRATIONS = {
    rock: [8, 8, 8, 0, 0, 0, 0, 0, 0],
    full: [8, 8, 8, 6, 4, 5, 3, 3, 4],
    jazz: [8, 8, 8, 6, 0, 0, 0, 0, 0],
    soft: [0, 0, 8, 4, 0, 0, 0, 0, 0]
};

// Cabine Leslie : un haut-parleur tournant donne un tremblement d'amplitude et un petit vibrato. Lente (chorale) ou rapide (tremolo).
// Un peu de saturation de la lampe optionnelle (drive : 0 = aucune, 1 = « overdrive » de l'orgue du hard rock).
function createOrganBus(ctx, destination, opts = {}) {
    const tier = opts.tier || 0;
    const input = ctx.createGain();
    const nodes = [input];
    const out = ctx.createGain();
    nodes.push(out);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; lp.Q.value = 0.6;
    nodes.push(hp, lp);
    let head = input;
    let shaper = null;
    if (opts.drive && tier < 2) {
        shaper = ctx.createWaveShaper();
        shaper.curve = makeAmpCurve(2.6, 0.1);
        shaper.oversample = tier >= 1 ? 'none' : '2x';
        const pre = ctx.createGain(); pre.gain.value = 1.8;
        const post = ctx.createGain(); post.gain.value = 0.34;
        input.connect(pre); pre.connect(shaper); shaper.connect(post);
        head = post; nodes.push(pre, shaper, post);
    }
    const api = { input, nodes, speed: 'slow', setSpeed() {}, setDrive() {} };
    if (tier >= 2) {
        head.connect(hp); hp.connect(lp); lp.connect(out); out.connect(destination);
        return api;
    }
    // Leslie : deux voies. Le tremblement (AM) module le niveau, le vibrato module un retard court.
    const trem = ctx.createGain(); trem.gain.value = 0.82;
    const vib = ctx.createDelay(0.05); vib.delayTime.value = 0.004;
    const dry = ctx.createGain(); dry.gain.value = 0.62;
    const wetV = ctx.createGain(); wetV.gain.value = 0.5;
    const lfoT = ctx.createOscillator(); lfoT.type = 'sine'; lfoT.frequency.value = 0.8;
    const lfoTg = ctx.createGain(); lfoTg.gain.value = 0.14;
    const lfoV = ctx.createOscillator(); lfoV.type = 'sine'; lfoV.frequency.value = 0.8;
    const lfoVg = ctx.createGain(); lfoVg.gain.value = 0.0011;
    lfoT.connect(lfoTg); lfoTg.connect(trem.gain);
    lfoV.connect(lfoVg); lfoVg.connect(vib.delayTime);
    head.connect(trem); trem.connect(dry); dry.connect(hp);
    head.connect(vib); vib.connect(wetV); wetV.connect(hp);
    hp.connect(lp); lp.connect(out); out.connect(destination);
    lfoT.start(0); lfoV.start(0);
    nodes.push(trem, vib, dry, wetV, lfoT, lfoTg, lfoV, lfoVg);
    api.setSpeed = (speed) => {
        const fast = speed === 'fast';
        api.speed = fast ? 'fast' : 'slow';
        const f = fast ? 6.6 : 0.8, now = ctx.currentTime || 0;
        lfoT.frequency.setTargetAtTime(f, now, fast ? 0.5 : 1.2);   // un vrai Leslie met un moment à prendre de la vitesse
        lfoV.frequency.setTargetAtTime(f, now, fast ? 0.5 : 1.2);
        lfoTg.gain.setTargetAtTime(fast ? 0.2 : 0.12, now, 0.5);
        lfoVg.gain.setTargetAtTime(fast ? 0.0006 : 0.0011, now, 0.5);
    };
    return api;
}

// Instrument « orgue » : une note = une oscillation sinusoïdale par tirette tirée, un claquement de touche et une percussion
// (3e harmonique qui s'éteint). Attaque et relâchement quasi instantanés, comme sur un vrai orgue.
function createOrganInstrument(ctx, bus, opts = {}) {
    const tier = opts.tier || 0;
    const reg = (typeof opts.registration === 'string' ? ORGAN_REGISTRATIONS[opts.registration] : opts.registration) || ORGAN_REGISTRATIONS.rock;
    let noiseBuf = null;
    const noise = () => {
        if (noiseBuf) return noiseBuf;
        noiseBuf = ctx.createBuffer(1, Math.floor((ctx.sampleRate || 44100) * 0.1), ctx.sampleRate || 44100);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return noiseBuf;
    };
    return {
        bus, registration: reg,
        play(note, when, o = {}) {
            const midi = rsNoteToMidi(note);
            if (midi === null) return { stop() {} };
            const f0 = rsMidiToFreq(midi) * Math.pow(2, (o.cents || 0) / 1200);
            const t0 = Math.max(when || 0, ctx.currentTime || 0);
            const dur = Math.max(0.05, o.duration === undefined ? 0.5 : o.duration);
            const peak = Math.max(0.0002, (o.gain === undefined ? 0.5 : o.gain) * 0.06);
            const att = Math.max(0.002, o.attack === undefined ? 0.006 : o.attack);
            const rel = Math.max(0.02, o.release === undefined ? 0.07 : o.release);
            const end = t0 + dur;
            const out = ctx.createGain();
            out.gain.setValueAtTime(0.0001, t0);
            out.gain.linearRampToValueAtTime(peak, t0 + att);
            out.gain.setValueAtTime(peak, Math.max(t0 + att, end));
            out.gain.exponentialRampToValueAtTime(0.0001, end + rel);
            out.connect(bus.input);
            const srcs = [];
            // tirettes : au niveau minimal, les deux plus fortes seulement ; au niveau allégé, pas plus de quatre
            const order = reg.map((lvl, i) => [lvl, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
            const used = tier >= 2 ? order.slice(0, 2) : (tier === 1 ? order.slice(0, 4) : order);
            used.forEach(([lvl, i]) => {
                const fr = f0 * ORGAN_DRAWBAR_RATIOS[i];
                if (fr > 12000) return;
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = fr;
                const g = ctx.createGain();
                g.gain.value = (lvl / 8) * (i === 0 ? 0.9 : 1);
                osc.connect(g); g.connect(out);
                osc.start(t0); osc.stop(end + rel + 0.05);
                srcs.push(osc);
            });
            if (tier < 1) {
                // percussion : 3e harmonique (la tirette de 2⅔'), forte à l'attaque puis éteinte en 0,28 s
                const p = ctx.createOscillator();
                p.type = 'sine'; p.frequency.value = f0 * 3;
                const pg = ctx.createGain();
                pg.gain.setValueAtTime(0.0001, t0);
                pg.gain.linearRampToValueAtTime(0.5, t0 + 0.003);
                pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
                p.connect(pg); pg.connect(out);
                p.start(t0); p.stop(t0 + 0.32);
                srcs.push(p);
                // claquement de touche : un souffle très bref, filtré autour de 2,5 kHz
                const n = ctx.createBufferSource();
                n.buffer = noise();
                const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 1.2;
                const ng = ctx.createGain();
                ng.gain.setValueAtTime(0.0001, t0);
                ng.gain.linearRampToValueAtTime(0.35, t0 + 0.001);
                ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012);
                n.connect(bp); bp.connect(ng); ng.connect(out);
                n.start(t0, Math.random() * 0.05); n.stop(t0 + 0.02);
                srcs.push(n);
            }
            return {
                stop(when2) {
                    const t = Math.max(when2 || 0, ctx.currentTime || 0);
                    try { out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0.0001, t, 0.01); } catch (e) {}
                    srcs.forEach(s => { try { s.stop(t + 0.06); } catch (e) {} });
                }
            };
        }
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ensemble de cordes (« string machine »)
// ---------------------------------------------------------------------------------------------------------------------

// Bus : chœur d'ensemble (trois retards modulés lentement, qui donnent l'épaisseur de plusieurs violons), passe-haut et passe-bas doux.
function createStringsBus(ctx, destination, opts = {}) {
    const tier = opts.tier || 0;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.6;
    const nodes = [input, out, hp, lp];
    input.connect(hp);
    if (tier >= 1) {
        hp.connect(lp); lp.connect(out); out.connect(destination);
        return { input, nodes };
    }
    const dry = ctx.createGain(); dry.gain.value = 0.55;
    hp.connect(dry); dry.connect(lp);
    [[0.013, 0.5, 0.0028], [0.018, 0.63, 0.0033], [0.024, 0.77, 0.0038]].forEach(([base, rate, depth], k) => {
        const d = ctx.createDelay(0.08); d.delayTime.value = base;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = rate;
        const lg = ctx.createGain(); lg.gain.value = depth;
        const w = ctx.createGain(); w.gain.value = 0.36;
        lfo.connect(lg); lg.connect(d.delayTime);
        hp.connect(d); d.connect(w); w.connect(lp);
        lfo.start(0 + k * 0.01);
        nodes.push(d, lfo, lg, w);
    });
    lp.connect(out); out.connect(destination);
    nodes.push(dry);
    return { input, nodes };
}

// Instrument « cordes » : par note, deux scies légèrement désaccordées à l'unisson et une troisième à l'octave supérieure (plus douce),
// passées dans un passe-bas qui s'ouvre avec l'attaque (le timbre s'éclaire quand l'archet prend de la vitesse).
function createStringsInstrument(ctx, bus, opts = {}) {
    const tier = opts.tier || 0;
    return {
        bus,
        play(note, when, o = {}) {
            const midi = rsNoteToMidi(note);
            if (midi === null) return { stop() {} };
            const f0 = rsMidiToFreq(midi) * Math.pow(2, (o.cents || 0) / 1200);
            const t0 = Math.max(when || 0, ctx.currentTime || 0);
            const dur = Math.max(0.08, o.duration === undefined ? 1 : o.duration);
            const att = Math.max(0.01, o.attack === undefined ? 0.3 : o.attack);
            const rel = Math.max(0.05, o.release === undefined ? 0.5 : o.release);
            const peak = Math.max(0.0002, (o.gain === undefined ? 0.5 : o.gain) * 0.062);
            const end = t0 + dur;
            const out = ctx.createGain();
            out.gain.setValueAtTime(0.0001, t0);
            out.gain.linearRampToValueAtTime(peak, t0 + att);
            out.gain.setValueAtTime(peak, Math.max(t0 + att, end));
            out.gain.exponentialRampToValueAtTime(0.0001, end + rel);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.Q.value = 0.6;
            lp.frequency.setValueAtTime(900, t0);
            lp.frequency.exponentialRampToValueAtTime(Math.min(4200, 1500 + f0 * 3), t0 + att * 1.2);
            lp.connect(out); out.connect(bus.input);
            const layers = tier >= 1 ? [[0, 1, 'sawtooth']] : [[-7, 1, 'sawtooth'], [7, 1, 'sawtooth'], [1200 - 3, 0.35, 'sawtooth']];
            const srcs = [];
            layers.forEach(([cents, amp, type]) => {
                const osc = ctx.createOscillator();
                osc.type = type; osc.frequency.value = f0; osc.detune.value = cents;
                const g = ctx.createGain(); g.gain.value = amp;
                osc.connect(g); g.connect(lp);
                osc.start(t0); osc.stop(end + rel + 0.05);
                srcs.push(osc);
            });
            return {
                stop(when2) {
                    const t = Math.max(when2 || 0, ctx.currentTime || 0);
                    try { out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0.0001, t, 0.05); } catch (e) {}
                    srcs.forEach(s => { try { s.stop(t + 0.3); } catch (e) {} });
                }
            };
        }
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rsNoteToMidi, rsMidiToFreq, makeAmpCurve, AMP_TONES, createGuitarAmp,
        ORGAN_DRAWBAR_RATIOS, ORGAN_REGISTRATIONS, createOrganBus, createOrganInstrument,
        createStringsBus, createStringsInstrument };
}
