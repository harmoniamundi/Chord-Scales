// audio/drum-synths.js — synthèse des percussions du groupe (grosse caisse, caisse claire, charleston, cymbales, toms, percussions
// latines, fanfare, Balkans, tango, cumbia), en Web Audio pur : aucune dépendance au moteur ni au DOM.
// Chaque synthé reçoit un « rt » (runtime audio) décrivant l'environnement de synthèse :
//   rt.ctx      contexte audio (AudioContext, ou OfflineAudioContext pour les percussions pré-calculées)
//   rt.tier     niveau de qualité (0 complet, 1 allégé, 2 minimal)
//   rt.nodes    tableau où l'on range les sources démarrées (pour pouvoir les couper à l'arrêt)
//   rt.noise()  tampon de bruit blanc partagé ;  rt.curve()  courbe de saturation partagée
//   rt.reverb() entrée de la réverbération des cymbales
// puis (time, destination, …). Chargé par index.html via <script src="audio/drum-synths.js"> et testé par
// audio/drum-synths.test.js avec un faux contexte audio qui enregistre les nœuds créés.

// Tampon de bruit blanc d'une seconde.
function makeNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
}

// Courbe de saturation douce (waveshaper) utilisée pour donner du corps
// et un peu de grain analogique à la grosse caisse et à la caisse claire.
function makeSaturationCurve() {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = Math.tanh(2.2 * x);
    }
    return curve;
}

// Retourne { drum, mul, freq, short, name, variants, maxDur, long } décrivant l'échantillon d'un coup, ou null.
function drumSpec(e) {
    let drum = e.drum, mul = 1;
    if (drum === 'pedal') { drum = 'hat'; mul = 0.8; }
    const MAXDUR = { kick: 0.5, snare: 0.35, ghost: 0.25, hat: 0.15, ohat: 0.65, ride: 1.3, crash: 2.9, clash: 1.1, rim: 0.12,
        tom1: 0.45, tom2: 0.45, tom3: 0.45, bell: 0.3, clave: 0.15, conga1: 0.2, conga2: 0.4, slap: 0.15, shaker: 0.12,
        bdrum: 0.75, golpe: 0.25, chich: 0.3, latigo: 0.3, dum: 0.7, tek: 0.7, ka: 0.7, tapan: 0.7, stick: 0.7, daire: 0.7,
        cajonb: 0.35, cajont: 0.25, palma: 0.22, sorda: 0.15, pito: 0.12,
        shell: 0.1, guiro: 0.16, guirot: 0.06, bongoh: 0.14, bongol: 0.18,
        guacd: 0.16, guacu: 0.1, llam: 0.12, llamo: 0.35, tamb: 0.55, palo: 0.1,
        rkick: 0.42, rsnare: 0.34, rghost: 0.16, rtom1: 0.45, rtom2: 0.5, rtom3: 0.55, rtom4: 0.6, tmb: 0.24, tmbs: 0.12, clap: 0.34,
        surdo: 0.9, surdom: 0.2, tamborim: 0.1, pandj: 0.1, pandg: 0.27, pandt: 0.14, ganza: 0.1, agogoh: 0.3, agogol: 0.3 }; // samba : surdo ouvert / étouffé, tamborim, pandeiro (platinelas, pouce, tapa), ganzá, agogô aigu / grave // kit rock : rkick/rsnare/rghost (grosse caisse, caisse claire, note fantôme), rtom1 à rtom4 (toms du plus aigu au plus grave), tmb/tmbs (tambourin : coup, petite secousse), clap (claquement de mains)
    // cumbia : guacharaca (guacd descendant, guacu ascendant), llamador (llam étouffé, llamo ouvert), tambora (tamb grave, palo baguette sur le bois) ; // cajonb/cajont : cajón flamenco (grave, claqué) ; palma/sorda : palmas claires/sourdes ; pito : claquement de doigts ; shell : cáscara (flanc du timbal) ; guiro/guirot : güiro, coup long / court ; bongoh/bongol : bongó aigu (hembra) / grave (macho)
    let maxDur = MAXDUR[drum], name = drum, freq, short;
    if (drum === 'timp') {
        freq = e.freq || 98; short = !!e.short;
        maxDur = short ? 0.75 : 2.1;
        name = 'timp' + freq + (short ? 's' : 'l');
    }
    if (!maxDur) return null;
    const variants = (drum === 'snare' || drum === 'ghost' || drum === 'tom1' || drum === 'tom2' || drum === 'tom3' || drum === 'cajonb' || drum === 'cajont' || drum === 'palma' || drum === 'sorda' || drum === 'guacd' || drum === 'guacu' || drum === 'llam' || drum === 'llamo' || drum === 'tamb' || drum === 'palo' || drum === 'rsnare' || drum === 'rghost' || drum === 'tmb' || drum === 'tmbs' || drum === 'clap'
        || drum === 'surdo' || drum === 'surdom' || drum === 'tamborim' || drum === 'pandg' || drum === 'pandt' || drum === 'ganza') ? 2
        : (drum === 'pandj' ? 3 // les platinelas jouent toutes les doubles croches : trois variantes évitent l'effet « mitraillette »
        : ((drum === 'rtom1' || drum === 'rtom2' || drum === 'rtom3' || drum === 'rtom4') ? 3 : 1)); // hauteur légèrement aléatoire à chaque coup
    return { drum, mul, freq, short, name, variants, maxDur, long: maxDur >= 0.8 };
}

