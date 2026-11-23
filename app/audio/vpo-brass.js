// vpo-brass.js — cuivres de l'orchestre Brass band : échantillons de la bibliothèque libre « Virtual Playing Orchestra »
// (VPO, Paul Battersby, virtualplaying.com) : trompette, cor et trombone de l'Université d'Iowa, tuba de Sonatina Symphonic
// Orchestra. Chargé par index.html après local-soundfonts.js ; le service worker (sw.js) le charge aussi (importScripts)
// pour connaître la liste des fichiers à garder en cache. Testé par vpo-brass.test.js.
//
// Les fichiers app/sounds/VPO/<nom>.js ont été préparés à partir des WAV de VPO (voir app/sounds/VPO/LISEZMOI.txt) :
//  - une note échantillonnée tous les 3 demi-tons environ (la hauteur des notes intermédiaires est ajustée à la lecture) ;
//  - notes tenues : l'échantillon s'arrête à la fin de sa boucle ; ls / le = début / fin de boucle (secondes), lue en
//    boucle tant que la note dure — la durée d'une note n'est donc plus limitée à celle de l'enregistrement ;
//  - tuba_stc : notes courtes du tuba (non bouclées) ;
//  - g = gain qui ramène l'instrument au niveau des anciens sons (MusyngKite), pour garder l'équilibre du mixage.
// Cordes : violon.js (notes tenues avec vibrato, bouclées), violon_stc → violin_stc.js (spiccato, notes courtes non bouclées, une
// note tous les 3 demi-tons) et contrabass.js (notes tenues bouclées). Les réglages d'égaliseur et de volume des .sfz sont déjà
// appliqués dans les fichiers, et le niveau de chaque note est égalisé. Leur timbre est proche de celui des anciens sons : aucun filtre.
// Les articulations « staccato » de la trompette, du cor et du trombone n'ont pas d'enregistrement à part dans VPO : ce sont
// les mêmes notes, jouées plus courtes (c'est la durée et l'enveloppe de chaque frappe qui font la différence).
//
// L'instrument renvoyé a la même interface que ceux de soundfont-player : play(note, quand, options) → { stop(quand) },
// avec les options déjà utilisées par l'appli (duration, gain, attack, decay, sustain, release, cents, destination), plus :
// offset (début de lecture dans l'échantillon, s), swell (profil d'archet, voir vpoEnvelope) et xfade (note longue jouée en
// passages enchaînés plutôt qu'en boucle courte, voir vpoGrainPlan).
// Si un fichier manque, la promesse est rejetée et l'appli retombe sur les anciens sons (voir loadBrass dans index.html).

const VPO_BRASS_DIR = 'app/sounds/VPO';
const VPO_BRASS_NAMES = ['trumpet', 'french_horn', 'trombone', 'tuba', 'tuba_stc'];
// Cordes frottées du quinteto de tango (orchestre Piazzolla) : violon tenu, violon spiccato (notes courtes) et contrebasse à l'archet.
const VPO_STRING_NAMES = ['violin', 'violin_stc', 'contrabass'];
const VPO_BRASS_FILES = VPO_BRASS_NAMES.map((n) => VPO_BRASS_DIR + '/' + n + '.js');
// Tous les fichiers de sons VPO (cuivres + cordes) : c'est la liste que le service worker garde en cache pour le hors-ligne.
const VPO_ALL_FILES = VPO_BRASS_NAMES.concat(VPO_STRING_NAMES).map((n) => VPO_BRASS_DIR + '/' + n + '.js');

// Timbre : les échantillons VPO de la nuance ff sont des cuivres joués à pleine puissance, très riches dans l'aigu. Le trombone
// avait environ 24 dB d'énergie de plus entre 2 et 4 kHz, et 40 dB de plus au-dessus de 4 kHz, que les anciens sons sur lesquels
// l'orchestre a été réglé : c'est ce qu'on entendait comme un « buzz » désagréable. Le cor avait 11 dB (2-4 kHz) et 21 dB (4-8 kHz)
// de trop. Un filtre passe-bas de pente 24 dB par octave (deux filtres de Butterworth en série), propre à chaque instrument,
// ramène le spectre à celui de l'orchestre. Valeurs trouvées en comparant le spectre moyen de chaque instrument à l'ancien
// (voir sounds/VPO/LISEZMOI.txt). Pour assombrir ou éclaircir un instrument, c'est cette fréquence (en Hz) qu'il faut changer.
const VPO_TONE_LOWPASS = { trumpet: null, french_horn: 2200, trombone: 1250, tuba: 3000, tuba_stc: 3000, violin: null, violin_stc: null, contrabass: null };
const VPO_TONE_STAGES = 2;
const VPO_TONE_Q_DB = -3.0103;   // le « Q » d'un passe-bas Web Audio s'exprime en dB : −3 dB = Butterworth (aucune bosse)

