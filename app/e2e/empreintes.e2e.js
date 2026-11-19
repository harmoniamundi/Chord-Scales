// Empreintes sonores (« golden master ») : vérifie que l'appli joue EXACTEMENT la même chose qu'au moment où les
// références ont été enregistrées. Sert de filet de sécurité avant une réorganisation du code (styles, orchestres,
// rythmes) : si une seule note, un seul réglage ou un seul accord change, le test dit où.
//
// Ce qui est comparé, pour chaque cas :
//   · les réglages posés par le style ou le menu Orchestre : tonalité, mode, tempo, mesure, orchestre, rythme imposé,
//     swing, densité, nom affiché, libellés et valeurs des curseurs ;
//   · la grille générée (accords, gammes, reprises, parties, marqueurs de modulation) ;
//   · mesure par mesure, tout ce que l'orchestre joue : le plan de la mesure (buildBandPlan), chaque frappe envoyée aux
//     instruments (piano, guitare, basse, batterie, cuivres…, avec instant, force et durée) et chaque note réellement
//     donnée à un instrument (échantillons, orgue, cordes, piano électrique).
// La lecture est simulée : le hasard suit une graine fixe, l'horloge audio est figée (AudioContext suspendu),
// les instruments sont des faux qui enregistrent ce qu'on leur demande. Rien n'est entendu : le rendu sonore
// (synthèse des percussions, réverbération, échantillons) n'est pas comparé, seulement ce qui lui est demandé.
//
// Cas couverts : chaque style de grille (forme de référence avec deux graines, puis une proposition « Générer ») ;
// chaque entrée du menu Orchestre et le bouton Arpèges, sur cinq grilles hôtes (4/4, 3/4, 6/8, 12/8, aksak 7/8).
//
// Lancer :                      npm run test:empreintes
// Enregistrer les références :  npm run empreintes:maj   (seulement quand un changement de son est VOULU et écouté)
// Variables facultatives :
//   CHROMIUM_PATH=/chemin/vers/chromium   navigateur déjà installé
//   EMPREINTES_CAS=bossa                  ne lance que les cas dont le nom contient ce texte
//   EMPREINTES_DETAIL=dossier             écrit le détail complet de chaque cas (JSON lisible) pour comparer deux versions
//   EMPREINTES_PARALLELE=6                nombre de pages ouvertes en même temps
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let pw = null;
try { pw = require('playwright'); } catch (e) { /* non installé : le test est ignoré */ }

const ROOT = path.join(__dirname, '..', '..'); // dossier qui contient index.html
const REF_FILE = path.join(__dirname, 'empreintes', 'reference.json');
const UPDATE = process.env.EMPREINTES_MAJ === '1';
const FILTER = process.env.EMPREINTES_CAS || '';
const DETAIL_DIR = process.env.EMPREINTES_DETAIL || '';
const PARALLEL = Math.max(1, +process.env.EMPREINTES_PARALLELE || 6);
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };

function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
            if (f.endsWith(path.sep)) f = path.join(f, 'index.html');
            if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            fs.readFile(f, (err, data) => {
                if (err) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
                res.end(data);
            });
        }).listen(0, () => resolve(srv));
    });
}

// Avant le chargement de la page : hasard à graine fixe et faux instruments qui enregistrent.
const INIT = (seed) => `
(() => {
    let a = ${seed} >>> 0;
    Math.random = function () {   // mulberry32 : même suite de nombres à chaque lancement
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    window.__rec = null;
    const mk = (name) => ({ name,
        play(n, w, o) { if (window.__rec) window.__rec('note', [name, n, w, o]); return { stop() {} }; },
        schedule() {}, stop() {}, connect() {} });
    window.__mkInst = mk;
    window.Soundfont = { instrument: (ctx, name) => Promise.resolve(mk('sf:' + name)) };
})();`;

// Faux VexFlow minimal (la portée n'est pas l'objet de ce test).
const FAKE_VEXFLOW = `
(() => {
    const NS = 'http://www.w3.org/2000/svg';
    class Renderer { constructor(c) { this.svg = document.createElementNS(NS, 'svg'); c.appendChild(this.svg); Renderer.last = this.svg; } resize() {} getContext() { return {}; } }
    Renderer.Backends = { SVG: 'svg' };
    class Stave { addClef() { return this; } setContext() { return this; } draw() { return this; } getNoteStartX() { return 50; } setNoteStartX() {} }
    class Accidental { constructor(t) { this.t = t; } }
    class StaveNote {
        constructor(o) { this.el = document.createElementNS(NS, 'g'); this.el.setAttribute('data-keys', o.keys.join()); }
        setStemDirection() {} addModifier() {} setStyle() {} getSVGElement() { return this.el; }
    }
    class Voice { constructor() { this.t = []; } addTickables(t) { this.t = t; } draw() { this.t.forEach(n => Renderer.last.appendChild(n.el)); } }
    class Formatter { joinVoices() { return this; } format() {} }
    window.Vex = { Flow: { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Stem: { UP: 1, DOWN: -1 } } };
})();`;