// Joue un coup de percussion décrit par e ({ drum, freq?, short? }) avec la synthèse correspondante.
function synthDrumLive(rt, e, time, dest, v) {
    switch (e.drum) {
        case 'kick': synthKick(rt, time, dest, v); break;
        case 'snare': synthSnare(rt, time, dest, false, v); break;
        case 'ghost': synthSnare(rt, time, dest, true, v); break;
        case 'hat': synthHihat(rt, time, dest, false, v); break;
        case 'pedal': synthHihat(rt, time, dest, false, v * 0.8); break;
        case 'ohat': synthHihat(rt, time, dest, true, v); break;
        case 'ride': synthCymbal(rt, time, dest, 1.0, v, 5500); break;
        case 'crash': synthCymbal(rt, time, dest, 2.6, v, 3500); break;
        case 'rim': synthRim(rt, time, dest, v); break;
        case 'tom1': synthTom(rt, time, dest, 160, v); break;
        case 'tom2': synthTom(rt, time, dest, 120, v); break;
        case 'tom3': synthTom(rt, time, dest, 88, v); break;
        case 'bell': synthCowbell(rt, time, dest, v); break;
        case 'clave': synthClave(rt, time, dest, v); break;
        case 'conga1': synthConga(rt, time, dest, 430, 0.1, v); break;
        case 'conga2': synthConga(rt, time, dest, 300, 0.3, v); break;
        case 'slap': synthSlap(rt, time, dest, v); break;
        case 'shaker': synthShaker(rt, time, dest, v); break;
        case 'bdrum': synthBassDrum(rt, time, dest, v); break;
        case 'timp': synthTimp(rt, time, dest, e.freq || 98, v, e.short ? 0.5 : 1.8); break;
        case 'clash': synthCymbal(rt, time, dest, 0.8, v, 4200); break;
        case 'golpe': synthGolpe(rt, time, dest, v); break;
        case 'chich': synthChicharra(rt, time, dest, v); break;
        case 'latigo': synthLatigo(rt, time, dest, v); break;
        case 'cajonb': synthCajonBass(rt, time, dest, v); break;
        case 'cajont': synthCajonTap(rt, time, dest, v); break;
        case 'palma': synthPalma(rt, time, dest, false, v); break;
        case 'sorda': synthPalma(rt, time, dest, true, v); break;
        case 'pito': synthPito(rt, time, dest, v); break;
        case 'shell': synthShell(rt, time, dest, v); break;
        case 'guiro': synthGuiro(rt, time, dest, v, true); break;
        case 'guirot': synthGuiro(rt, time, dest, v, false); break;
        case 'bongoh': synthConga(rt, time, dest, 700, 0.11, v); break;
        case 'bongol': synthConga(rt, time, dest, 520, 0.14, v); break;
        case 'guacd': synthGuacharaca(rt, time, dest, false, v); break;
        case 'guacu': synthGuacharaca(rt, time, dest, true, v); break;
        case 'llam': synthLlamador(rt, time, dest, false, v); break;
        case 'llamo': synthLlamador(rt, time, dest, true, v); break;
        case 'tamb': synthTambora(rt, time, dest, v); break;
        case 'palo': synthPalo(rt, time, dest, v); break;
        case 'rkick': synthRockKick(rt, time, dest, v); break;
        case 'rsnare': synthRockSnare(rt, time, dest, false, v); break;
        case 'rghost': synthRockSnare(rt, time, dest, true, v); break;
        case 'rtom1': synthRockTom(rt, time, dest, 188, v); break;
        case 'rtom2': synthRockTom(rt, time, dest, 150, v); break;
        case 'rtom3': synthRockTom(rt, time, dest, 112, v); break;
        case 'rtom4': synthRockTom(rt, time, dest, 84, v); break;
        case 'tmb': synthTambourine(rt, time, dest, false, v); break;
        case 'tmbs': synthTambourine(rt, time, dest, true, v); break;
        case 'clap': synthClap(rt, time, dest, v); break;
        case 'surdo': synthSurdo(rt, time, dest, false, v); break;
        case 'surdom': synthSurdo(rt, time, dest, true, v); break;
        case 'tamborim': synthTamborim(rt, time, dest, v); break;
        case 'pandj': case 'pandg': case 'pandt': synthPandeiro(rt, time, dest, e.drum, v); break;
        case 'ganza': synthGanza(rt, time, dest, v); break;
        case 'agogoh': synthAgogo(rt, time, dest, true, v); break;
        case 'agogol': synthAgogo(rt, time, dest, false, v); break;
        case 'dum': case 'tek': case 'ka': case 'tapan': case 'stick': case 'daire': synthDarbuka(rt, time, dest, e.drum, v); break;
    }
}

function synthKick(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;

    // Corps : sinus avec chute de hauteur, légèrement saturé pour plus de punch,
    // et un filtre passe-bas pour retirer l'agressivité numérique.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);
    const shaper = ctx.createWaveShaper();
    shaper.curve = rt.curve();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(vel, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
    if (rt.tier >= 2) {
        // Niveau minimal : sinus + passe-bas seulement (ni saturation ni clic d'attaque)
        osc.connect(lp); lp.connect(gain); gain.connect(destination);
        osc.start(time); osc.stop(time + 0.34);
        rt.nodes.push(osc);
        return;
    }
    osc.connect(shaper); shaper.connect(lp); lp.connect(gain); gain.connect(destination);
    osc.start(time); osc.stop(time + 0.34);
    rt.nodes.push(osc);

    // Attaque : clic du battant sur la peau (bruit filtré très bref)
    const click = ctx.createBufferSource();
    click.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.7;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.001, time);
    clickGain.gain.exponentialRampToValueAtTime(0.45 * vel, time + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.018);
    click.connect(bp); bp.connect(clickGain); clickGain.connect(destination);
    click.start(time); click.stop(time + 0.025);
    rt.nodes.push(click);
}

function synthSnare(rt, time, destination, soft = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const dur = soft ? 0.13 : 0.2;

    // Bruit "timbre" (cordes de caisse claire), autour de 3 kHz
    const wire = ctx.createBufferSource();
    wire.buffer = rt.noise();
    const wireBP = ctx.createBiquadFilter();
    wireBP.type = 'bandpass'; wireBP.frequency.value = 3200; wireBP.Q.value = 0.6;
    const wireGain = ctx.createGain();
    wireGain.gain.setValueAtTime((soft ? 0.26 : 0.48) * vel, time);
    wireGain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    wire.connect(wireBP); wireBP.connect(wireGain); wireGain.connect(destination);
    wire.start(time); wire.stop(time + dur + 0.02);
    rt.nodes.push(wire);

    if (rt.tier < 2) {
    // Bruit "crack" (attaque nette, au-delà de 6 kHz)
    const crack = ctx.createBufferSource();
    crack.buffer = rt.noise();
    const crackHP = ctx.createBiquadFilter();
    crackHP.type = 'highpass'; crackHP.frequency.value = 6000;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime((soft ? 0.1 : 0.3) * vel, time);
    crackGain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.35);
    crack.connect(crackHP); crackHP.connect(crackGain); crackGain.connect(destination);
    crack.start(time); crack.stop(time + dur * 0.35 + 0.02);
    rt.nodes.push(crack);
    }

    // Corps : un seul sinus fondamental (pas de triangle, pour éviter le côté "buzz"
    // de synthé), avec une infime variation de hauteur à chaque coup pour ne pas
    // sonner deux fois exactement pareil.
    const bodyFreq = 180 * (0.985 + Math.random() * 0.03);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(bodyFreq, time);
    osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.86, time + dur);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime((soft ? 0.13 : 0.25) * vel, time);
    oGain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.8);
    osc.connect(oGain); oGain.connect(destination);
    osc.start(time); osc.stop(time + dur * 0.8 + 0.02);
    rt.nodes.push(osc);

    if (rt.tier < 2) {
    // Deuxième résonance de la peau : un grain de bruit filtré (et non plus un
    // oscillateur accordé) — un vrai fût ne sonne jamais comme un "bip" pur.
    const shell = ctx.createBufferSource();
    shell.buffer = rt.noise();
    const shellBP = ctx.createBiquadFilter();
    shellBP.type = 'bandpass'; shellBP.frequency.value = 310; shellBP.Q.value = 2.4;
    const shellGain = ctx.createGain();
    shellGain.gain.setValueAtTime((soft ? 0.09 : 0.16) * vel, time);
    shellGain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.45);
    shell.connect(shellBP); shellBP.connect(shellGain); shellGain.connect(destination);
    shell.start(time); shell.stop(time + dur * 0.45 + 0.02);
    rt.nodes.push(shell);
    }
}

// Banc d'oscillateurs carrés à fréquences non harmoniques (comme les circuits analogiques
// de cymbales) : donne un timbre métallique bien plus naturel qu'un simple bruit filtré.
function metalOscBank(rt, time, dur, freqs) {
    const ctx = rt.ctx;
    const bank = ctx.createGain();
    bank.gain.value = 1;
    freqs.forEach(f => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        osc.connect(bank);
        osc.start(time); osc.stop(time + dur + 0.08);
        rt.nodes.push(osc);
    });
    return bank;
}

