// ui/chord-block.js — bloc d'accords jouables posé sur le canevas d'une zone d'annotation (<div class="annot-chords" data-chords="…" data-at="x,y">).
// Le bloc affiche une suite d'accords (symbole + durée en temps). En édition, une fenêtre propose le sélecteur d'accord de Chord Scales
// (« Construire » / « Catalogue », ui/chord-picker.js) pour choisir chaque accord, sa durée, sa place dans la suite, et le mode de lecture (plaqué / arpégé).
// Hors édition, il se déplace comme les autres blocs (ui/annot-canvas.js) ; son bouton ▶ le joue au piano au tempo de la jam.
// Le format, les symboles et les notes jouées sont dans ui/chord-notes.js (sans DOM, testé) ; ici, seulement l'écran.
// Chargé par index.html via <script src="app/ui/chord-block.js"> (après ui/chord-notes.js, ui/chord-picker.js et ui/annot-canvas.js).

let CHB_ACTIVE = null; // le bloc d'accords dont la fenêtre d'édition est ouverte (un seul à la fois)

const CHB_PICKER_MODE_KEY = 'jamChordPickerMode';

// Fonctions des autres modules : globales dans le navigateur, chargées sous Node (tests).
const CHB_L = (typeof chordsJazz !== 'undefined')
    ? { chordsJazz, chordsBeatsText, chordsLabelHtml, chordsLabels, CH_MAX_CHORDS, CH_BEATS_CHOICES, chordPickerHtml, lookupChord, chordTypes, SN_BPM_MIN, SN_BPM_MAX }
    : Object.assign({}, require('./chord-notes.js'), require('./chord-picker.js'), require('../theory.js'));

// Swing proposé (50 % = croches droites, 67 % = triolet) ; « Jam » (valeur 0) suit le swing de la jam : toujours proposé pour y revenir.
const CHB_SWING_CHOICES = [[50, 'Droit · 50 %'], [55, '55 %'], [60, '60 %'], [65, '65 %'], [67, 'Triolet · 67 %'], [70, '70 %'], [75, '75 %']];
const CHB_INSTR_CHOICES = [['C', 'En Ut'], ['Bb', 'En Si♭'], ['Eb', 'En Mi♭']];
function chordSwingOptions(cur) {
    const list = CHB_SWING_CHOICES.slice();
    if (cur && !list.some(c => c[0] === cur)) { list.push([cur, `${cur} %`]); list.sort((a, b) => a[0] - b[0]); }
    list.unshift([0, 'Jam']);
    return list.map(([v, t]) => `<option value="${v}"${v === (cur || 0) ? ' selected' : ''}>${t}</option>`).join('');
}
function chordInstrOptions(cur) {
    const list = [['', 'Jam']].concat(CHB_INSTR_CHOICES);
    return list.map(([v, t]) => `<option value="${v}"${v === (cur || '') ? ' selected' : ''}>${t}</option>`).join('');
}