// Nom de note (« C#4 », « Bb3 », « B♭3 ») → numéro MIDI (C4 = 60), ou null.
function vpoNoteToMidi(name) {
    if (typeof name === 'number') return Number.isFinite(name) ? name : null;
    const m = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(String(name || '').trim());
    if (!m) return null;
    const pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
    const acc = (m[2] === '#' || m[2] === '♯') ? 1 : (m[2] ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + pc + acc;
}

// Échantillon le plus proche (en demi-tons) de la note demandée ; à égalité, celui du dessus (on baisse la hauteur plutôt
// que de la monter : le timbre reste plus naturel).
function vpoNearestKey(keys, midi) {
    let best = null;
    keys.forEach((k) => {
        const d = Math.abs(k - midi);
        if (best === null || d < Math.abs(best - midi) || (d === Math.abs(best - midi) && k > best)) best = k;
    });
    return best;
}

// Enveloppe d'une note : suite de points { t (secondes depuis le début), v (niveau) } reliés en ligne droite, puis relâchement
// exponentiel. `duration` absent = note tenue jusqu'à stop(). Renvoie aussi le niveau à l'instant du relâchement.
// o.swell (0 à 1, facultatif) : profil d'une note tenue à l'archet (voir plus bas).
function vpoEnvelope(o) {
    const gain = o.gain, attack = Math.max(0.002, o.attack), decay = Math.max(0.002, o.decay);
    const sus = gain * o.sustain, dur = o.duration, sw = Math.max(0, Math.min(1, o.swell || 0));
    const pts = [{ t: 0, v: 0 }];
    if (dur === undefined || dur === null) {
        pts.push({ t: attack, v: gain }, { t: attack + decay, v: sus });
        return { points: pts, releaseAt: null, releaseLevel: sus, release: o.release };
    }
    let level;
    if (dur <= attack) { level = gain * dur / attack; pts.push({ t: dur, v: level }); }
    else if (dur <= attack + decay) {
        level = gain + (sus - gain) * (dur - attack) / decay;
        pts.push({ t: attack, v: gain }, { t: dur, v: level });
    } else if (sw > 0 && dur - attack - decay > 0.5) {
        // note longue jouée à l'archet (o.swell, 0 à 1) : l'attaque ne fait pas de pic, le son s'ouvre jusqu'aux deux tiers
        // de la note puis se retire un peu avant le relâchement (au lieu d'un niveau plat, qui sonne « clavier »)
        const a = attack + decay;
        level = sus * (1 - 0.12 * sw);
        pts.push({ t: attack, v: gain * (1 - 0.18 * sw) }, { t: a, v: sus * (1 - 0.2 * sw) },
            { t: a + (dur - a) * 0.6, v: Math.min(gain, sus * (1 + 0.1 * sw)) }, { t: dur, v: level });
    } else {
        level = sus;
        pts.push({ t: attack, v: gain }, { t: attack + decay, v: sus }, { t: dur, v: sus });
    }
    return { points: pts, releaseAt: dur, releaseLevel: level, release: o.release };
}

// Note longue sans boucle courte (option xfade) : les boucles des fichiers ne durent souvent que 0,2 à 1 s, et leur répétition
// (le même coup de vibrato qui revient à l'identique) s'entend comme un son mécanique. On joue d'abord l'enregistrement tel quel,
// puis des passages de 0,5 à 1,3 s pris au hasard dans sa partie tenue (après l'attaque), enchaînés par des fondus à puissance
// constante et très légèrement désaccordés les uns des autres (± 3 cents) : le vibrato et le grain de l'archet restent vivants.
// Renvoie la liste des passages { at (s depuis le début de la note), from (s dans l'échantillon), len (s réelles), fadeIn,
// fadeOut, cents } qui couvrent `total` secondes ; rate = vitesse de lecture (hauteur).
function vpoGrainPlan(bufDur, loopStart, rate, offset, total, rand) {
    const end = bufDur - 0.02;
    const r0 = Math.min(Math.max(0.3, loopStart * 0.35), end - 0.4);
    const regionBuf = Math.max(0.2, end - r0);
    const maxLen = Math.min(1.3, regionBuf / rate);
    const X = Math.min(0.25, maxLen / 4);
    const first = Math.max(2 * X + 0.01, (end - offset) / rate);
    const out = [{ at: 0, from: offset, len: first, fadeIn: 0, fadeOut: X, cents: 0 }];
    let t = first - X;
    while (t < total && out.length < 64) {
        const len = maxLen * (0.65 + 0.35 * rand());
        const from = r0 + rand() * Math.max(0, regionBuf - len * rate);
        out.push({ at: t, from, len, fadeIn: X, fadeOut: X, cents: (rand() - 0.5) * 6 });
        t += len - X;
    }
    return out;
}

// Fondus à puissance constante d'un passage (gain : 0 → 1 en fadeIn, 1 → 0 sur les fadeOut dernières secondes).
const VPO_FADE_N = 16;
const vpoFadeIn = new Float32Array(VPO_FADE_N), vpoFadeOut = new Float32Array(VPO_FADE_N);
for (let i = 0; i < VPO_FADE_N; i++) {
    const x = i / (VPO_FADE_N - 1);
    vpoFadeIn[i] = Math.sin(x * Math.PI / 2); vpoFadeOut[i] = Math.cos(x * Math.PI / 2);
}
// (aucun autre événement sur le paramètre : setValueCurveAtTime refuse tout chevauchement)
function vpoGrainFades(param, at, len, fadeIn, fadeOut) {
    param.value = fadeIn > 0 ? 0 : 1;
    if (fadeIn > 0) param.setValueCurveAtTime(vpoFadeIn, at, fadeIn);
    if (fadeOut > 0) param.setValueCurveAtTime(vpoFadeOut, at + len - fadeOut, fadeOut);
}

// --- Chargement des fichiers (balise <script> : marche en https, en localhost et en double-clic file://) ---
const vpoPendingScripts = new Map();
function vpoLoadScript(name) {
    const url = VPO_BRASS_DIR + '/' + name + '.js';
    if (vpoPendingScripts.has(url)) return vpoPendingScripts.get(url);
    const p = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.async = true;
        el.onload = () => {
            const set = window.VPO_SAMPLES && window.VPO_SAMPLES[name];
            if (window.VPO_SAMPLES) delete window.VPO_SAMPLES[name]; // une fois décodés, inutile de garder le texte en mémoire
            el.remove();
            if (set && set.s) resolve(set); else reject(new Error('Fichier de son vide : ' + url));
        };
        el.onerror = () => { el.remove(); reject(new Error('Fichier de son introuvable : ' + url)); };
        el.src = url;
        document.head.appendChild(el);
    });
    vpoPendingScripts.set(url, p);
    const forget = () => vpoPendingScripts.delete(url);
    p.then(forget, forget);
    return p;
}