function synthHihat(rt, time, destination, open = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const dur = open ? 0.5 : 0.075;

    const bank = metalOscBank(rt, time, dur, rt.tier >= 2 ? [] : rt.tier === 1 ? [287, 415, 573] : [287, 343, 415, 479, 573, 637]);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7500;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = open ? 9000 : 10000; bp.Q.value = 0.6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.5 * vel, time + 0.002);
    if (open) {
        amp.gain.exponentialRampToValueAtTime(0.16 * vel, time + 0.09);
    }
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    bank.connect(hp); hp.connect(bp); bp.connect(amp); amp.connect(destination);

    // Un peu de bruit d'air pour adoucir le côté trop "pur" des oscillateurs
    const air = ctx.createBufferSource();
    air.buffer = rt.noise();
    const airHP = ctx.createBiquadFilter();
    airHP.type = 'highpass'; airHP.frequency.value = 9000;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime((rt.tier >= 2 ? 0.4 : 0.1) * vel, time);
    airGain.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.6);
    air.connect(airHP); airHP.connect(airGain); airGain.connect(destination);
    air.start(time); air.stop(time + dur * 0.6 + 0.02);
    rt.nodes.push(air);
}

function synthCymbal(rt, time, destination, dur = 1, vel = 1, hpFreq = 5500) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const reverb = rt.tier >= 1 ? null : rt.reverb();   // allégé : pas de seconde réverbération

    // Une seule source de bruit large bande, partagée par le corps du son et par
    // les résonances : plus de banc d'oscillateurs carrés (le côté "buzz" synthétique
    // et désagréable venait de là). Un vrai grondement de cymbale est avant tout du
    // bruit filtré, pas un son de synthétiseur.
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();

    // Corps principal : bruit large bande qui s'assombrit lentement (perte naturelle
    // des aigus au fil de la résonance) et se pose avec une attaque douce et discrète.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = hpFreq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(10000, time);
    lp.frequency.exponentialRampToValueAtTime(Math.max(1500, hpFreq * 0.55), time + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0006, time);
    amp.gain.exponentialRampToValueAtTime(0.42 * vel, time + 0.025);
    amp.gain.exponentialRampToValueAtTime(0.14 * vel, time + 0.16);
    amp.gain.exponentialRampToValueAtTime(0.025 * vel, time + Math.max(0.25, dur * 0.6));
    amp.gain.exponentialRampToValueAtTime(0.0004, time + dur);
    noise.connect(hp); hp.connect(lp); lp.connect(amp); amp.connect(destination);
    if (reverb) {
        const send = ctx.createGain();
        send.gain.value = 0.6;
        amp.connect(send); send.connect(reverb);
    }

    // Quelques résonances métalliques étroites, tirées du même bruit filtré en bandes
    // (et non plus d'ondes carrées) : ça donne le "corps" et le chatoiement propres à
    // une cymbale sans le grain de synthétiseur. Les résonances aiguës s'éteignent
    // plus vite que les graves, comme sur un vrai métal.
    const resonances = [[300, 4, 0.16], [560, 5, 0.12], [900, 6, 0.085], [1500, 7, 0.055]];
    resonances.slice(0, rt.tier >= 2 ? 0 : rt.tier === 1 ? 2 : 4).forEach(([freq, q, level], idx) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
        const rGain = ctx.createGain();
        const decay = Math.max(0.2, dur * (0.85 - idx * 0.15));
        rGain.gain.setValueAtTime(0.0004, time);
        rGain.gain.exponentialRampToValueAtTime(level * vel, time + 0.015 + idx * 0.004);
        rGain.gain.exponentialRampToValueAtTime(0.0003, time + decay);
        noise.connect(bp); bp.connect(rGain); rGain.connect(destination);
        if (reverb) {
            const rSend = ctx.createGain();
            rSend.gain.value = 0.5;
            rGain.connect(rSend); rSend.connect(reverb);
        }
    });

    noise.start(time); noise.stop(time + dur + 0.05);
    rt.nodes.push(noise);
}

function synthCowbell(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    // Deux carrées non harmoniques (≈ 560 et 845 Hz) passées dans un passe-bande : le timbre creux et métallique de la cloche
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 760; bp.Q.value = 1.3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.24 * vel, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.065 * vel, time + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.22);
    [562, 845].forEach(f => {
        const o = ctx.createOscillator();
        o.type = 'square'; o.frequency.value = f;
        o.connect(bp);
        o.start(time); o.stop(time + 0.24);
        rt.nodes.push(o);
    });
    bp.connect(gain); gain.connect(destination);
}

function synthClave(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    // Bois dur : sinusoïde aiguë très brève (≈ 2,5 kHz) et un grain de bruit
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2550, time);
    osc.frequency.exponentialRampToValueAtTime(2300, time + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, time + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0006, time + 0.09);
    osc.connect(g); g.connect(destination);
    osc.start(time); osc.stop(time + 0.1);
    rt.nodes.push(osc);
}

function synthConga(rt, time, destination, freq = 300, dur = 0.3, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    // Peau : sinusoïde qui descend légèrement + claquement de la paume (bruit filtré très court)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.25, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.62 * vel, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    osc.connect(g); g.connect(destination);
    osc.start(time); osc.stop(time + dur + 0.02);
    rt.nodes.push(osc);

    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 4; bp.Q.value = 1.2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.18 * vel, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
    noise.connect(bp); bp.connect(nGain); nGain.connect(destination);
    noise.start(time); noise.stop(time + 0.04);
    rt.nodes.push(noise);
}

function synthSlap(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    // Slap de conga : bruit large et sec sur le bord de la peau, avec un court corps aigu
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.09);
    noise.connect(bp); bp.connect(g); g.connect(destination);
    noise.start(time); noise.stop(time + 0.1);
    rt.nodes.push(noise);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, time);
    osc.frequency.exponentialRampToValueAtTime(380, time + 0.06);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.001, time);
    oGain.gain.exponentialRampToValueAtTime(0.24 * vel, time + 0.002);
    oGain.gain.exponentialRampToValueAtTime(0.0006, time + 0.07);
    osc.connect(oGain); oGain.connect(destination);
    osc.start(time); osc.stop(time + 0.08);
    rt.nodes.push(osc);
}

function synthShaker(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    // Maracas / shaker : bruit blanc aigu, attaque légèrement floue
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.2 * vel, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.07);
    noise.connect(hp); hp.connect(g); g.connect(destination);
    noise.start(time); noise.stop(time + 0.09);
    rt.nodes.push(noise);
}