// Exécuté dans la page : prépare le cas, simule la lecture complète de la grille, renvoie l'empreinte.
async function capturePage(spec) {
    const EMP_RATE = 44100;
    const jam = app.jam;
    const settle = async () => { for (let k = 0; k < 4; k++) await new Promise(r => setTimeout(r, 0)); };

    // Horloge audio figée : un AudioContext suspendu (rien n'est calculé, currentTime ne bouge pas), présenté comme « en marche ».
    // Fréquence d'échantillonnage imposée : le bruit blanc des percussions et de la réverbération tire un nombre au hasard par
    // échantillon ; à 48 kHz (Mac) au lieu de 44,1 kHz, toute la suite du hasard serait décalée et rien ne correspondrait.
    const ctx = new AudioContext({ sampleRate: EMP_RATE });
    try { await ctx.suspend(); } catch (e) {}
    Object.defineProperty(ctx, 'currentTime', { get: () => 0 });   // toujours 0 : l'instant de départ ne dépend pas de la vitesse de la machine
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    ctx.resume = () => Promise.resolve();
    app.audioCtx = ctx;
    jam.setPerfMode('full');             // jamais d'allègement selon la charge de la machine
    jam._perfObserve = () => {};
    jam._drumSamplesOff = true;          // percussions synthétisées directement (les échantillons pré-calculés arrivent à des instants variables)
    // Cuivres et cordes VPO, orgue, cordes, piano électrique : faux instruments qui enregistrent
    vpoLoadBrass = (c, name) => Promise.resolve(window.__mkInst('vpo:' + name));
    ['createOrganInstrument', 'createStringsInstrument', 'createEPianoInstrument'].forEach(fn => {
        const orig = window[fn];
        if (typeof orig !== 'function') return;
        window[fn] = function (...args) {
            const inst = orig.apply(this, args);
            if (inst && typeof inst.play === 'function') {
                const p = inst.play.bind(inst);
                inst.play = (...a) => { if (window.__rec) window.__rec('note', [fn, ...a]); return p(...a); };
            }
            return inst;
        };
    });

    // Préparation du cas, comme le ferait un utilisateur
    const styleSel = document.getElementById('jam-style-select');
    const host = spec.style || spec.host;
    styleSel.value = host;
    jam.changeStyle(host);
    if (spec.generer) jam.resetGrid();
    if (spec.entry) {
        const bandSel = document.getElementById('band-style-select');
        if (bandSel) bandSel.value = spec.entry;
        jam.chooseBandStyle(spec.entry);
    }
    jam.loopEnabled = false;
    jam.metronomeEnabled = false;
    app.loadPiano();
    jam.ensureBandAudio();
    await settle();
    jam.ensureBandAudio();
    await settle();

    const label = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
    const visible = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
    const reglages = {
        tonalite: jam.mainKey, mode: jam.mainQuality, bpm: jam.bpm, mesure: jam.getMeterKey(),
        orchestre: jam.bandStyle, rythme: jam.getEffectiveGroove(), menuOrchestre: jam._bandSelectValue(),
        nom: label('band-btn-label'), swing: Math.round(jam.getBandSwing() * 1e4) / 1e4,
        densite: jam.bandDensity ? jam.bandDensity[jam.bandStyle] ?? null : null,
        curseurs: [label('band-vol-piano-label'), label('band-vol-bass-label'), label('band-vol-drums-label'), label('band-vol-organ-label')],
        lignes: ['band-row-pz-bandoneon', 'band-row-pz-violin', 'band-row-pz-guitar', 'band-row-rk-rguitar', 'band-row-rk-organ', 'band-row-rk-strings', 'band-row-density'].filter(visible),
        volumes: jam.bandVolumes
    };
    const grilleTexte = jam.grid.map(s => `${s.rootIndex}:${s.chordId}x${s.measures}` + (s.split ? `/${s.split.rootIndex}:${s.split.chordId}` : '')).join(' ');

    // Enregistrement : tout ce qui est joué est rangé par mesure
    const r6 = (x) => Math.round(x * 1e6) / 1e6;
    const clean = (k, v) => {
        if (typeof v === 'number') return Number.isFinite(v) ? r6(v) : String(v);
        if (typeof v === 'function') return undefined;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const proto = Object.getPrototypeOf(v);
            if (proto !== Object.prototype && proto !== null) return undefined; // nœuds audio, instruments…
        }
        return v;
    };
    const measures = [];
    const rec = (kind, data) => {
        const m = jam._bandMeasureCounter || 0;
        (measures[m] = measures[m] || []).push(JSON.stringify([kind, data], clean));
    };
    window.__rec = rec;
    const wrap = (obj, name, tag) => {
        const orig = obj[name];
        if (typeof orig !== 'function') return;
        obj[name] = function (...args) { rec(tag || name, args); return orig.apply(this, args); };
    };
    const origBuild = jam.buildBandPlan;
    jam.buildBandPlan = function (...args) { const p = origBuild.apply(this, args); rec('plan', p); return p; };
    ['playBandDrum', 'playBassAbs', 'playTubaAbs', 'playPiazzollaBass', 'playPianoHit', 'playGuitarHit', 'playAccordionHit',
        'playBrassHit', 'playPiazzollaHit', 'playClassicalGuitarHit', 'playRockHit', 'playAfricaHit'].forEach(n => wrap(jam, n));
    // Notes calculées par audio/note-events.js (fonctions globales)
    ['bassNote', 'pianoNotes', 'rockNotes', 'guitarNotes', 'classicalGuitarNotes', 'brassNotes', 'tubaNote', 'accordionNotes', 'piazzollaNotes', 'arcoNote'].forEach(fn => {
        const orig = window[fn];
        if (typeof orig !== 'function') return;
        window[fn] = function (...args) { const out = orig.apply(this, args); rec(fn, out); return out; };
    });

    // Lecture simulée : chaque temps est programmé tout de suite, l'affichage et l'arrêt sont exécutés sans attendre
    jam._scheduleNextTick = () => {};
    jam._runAtAudioTime = (t, runId, fn) => { if (jam.isPlaying && runId === jam._runId) fn(); };
    const errors = [];
    const origErr = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr.apply(console, a); };
    if (spec.arp) await jam.toggleArpeggioPlay(); else await jam.start();
    let guard = 0;
    while (jam.isPlaying && guard++ < 20000) jam.tick(jam._runId);
    const stillPlaying = jam.isPlaying;
    if (jam.isPlaying) jam.stop();
    window.__rec = null;
    console.error = origErr;

    return { reglages, grilleTexte, grille: JSON.stringify(jam.grid), mesures: Array.from(measures, a => (a || []).join('\n')), errors, stillPlaying };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

