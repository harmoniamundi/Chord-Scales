// ui/staff-editor.js — portées éditables dans les annotations (onglet « Annotations » du mode Jam) : dessin avec VexFlow
// et édition à la souris, au doigt et au clavier. Le format, les mesures et les hauteurs sont dans ui/staff-notes.js.
// Une portée est un élément <div class="annot-staff" data-staff="…"> glissé dans le texte de l'annotation ; le texte enregistré
// ne garde que ce petit bloc (le dessin et la barre d'outils sont refaits à l'ouverture).
// Écrire : choisir une durée, cliquer sur la portée (la note se pose à la hauteur cliquée, avant la note qui suit) ;
// cliquer une note pour la sélectionner puis la glisser vers le haut ou le bas, ou utiliser les flèches ; Suppr. l'enlève.
// Chargé par index.html via <script src="ui/staff-editor.js"> (après ui/staff-notes.js) et testé par ui/staff-editor.test.js.

// Sous Node (tests), le format se charge ; en navigateur ce sont des globaux (ui/staff-notes.js).
const NSE_N = (typeof parseStaff !== 'undefined')
    ? { parseStaff, formatStaff, staffDefault, layoutStaff, meterBeamUnits, pitchFromDia, pitchDia, pitchLabel, pitchMidi, midiToName, diaFromY, yFromDia,
        playbackPlan, insertEvent, removeEvent, updateEvent, alterEvent, shiftEvent, cloneStaff, SN_KEY_NAMES, SN_KEY_LABELS, SN_BOTTOM_LINE, SN_METERS, SN_SIZE_MIN, SN_SIZE_MAX, SN_SIZE_STEP, SN_SIZE_DEFAULT, clampStaffSize }
    : require('./staff-notes.js');

const NSE_SPACING = 10;        // écart entre deux lignes de la portée (pixels)
const NSE_ABOVE = 3;           // lignes d'espace au-dessus de la portée
const NSE_BAND = 110;          // hauteur d'une ligne de portée (système) avec ses lignes supplémentaires
const NSE_TOP = NSE_ABOVE * NSE_SPACING; // position de la ligne du haut dans une ligne de portée
const NSE_BLUE = '#2563eb';

// ----- Dessin -----