// Cáscara : le flanc métallique du timbal frappé à la baguette. Sec, brillant et très bref : un « toc » plus aigu et plus métallique
// que la clave (bois) et que le rim (bord de caisse claire).
function synthShell(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3100; bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.42 * vel, time + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0006, time + 0.055);
    noise.connect(bp); bp.connect(g); g.connect(destination);
    noise.start(time); noise.stop(time + 0.07);
    rt.nodes.push(noise);
    // Résonance du métal : deux partiels non harmoniques qui s'éteignent vite
    const ring = ctx.createGain();
    ring.gain.setValueAtTime(0.001, time);
    ring.gain.exponentialRampToValueAtTime(0.14 * vel, time + 0.002);
    ring.gain.exponentialRampToValueAtTime(0.0005, time + 0.085);
    ring.connect(destination);
    [1480, 2210].forEach(f => {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(ring);
        o.start(time); o.stop(time + 0.09);
        rt.nodes.push(o);
    });
}

// Güiro : racloir en calebasse. Coup long (« grattage » descendant, bruit à grain rapide) ou coup court (retour vif).
function synthGuiro(rt, time, destination, vel = 1, long = true) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const dur = long ? 0.13 : 0.045;
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(long ? 5200 : 6000, time);
    bp.frequency.exponentialRampToValueAtTime(long ? 3200 : 5000, time + dur);
    // Les dents du racloir : le niveau est haché à environ 70 Hz (long) ou 110 Hz (court)
    const teeth = ctx.createGain();
    teeth.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.type = 'square'; lfo.frequency.value = long ? 70 : 110;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth); lfoDepth.connect(teeth.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime((long ? 0.2 : 0.15) * vel, time + (long ? 0.012 : 0.004));
    g.gain.exponentialRampToValueAtTime(0.0007, time + dur);
    noise.connect(bp); bp.connect(teeth); teeth.connect(g); g.connect(destination);
    noise.start(time); noise.stop(time + dur + 0.02);
    lfo.start(time); lfo.stop(time + dur + 0.02);
    rt.nodes.push(noise); rt.nodes.push(lfo);
}

function synthRim(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;

    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.5 * vel, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0006, time + 0.045);
    noise.connect(bp); bp.connect(lp); lp.connect(gain); gain.connect(destination);
    noise.start(time); noise.stop(time + 0.06);
    rt.nodes.push(noise);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, time);
    osc.frequency.exponentialRampToValueAtTime(410, time + 0.045);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.001, time);
    oGain.gain.exponentialRampToValueAtTime(0.26 * vel, time + 0.001);
    oGain.gain.exponentialRampToValueAtTime(0.0005, time + 0.045);
    osc.connect(oGain); oGain.connect(destination);
    osc.start(time); osc.stop(time + 0.06);
    rt.nodes.push(osc);
}

function synthTom(rt, time, destination, freq = 120, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;

    // Corps : chute de hauteur modeste et passe-bas serré pour un grain grave, mat,
    // plutôt qu'un timbre brillant qui "surgirait" au-dessus du reste de la batterie.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = freq * 3.8;
    const bodyFreq = freq * (0.99 + Math.random() * 0.02);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(bodyFreq * 1.3, time);
    osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.86, time + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.8 * vel, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.34);
    osc.connect(lp); lp.connect(gain); gain.connect(destination);
    osc.start(time); osc.stop(time + 0.36);
    rt.nodes.push(osc);

    // Deuxième résonance de la peau, sur l'attaque : un grain de bruit filtré
    // plutôt qu'un oscillateur accordé, qui sonnait comme un "bip" électronique
    // (surtout perceptible sur le tom le plus aigu).
    const overtone = ctx.createBufferSource();
    overtone.buffer = rt.noise();
    const obp = ctx.createBiquadFilter();
    obp.type = 'bandpass'; obp.frequency.value = freq * 1.6; obp.Q.value = 2.6;
    const oGain2 = ctx.createGain();
    oGain2.gain.setValueAtTime(0.09 * vel, time);
    oGain2.gain.exponentialRampToValueAtTime(0.0008, time + 0.06);
    overtone.connect(obp); obp.connect(oGain2); oGain2.connect(destination);
    overtone.start(time); overtone.stop(time + 0.07);
    rt.nodes.push(overtone);

    // Attaque : bruit bref et sourd de la baguette sur la peau, filtré plus bas
    // pour rester discret et ne pas ajouter de brillance.
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 0.9;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.1 * vel, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    noise.connect(bp); bp.connect(nGain); nGain.connect(destination);
    noise.start(time); noise.stop(time + 0.03);
    rt.nodes.push(noise);
}

// Grosse caisse de fanfare : coup sourd, hauteur qui tombe, un peu de peau.
function synthBassDrum(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.16);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.95 * vel, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
    osc.connect(lp); lp.connect(g); g.connect(destination);
    osc.start(time); osc.stop(time + 0.65);
    rt.nodes.push(osc);
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 170; bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28 * vel, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    noise.connect(bp); bp.connect(ng); ng.connect(destination);
    noise.start(time); noise.stop(time + 0.08);
    rt.nodes.push(noise);
}

// Timbale accordée : fondamentale, partiels (1,5 et 2 fois), coup de mailloche ; decay = durée de résonance (s).
function synthTimp(rt, time, destination, freq = 98, vel = 1, decay = 1.8) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    [[1, 0.8, 1], [1.5, 0.22, 0.55], [2, 0.12, 0.35]].forEach(([mul, amp, dk]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * mul * 1.06, time);
        osc.frequency.exponentialRampToValueAtTime(freq * mul, time + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, time);
        g.gain.exponentialRampToValueAtTime(amp * vel, time + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, time + decay * dk);
        osc.connect(g); g.connect(destination);
        osc.start(time); osc.stop(time + decay * dk + 0.05);
        rt.nodes.push(osc);
    });
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 2.2; bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16 * vel, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(bp); bp.connect(ng); ng.connect(destination);
    noise.start(time); noise.stop(time + 0.07);
    rt.nodes.push(noise);
}

// Percussions des Balkans : tapan, baguette, darbuka (dum, tek, ka), daire.
function synthDarbuka(rt, time, destination, kind, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const tone = (type, f0, f1, tEnd, amp, dec) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, time);
        o.frequency.exponentialRampToValueAtTime(f1, time + tEnd);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, time);
        g.gain.exponentialRampToValueAtTime(amp * vel, time + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0007, time + dec);
        o.connect(g); g.connect(destination);
        o.start(time); o.stop(time + dec + 0.03);
        rt.nodes.push(o);
    };
    const noise = (type, freq, q, amp, dec, delay = 0) => {
        const s = ctx.createBufferSource();
        s.buffer = rt.noise();
        const fl = ctx.createBiquadFilter();
        fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
        const g = ctx.createGain();
        const t0 = time + delay;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(amp * vel, t0 + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0007, t0 + dec);
        s.connect(fl); fl.connect(g); g.connect(destination);
        s.start(t0); s.stop(t0 + dec + 0.02);
        rt.nodes.push(s);
    };
    switch (kind) {
        case 'dum':     // centre de la peau : grave, rond
            tone('sine', 200, 108, 0.09, 0.85, 0.3);
            noise('bandpass', 420, 0.9, 0.16, 0.05);
            break;
        case 'tek':     // bord de la peau : sec et brillant
            tone('triangle', 920, 640, 0.04, 0.2, 0.07);
            noise('bandpass', 3300, 1.8, 0.42, 0.06);
            break;
        case 'ka':      // doigts sur le bord : léger, mat
            tone('triangle', 640, 520, 0.03, 0.1, 0.05);
            noise('bandpass', 2300, 1.2, 0.25, 0.05);
            break;
        case 'tapan':   // grosse caisse à deux peaux, frappée à la mailloche
            tone('sine', 128, 66, 0.12, 0.95, 0.38);
            noise('lowpass', 520, 0.7, 0.2, 0.07);
            noise('bandpass', 1200, 0.8, 0.1, 0.02);
            break;
        case 'stick':   // baguette fine sur la peau du tapan
            tone('triangle', 1100, 780, 0.035, 0.14, 0.05);
            noise('bandpass', 2700, 2.5, 0.38, 0.04);
            break;
        case 'daire':   // cymbalettes du tambour sur cadre
            noise('highpass', 5800, 0.7, 0.2, 0.08);
            noise('highpass', 6400, 0.7, 0.14, 0.07, 0.018);
            break;
    }
}