// Échantillons décodés, partagés entre les instruments d'un même contexte audio (le 2e cornet reprend ceux du 1er).
const vpoDecoded = new WeakMap();
function vpoDecodeSet(ctx, name) {
    let byName = vpoDecoded.get(ctx);
    if (!byName) { byName = new Map(); vpoDecoded.set(ctx, byName); }
    if (byName.has(name)) return byName.get(name);
    const p = vpoLoadScript(name).then((set) => {
        const keys = Object.keys(set.s);
        return Promise.all(keys.map((k) => {
            const e = set.s[k];
            const bin = atob(e.d.slice(e.d.indexOf(',') + 1));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            // forme à promesse ET à rappel : Safari ancien n'a que les rappels
            return new Promise((res, rej) => {
                const r = ctx.decodeAudioData(bytes.buffer, res, rej);
                if (r && typeof r.then === 'function') r.then(res, rej);
            }).then((buffer) => ({ key: e.k, tune: e.c || 0, buffer, ls: e.ls, le: e.le }));
        })).then((list) => ({ gain: set.g || 1, samples: new Map(list.map((s) => [s.key, s])) }));
    });
    byName.set(name, p);
    p.catch(() => byName.delete(name)); // un échec n'est pas gardé : on pourra réessayer
    return p;
}