describe('empreintes sonores (golden master)', { skip: !pw && 'Playwright non installé : npm install && npx playwright install chromium' }, () => {
    let srv, browser, base;

    before(async () => {
        srv = await serve();
        base = `http://127.0.0.1:${srv.address().port}`;
        browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    });
    after(async () => {
        if (browser) await browser.close();
        if (srv) srv.close();
    });

    // Liste des cas, lue dans la page elle-même : un style ou une entrée d'orchestre ajoutés plus tard sont détectés.
    async function listOptions() {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
        await page.route('**/app/vendor/**', (r) => r.abort());
        await page.addInitScript(INIT(1));
        await page.addInitScript(FAKE_VEXFLOW);
        await page.goto(`${base}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
        const res = await page.evaluate(() => ({
            styles: [...document.querySelectorAll('#jam-style-select option')].map(o => o.value).filter(v => v && v !== 'custom'),
            bands: [...document.querySelectorAll('#band-style-select option')].map(o => o.value).filter(Boolean),
        }));
        await ctx.close();
        return res;
    }

    async function runCase(spec) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
        await page.route('**/app/vendor/**', (r) => r.abort());
        await page.route('**/app/sounds/**', (r) => r.abort());
        await page.addInitScript(INIT(spec.seed));
        await page.addInitScript(FAKE_VEXFLOW);
        await page.goto(`${base}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof app !== 'undefined' && app.jam);
        const out = await page.evaluate(capturePage, spec);
        await ctx.close();
        out.errors = out.errors.concat(pageErrors);
        return out;
    }

    test('l\'orchestre joue exactement comme dans les références', { timeout: 60 * 60 * 1000 }, async () => {
        const { styles, bands } = await listOptions();
        const HOSTS = ['ii-v-i', 'valsejazz', 'jig', 'blues128', 'balkan78']; // 4/4, 3/4, 6/8, 12/8, aksak 7/8
        const cases = [];
        styles.forEach(s => {
            cases.push({ name: `style:${s}`, style: s, seed: 1 });
            cases.push({ name: `style:${s}#graine2`, style: s, seed: 2 });
            cases.push({ name: `style:${s}#generer`, style: s, seed: 1, generer: true });
        });
        HOSTS.forEach(h => {
            bands.forEach(b => cases.push({ name: `orchestre:${b}@${h}`, host: h, entry: b, seed: 3 }));
            cases.push({ name: `arpeges@${h}`, host: h, arp: true, seed: 3 });
        });
        const todo = cases.filter(c => c.name.includes(FILTER));

        const results = {};
        let next = 0;
        const t0 = Date.now();
        const worker = async () => {
            while (next < todo.length) {
                const c = todo[next++];
                const out = await runCase(c);
                if (DETAIL_DIR) {
                    fs.mkdirSync(DETAIL_DIR, { recursive: true });
                    const file = path.join(DETAIL_DIR, c.name.replace(/[^a-z0-9#@.-]+/gi, '_') + '.json');
                    fs.writeFileSync(file, JSON.stringify({ reglages: out.reglages, grille: JSON.parse(out.grille),
                        mesures: out.mesures.map(m => m.split('\n').filter(Boolean).map(l => JSON.parse(l))) }, null, 1));
                }
                results[c.name] = {
                    reglages: out.reglages,
                    grille: out.grilleTexte,
                    grilleEmpreinte: sha(out.grille),
                    mesures: out.mesures.map(sha),
                    erreurs: out.errors.length ? out.errors.slice(0, 3) : undefined,
                    finie: out.stillPlaying ? false : undefined,
                };
            }
        };
        await Promise.all(Array.from({ length: PARALLEL }, worker));
        const secs = Math.round((Date.now() - t0) / 1000);

        if (UPDATE) {
            let ref = { cas: {} };
            if (FILTER && fs.existsSync(REF_FILE)) ref = JSON.parse(fs.readFileSync(REF_FILE, 'utf8'));
            const all = { ...ref.cas, ...results };
            const sorted = {};
            Object.keys(all).sort().forEach(k => { sorted[k] = all[k]; });
            fs.mkdirSync(path.dirname(REF_FILE), { recursive: true });
            fs.writeFileSync(REF_FILE, JSON.stringify({
                note: 'Empreintes de référence de e2e/empreintes.e2e.js. Ne pas modifier à la main : npm run empreintes:maj',
                cas: sorted }, null, 1) + '\n');
            console.log(`# ${todo.length} cas enregistrés dans ${path.relative(ROOT, REF_FILE)} (${secs} s)`);
            return;
        }

        assert.ok(fs.existsSync(REF_FILE), 'Pas de références : lancer d\'abord npm run empreintes:maj sur la version de départ');
        const ref = JSON.parse(fs.readFileSync(REF_FILE, 'utf8')).cas;
        const diffs = [];
        for (const c of todo) {
            const a = ref[c.name], b = results[c.name];
            if (!a) { diffs.push(`${c.name} : cas nouveau, absent des références`); continue; }
            const msgs = [];
            const ra = JSON.stringify(a.reglages), rb = JSON.stringify(b.reglages);
            if (ra !== rb) {
                const keys = Object.keys({ ...a.reglages, ...b.reglages }).filter(k => JSON.stringify(a.reglages[k]) !== JSON.stringify(b.reglages[k]));
                msgs.push('réglages : ' + keys.map(k => `${k} ${JSON.stringify(a.reglages[k])} → ${JSON.stringify(b.reglages[k])}`).join(', '));
            }
            if (a.grille !== b.grille) msgs.push(`grille d'accords différente :\n      avant ${a.grille}\n      après ${b.grille}`);
            else if (a.grilleEmpreinte !== b.grilleEmpreinte) msgs.push('grille : mêmes accords, mais gammes, reprises, parties ou marqueurs différents');
            if (a.mesures.length !== b.mesures.length) msgs.push(`nombre de mesures jouées ${a.mesures.length - 1} → ${b.mesures.length - 1}`);
            const n = Math.min(a.mesures.length, b.mesures.length);
            const bad = [];
            for (let i = 0; i < n; i++) if (a.mesures[i] !== b.mesures[i]) bad.push(i);
            if (bad.length) msgs.push(`jeu de l'orchestre différent à la mesure ${bad[0]}` + (bad.length > 1 ? ` (et ${bad.length - 1} autre${bad.length > 2 ? 's' : ''})` : ''));
            if (JSON.stringify(a.erreurs) !== JSON.stringify(b.erreurs)) msgs.push(`erreurs JavaScript : ${JSON.stringify(b.erreurs || [])}`);
            if (msgs.length) diffs.push(`${c.name}\n    ` + msgs.join('\n    '));
        }
        console.log(`# ${todo.length} cas comparés (${secs} s), ${diffs.length} différent${diffs.length > 1 ? 's' : ''}`);
        assert.equal(diffs.length, 0, `\n${diffs.length} cas ne jouent plus comme les références :\n\n` + diffs.slice(0, 40).join('\n\n')
            + (diffs.length > 40 ? `\n\n… et ${diffs.length - 40} autres` : '')
            + '\n\nPour voir le détail : EMPREINTES_DETAIL=avant (sur l\'ancienne version) puis EMPREINTES_DETAIL=apres, et comparer les deux dossiers.');
    });
});