// Golpe : coup de la main sur la caisse du violon ou du bandonéon (sec, boisé).
function synthGolpe(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(240, time);
    o.frequency.exponentialRampToValueAtTime(95, time + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.7 * vel, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.16);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + 0.18);
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.001, time);
    gn.gain.exponentialRampToValueAtTime(0.32 * vel, time + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0007, time + 0.04);
    s.connect(bp); bp.connect(gn); gn.connect(destination);
    s.start(time); s.stop(time + 0.05);
    rt.nodes.push(o, s);
}

// Chicharra : grattement de l'archet (ou des doigts sur les cordes), bruit modulé qui descend en fréquence.
function synthChicharra(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(5200, time);
    bp.frequency.exponentialRampToValueAtTime(2400, time + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.2);
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const lg = ctx.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg); lg.connect(am.gain);
    s.connect(bp); bp.connect(am); am.connect(g); g.connect(destination);
    s.start(time); s.stop(time + 0.22);
    lfo.start(time); lfo.stop(time + 0.22);
    rt.nodes.push(s, lfo);
}

// Látigo : coup de fouet (craquement bref, plus un « zap » qui chute).
function synthLatigo(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2800; hp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.6 * vel, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.11);
    s.connect(hp); hp.connect(g); g.connect(destination);
    s.start(time); s.stop(time + 0.12);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2400, time);
    o.frequency.exponentialRampToValueAtTime(300, time + 0.12);
    const go = ctx.createGain();
    go.gain.setValueAtTime(0.001, time);
    go.gain.exponentialRampToValueAtTime(0.22 * vel, time + 0.003);
    go.gain.exponentialRampToValueAtTime(0.0007, time + 0.15);
    o.connect(go); go.connect(destination);
    o.start(time); o.stop(time + 0.17);
    rt.nodes.push(s, o);
}

// ---------------------------------------------------------------------------------------------
// Percussions du flamenco : cajón, palmas, pitos
// ---------------------------------------------------------------------------------------------

// Cajón, coup grave (au centre de la tapa) : thump boisé court, avec une petite chute de hauteur ; un souffle grave sert d'attaque.
function synthCajonBass(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f0 = 150 * (0.97 + Math.random() * 0.06);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, time);
    o.frequency.exponentialRampToValueAtTime(68, time + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.9 * vel, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.24);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + 0.26);
    rt.nodes.push(o);
    if (rt.tier >= 2) return;                                   // niveau minimal : le thump seul
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 0.7;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.001, time);
    gn.gain.exponentialRampToValueAtTime(0.4 * vel, time + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0007, time + 0.05);
    s.connect(lp); lp.connect(gn); gn.connect(destination);
    s.start(time, Math.random() * 0.5); s.stop(time + 0.07);
    rt.nodes.push(s);
}

// Cajón, coup claqué (près du bord de la tapa) : claquement sec et brillant, résonance de la caisse et frisson des cordes/timbres.
function synthCajonTap(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2700 * (0.96 + Math.random() * 0.08); bp.Q.value = 0.75;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.8 * vel, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.085);
    s.connect(bp); bp.connect(g); g.connect(destination);
    s.start(time, Math.random() * 0.5); s.stop(time + 0.1);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(340, time);
    o.frequency.exponentialRampToValueAtTime(235, time + 0.05);
    const go = ctx.createGain();
    go.gain.setValueAtTime(0.001, time);
    go.gain.exponentialRampToValueAtTime(0.36 * vel, time + 0.002);
    go.gain.exponentialRampToValueAtTime(0.0007, time + 0.11);
    o.connect(go); go.connect(destination);
    o.start(time); o.stop(time + 0.12);
    rt.nodes.push(s, o);
    if (rt.tier >= 2) return;
    const r = ctx.createBufferSource();                          // frisson des timbres, légèrement après l'attaque
    r.buffer = rt.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5500;
    const gr = ctx.createGain();
    gr.gain.setValueAtTime(0.001, time);
    gr.gain.exponentialRampToValueAtTime(0.16 * vel, time + 0.006);
    gr.gain.exponentialRampToValueAtTime(0.0007, time + 0.15);
    r.connect(hp); hp.connect(gr); gr.connect(destination);
    r.start(time, Math.random() * 0.5); r.stop(time + 0.17);
    rt.nodes.push(r);
}

// Palmas : claquement de mains. Claire (sorda = false) : sèche, brillante, faite de trois micro-claquements très rapprochés ;
// sourde (sorda = true) : mains en coupe, étouffée et plus grave.
function synthPalma(rt, time, destination, sorda = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    if (sorda) {
        bp.frequency.value = 780 * (0.95 + Math.random() * 0.1); bp.Q.value = 1;
        g.gain.exponentialRampToValueAtTime(1 * vel, time + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0007, time + 0.07);
    } else {
        bp.frequency.value = 1900 * (0.95 + Math.random() * 0.1); bp.Q.value = 1.3;
        g.gain.exponentialRampToValueAtTime(0.75 * vel, time + 0.001);
        g.gain.exponentialRampToValueAtTime(0.11 * vel, time + 0.005);
        g.gain.exponentialRampToValueAtTime(0.66 * vel, time + 0.007);
        g.gain.exponentialRampToValueAtTime(0.11 * vel, time + 0.011);
        g.gain.exponentialRampToValueAtTime(1.1 * vel, time + 0.0135);
        g.gain.exponentialRampToValueAtTime(0.0007, time + 0.1);
    }
    s.connect(bp); bp.connect(g); g.connect(destination);
    s.start(time, Math.random() * 0.5); s.stop(time + (sorda ? 0.09 : 0.12));
    rt.nodes.push(s);
    if (rt.tier >= 2) return;
    // Creux de la main : petite résonance grave sous le claquement
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(sorda ? 320 : 520, time);
    o.frequency.exponentialRampToValueAtTime(sorda ? 210 : 360, time + 0.05);
    const go = ctx.createGain();
    go.gain.setValueAtTime(0.001, time);
    go.gain.exponentialRampToValueAtTime((sorda ? 0.4 : 0.18) * vel, time + 0.003);
    go.gain.exponentialRampToValueAtTime(0.0007, time + (sorda ? 0.06 : 0.07));
    o.connect(go); go.connect(destination);
    o.start(time); o.stop(time + 0.08);
    rt.nodes.push(o);
}