// Charge un instrument (« trumpet », « french_horn », « trombone », « tuba », « tuba_stc », « violin », « violin_stc », « contrabass ») dont la sortie va vers
// opts.destination (sinon la sortie du contexte audio).
function vpoLoadBrass(ctx, name, opts) {
    let destination = (opts && opts.destination) || ctx.destination;
    // une chaîne de filtres par instrument, partagée par toutes ses notes (peu coûteux)
    const fc = VPO_TONE_LOWPASS[name];
    if (fc) {
        const out = destination;
        const filters = [];
        for (let i = 0; i < VPO_TONE_STAGES; i++) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = fc; f.Q.value = VPO_TONE_Q_DB;
            if (filters.length) filters[filters.length - 1].connect(f);
            filters.push(f);
        }
        filters[filters.length - 1].connect(out);
        destination = filters[0];
    }
    return vpoDecodeSet(ctx, name).then((set) => {
        const keys = [...set.samples.keys()];
        return {
            name,
            play(noteStr, when, o) {
                o = o || {};
                const midi = vpoNoteToMidi(noteStr);
                if (midi === null) return null;
                const smp = set.samples.get(vpoNearestKey(keys, midi));
                const t0 = Math.max(ctx.currentTime, when || 0);
                const cents = (midi - smp.key) * 100 + smp.tune + (o.cents || 0);
                const rate = Math.pow(2, cents / 1200);
                const hasLoop = smp.ls !== undefined && smp.le !== undefined;
                // o.offset : la lecture commence un peu après le début de l'échantillon (note liée : sans nouvelle attaque d'archet)
                const offset = Math.max(0, Math.min(o.offset || 0, hasLoop ? smp.ls * 0.8 : smp.buffer.duration * 0.5));
                const relTime = Math.max(0.01, o.release === undefined ? 0.3 : o.release);
                const total = (o.duration === undefined || o.duration === null) ? null : o.duration + relTime + 0.05;
                const natural = (smp.buffer.duration - offset) / rate;
                const plan = (o.xfade && hasLoop && total !== null && total > natural - 0.05)
                    ? vpoGrainPlan(smp.buffer.duration, smp.ls, rate, offset, total, Math.random) : null;
                const srcs = [];
                let src = null;
                if (!plan) {
                    src = ctx.createBufferSource();
                    src.buffer = smp.buffer;
                    // hauteur : écart en demi-tons + accord propre à l'échantillon (« tune » de VPO) + désaccord demandé par la frappe
                    src.playbackRate.value = rate;
                    if (hasLoop) { src.loop = true; src.loopStart = smp.ls; src.loopEnd = smp.le; }
                    srcs.push(src);
                }
                const env = vpoEnvelope({
                    gain: (o.gain === undefined ? 1 : o.gain) * set.gain,
                    attack: o.attack === undefined ? 0.01 : o.attack,
                    decay: o.decay === undefined ? 0.1 : o.decay,
                    sustain: o.sustain === undefined ? 0.9 : o.sustain,
                    release: o.release === undefined ? 0.3 : o.release,
                    duration: o.duration,
                    swell: o.swell
                });
                const g = ctx.createGain();
                const p = g.gain;
                p.setValueAtTime(0, t0);
                env.points.slice(1).forEach((pt) => p.linearRampToValueAtTime(pt.v, t0 + pt.t));
                g.connect(o.destination || destination);
                if (plan) {
                    // note longue : passages successifs de la partie tenue de l'enregistrement, en fondu enchaîné (pas de boucle courte)
                    plan.forEach((gr) => {
                        const sn = ctx.createBufferSource();
                        sn.buffer = smp.buffer;
                        sn.playbackRate.value = Math.pow(2, (cents + gr.cents) / 1200);
                        const gg = ctx.createGain();
                        vpoGrainFades(gg.gain, t0 + gr.at, gr.len, gr.fadeIn, gr.fadeOut);
                        sn.connect(gg); gg.connect(g);
                        sn.start(t0 + gr.at, gr.from);
                        try { sn.stop(t0 + gr.at + gr.len + 0.01); } catch (e) {}
                        sn.onended = () => { try { gg.disconnect(); } catch (e) {} };
                        srcs.push(sn);
                    });
                    src = srcs[srcs.length - 1];
                } else {
                    src.connect(g);
                    src.start(t0, offset);
                }
                const finish = (tEnd) => { srcs.forEach((x) => { try { x.stop(tEnd); } catch (e) {} }); };
                if (env.releaseAt !== null) {
                    const tr = t0 + env.releaseAt, rel = Math.max(0.01, env.release);
                    p.setValueAtTime(env.releaseLevel, tr);
                    p.exponentialRampToValueAtTime(Math.max(1e-5, env.releaseLevel * 0.001), tr + rel);
                    p.setValueAtTime(0, tr + rel + 0.001);
                    finish(tr + rel + 0.02);
                }
                src.onended = () => { try { g.disconnect(); } catch (e) {} };
                return {
                    // coupure (fin de la jam) : fondu très court à partir de maintenant, ou à l'instant `quand`
                    stop(quand) {
                        const t = Math.max(ctx.currentTime, quand || 0);
                        try {
                            if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
                            else p.cancelScheduledValues(t);
                            p.setTargetAtTime(0, t, 0.02);
                        } catch (e) {}
                        finish(t + 0.15);
                    }
                };
            }
        };
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VPO_BRASS_DIR, VPO_BRASS_NAMES, VPO_STRING_NAMES, VPO_ALL_FILES, VPO_BRASS_FILES, VPO_TONE_LOWPASS, vpoNoteToMidi, vpoNearestKey, vpoEnvelope, vpoGrainPlan, vpoLoadBrass, vpoLoadScript };
}