// Dessine la portée `st` dans `host` (vide d'abord). opts : width (largeur disponible), selected (indice de l'événement à colorer).
// Renvoie la géométrie pour les clics : { width, height, lines: [{ top, bottom, bottomY }], notes: [{ ev, x, y, line, rest, tieFromPrev }] }.
function drawNoteStaff(host, st, opts = {}) {
    const VF = Vex.Flow;
    host.innerHTML = '';
    const zoom = (st.size || NSE_N.SN_SIZE_DEFAULT) / 100; // taille d'affichage : on dessine en grandeur normale puis on agrandit / réduit
    const W = Math.max(260, Math.floor((opts.width || host.clientWidth || 600) / zoom)); // largeur « logique » disponible
    const clef = st.clef === 'b' ? 'bass' : 'treble';
    const restKey = st.clef === 'b' ? 'd/3' : 'b/4';
    const keyName = NSE_N.SN_KEY_NAMES[st.ks];
    const layout = NSE_N.layoutStaff(st);
    const beamUnits = NSE_N.meterBeamUnits(st.meter);

    // 1. Notes, voix, barres, triolets de chaque mesure (sans position : elle vient après le découpage en lignes)
    const meas = layout.measures.map((m) => {
        const notes = m.pieces.map((pc) => {
            let key;
            if (pc.p) key = `${pc.p.l}${({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[pc.p.a]}/${pc.p.o}`;
            else key = restKey;
            const n = new VF.StaveNote({ clef, keys: [key], duration: pc.d + (pc.dot ? 'd' : '') + (pc.p ? '' : 'r'), auto_stem: true });
            if (pc.dot) VF.Dot.buildAndAttach([n], { all: true });
            if (opts.selected === pc.ev) n.setStyle({ fillStyle: NSE_BLUE, strokeStyle: NSE_BLUE });
            return n;
        });
        const tuplets = [];
        m.pieces.forEach((pc, i) => {
            if (pc.tupletStart) tuplets.push(new VF.Tuplet(notes.slice(i, i + pc.tupletSize), { num_notes: 3, notes_occupied: 2, ratioed: false, bracketed: true }));
        });
        let voice = null, formatter = null, minW = 0, beams = [];
        if (notes.length) {
            voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
            voice.addTickables(notes);
            VF.Accidental.applyAccidentals([voice], keyName); // altérations selon l'armure, rappelées dans la mesure
            formatter = new VF.Formatter().joinVoices([voice]);
            minW = formatter.preCalculateMinTotalWidth([voice]);
            beams = VF.Beam.generateBeams(notes, { groups: [new VF.Fraction(beamUnits / 12, 8)], beam_rests: false });
            // les groupes de triolets de croches ou de doubles-croches sont barrés d'un bloc
            m.pieces.forEach((pc, i) => {
                if (!pc.tupletStart) return;
                const grp = m.pieces.slice(i, i + pc.tupletSize);
                if (grp.length > 1 && grp.every(g => g.p && (g.d === '8' || g.d === '16'))) beams.push(new VF.Beam(notes.slice(i, i + pc.tupletSize)));
            });
        }
        return { m, notes, tuplets, voice, formatter, minW, beams };
    });

    // 2. Répartition des mesures en lignes de portée
    const probe = (first, firstLine) => {
        const s = new VF.Stave(0, 0, 400);
        if (first) { s.addClef(clef); if (st.ks) s.addKeySignature(keyName); if (firstLine) s.addTimeSignature(st.meter); }
        return s.getNoteStartX();
    };
    const head = { firstLine: probe(true, true), otherLine: probe(true, false), inner: probe(false, false) };
    const lines = [];
    let curLine = null;
    meas.forEach((mo) => {
        const content = Math.max(54, Math.ceil(mo.minW * 1.25) + 26);
        const isFirstLine = lines.length === 0;
        const headW = curLine ? head.inner : (isFirstLine ? head.firstLine : head.otherLine);
        if (!curLine || (curLine.natural + headW + content > W - 6 && curLine.items.length)) {
            curLine = { items: [], natural: 0 };
            lines.push(curLine);
            mo.headW = lines.length === 1 ? head.firstLine : head.otherLine;
        } else mo.headW = head.inner;
        mo.content = content;
        curLine.items.push(mo);
        curLine.natural += mo.headW + content;
    });

    // 3. Dessin
    const height = lines.length * NSE_BAND;
    const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(W, height);
    const ctx = renderer.getContext();
    const svg = host.querySelector('svg');
    if (svg) {
        svg.style.display = 'block'; svg.style.overflow = 'visible';
        svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
        svg.setAttribute('width', String(Math.round(W * zoom))); svg.setAttribute('height', String(Math.round(height * zoom)));
        svg.style.width = `${Math.round(W * zoom)}px`; svg.style.maxWidth = '100%'; svg.style.height = 'auto'; // trop grand pour la zone : il se réduit sans se déformer
    }
    const geo = { width: W, height, zoom, lines: [], notes: [] };
    const tieJobs = []; // { from: {note, line}, to: {note, line} }
    let tiePending = null;
    lines.forEach((ln, li) => {
        const y = li * NSE_BAND;
        const isLastLine = li === lines.length - 1;
        // Les lignes pleines remplissent la largeur ; la dernière garde la largeur de ses notes (elles ne se déplacent pas quand on en ajoute)
        // et se prolonge d'une portée vide, où l'on clique pour écrire la suite.
        const extra = isLastLine ? 0 : Math.max(0, W - 6 - ln.natural);
        const totalContent = ln.items.reduce((s, mo) => s + mo.content, 0);
        let x = 3;
        ln.items.forEach((mo, k) => {
            const w = mo.headW + mo.content + (extra * mo.content / totalContent);
            const stave = new VF.Stave(x, y, w, { space_above_staff_ln: NSE_ABOVE, space_below_staff_ln: 3 });
            if (k === 0) { stave.addClef(clef); if (st.ks) stave.addKeySignature(keyName); if (li === 0) stave.addTimeSignature(st.meter); }
            if (isLastLine && k === ln.items.length - 1) stave.setEndBarType(ln.natural >= W - 40 ? VF.Barline.type.END : VF.Barline.type.SINGLE);
            stave.setContext(ctx).draw();
            if (mo.voice) {
                const fw = Math.max(30, stave.getNoteEndX() - stave.getNoteStartX() - 12);
                mo.formatter.format([mo.voice], fw);
                mo.voice.draw(ctx, stave);
                mo.beams.forEach(b => b.setContext(ctx).draw());
                mo.tuplets.forEach(t => t.setContext(ctx).draw());
                mo.m.pieces.forEach((pc, i) => {
                    const n = mo.notes[i];
                    const cx = (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2;
                    geo.notes.push({ ev: pc.ev, x: cx, y: pc.p ? n.getYs()[0] : y + NSE_TOP + 2 * NSE_SPACING, line: li, rest: !pc.p, tieFromPrev: pc.tieFromPrev });
                    if (pc.tieFromPrev && tiePending) tieJobs.push({ from: tiePending, to: { note: n, line: li } });
                    tiePending = pc.tieNext ? { note: n, line: li } : null;
                });
            }
            x += w;
        });
        if (isLastLine && W - 3 - x > 40) {
            const tail = new VF.Stave(x, y, W - 3 - x, { space_above_staff_ln: NSE_ABOVE, space_below_staff_ln: 3 });
            tail.setBegBarType(VF.Barline.type.NONE);
            tail.setEndBarType(VF.Barline.type.NONE);
            tail.setContext(ctx).draw();
        }
        geo.lines.push({ top: y, bottom: y + NSE_BAND, bottomY: y + NSE_TOP + 4 * NSE_SPACING });
    });
    tieJobs.forEach((j) => {
        try {
            if (j.from.line === j.to.line) new VF.StaveTie({ first_note: j.from.note, last_note: j.to.note, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
            else {
                new VF.StaveTie({ first_note: j.from.note, last_note: null, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
                new VF.StaveTie({ first_note: null, last_note: j.to.note, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
            }
        } catch (e) { /* liaison impossible à dessiner : la portée reste lisible */ }
    });
    return geo;
}

// ----- Barre d'outils de la portée (petites icônes dessinées, sans dépendre d'une police musicale) -----

function nseNoteIcon(d) {
    const head = (open, x, y) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3.4" transform="rotate(-22 ${x} ${y})" ${open ? 'fill="none" stroke="currentColor" stroke-width="1.6"' : 'fill="currentColor"'}/>`;
    const stem = (x, y1, y2) => `<path d="M${x} ${y1}V${y2}" stroke="currentColor" stroke-width="1.5" fill="none"/>`;
    const flag = (y) => `<path d="M11.4 ${y}c0.4 3.2 4.6 4 4.6 7.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    let inner;
    if (d === 'w') inner = `<ellipse cx="10" cy="11" rx="6" ry="4" transform="rotate(-22 10 11)" fill="none" stroke="currentColor" stroke-width="2"/>`;
    else if (d === 'h') inner = head(true, 7, 16) + stem(11.2, 15, 3);
    else if (d === 'q') inner = head(false, 7, 16) + stem(11.2, 15, 3);
    else if (d === '8') inner = head(false, 7, 16) + stem(11.2, 15, 3) + flag(3);
    else inner = head(false, 7, 16) + stem(11.2, 15, 3) + flag(3) + flag(7.5);
    return `<svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true">${inner}</svg>`;
}

const NSE_REST_ICON = '<svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true"><path d="M7 3l5 5-4 4.5 5 5.5c-3-1-5 .4-4.6 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NSE_DURATION_TITLES = { w: 'Ronde (clavier : 5)', h: 'Blanche (clavier : 4)', q: 'Noire (clavier : 3)', '8': 'Croche (clavier : 2)', '16': 'Double-croche (clavier : 1)' };
const NSE_DURATION_KEYS = { '1': '16', '2': '8', '3': 'q', '4': 'h', '5': 'w' };

function nseKeyOptions(current) {
    const opts = [];
    for (let k = -7; k <= 7; k++) {
        const label = k === 0 ? 'Do maj. · aucune' : `${NSE_N.SN_KEY_LABELS[k]} maj. · ${Math.abs(k)}${k > 0 ? '♯' : '♭'}`;
        opts.push(`<option value="${k}"${k === current ? ' selected' : ''}>${label}</option>`);
    }
    return opts.join('');
}

// HTML de la barre d'outils d'une portée (pur : testé sans navigateur).
function nseToolsHtml(st, cur) {
    const dur = ['w', 'h', 'q', '8', '16'].map(d => `<button type="button" class="ns-btn" data-dur="${d}" title="${NSE_DURATION_TITLES[d]}" aria-label="${NSE_DURATION_TITLES[d]}">${nseNoteIcon(d)}</button>`).join('');
    const meters = NSE_N.SN_METERS.map(m => `<option value="${m}"${m === st.meter ? ' selected' : ''}>${m}</option>`).join('');
    return `
        <button type="button" class="ns-btn ns-txt ns-exit" data-act="exit" title="Revenir à la mise en forme du texte" aria-label="Revenir à la mise en forme du texte">◂ Texte</button>
        <span class="ns-sep"></span>
        <div class="ns-grp" role="group" aria-label="Durée de la prochaine note">${dur}
            <button type="button" class="ns-btn" data-mod="dot" title="Note pointée (clavier : .)" aria-label="Note pointée"><b>•</b></button>
            <button type="button" class="ns-btn" data-mod="tri" title="Triolet : groupes de trois notes (clavier : t)" aria-label="Triolet"><i>3</i></button>
            <button type="button" class="ns-btn" data-mod="rest" title="Silence : le prochain clic pose un silence (clavier : r)" aria-label="Silence">${NSE_REST_ICON}</button>
        </div>
        <span class="ns-sep"></span>
        <div class="ns-grp" role="group" aria-label="Altération de la note sélectionnée">
            <button type="button" class="ns-btn" data-alt="1" title="Dièse (clavier : #)" aria-label="Dièse">♯</button>
            <button type="button" class="ns-btn" data-alt="-1" title="Bémol (clavier : -)" aria-label="Bémol">♭</button>
            <button type="button" class="ns-btn" data-alt="0" title="Bécarre (clavier : n)" aria-label="Bécarre">♮</button>
        </div>
        <span class="ns-sep"></span>
        <select class="ns-sel" data-set="clef" aria-label="Clé"><option value="t"${st.clef === 't' ? ' selected' : ''}>Clé de sol</option><option value="b"${st.clef === 'b' ? ' selected' : ''}>Clé de fa</option></select>
        <select class="ns-sel" data-set="meter" aria-label="Mesure">${meters}</select>
        <select class="ns-sel ns-sel-key" data-set="ks" aria-label="Armure">${nseKeyOptions(st.ks)}</select>
        <span class="ns-sep"></span>
        <label class="ns-zoom" title="Taille de la portée">
            <span class="ns-zoom-lab" aria-hidden="true">Taille</span>
            <input type="range" class="ns-range" data-set="size" min="${NSE_N.SN_SIZE_MIN}" max="${NSE_N.SN_SIZE_MAX}" step="${NSE_N.SN_SIZE_STEP}" value="${st.size || NSE_N.SN_SIZE_DEFAULT}" aria-label="Taille de la portée en pourcentage">
            <output class="ns-zoom-val">${st.size || NSE_N.SN_SIZE_DEFAULT} %</output>
        </label>
        <span class="ns-sep"></span>
        <div class="ns-grp">
            <button type="button" class="ns-btn ns-play" data-act="play" title="Écouter la portée" aria-label="Écouter la portée">▶</button>
            <button type="button" class="ns-btn" data-act="undo" title="Annuler le dernier changement de la portée (⌘Z)" aria-label="Annuler">↶</button>
            <button type="button" class="ns-btn" data-act="del" title="Supprimer la note sélectionnée (Suppr.)" aria-label="Supprimer la note sélectionnée">⌫</button>
            <button type="button" class="ns-btn ns-txt" data-act="clear" title="Effacer toutes les notes">Vider</button>
            <button type="button" class="ns-btn ns-txt ns-danger" data-act="remove" title="Supprimer cette portée">✕ Portée</button>
        </div>`;
}

// Touche du clavier → action sur la note sélectionnée (pur : testé sans navigateur). Renvoie null si la touche n'est pas pour la portée.
function nseKeyAction(key, mods = {}) {
    if (mods.meta || mods.ctrl) return (key === 'z' || key === 'Z') ? { type: 'undo' } : null;
    if (key === 'ArrowUp') return { type: 'shift', steps: mods.shift ? 7 : 1 };
    if (key === 'ArrowDown') return { type: 'shift', steps: mods.shift ? -7 : -1 };
    if (key === 'ArrowLeft') return { type: 'move', delta: -1 };
    if (key === 'ArrowRight') return { type: 'move', delta: 1 };
    if (key === 'Delete' || key === 'Backspace') return { type: 'delete' };
    if (key === 'Escape') return { type: 'deselect' };
    if (/^[a-gA-G]$/.test(key)) return { type: 'letter', letter: key.toLowerCase() };
    if (key === '#') return { type: 'alter', delta: 1 };
    if (key === '-') return { type: 'alter', delta: -1 };
    if (key === 'n' || key === 'N') return { type: 'alter', delta: null };
    if (key === '.') return { type: 'mod', mod: 'dot' };
    if (key === 't' || key === 'T') return { type: 'mod', mod: 'tri' };
    if (key === 'r' || key === 'R') return { type: 'mod', mod: 'rest' };
    if (NSE_DURATION_KEYS[key]) return { type: 'dur', dur: NSE_DURATION_KEYS[key] };
    return null;
}

// Hauteur la plus proche de la hauteur actuelle pour la lettre demandée (touche a-g).
function nseNearestLetter(p, letter, ks) {
    const here = NSE_N.pitchDia(p);
    let best = null;
    for (let o = p.o - 1; o <= p.o + 1; o++) {
        const dia = o * 7 + 'cdefgab'.indexOf(letter);
        if (best === null || Math.abs(dia - here) < Math.abs(best - here)) best = dia;
    }
    return NSE_N.pitchFromDia(best, ks);
}

// ----- Portée éditable -----

let NSE_ACTIVE = null; // la portée dont la barre d'outils est ouverte (une seule à la fois)

// opts : isEditable() → l'annotation est modifiable ; onChange(view) après chaque modification ; onActivate(view) quand on clique dans la portée ;
//        audio : { ready() → Promise, now(), play(midi, secondes, durée) → nœud audio ou null, bpm() }
class NoteStaffView {
    constructor(el, opts) {
        this.el = el;
        this.opts = opts;
        this.st = NSE_N.parseStaff(el.getAttribute('data-staff') || '') || NSE_N.staffDefault();
        this.sel = -1;          // événement sélectionné
        this.selAuto = false;   // sélection posée par l'insertion d'une note (les boutons de durée ne la modifient pas)
        this.cur = { d: 'q', dot: false, tri: false, rest: false }; // valeurs de la prochaine note
        this.history = [];
        this.geo = null;
        this.playing = null;
        el.__noteStaff = this;
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Portée : motif musical');
        el.innerHTML = '<div class="annot-staff-svg"></div><div class="annot-staff-tools" role="toolbar" aria-label="Édition de la portée"></div>';
        // La barre d'outils de la portée prend la place de la barre de texte tant que la portée est active (opts.toolsHost) ; sinon elle reste ici, cachée.
        this.svgHost = el.firstElementChild;
        this.tools = el.lastElementChild;
        this._bind();
        this._renderTools();
        this.render();
        if (typeof ResizeObserver !== 'undefined') {
            this._ro = new ResizeObserver(() => {
                const w = Math.floor(this.svgHost.clientWidth);
                if (w > 0 && this.geo && Math.abs(w - this._lastWidth) > 6) this.render();
            });
            this._ro.observe(this.svgHost);
        }
    }

    get editable() { return !!this.opts.isEditable(); }

    destroy() { if (this._ro) this._ro.disconnect(); this.stop(); if (NSE_ACTIVE === this) NSE_ACTIVE = null; }

    // Dessine la portée ; si VexFlow n'est pas là (ou échoue), un message remplace le dessin.
    render() {
        this._lastWidth = Math.floor(this.svgHost.clientWidth) || this._lastWidth || 600;
        try {
            this.geo = drawNoteStaff(this.svgHost, this.st, { width: this._lastWidth, selected: this.sel });
        } catch (e) {
            this.geo = null;
            this.svgHost.textContent = 'Portée non affichable';
        }
        const empty = this.st.ev.length === 0;
        let hint = this.svgHost.querySelector('.annot-staff-hint');
        if (empty && !hint) {
            hint = document.createElement('div');
            hint.className = 'annot-staff-hint';
            hint.textContent = 'Choisissez une durée puis cliquez sur la portée pour poser des notes';
            this.svgHost.appendChild(hint);
        }
        this._refreshTools();
    }

    _renderTools() { this.tools.innerHTML = nseToolsHtml(this.st, this.cur); }

    // Boutons allumés selon la sélection (ou, sans sélection, selon les valeurs de la prochaine note).
    _refreshTools() {
        const e = this.sel >= 0 ? this.st.ev[this.sel] : null;
        const v = e ? { d: e.d, dot: e.dot, tri: e.tri, rest: !e.p } : this.cur;
        this.tools.querySelectorAll('[data-dur]').forEach(b => b.classList.toggle('is-on', b.dataset.dur === v.d));
        const on = (mod, val) => { const b = this.tools.querySelector(`[data-mod="${mod}"]`); if (b) b.classList.toggle('is-on', !!val); };
        on('dot', v.dot); on('tri', v.tri); on('rest', v.rest);
        this.tools.querySelectorAll('[data-alt]').forEach(b => {
            const a = e && e.p ? e.p.a : null;
            b.classList.toggle('is-on', a !== null && ((b.dataset.alt === '0' && a === 0 && NSE_N.pitchFromDia(NSE_N.pitchDia(e.p), this.st.ks).a !== 0) || (b.dataset.alt !== '0' && a === Number(b.dataset.alt))));
        });
        const del = this.tools.querySelector('[data-act="del"]'); if (del) del.disabled = this.sel < 0;
        const un = this.tools.querySelector('[data-act="undo"]'); if (un) un.disabled = this.history.length === 0;
        const play = this.tools.querySelector('[data-act="play"]'); if (play) play.textContent = this.playing ? '■' : '▶';
        const sz = this.tools.querySelector('[data-set="size"]');
        if (sz && document.activeElement !== sz) sz.value = String(this.st.size || NSE_N.SN_SIZE_DEFAULT);
        const szv = this.tools.querySelector('.ns-zoom-val'); if (szv) szv.textContent = `${this.st.size || NSE_N.SN_SIZE_DEFAULT} %`;
        ['clef', 'meter', 'ks'].forEach(k => {
            const s = this.tools.querySelector(`[data-set="${k}"]`);
            if (s) s.value = String(k === 'clef' ? this.st.clef : (k === 'meter' ? this.st.meter : this.st.ks));
        });
    }

    activate() {
        if (NSE_ACTIVE && NSE_ACTIVE !== this) NSE_ACTIVE.deactivate();
        NSE_ACTIVE = this;
        this.el.classList.add('is-active');
        const host = this.opts.toolsHost && this.opts.toolsHost();
        if (host && this.tools.parentNode !== host) host.appendChild(this.tools);
        if (this.opts.onActivate) this.opts.onActivate(this);
        if (!this._outside) {
            this._outside = (ev) => { if (!this.el.contains(ev.target) && !this.tools.contains(ev.target)) this.deactivate(); };
            document.addEventListener('pointerdown', this._outside, true);
        }
    }

    deactivate() {
        this.el.classList.remove('is-active');
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        this.stop();
        if (this.tools.parentNode !== this.el) this.el.appendChild(this.tools);
        if (this.sel >= 0) { this.sel = -1; this.selAuto = false; this.render(); }
        if (NSE_ACTIVE === this) NSE_ACTIVE = null;
        if (this.opts.onDeactivate) this.opts.onDeactivate(this);
    }

    // ----- Changements de la portée -----

    // Remplace la portée (annulable) : redessine, met à jour data-staff et prévient l'annotation.
    _apply(next, opts = {}) {
        if (NSE_N.formatStaff(next) === NSE_N.formatStaff(this.st)) return false;
        if (!opts.noHistory) { this.history.push(this.st); if (this.history.length > 60) this.history.shift(); }
        this.st = next;
        if (this.sel >= this.st.ev.length) this.sel = this.st.ev.length - 1;
        this.render();
        this.commit();
        return true;
    }

    commit() {
        this.el.setAttribute('data-staff', NSE_N.formatStaff(this.st));
        if (this.opts.onChange) this.opts.onChange(this);
    }

    undo() {
        const prev = this.history.pop();
        if (!prev) return;
        this._apply(prev, { noHistory: true });
    }

    select(i, auto = false) {
        this.sel = i;
        this.selAuto = auto;
        this.render();
    }

    _hearEvent(i) {
        const e = this.st.ev[i];
        if (e && e.p) this._audition(NSE_N.pitchMidi(e.p));
    }

    // ----- Souris et doigt -----

    _bind() {
        const host = this.svgHost;
        this.tools.addEventListener('click', (ev) => this._toolClick(ev));
        this.tools.addEventListener('change', (ev) => this._toolChange(ev));
        this.tools.addEventListener('input', (ev) => this._toolInput(ev));
        host.addEventListener('pointerdown', (ev) => this._pointerDown(ev));
        host.addEventListener('pointermove', (ev) => this._pointerMove(ev));
        host.addEventListener('pointerleave', () => this._hideGhost());
    }

    _local(ev) {
        const svg = this.svgHost.querySelector('svg');
        const r = (svg || this.svgHost).getBoundingClientRect();
        // Les positions de la géométrie sont en unités du dessin : on convertit les pixels de l'écran (la portée peut être agrandie ou réduite).
        const k = this.geo && r.width > 0 ? this.geo.width / r.width : 1;
        this._k = k;
        return { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k };
    }

    _lineAt(y) {
        if (!this.geo) return 0;
        return Math.max(0, Math.min(this.geo.lines.length - 1, Math.floor(y / NSE_BAND)));
    }

    // Note (ou silence) sous le pointeur : indice de l'événement, ou -1.
    _hitEvent(pt) {
        if (!this.geo) return -1;
        let best = -1, bestD = 1e9;
        const tol = Math.max(1, this._k || 1); // portée réduite : la zone de clic reste d'au moins 11 pixels à l'écran
        for (const r of this.geo.notes) {
            const dx = Math.abs(pt.x - r.x);
            if (dx > 11 * tol) continue;
            const L = this.geo.lines[r.line];
            const dy = r.rest ? ((pt.y >= L.bottomY - 4 * NSE_SPACING - 4 && pt.y <= L.bottomY + 4) ? 0 : 99) : Math.abs(pt.y - r.y);
            if (dy > 8 * tol) continue;
            const d = dx + dy;
            if (d < bestD) { bestD = d; best = r.ev; }
        }
        return best;
    }

    _insertIndexAt(line, x) {
        const recs = this.geo.notes.filter(r => r.line === line);
        if (!recs.length) return this.st.ev.length;
        for (const r of recs) if (r.x > x) return r.tieFromPrev ? r.ev + 1 : r.ev;
        return recs[recs.length - 1].ev + 1;
    }

    _diaAt(pt, line) {
        const L = this.geo.lines[line];
        return NSE_N.diaFromY(pt.y, L.bottomY, NSE_SPACING, NSE_N.SN_BOTTOM_LINE[this.st.clef]);
    }

    _pointerDown(ev) {
        if (!this.editable || ev.button > 0 || !this.geo) return;
        ev.preventDefault(); // garde le focus (et la sélection de texte) où ils sont
        this.activate();
        const pt = this._local(ev);
        const hit = this._hitEvent(pt);
        let dragEv = -1, moved = false, wasSelected = false;
        if (hit >= 0) {
            wasSelected = this.sel === hit && !this.selAuto;
            this.select(hit, false);
            this._hearEvent(hit);
            if (this.st.ev[hit].p) dragEv = hit;
        } else {
            const line = this._lineAt(pt.y);
            const at = this._insertIndexAt(line, pt.x);
            const c = this.cur;
            let p = null;
            if (!c.rest) p = NSE_N.pitchFromDia(this._diaAt(pt, line), this.st.ks);
            if (!c.rest && !p) return;
            const next = NSE_N.insertEvent(this.st, at, { d: c.d, dot: c.dot, tri: c.tri, p });
            if (!this._apply(next)) return;
            this.select(at, true);
            if (p) { this._audition(NSE_N.pitchMidi(p)); dragEv = at; }
        }
        // Glisser vers le haut ou le bas change la hauteur de la note touchée.
        if (dragEv < 0) return;
        const host = this.svgHost;
        try { host.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const line = this.geo.notes.find(r => r.ev === dragEv);
        const lineIdx = line ? line.line : 0;
        const onMove = (e2) => {
            const p2 = this._local(e2);
            if (!moved && Math.abs(p2.y - pt.y) < 4 * Math.max(1, this._k || 1)) return;
            const dia = this._diaAt(p2, lineIdx);
            const np = NSE_N.pitchFromDia(dia, this.st.ks);
            const e0 = this.st.ev[dragEv];
            if (!np || !e0 || !e0.p) return;
            if (NSE_N.pitchDia(np) === NSE_N.pitchDia(e0.p)) return;
            moved = true;
            this._apply(NSE_N.updateEvent(this.st, dragEv, { p: np }));
            this._audition(NSE_N.pitchMidi(np));
        };
        const onUp = () => {
            host.removeEventListener('pointermove', onMove);
            host.removeEventListener('pointerup', onUp);
            host.removeEventListener('pointercancel', onUp);
            try { host.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (!moved && wasSelected && hit === dragEv) this.select(-1);
        };
        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerup', onUp);
        host.addEventListener('pointercancel', onUp);
    }

    // Survol à la souris : une note fantôme montre la hauteur qui sera posée.
    _pointerMove(ev) {
        if (!this.editable || !this.geo || ev.buttons || ev.pointerType === 'touch' || this.cur.rest) { this._hideGhost(); return; }
        const pt = this._local(ev);
        if (this._hitEvent(pt) >= 0) { this._hideGhost(); return; }
        const line = this._lineAt(pt.y);
        const dia = this._diaAt(pt, line);
        const p = NSE_N.pitchFromDia(dia, this.st.ks);
        if (!p) { this._hideGhost(); return; }
        const L = this.geo.lines[line];
        const y = NSE_N.yFromDia(dia, L.bottomY, NSE_SPACING, NSE_N.SN_BOTTOM_LINE[this.st.clef]);
        let g = this.svgHost.querySelector('.annot-ghost');
        if (!g) {
            g = document.createElement('div');
            g.className = 'annot-ghost';
            g.innerHTML = '<i></i><span></span>';
            this.svgHost.appendChild(g);
        }
        const back = 1 / (this._k || 1); // unités du dessin → pixels de l'écran
        g.style.left = `${pt.x * back - 6}px`;
        g.style.top = `${y * back - 4.5}px`;
        g.lastChild.textContent = NSE_N.pitchLabel(p);
    }

    _hideGhost() { const g = this.svgHost.querySelector('.annot-ghost'); if (g) g.remove(); }

    // ----- Barre d'outils -----

    _toolClick(ev) {
        const b = ev.target.closest('button');
        if (!b || !this.editable) return;
        this.activate();
        const selEv = this.sel >= 0 ? this.st.ev[this.sel] : null;
        const applyToSel = selEv && !this.selAuto;
        if (b.dataset.dur) {
            this.cur.d = b.dataset.dur;
            if (applyToSel) this._apply(NSE_N.updateEvent(this.st, this.sel, { d: b.dataset.dur }));
            this._refreshTools();
        } else if (b.dataset.mod) {
            this._applyMod(b.dataset.mod);
        } else if (b.dataset.alt !== undefined) {
            if (selEv && selEv.p) {
                const a = b.dataset.alt === '0' ? null : Number(b.dataset.alt);
                this._apply(NSE_N.alterEvent(this.st, this.sel, a));
                this._hearEvent(this.sel);
            }
        } else if (b.dataset.act) {
            const act = b.dataset.act;
            if (act === 'play') this.playing ? this.stop() : this.play();
            else if (act === 'undo') this.undo();
            else if (act === 'del') this._deleteSelected();
            else if (act === 'clear') { this.sel = -1; this._apply(Object.assign(NSE_N.cloneStaff(this.st), { ev: [] })); }
            else if (act === 'remove') { if (this.opts.onRemove) this.opts.onRemove(this); }
            else if (act === 'exit') { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); }
        }
    }

    _applyMod(mod) {
        const key = mod === 'rest' ? 'rest' : mod;
        this.cur[key] = !this.cur[key];
        const e = this.sel >= 0 ? this.st.ev[this.sel] : null;
        if (e && !this.selAuto) {
            if (mod === 'rest') {
                const nowRest = !!e.p;
                const prev = this.st.ev.slice(0, this.sel).reverse().find(x => x.p);
                const p = nowRest ? null : (prev ? { ...prev.p } : NSE_N.pitchFromDia(NSE_N.SN_BOTTOM_LINE[this.st.clef] + 4, this.st.ks));
                this.cur.rest = nowRest;
                this._apply(NSE_N.updateEvent(this.st, this.sel, { p }));
            } else {
                this.cur[key] = !e[mod];
                this._apply(NSE_N.updateEvent(this.st, this.sel, { [mod]: !e[mod] }));
            }
        }
        this._refreshTools();
    }

    // Curseur de taille : la portée suit le curseur en direct (sans encombrer l'historique d'annulation).
    _toolInput(ev) {
        const r = ev.target.closest('input[data-set="size"]');
        if (!r || !this.editable) return;
        this.activate();
        this._apply(Object.assign(NSE_N.cloneStaff(this.st), { size: NSE_N.clampStaffSize(r.value) }), { noHistory: true });
    }

    _toolChange(ev) {
        const s = ev.target.closest('select');
        if (!s || !this.editable) return;
        const next = NSE_N.cloneStaff(this.st);
        if (s.dataset.set === 'clef') next.clef = s.value === 'b' ? 'b' : 't';
        else if (s.dataset.set === 'meter') next.meter = NSE_N.SN_METERS.includes(s.value) ? s.value : '4/4';
        else if (s.dataset.set === 'ks') next.ks = Math.max(-7, Math.min(7, parseInt(s.value, 10) || 0));
        this._apply(next);
        if (this.opts.onFocusBack) this.opts.onFocusBack(this);
    }

    _deleteSelected() {
        if (this.sel < 0) return;
        const i = this.sel;
        this.sel = -1;
        this._apply(NSE_N.removeEvent(this.st, i));
        if (this.st.ev.length) this.select(Math.max(0, Math.min(i - 1, this.st.ev.length - 1)), true); // la note d'avant, ou la première
    }

    // ----- Clavier (appelé par l'annotation quand la portée est active) : renvoie true si la touche a été utilisée -----

    handleKey(ev) {
        if (!this.editable || ev.target.closest('select, input')) return false;
        const act = nseKeyAction(ev.key, { shift: ev.shiftKey, meta: ev.metaKey, ctrl: ev.ctrlKey });
        if (!act) return false;
        const has = this.sel >= 0 && this.st.ev[this.sel];
        if (act.type === 'undo') { if (!this.history.length) return false; this.undo(); return true; }
        if (act.type === 'dur') { this.cur.d = act.dur; if (has) this._apply(NSE_N.updateEvent(this.st, this.sel, { d: act.dur })); this._refreshTools(); return true; }
        if (act.type === 'mod') { this._applyMod(act.mod); return true; }
        if (!has) return false; // sans note sélectionnée, flèches, lettres et Suppr. restent à la saisie de texte
        if (act.type === 'deselect') { this.select(-1); return true; }
        if (act.type === 'delete') { this._deleteSelected(); return true; }
        if (act.type === 'move') { const n = Math.max(0, Math.min(this.st.ev.length - 1, this.sel + act.delta)); this.select(n, false); this._hearEvent(n); return true; }
        const e = this.st.ev[this.sel];
        if (!e.p) return false;
        if (act.type === 'shift') { if (this._apply(NSE_N.shiftEvent(this.st, this.sel, act.steps))) this._hearEvent(this.sel); return true; }
        if (act.type === 'letter') {
            const np = nseNearestLetter(e.p, act.letter, this.st.ks);
            if (np) { this._apply(NSE_N.updateEvent(this.st, this.sel, { p: np })); this._hearEvent(this.sel); }
            return true;
        }
        if (act.type === 'alter') { this._apply(NSE_N.alterEvent(this.st, this.sel, act.delta)); this._hearEvent(this.sel); return true; }
        return false;
    }

    // ----- Son -----

    _audition(midi) {
        const a = this.opts.audio;
        if (!a) return;
        a.ready().then((ok) => { if (ok) a.play(midi, 0, 0.7); });
    }

    play() {
        const a = this.opts.audio;
        if (!a || !this.st.ev.length) return;
        this.stop();
        const token = {};
        this.playing = token;
        this._refreshTools();
        a.ready().then((ok) => {
            if (!ok || this.playing !== token) { if (this.playing === token) { this.playing = null; this._refreshTools(); } return; }
            const beat = 60 / (a.bpm() || 100);
            const plan = NSE_N.playbackPlan(this.st);
            const nodes = [];
            plan.forEach(n => { if (n.midi !== null) { const node = a.play(n.midi, n.at * beat, Math.max(0.12, n.len * beat * 0.95)); if (node) nodes.push(node); } });
            token.nodes = nodes;
            const last = plan[plan.length - 1];
            token.timer = setTimeout(() => { if (this.playing === token) { this.playing = null; this._refreshTools(); } }, (last.at + last.len) * beat * 1000 + 150);
        });
    }

    stop() {
        const t = this.playing;
        if (!t) return;
        this.playing = null;
        if (t.timer) clearTimeout(t.timer);
        (t.nodes || []).forEach(n => { try { n.stop(); } catch (e) { /* déjà arrêtée */ } });
        this._refreshTools();
    }
}

// Petit bloc enregistré dans l'annotation pour une portée (le dessin n'est pas enregistré).
function noteStaffStubHtml(st) {
    return `<div class="annot-staff" data-staff="${NSE_N.formatStaff(st || NSE_N.staffDefault())}"></div>`;
}

// Transforme chaque bloc « annot-staff » de `root` en portée éditable (ou simplement affichée si l'annotation est en lecture seule).
function hydrateNoteStaves(root, opts) {
    root.querySelectorAll('.annot-staff').forEach((el) => {
        if (el.__noteStaff && el.isConnected && el.__noteStaff.el === el && el.querySelector('.annot-staff-svg')) return;
        new NoteStaffView(el, opts);
    });
}

// Copie du contenu d'un champ d'annotation où chaque portée est remplacée par son petit bloc enregistrable.
function annotationHtmlForSave(ed) {
    const c = ed.cloneNode(true);
    c.querySelectorAll('.annot-staff').forEach((el) => {
        const st = NSE_N.parseStaff(el.getAttribute('data-staff') || '');
        const stub = document.createElement('div');
        stub.className = 'annot-staff';
        stub.setAttribute('data-staff', NSE_N.formatStaff(st || NSE_N.staffDefault()));
        el.replaceWith(stub);
    });
    return c.innerHTML;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NSE_SPACING, NSE_BAND, NSE_TOP, nseToolsHtml, nseKeyAction, nseNearestLetter, nseNoteIcon, nseKeyOptions };
}