// Pito : claquement de doigts, bref clic aigu avec une petite résonance.
function synthPito(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3300; bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.85 * vel, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.045);
    s.connect(bp); bp.connect(g); g.connect(destination);
    s.start(time, Math.random() * 0.5); s.stop(time + 0.06);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1900, time);
    o.frequency.exponentialRampToValueAtTime(1300, time + 0.035);
    const go = ctx.createGain();
    go.gain.setValueAtTime(0.001, time);
    go.gain.exponentialRampToValueAtTime(0.24 * vel, time + 0.001);
    go.gain.exponentialRampToValueAtTime(0.0007, time + 0.04);
    o.connect(go); go.connect(destination);
    o.start(time); o.stop(time + 0.05);
    rt.nodes.push(s, o);
}

// ---------------------------------------------------------------------------------------------
// Percussions de la cumbia : guacharaca, llamador, tambora, palos
// ---------------------------------------------------------------------------------------------

// Guacharaca : râpe en bois frottée par une baguette à dents. Le coup descendant (« chu ») est plus long et plus rugueux ;
// le coup ascendant (« cu ») est bref et plus clair. Le grain vient d'un bruit filtré, haché à ~80 Hz (les dents de la râpe).
function synthGuacharaca(rt, time, destination, up = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const dec = up ? 0.045 : 0.1;
    const s = ctx.createBufferSource();
    s.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = (up ? 5000 : 3700) * (0.95 + Math.random() * 0.1); bp.Q.value = 1.4;
    const am = ctx.createGain();
    am.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = (up ? 105 : 78) * (0.92 + Math.random() * 0.16);
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg); lg.connect(am.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime((up ? 0.42 : 0.62) * vel, time + (up ? 0.003 : 0.006));
    g.gain.exponentialRampToValueAtTime(0.0007, time + dec);
    s.connect(bp); bp.connect(am); am.connect(g); g.connect(destination);
    s.start(time, Math.random() * 0.4); s.stop(time + dec + 0.02);
    lfo.start(time); lfo.stop(time + dec + 0.02);
    // petit « tok » du bois au départ du coup descendant
    if (!up) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(900, time);
        o.frequency.exponentialRampToValueAtTime(560, time + 0.025);
        const go = ctx.createGain();
        go.gain.setValueAtTime(0.001, time);
        go.gain.exponentialRampToValueAtTime(0.12 * vel, time + 0.002);
        go.gain.exponentialRampToValueAtTime(0.0007, time + 0.04);
        o.connect(go); go.connect(destination);
        o.start(time); o.stop(time + 0.05);
        rt.nodes.push(o);
    }
    rt.nodes.push(s, lfo);
}

// Llamador : petit tambour à une peau, aigu. Étouffé par la main (« tup », sec) ou ouvert (« tuum », qui sonne).
function synthLlamador(rt, time, destination, open = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f = (open ? 330 : 300) * (0.97 + Math.random() * 0.06);
    const dec = open ? 0.24 : 0.07;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.22, time);
    o.frequency.exponentialRampToValueAtTime(f, time + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime((open ? 0.62 : 0.5) * vel, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0007, time + dec);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + dec + 0.02);
    rt.nodes.push(o);
    if (open) {   // harmonique de la peau qui sonne
        const o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(f * 1.9, time);
        o2.frequency.exponentialRampToValueAtTime(f * 1.7, time + 0.08);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.001, time);
        g2.gain.exponentialRampToValueAtTime(0.13 * vel, time + 0.003);
        g2.gain.exponentialRampToValueAtTime(0.0007, time + 0.12);
        o2.connect(g2); g2.connect(destination);
        o2.start(time); o2.stop(time + 0.14);
        rt.nodes.push(o2);
    }
    const n = ctx.createBufferSource();
    n.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = open ? 1900 : 1300; bp.Q.value = 1.1;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.001, time);
    gn.gain.exponentialRampToValueAtTime((open ? 0.22 : 0.26) * vel, time + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0007, time + 0.03);
    n.connect(bp); bp.connect(gn); gn.connect(destination);
    n.start(time, Math.random() * 0.4); n.stop(time + 0.04);
    rt.nodes.push(n);
}

// Tambora : grosse caisse à deux peaux frappée à la mailloche ; grave, rond, avec un peu de souffle de la peau.
function synthTambora(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f = 112 * (0.97 + Math.random() * 0.06);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, time);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, time + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.95 * vel, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, time + 0.42);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + 0.45);
    const n = ctx.createBufferSource();
    n.buffer = rt.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.7;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.001, time);
    gn.gain.exponentialRampToValueAtTime(0.2 * vel, time + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0007, time + 0.08);
    n.connect(lp); lp.connect(gn); gn.connect(destination);
    n.start(time, Math.random() * 0.4); n.stop(time + 0.1);
    rt.nodes.push(o, n);
}

// Palo : baguette frappée sur le bois (fût) de la tambora ; sec et boisé.
function synthPalo(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f = 1350 * (0.95 + Math.random() * 0.1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, time);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, time + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0007, time + 0.055);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + 0.07);
    const n = ctx.createBufferSource();
    n.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.001, time);
    gn.gain.exponentialRampToValueAtTime(0.36 * vel, time + 0.001);
    gn.gain.exponentialRampToValueAtTime(0.0007, time + 0.035);
    n.connect(bp); bp.connect(gn); gn.connect(destination);
    n.start(time, Math.random() * 0.4); n.stop(time + 0.05);
    rt.nodes.push(o, n);
}

// ===========================================================================================================
// Kit rock : grosse caisse, caisse claire, quatre toms, tambourin, claquement de mains.
// Écrits pour sonner comme une vraie batterie plutôt que comme une boîte à rythmes : les peaux ne produisent pas un
// sinus unique mais plusieurs modes de vibration (rapports 1 ; 1,59 ; 2,14 d'une membrane circulaire) qui s'éteignent
// chacun à leur rythme, la hauteur retombe à l'attaque (la peau est tendue par la baguette), la baguette claque sur la
// peau, la peau de résonance répond un peu à côté de la peau de frappe, et les timbres de la caisse claire vibrent par
// sympathie quand on frappe un tom. La force règle aussi la brillance : un coup léger est plus mat qu'un coup fort.
// ===========================================================================================================

// Source de bruit filtrée et enveloppée : renvoie le gain de sortie. spec = { type, freq, q, peak, dec, att, hp }.
function rockNoiseHit(rt, time, destination, spec, vel) {
    const ctx = rt.ctx;
    const src = ctx.createBufferSource();
    src.buffer = rt.noise();
    const f = ctx.createBiquadFilter();
    f.type = spec.type || 'bandpass'; f.frequency.value = spec.freq; f.Q.value = spec.q === undefined ? 0.8 : spec.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, spec.peak * vel), time + (spec.att || 0.001));
    g.gain.exponentialRampToValueAtTime(0.0006, time + spec.dec);
    src.connect(f);
    if (spec.hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = spec.hp; f.connect(h); h.connect(g); } else f.connect(g);
    g.connect(destination);
    src.start(time, Math.random() * 0.45); src.stop(time + spec.dec + 0.03);
    rt.nodes.push(src);
    return g;
}