// HTML de la fenêtre d'édition (sans DOM) : suite d'accords, réglages de l'accord choisi, lecture, sélecteur d'accord.
//   v : { st (bloc), sel (indice de l'accord choisi), pickerMode ('build' | 'cat'), playing }
function chordEditorHtml(v) {
    const L = CHB_L, st = v.st, c = st.chords[v.sel] || st.chords[0];
    const findChordObj = (id) => L.lookupChord(id) || L.chordTypes.maj[0];
    const chips = st.chords.map((ch, i) => `<button type="button" class="cb-seq-chip${i === v.sel ? ' is-on' : ''}" data-cb="pick" data-i="${i}" title="Choisir cet accord (${L.chordsBeatsText(ch.beats)} temps)">`
        + `<span class="cb-sym">${L.chordsLabelHtml(ch)}</span><small>${L.chordsBeatsText(ch.beats)}</small></button>`).join('');
    const add = st.chords.length < L.CH_MAX_CHORDS
        ? '<button type="button" class="cb-seq-add" data-cb="add" title="Ajouter un accord après celui-ci (copie de l\'accord choisi)" aria-label="Ajouter un accord">+</button>' : '';
    const beats = Array.from(new Set(L.CH_BEATS_CHOICES.concat([c.beats]))).sort((a, b) => a - b)
        .map(b => `<option value="${b}"${b === c.beats ? ' selected' : ''}>${L.chordsBeatsText(b)}</option>`).join('');
    const picker = L.chordPickerHtml({ rootIndex: c.pc, chordId: c.id, mode: v.pickerMode === 'cat' ? 'cat' : 'build', rootLabels: L.chordsLabels(c.acc), jazz: L.chordsJazz, findChordObj });
    const chip = (on, attrs, inner) => `<button type="button" class="jm-chip${on ? ' is-on' : ''}" ${attrs}>${inner}</button>`;
    return `<div class="jm-head cb-head" title="Glisser le bandeau pour déplacer la fenêtre"><span class="jm-title">Accords</span>
            <button type="button" class="jm-btn jm-primary" data-cb="done" title="Fermer l'éditeur (Échap)">Terminé</button></div>
        <div class="cb-seq" role="group" aria-label="Suite d'accords">${chips}${add}</div>
        <div class="cb-ctl">
            <label class="cb-beats" title="Durée de l'accord choisi, en temps (la durée d'un temps suit le tempo de la jam)">Durée <select class="jm-select" data-cb="beats">${beats}</select> <span>temps</span></label>
            <button type="button" class="jm-btn" data-cb="left" title="Reculer l'accord choisi dans la suite"${v.sel > 0 ? '' : ' disabled'}>←</button>
            <button type="button" class="jm-btn" data-cb="right" title="Avancer l'accord choisi dans la suite"${v.sel < st.chords.length - 1 ? '' : ' disabled'}>→</button>
            <button type="button" class="jm-btn jm-danger" data-cb="del" title="Supprimer l'accord choisi"${st.chords.length > 1 ? '' : ' disabled'}>Supprimer</button>
        </div>
        <div class="cb-ctl">
            <div class="jm-mode cb-mode" role="group" aria-label="Lecture">
                ${chip(st.mode === 'b', 'data-cb="mode" data-v="b" title="Toutes les notes de l\'accord ensemble"', 'Plaqué')}
                ${chip(st.mode === 'a', 'data-cb="mode" data-v="a" title="Les notes l\'une après l\'autre, de bas en haut"', 'Arpégé')}
            </div>
            <button type="button" class="jm-btn cb-listen" data-cb="play" title="Écouter le bloc">${v.playing ? '■ Stop' : '▶ Écouter'}</button>
        </div>
        <div class="cb-ctl cb-play-set" role="group" aria-label="Réglages de lecture de ce bloc">
            <label class="cb-beats" title="Tempo de ce bloc, en noires par minute (vide : tempo de la jam)">♩ = <input type="number" class="jm-select cb-num" data-cb="bpm" min="${L.SN_BPM_MIN}" max="${L.SN_BPM_MAX}" step="1" inputmode="numeric" placeholder="jam" value="${st.bpm || ''}" aria-label="Tempo, en noires par minute"></label>
            <label class="cb-beats" title="Swing de ce bloc : 50 % = croches droites, 67 % = triolet">Swing <select class="jm-select" data-cb="swing" aria-label="Swing de lecture">${chordSwingOptions(st.swing)}</select></label>
            <label class="cb-beats" title="Instrument transpositeur de ce bloc : la hauteur est transposée à la lecture">Instr. <select class="jm-select" data-cb="instr" aria-label="Instrument transpositeur">${chordInstrOptions(st.instr)}</select></label>
        </div>
        <div class="cb-picker">${picker}</div>`;
}