// Mode de vibration d'une peau : sinus dont la hauteur retombe (rapport drop) puis reste, enveloppe exponentielle.
function rockMode(rt, time, destination, freq, drop, dropT, peak, dec) {
    const ctx = rt.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * drop, time);
    o.frequency.exponentialRampToValueAtTime(freq, time + dropT);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0006, time + dec);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + dec + 0.03);
    rt.nodes.push(o);
    return g;
}

// Grosse caisse rock : coup de pédale (clic du battant), corps qui retombe vite de ~135 à ~55 Hz puis résonne un peu,
// « poum » de la peau de résonance et un souffle grave de la caisse. Pas de saturation dure : le corps reste rond.
function synthRockKick(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const hard = 0.55 + 0.45 * Math.min(1, vel);
    const base = 56 * (0.985 + Math.random() * 0.03);
    // corps
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520 + 520 * hard;
    lp.connect(destination);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(1, time);
    bodyGain.connect(lp);
    rockMode(rt, time, bodyGain, base, 2.45, 0.05, 0.78 * vel, 0.3);
    if (rt.tier >= 2) { rockNoiseHit(rt, time, destination, { freq: 2200, q: 0.8, peak: 0.22, dec: 0.012 }, vel); return; }
    // peau de résonance : un peu plus haut, plus courte
    rockMode(rt, time, bodyGain, base * 1.62, 1.5, 0.03, 0.22 * vel, 0.14);
    // clic du battant sur la peau (plus présent quand on joue fort)
    rockNoiseHit(rt, time, destination, { freq: 3000, q: 0.9, peak: 0.34 * hard, dec: 0.014 }, vel);
    // souffle de la caisse
    rockNoiseHit(rt, time, destination, { freq: 130, q: 0.9, peak: 0.2, dec: 0.09 }, vel);
}

// Caisse claire rock : deux modes de la peau (≈ 185 et 330 Hz), timbres qui vibrent ~0,2 s (bruit autour de 5 kHz, filtré
// au-dessus de 1,6 kHz), claquement de baguette, corps de la caisse. `soft` = note fantôme (peau à peine touchée, timbres seuls).
function synthRockSnare(rt, time, destination, soft = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const hard = 0.5 + 0.5 * Math.min(1, vel);
    const dec = soft ? 0.1 : 0.2 + 0.05 * hard;
    const tune = 183 * (0.985 + Math.random() * 0.03);
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = soft ? 0.5 : 1;
    bodyGain.connect(destination);
    rockMode(rt, time, bodyGain, tune, 1.28, 0.03, 0.36 * vel, soft ? 0.07 : 0.13);
    // timbres
    rockNoiseHit(rt, time, destination, { freq: 5200, q: 0.55, peak: (soft ? 0.3 : 0.52) * (0.7 + 0.3 * hard), dec, att: 0.0015, hp: 1600 }, vel);
    if (rt.tier >= 2) return;
    rockMode(rt, time, bodyGain, tune * 1.8, 1.2, 0.025, 0.2 * vel, soft ? 0.05 : 0.09);
    // claquement de baguette
    if (!soft) rockNoiseHit(rt, time, destination, { type: 'highpass', freq: 6800, q: 0.7, peak: 0.26 * hard, dec: 0.016 }, vel);
    // corps de la caisse
    rockNoiseHit(rt, time, destination, { freq: 330, q: 2.2, peak: soft ? 0.07 : 0.15, dec: 0.07 }, vel);
}

// Tom rock : trois modes de la peau, hauteur qui retombe à l'attaque, peau de résonance un peu désaccordée, claquement de
// baguette (plus net quand on joue fort), souffle du fût et timbres de la caisse claire qui vibrent par sympathie.
// freq = fondamentale (≈ 188, 150, 112, 84 Hz pour les quatre toms). Plus le tom est grave, plus il résonne longtemps.
function synthRockTom(rt, time, destination, freq = 150, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const hard = 0.5 + 0.5 * Math.min(1, vel);
    const ring = 0.2 + (200 - Math.min(200, freq)) / 200 * 0.26;      // 0,22 s (aigu) à 0,42 s (grave)
    const f0 = freq * (0.985 + Math.random() * 0.03);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = f0 * (3.2 + 3.4 * hard); lp.Q.value = 0.5;
    lp.connect(destination);
    // modes principaux de la peau de frappe
    rockMode(rt, time, lp, f0, 1.22, 0.045, 0.6 * vel, ring);
    if (rt.tier >= 2) { rockNoiseHit(rt, time, destination, { freq: f0 * 2.4, q: 0.9, peak: 0.12, dec: 0.02 }, vel); return; }
    rockMode(rt, time, lp, f0 * 1.593, 1.15, 0.04, 0.24 * vel, ring * 0.62);
    rockMode(rt, time, lp, f0 * 2.136, 1.1, 0.035, 0.11 * vel, ring * 0.4);
    // peau de résonance (désaccordée de ~3 %) : donne le léger « battement » d'un vrai tom
    rockMode(rt, time + 0.002, lp, f0 * 0.97, 1.08, 0.05, 0.26 * vel, ring * 1.15);
    // baguette sur la peau
    rockNoiseHit(rt, time, destination, { freq: 3400, q: 0.8, peak: 0.2 * hard, dec: 0.012 }, vel);
    rockNoiseHit(rt, time, destination, { freq: f0 * 2.2, q: 1.1, peak: 0.12, dec: 0.045 }, vel);
    // souffle du fût
    rockNoiseHit(rt, time + 0.004, destination, { freq: f0 * 1.3, q: 1.4, peak: 0.07, dec: ring * 0.8 }, vel);
    // timbres de la caisse claire qui vibrent par sympathie
    rockNoiseHit(rt, time + 0.006, destination, { freq: 4200, q: 0.6, peak: 0.022 + 0.03 * hard, dec: 0.1 + ring * 0.2, att: 0.01, hp: 2000 }, vel);
}

// Tambourin : les cymbalettes (oscillateurs métalliques non harmoniques, filtrés au-dessus de 5 kHz) et un souffle d'air ;
// `shake` = petite secousse (plus courte et plus douce) pour les croches ou doubles croches en roulement.
function synthTambourine(rt, time, destination, shake = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const dur = shake ? 0.1 : 0.2;
    const freqs = rt.tier >= 2 ? [] : (rt.tier === 1 ? [4300, 6100] : [3900, 4900, 6100, 7400, 8800]);
    if (freqs.length) {
        const bank = metalOscBank(rt, time, dur, freqs.map(f => f * (0.97 + Math.random() * 0.06)));
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 5200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0008, time);
        g.gain.exponentialRampToValueAtTime(0.1 * vel, time + 0.002);
        g.gain.exponentialRampToValueAtTime(0.03 * vel, time + dur * 0.35);
        g.gain.exponentialRampToValueAtTime(0.0006, time + dur);
        bank.connect(hp); hp.connect(g); g.connect(destination);
    }
    // souffle d'air et coup de peau (le pouce frappe la peau du tambourin)
    rockNoiseHit(rt, time, destination, { type: 'highpass', freq: 7000, q: 0.6, peak: 0.3, dec: dur * 0.7 }, vel);
    if (!shake && rt.tier < 2) rockNoiseHit(rt, time, destination, { freq: 900, q: 1.2, peak: 0.12, dec: 0.03 }, vel);
}

// Claquement de mains : quelques rafales de bruit très proches (les mains ne claquent jamais ensemble), puis une courte résonance de salle.
function synthClap(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const bursts = rt.tier >= 2 ? [0] : [0, 0.011, 0.021, 0.034];
    bursts.forEach((dt, k) => {
        rockNoiseHit(rt, time + dt, destination, { freq: 1250 + 120 * k, q: 1.4, peak: 0.34 * (k === bursts.length - 1 ? 1 : 0.75), dec: 0.02 }, vel);
    });
    rockNoiseHit(rt, time + 0.03, destination, { freq: 1050, q: 1.1, peak: 0.16, dec: 0.2, att: 0.004 }, vel);
}

// ===== Percussions de la roda de samba =====
// Surdo : grand tambour grave frappé à la mailloche feutrée. Ouvert (temps 2, « marcação ») il résonne longtemps ; étouffé par la
// main (temps 1) il ne laisse qu'un « poum » bref. Attaque douce (feutre), hauteur qui retombe un peu, deuxième mode de la peau.
function synthSurdo(rt, time, destination, muted = false, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f = (muted ? 66 : 58) * (0.98 + Math.random() * 0.04);
    const dec = muted ? 0.17 : 0.72;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.32, time);
    o.frequency.exponentialRampToValueAtTime(f, time + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.exponentialRampToValueAtTime((muted ? 0.75 : 0.95) * vel, time + 0.007);
    if (!muted) g.gain.exponentialRampToValueAtTime(0.26 * vel, time + 0.15); // tenue réduite : la basse appuie aussi le 2
    g.gain.exponentialRampToValueAtTime(0.0006, time + dec);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + dec + 0.03);
    rt.nodes.push(o);
    if (!muted && rt.tier < 2) rockMode(rt, time, destination, f * 1.58, 1.08, 0.05, 0.12 * vel, 0.32); // deuxième mode de la peau
    // feutre de la mailloche sur la peau
    rockNoiseHit(rt, time, destination, { type: 'lowpass', freq: 700, q: 0.7, peak: (muted ? 0.3 : 0.22), dec: muted ? 0.05 : 0.07, att: 0.003 }, vel);
}

// Tamborim : petit tambour sur cadre à peau très tendue, frappé à la baguette souple. Sec, aigu, presque sans résonance.
function synthTamborim(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f = 760 * (0.97 + Math.random() * 0.06);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 1.12, time);
    o.frequency.exponentialRampToValueAtTime(f, time + 0.012);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, time + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0006, time + 0.07);
    o.connect(g); g.connect(destination);
    o.start(time); o.stop(time + 0.09);
    rt.nodes.push(o);
    // claquement de la baguette sur la peau tendue
    rockNoiseHit(rt, time, destination, { freq: 2600, q: 1.3, peak: 0.42, dec: 0.028 }, vel);
    if (rt.tier < 2) rockNoiseHit(rt, time, destination, { type: 'highpass', freq: 6000, q: 0.5, peak: 0.12, dec: 0.012 }, vel);
}

// Pandeiro : tambourin brésilien. kind : 'pandj' platinelas (cymbalettes, coups légers des doigts et du talon de la main),
// 'pandg' pouce sur la peau (grave, avec les platinelas), 'pandt' tapa (claque de la main au centre, sèche).
function synthPandeiro(rt, time, destination, kind, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const jingle = (amt, dur) => {
        const freqs = rt.tier >= 2 ? [] : (rt.tier === 1 ? [5400, 7900] : [4700, 5900, 7300, 8600, 10100]);
        if (freqs.length) {
            const bank = metalOscBank(rt, time, dur, freqs.map(x => x * (0.97 + Math.random() * 0.06)));
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 5600;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0008, time);
            g.gain.exponentialRampToValueAtTime(0.055 * amt * vel, time + 0.003);
            g.gain.exponentialRampToValueAtTime(0.0005, time + dur);
            bank.connect(hp); hp.connect(g); g.connect(destination);
        }
        rockNoiseHit(rt, time, destination, { type: 'highpass', freq: 6800, q: 0.6, peak: 0.24 * amt, dec: dur * 0.8, att: 0.002 }, vel);
    };
    if (kind === 'pandg') {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f = 150 * (0.97 + Math.random() * 0.06);
        o.frequency.setValueAtTime(f * 1.3, time);
        o.frequency.exponentialRampToValueAtTime(f, time + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0008, time);
        g.gain.exponentialRampToValueAtTime(0.5 * vel, time + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0006, time + 0.24);
        o.connect(g); g.connect(destination);
        o.start(time); o.stop(time + 0.26);
        rt.nodes.push(o);
        jingle(0.7, 0.1);
    } else if (kind === 'pandt') {
        rockNoiseHit(rt, time, destination, { freq: 1150, q: 1.1, peak: 0.38, dec: 0.04 }, vel);
        jingle(1, 0.12);
    } else {
        jingle(1, 0.075);
    }
}

// Ganzá : chocalho métallique rempli de billes. Attaque plus floue et souffle plus rond que le shaker.
function synthGanza(rt, time, destination, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const noise = ctx.createBufferSource();
    noise.buffer = rt.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.exponentialRampToValueAtTime(0.28 * vel, time + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0006, time + 0.075);
    noise.connect(bp); bp.connect(g); g.connect(destination);
    noise.start(time, Math.random() * 0.4); noise.stop(time + 0.09);
    rt.nodes.push(noise);
}

// Agogô : double cloche frappée à la baguette (cloche aiguë / grave). Plus fine et plus chantante que la cloche cubaine.
function synthAgogo(rt, time, destination, high = true, vel = 1) {
    const ctx = rt.ctx;
    if (!ctx || !destination) return;
    const f = (high ? 940 : 700) * (0.995 + Math.random() * 0.01);
    const parts = rt.tier >= 2 ? [[1, 1]] : [[1, 1], [2.72, 0.35], [4.9, 0.12]];
    parts.forEach(([r, a]) => {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * r;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0008, time);
        g.gain.exponentialRampToValueAtTime(0.2 * a * vel, time + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0006, time + (r === 1 ? 0.26 : 0.1));
        o.connect(g); g.connect(destination);
        o.start(time); o.stop(time + 0.28);
        rt.nodes.push(o);
    });
    rockNoiseHit(rt, time, destination, { freq: 3000, q: 1.2, peak: 0.08, dec: 0.01 }, vel);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeNoiseBuffer, makeSaturationCurve, drumSpec, synthDrumLive, synthKick, synthSnare, metalOscBank, synthHihat,
        synthCymbal, synthCowbell, synthClave, synthConga, synthSlap, synthShaker, synthRim, synthTom, synthBassDrum, synthTimp,
        synthDarbuka, synthGolpe, synthChicharra, synthLatigo, synthCajonBass, synthCajonTap, synthPalma, synthPito, synthShell, synthGuiro,
        synthGuacharaca, synthLlamador, synthTambora, synthPalo,
        synthRockKick, synthRockSnare, synthRockTom, synthTambourine, synthClap,
        synthSurdo, synthTamborim, synthPandeiro, synthGanza, synthAgogo };
}