// opts (donnés par l'appli) : isEditable() ; canvas() → canevas de la zone ; keepOpen(cible) ; onChange(view) après chaque modification (enregistrée par l'appli) ;
//   onMoved(view) ; onActivate / onDeactivate(view) ; onFocusBack(view) ; onGrab(view) ; audio { ready(), play(midi, après, durée), bpm() }.
class ChordBlockView {
    constructor(el, opts) {
        this.el = el;
        this.opts = opts;
        this.st = chordsParse(el.getAttribute('data-chords') || '') || chordsDefault();
        this.sel = 0;
        this.legacy = false;
        const at = parseBlockAt(el.getAttribute('data-at') || '');
        this.pos = at || { x: 0, y: 0 };
        this.border = parseBlockBorder(el.getAttribute('data-border'));
        this.pickerMode = 'build';
        try { if (localStorage.getItem(CHB_PICKER_MODE_KEY) === 'cat') this.pickerMode = 'cat'; } catch (e) { /* stockage indisponible */ }
        this.playing = null;
        el.__chordBlock = this;
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Bloc d\'accords');
        el.classList.toggle('no-border', !this.border);
        el.innerHTML = '';
        this.editBtn = document.createElement('button');
        this.editBtn.type = 'button'; this.editBtn.className = 'annot-chords-edit'; this.editBtn.setAttribute('contenteditable', 'false');
        this.editBtn.title = 'Modifier les accords (un second clic referme l\'éditeur)'; this.editBtn.setAttribute('aria-label', 'Modifier les accords'); this.editBtn.textContent = '✎';
        this.row = document.createElement('div');
        this.row.className = 'annot-chords-row';
        el.appendChild(this.editBtn);
        el.appendChild(this.row);
        this._showPos();
        this._render();
        this._bind();
    }

    get editable() { return !!this.opts.isEditable(); }

    get isActive() { return this.el.classList.contains('is-editing'); }

    _canvas() { return this.opts.canvas ? this.opts.canvas() : null; }

    _zone() { return this.el.closest('.jam-annot-text') || this.el.parentElement; }

    // ----- Affichage -----

    _render() {
        // Un domino (cadre complet) par accord : clic = l'accord se joue ; sa largeur suit sa durée.
        this.row.innerHTML = this.st.chords.map((c, i) => `<span class="cb-chord${this.isActive && i === this.sel ? ' is-sel' : ''}" data-i="${i}" style="--b:${c.beats}" title="Jouer cet accord">`
            + `<span class="cb-sym">${chordsLabelHtml(c)}</span><small class="cb-dur">${chordsBeatsText(c.beats)}</small></span>`).join('');
        this.el.setAttribute('data-chords', chordsFormat(this.st));
        this.el.classList.toggle('is-arp', this.st.mode === 'a');
    }

    _hilite(i) {
        this.row.querySelectorAll('.cb-chord').forEach((n, k) => n.classList.toggle('is-playing', k === i));
    }

    // ----- Enregistrement -----

    commit() {
        this.el.setAttribute('data-chords', chordsFormat(this.st));
        this._showPos();
        if (this.opts.onChange) this.opts.onChange(this);
    }

    _showPos() {
        const { x, y } = this.pos;
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.setProperty('--bx', `${x}px`); // origine du zoom de la zone (voir style.css)
        this.el.style.setProperty('--by', `${y}px`);
        this.el.setAttribute('data-at', formatBlockAt(this.pos));
    }

    // Pose la place (entiers positifs, sur le canevas) ; renvoie true si elle a changé. N'enregistre rien (voir commit).
    setAt(pos) {
        const x = clampBlockAt(pos.x), y = clampBlockAt(pos.y);
        if (x === this.pos.x && y === this.pos.y) return false;
        this.pos = { x, y };
        this._showPos();
        if (this.isActive) this._popPosition();
        return true;
    }

    setBorder(on) {
        on = !!on;
        if (on === this.border) return false;
        this.border = on;
        this.el.classList.toggle('no-border', !on);
        if (on) this.el.removeAttribute('data-border'); else this.el.setAttribute('data-border', '0');
        return true;
    }

    // Modification de la suite d'accords (op : voir chordsEdit) : le bloc, la fenêtre et l'enregistrement suivent.
    _edit(op, v) {
        const next = chordsEdit(this.st, this.sel, op, v);
        if (!next) return false;
        this.st = next;
        if (op === 'add') this.sel = Math.min(this.sel + 1, next.chords.length - 1);
        else if (op === 'remove') this.sel = Math.min(this.sel, next.chords.length - 1);
        else if (op === 'move') this.sel = Math.max(0, Math.min(next.chords.length - 1, this.sel + (v < 0 ? -1 : 1)));
        this._render();
        this._popRender();
        this.commit();
        return true;
    }

    // ----- Souris et doigt -----

    _bind() {
        const el = this.el;
        this.editBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        this.editBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (!this.editable) return;
            if (this.isActive) { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); } else this.activate();
        });
        // Au repos : un clic le sélectionne, un glisser le déplace. En édition, un clic sur un accord le choisit dans la fenêtre.
        el.addEventListener('pointerdown', (ev) => this._down(ev));
        el.addEventListener('dblclick', (ev) => {
            if (ev.target.closest('.annot-chords-edit, .cn-staff-play') || this.isActive || !this.editable) return;
            ev.preventDefault(); ev.stopPropagation();
            this.activate();
        });
        // Un simple clic sur un domino joue cet accord (pas après un glisser) ; dans l'éditeur ouvert, il devient aussi l'accord choisi.
        el.addEventListener('pointerdown', (ev) => { this._downXY = { x: ev.clientX, y: ev.clientY }; }, true);
        el.addEventListener('click', (ev) => {
            const chip = ev.target.closest && ev.target.closest('.cb-chord');
            if (!chip) return;
            const d = this._downXY;
            if (d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return;
            const i = Math.max(0, Math.min(this.st.chords.length - 1, parseInt(chip.dataset.i, 10) || 0));
            if (this.isActive) { this.sel = i; this._render(); this._popRender(); }
            this.playChord(i);
        });
    }

    _down(ev) {
        if (!this.editable || ev.button > 0 || this.isActive) return;
        if (ev.target.closest && ev.target.closest('.annot-chords-edit, .cn-staff-play')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const cv = this._canvas();
        if (cv) cv.startMove(this, ev);
    }

    // ----- Fenêtre d'édition -----

    activate() {
        if (!this.editable) return;
        if (CHB_ACTIVE && CHB_ACTIVE !== this) CHB_ACTIVE.deactivate();
        if (typeof DRB_ACTIVE !== 'undefined' && DRB_ACTIVE) DRB_ACTIVE.deactivate();
        if (typeof NTF_ACTIVE !== 'undefined' && NTF_ACTIVE) NTF_ACTIVE.deactivate();
        if (typeof NSE_ACTIVE !== 'undefined' && NSE_ACTIVE) NSE_ACTIVE.deactivate();
        const cv = this._canvas();
        if (cv) cv.clearSelection(true);
        CHB_ACTIVE = this;
        this.sel = Math.max(0, Math.min(this.sel, this.st.chords.length - 1));
        this.el.classList.add('is-editing');
        this.el.classList.remove('is-picked');
        this._render();
        this._popOpen();
        if (this.opts.onActivate) this.opts.onActivate(this);
        if (!this._outside) {
            this._outside = (ev) => {
                const t = ev.target;
                if (!t || this.el.contains(t) || (this.pop && this.pop.contains(t))) return;
                if (this.opts.keepOpen && this.opts.keepOpen(t)) return;
                if (ev.pointerType === 'touch' && typeof acOnTouchTap === 'function') acOnTouchTap(ev, () => { if (this.isActive) this.deactivate(); });
                else this.deactivate();
            };
            document.addEventListener('pointerdown', this._outside, true);
        }
        if (!this._escKey) {
            // Échap ferme l'éditeur, où que soit le focus (le menu de durée ou le sélecteur peuvent l'avoir perdu en se redessinant).
            this._escKey = (ev) => {
                if (ev.key !== 'Escape' || !this.isActive) return;
                ev.preventDefault(); ev.stopPropagation();
                this.deactivate();
                if (this.opts.onFocusBack) this.opts.onFocusBack(this);
            };
            document.addEventListener('keydown', this._escKey, true);
        }
    }

    deactivate() {
        if (!this.isActive) return;
        this.stop();
        this.el.classList.remove('is-editing');
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (this._escKey) { document.removeEventListener('keydown', this._escKey, true); this._escKey = null; }
        if (CHB_ACTIVE === this) CHB_ACTIVE = null;
        this._popClose();
        this._render();
        this.commit();
        if (this.opts.onDeactivate) this.opts.onDeactivate(this);
    }

    destroy() {
        this.stop();
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (this._escKey) { document.removeEventListener('keydown', this._escKey, true); this._escKey = null; }
        if (CHB_ACTIVE === this) CHB_ACTIVE = null;
        this._popClose();
    }

    _popOpen() {
        if (this.pop) return;
        const pop = document.createElement('div');
        pop.className = 'jm-pop cn-chord-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Éditeur d\'accords');
        pop.addEventListener('mousedown', (ev) => { if (!ev.target.closest('select, input')) ev.preventDefault(); }); // les boutons ne volent pas le focus
        pop.addEventListener('click', (ev) => this._popClick(ev));
        pop.addEventListener('change', (ev) => this._popChange(ev));
        acPopDrag(pop);
        (document.fullscreenElement || document.body).appendChild(pop);
        this.pop = pop;
        this._reposition = () => this._popPosition();
        window.addEventListener('resize', this._reposition);
        const z = this._zone();
        if (z) z.addEventListener('scroll', this._reposition, { passive: true });
        this._popRender();
    }

    _popClose() {
        if (!this.pop) return;
        this.pop.remove();
        this.pop = null;
        window.removeEventListener('resize', this._reposition);
        const z = this._zone();
        if (z) z.removeEventListener('scroll', this._reposition);
    }

    _popRender() {
        if (!this.pop) return;
        const keep = this.pop.scrollTop;
        this.pop.innerHTML = chordEditorHtml({ st: this.st, sel: this.sel, pickerMode: this.pickerMode, playing: !!this.playing });
        this.pop.scrollTop = keep;
        this._popPosition();
    }

    // Sous le bloc (ou au-dessus s'il n'y a pas la place), déplaçable par son bandeau ; sur téléphone, en feuille collée au bas de l'écran.
    _popPosition() {
        const pop = this.pop;
        if (!pop) return;
        const phone = typeof acIsPhone === 'function' && acIsPhone();
        pop.classList.toggle('jm-sheet', phone);
        if (phone) { pop.style.left = ''; pop.style.top = ''; return; }
        if (acPopManual(pop)) return;   // déplacée à la main : elle reste où on l'a mise
        const r = this.el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
        const w = pop.offsetWidth, h = pop.offsetHeight;
        const below = r.bottom + 8, above = r.top - 8 - h;
        pop.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8))}px`;
        pop.style.top = `${Math.max(8, (below + h > vh - 8 && above >= 8) ? above : Math.min(below, vh - h - 8))}px`;
    }

    _popClick(ev) {
        const t = ev.target;
        let b;
        if ((b = t.closest('[data-cb]'))) {
            const act = b.dataset.cb;
            if (b.disabled) return;
            if (act === 'done') { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); }
            else if (act === 'pick') { this.sel = Math.max(0, Math.min(this.st.chords.length - 1, parseInt(b.dataset.i, 10) || 0)); this._render(); this._popRender(); }
            else if (act === 'add') this._edit('add');
            else if (act === 'del') this._edit('remove');
            else if (act === 'left') this._edit('move', -1);
            else if (act === 'right') this._edit('move', 1);
            else if (act === 'mode') this._edit('setMode', b.dataset.v);
            else if (act === 'play') { if (this.playing) this.stop(); else this.play(); this._popRender(); }
            return;
        }
        if ((b = t.closest('[data-act]')) && b.tagName !== 'SELECT') this._pickerAction(b.dataset.act, b.dataset.v);
    }

    _popChange(ev) {
        const t = ev.target;
        if (t.matches('[data-cb="beats"]')) this._edit('setBeats', parseFloat(t.value));
        else if (t.matches('[data-cb="bpm"]')) { const v = String(t.value).trim(); this._edit('setBpm', v === '' ? 0 : v); this._popRender(); }
        else if (t.matches('[data-cb="swing"]')) this._edit('setSwing', t.value);
        else if (t.matches('[data-cb="instr"]')) this._edit('setInstr', t.value);
        else if (t.matches('[data-act="chordsel"]') && t.value) this._pickerAction('chord', t.value);
    }

    // Mêmes actions que le sélecteur d'accord de Chord Scales (onChordPickerAction) : fondamentale, accord du catalogue, tierce / quinte / septième / tensions.
    _pickerAction(act, v) {
        const c = this.st.chords[this.sel];
        if (!c) return;
        if (act === 'mode') {
            this.pickerMode = v === 'cat' ? 'cat' : 'build';
            try { localStorage.setItem(CHB_PICKER_MODE_KEY, this.pickerMode); } catch (e) { /* stockage indisponible */ }
            this._popRender();
            return;
        }
        if (act === 'root') {
            const root = chordPickerParseRoot(v);
            if (root) this._edit('setRoot', root);
        } else if (act === 'chord') this._edit('setId', v);
        else if (act === 'third' || act === 'fifth' || act === 'sev' || act === 'ext') {
            const id = chordPickerBuild(c.id, act, v);
            if (id) this._edit('setId', id);
        }
    }

    // ----- Lecture -----

    get canPlay() { return !!(this.opts.audio && this.st.chords.length); }

    // Joue tout le bloc, ou seulement l'accord `only` (clic sur son domino). Tempo, swing et instrument sont ceux du bloc (à défaut, ceux de la jam).
    play(only) {
        const a = this.opts.audio;
        if (!a || !this.st.chords.length) return;
        this.stop();
        const single = Number.isInteger(only) && this.st.chords[only];
        const st = single ? Object.assign({}, this.st, { chords: [this.st.chords[only]] }) : this.st;
        const offset = single ? only : 0;
        const token = { timers: [] };
        this.playing = token;
        a.ready().then((ok) => {
            if (!ok || this.playing !== token) { if (this.playing === token) this._ended(token); return; }
            const beat = 60 / chordsTempo(st, a.bpm());
            const plan = chordsPlan(st, chordsSwingRatio(st, a.swing ? a.swing() : null));
            const nodes = [];
            plan.events.forEach(n => { const node = a.play(n.midi, n.at * beat, n.len * beat, st.instr); if (node) nodes.push(node); });
            token.nodes = nodes;
            plan.chords.forEach((s, i) => token.timers.push(setTimeout(() => { if (this.playing === token) this._hilite(i + offset); }, s.at * beat * 1000)));
            token.timers.push(setTimeout(() => { if (this.playing === token) this._ended(token); }, plan.total * beat * 1000 + 150));
        });
        this._refreshPlay();
    }

    playChord(i) { this.play(i); }

    stop() {
        const t = this.playing;
        if (!t) return;
        this._ended(t);
        (t.nodes || []).forEach(n => { try { n.stop(); } catch (e) { /* déjà arrêtée */ } });
    }

    _ended(token) {
        if (this.playing === token) this.playing = null;
        (token.timers || []).forEach(clearTimeout);
        this._hilite(-1);
        this._refreshPlay();
    }

    _refreshPlay() {
        const b = this.pop && this.pop.querySelector('[data-cb="play"]');
        if (b) b.textContent = this.playing ? '■ Stop' : '▶ Écouter';
    }
}

// Petit bloc enregistrable d'un bloc d'accords (voir chordsStubHtml) : tout est dans data-chords, sa place et son bord.
function hydrateChordBlocks(root, opts) {
    root.querySelectorAll('.annot-chords').forEach((el) => {
        if (el.__chordBlock && el.isConnected && el.__chordBlock.el === el && el.querySelector(':scope > .annot-chords-row')) return;
        new ChordBlockView(el, opts);
    });
}

// Texte brut des blocs `els` pour le presse-papiers : comme nseBlocksToClipText (ui/staff-editor.js), avec « [accords…] » pour un bloc d'accords.
function annotBlocksToClipText(els) {
    return els.map((n) => {
        if (n.classList.contains('annot-draw')) {
            const d = drawParse(n.getAttribute('data-draw') || '');
            return d ? drawClipText(d, { at: parseBlockAt(n.getAttribute('data-at') || ''), border: parseBlockBorder(n.getAttribute('data-border')) }) : '';
        }
        if (!n.classList.contains('annot-chords')) return nseBlocksToClipText([n]);
        const st = chordsParse(n.getAttribute('data-chords') || '');
        return st ? chordsClipText(st, { at: parseBlockAt(n.getAttribute('data-at') || ''), border: parseBlockBorder(n.getAttribute('data-border')) }) : '';
    }).join('');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { chordEditorHtml };
}
