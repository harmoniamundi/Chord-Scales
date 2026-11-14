// ui/draw-block.js — cadre de dessin libre posé sur le canevas d'une zone d'annotation (<div class="annot-draw" data-draw="…" data-at="x,y">).
// On y dessine à la souris, au stylet ou au doigt (événements « pointeur » : un même code pour les trois). Au repos, le cadre se déplace comme les autres
// blocs (ui/annot-canvas.js) ; le crayon ✎ (ou un double-clic) l'ouvre en édition : une petite fenêtre propose l'outil (crayon, surligneur, gomme), la couleur,
// l'épaisseur, annuler / rétablir et « Tout effacer » ; une poignée en bas à droite change la taille du cadre.
// Le format, la simplification des traits et la gomme sont dans ui/draw-notes.js (sans DOM, testé) ; ici, seulement l'écran.
// Chargé par index.html via <script src="app/ui/draw-block.js"> (après ui/draw-notes.js et ui/annot-canvas.js).

let DRB_ACTIVE = null; // le cadre de dessin en édition (un seul à la fois)

const DRB_PEN_KEY = 'jamDrawPen';
const DRB_ERASER_MIN = 6, DRB_ERASER_MAX = 60, DRB_ERASER_DEFAULT = 18;   // diamètre de la gomme (pixels du cadre)
const DRB_HL_FACTOR = 3;      // le surligneur est trois fois plus épais que le crayon

// Fonctions des autres modules : globales dans le navigateur, chargées sous Node (tests).
const DRB_L = (typeof DR_COLORS !== 'undefined')
    ? { DR_COLORS, DR_BG_COLORS, DR_STROKE_MIN, DR_STROKE_MAX, DR_SMOOTH_MIN, DR_SMOOTH_MAX, DR_SMOOTH_DEFAULT, drawColor, drawBg }
    : require('./draw-notes.js');

// Réglages du stylo, communs à tous les cadres (et rappelés d'une séance à l'autre) : outil, couleur, épaisseur du crayon.
const DRB_PEN = { tool: 'pen', color: '#0f172a', width: 3, smooth: DRB_L.DR_SMOOTH_DEFAULT, eraser: DRB_ERASER_DEFAULT, fit: true, pressure: true };
(function drbLoadPen() {
    try {
        const o = JSON.parse(localStorage.getItem(DRB_PEN_KEY) || 'null');
        if (!o) return;
        if (['pen', 'hl', 'eraser'].includes(o.tool)) DRB_PEN.tool = o.tool;
        if (DRB_L.drawColor(o.color)) DRB_PEN.color = DRB_L.drawColor(o.color);
        const w = Math.round(Number(o.width));
        if (w >= DRB_L.DR_STROKE_MIN && w <= DRB_L.DR_STROKE_MAX) DRB_PEN.width = w;
        const sm = Math.round(Number(o.smooth));
        if (o.smooth !== undefined && sm >= DRB_L.DR_SMOOTH_MIN && sm <= DRB_L.DR_SMOOTH_MAX) DRB_PEN.smooth = sm;
        if (o.fit === false) DRB_PEN.fit = false;
        if (o.pressure === false) DRB_PEN.pressure = false;
        const er = Math.round(Number(o.eraser));
        if (er >= DRB_ERASER_MIN && er <= DRB_ERASER_MAX) DRB_PEN.eraser = er;
    } catch (e) { /* stockage indisponible ou réglage illisible : valeurs par défaut */ }
})();
function drbSavePen() { try { localStorage.setItem(DRB_PEN_KEY, JSON.stringify(DRB_PEN)); } catch (e) { /* stockage indisponible */ } }

// Les points d'un mouvement : tous les événements regroupés par le navigateur (tracé fin), ou l'événement lui-même.
function drbEvents(e) { const l = e.getCoalescedEvents ? e.getCoalescedEvents() : []; return l.length ? l : [e]; }

// Épaisseur réellement tracée selon l'outil.
function drbWidthFor(pen) { return pen.tool === 'hl' ? Math.min(DRB_L.DR_STROKE_MAX, pen.width * DRB_HL_FACTOR) : pen.width; }

// HTML de la fenêtre d'édition (sans DOM) : outil, couleur, épaisseur et lissage (ou taille de la gomme), fond, annuler / rétablir / tout effacer.
//   v : { pen: { tool, color, width, smooth, eraser }, bg (fond du cadre : '', 't' ou '#rrggbb'), canUndo, canRedo, hasStrokes }
function drawEditorHtml(v) {
    const L = DRB_L, pen = v.pen, eraser = pen.tool === 'eraser';
    const tool = (id, label, title) => `<button type="button" class="jm-chip${pen.tool === id ? ' is-on' : ''}" data-dr="tool" data-v="${id}" title="${title}" aria-pressed="${pen.tool === id}">${label}</button>`;
    const sw = L.DR_COLORS.map(c => `<button type="button" class="dr-sw${c === L.drawColor(pen.color) ? ' is-on' : ''}" data-dr="color" data-v="${c}" style="background:${c}" title="${c}" aria-label="Couleur ${c}"></button>`).join('');
    const custom = !L.DR_COLORS.includes(L.drawColor(pen.color));
    const dotW = Math.min(26, drbWidthFor(pen));
    const bg = L.drawBg(v.bg), shown = bg || '#ffffff';
    const bgSw = [`<button type="button" class="dr-sw dr-sw-none${bg === 't' ? ' is-on' : ''}" data-dr="bg" data-v="t" title="Fond transparent" aria-label="Fond transparent"></button>`]
        .concat(L.DR_BG_COLORS.map(c => `<button type="button" class="dr-sw${shown === c ? ' is-on' : ''}" data-dr="bg" data-v="${c}" style="background:${c}" title="Fond ${c}" aria-label="Fond ${c}"></button>`)).join('');
    const bgCustom = bg !== 't' && !L.DR_BG_COLORS.includes(shown);
    const sizeRows = eraser
        ? `<div class="dr-row dr-width">
            <label>Taille de la gomme <input type="range" class="dr-range" data-dr="erasersize" min="${DRB_ERASER_MIN}" max="${DRB_ERASER_MAX}" step="1" value="${pen.eraser}" aria-label="Taille de la gomme"></label>
            <output class="dr-val" data-out="erasersize">${pen.eraser} px</output>
        </div>`
        : `<div class="dr-row dr-width">
            <label>Épaisseur <input type="range" class="dr-range" data-dr="width" min="${L.DR_STROKE_MIN}" max="${Math.floor(L.DR_STROKE_MAX / 2)}" step="1" value="${pen.width}" aria-label="Épaisseur du trait"></label>
            <output class="dr-val" data-out="width">${pen.width} px</output>
            <span class="dr-dot" style="width:${dotW}px;height:${dotW}px;background:${L.drawColor(pen.color)}${pen.tool === 'hl' ? ';opacity:.4' : ''}" aria-hidden="true"></span>
        </div>
        <div class="dr-row dr-width">
            <label title="0 : trait tel que tracé ; plus haut : trait plus lisse, moins tremblant">Lissage <input type="range" class="dr-range" data-dr="smooth" min="${L.DR_SMOOTH_MIN}" max="${L.DR_SMOOTH_MAX}" step="1" value="${pen.smooth}" aria-label="Lissage du tracé"></label>
            <output class="dr-val" data-out="smooth">${pen.smooth}</output>
        </div>${pen.tool === 'pen' ? `
        <div class="dr-row">
            <button type="button" class="jm-chip${pen.pressure !== false ? ' is-on' : ''}" data-dr="pressure" aria-pressed="${pen.pressure !== false}" title="Allumé : avec un stylet, le trait s'épaissit quand on appuie et s'affine quand on allège (l'épaisseur réglée est celle d'une pression moyenne). Sans effet à la souris ou au doigt.">Pression du stylet</button>
        </div>` : ''}`;
    return `<div class="jm-head cb-head" title="Glisser le bandeau pour déplacer la fenêtre"><span class="jm-title">Dessin</span>
            <button type="button" class="jm-btn jm-primary" data-dr="done" title="Fermer l'éditeur (Échap)">Terminé</button></div>
        <div class="dr-row jm-mode" role="group" aria-label="Outil">
            ${tool('pen', '✎ Crayon', 'Trait plein')}${tool('hl', 'Surligneur', 'Trait épais et translucide')}${tool('eraser', 'Gomme', 'Efface les traits que l\'on touche')}
        </div>
        ${eraser ? '' : `<div class="dr-row dr-colors" role="group" aria-label="Couleur du trait">${sw}
            <label class="dr-sw dr-sw-custom${custom ? ' is-on' : ''}" title="Autre couleur…" style="${custom ? `background:${L.drawColor(pen.color)}` : ''}"><input type="color" data-dr="custom" value="${L.drawColor(pen.color) || '#0f172a'}" aria-label="Autre couleur"></label>
        </div>`}
        ${sizeRows}
        <div class="dr-sec">Fond du cadre</div>
        <div class="dr-row dr-colors" role="group" aria-label="Fond du cadre">${bgSw}
            <label class="dr-sw dr-sw-custom${bgCustom ? ' is-on' : ''}" title="Autre fond…" style="${bgCustom ? `background:${shown}` : ''}"><input type="color" data-dr="bgcustom" value="${bgCustom ? shown : '#ffffff'}" aria-label="Autre couleur de fond"></label>
        </div>
        <div class="dr-row">
            <button type="button" class="jm-chip${pen.fit !== false ? ' is-on' : ''}" data-dr="fit" aria-pressed="${pen.fit !== false}" title="Allumé : tirer la poignée du cadre agrandit ou réduit aussi le dessin. Éteint : le cadre change de taille, le dessin reste tel quel.">Le dessin suit le cadre</button>
        </div>
        <div class="dr-row">
            <button type="button" class="jm-btn" data-dr="undo" title="Annuler le dernier trait"${v.canUndo ? '' : ' disabled'}>↶</button>
            <button type="button" class="jm-btn" data-dr="redo" title="Rétablir"${v.canRedo ? '' : ' disabled'}>↷</button>
            <button type="button" class="jm-btn jm-danger" data-dr="clear" title="Effacer tout le dessin du cadre"${v.hasStrokes ? '' : ' disabled'}>Tout effacer</button>
        </div>`;
}

// opts (donnés par l'appli) : isEditable() ; canvas() → canevas de la zone ; keepOpen(cible) ; onChange(view) après chaque modification (enregistrée par l'appli) ;
//   onMoved(view) ; onActivate / onDeactivate(view) ; onFocusBack(view) ; onGrab(view).
class DrawBlockView {
    constructor(el, opts) {
        this.el = el;
        this.opts = opts;
        this.st = drawParse(el.getAttribute('data-draw') || '') || drawDefault();
        this.undoStack = []; this.redoStack = [];
        const at = parseBlockAt(el.getAttribute('data-at') || '');
        this.pos = at || { x: 0, y: 0 };
        this.border = parseBlockBorder(el.getAttribute('data-border'));
        el.__drawBlock = this;
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Cadre de dessin');
        el.classList.toggle('no-border', !this.border);
        el.innerHTML = '';
        this.editBtn = document.createElement('button');
        this.editBtn.type = 'button'; this.editBtn.className = 'annot-draw-edit'; this.editBtn.setAttribute('contenteditable', 'false');
        this.editBtn.title = 'Dessiner (un second clic referme l\'éditeur)'; this.editBtn.setAttribute('aria-label', 'Dessiner dans ce cadre'); this.editBtn.textContent = '✎';
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('class', 'annot-draw-svg');
        this.grip = document.createElement('div');
        this.grip.className = 'annot-draw-grip'; this.grip.setAttribute('contenteditable', 'false'); this.grip.title = 'Changer la taille du cadre';
        this.ring = document.createElement('div');
        this.ring.className = 'annot-draw-eraser'; this.ring.setAttribute('aria-hidden', 'true');
        el.appendChild(this.svg);
        el.appendChild(this.ring);
        el.appendChild(this.editBtn);
        el.appendChild(this.grip);
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
        const { w, h } = this.st;
        this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        this.svg.setAttribute('width', String(w));
        this.svg.setAttribute('height', String(h));
        this.svg.innerHTML = drawSvgInner(this.st);
        this.el.style.width = `${w}px`;
        this.el.style.height = `${h}px`;
        this.el.style.background = drawBgCss(this.st.bg);   // '' : fond de la feuille de style (blanc, transparent sans bord)
        this.el.setAttribute('data-draw', drawFormat(this.st));
    }

    // ----- Enregistrement -----

    commit() {
        this.el.setAttribute('data-draw', drawFormat(this.st));
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

    // Applique une modification (`next` : nouveau cadre) : annulable trait par trait dans l'éditeur, enregistrée par l'appli.
    _apply(next, base) {
        if (!next) return false;
        this.undoStack.push(base || this.st);
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.redoStack = [];
        this.st = next;
        this._render();
        this._popRender();
        this.commit();
        return true;
    }

    _undo() { const p = this.undoStack.pop(); if (!p) return; this.redoStack.push(this.st); this.st = p; this._render(); this._popRender(); this.commit(); }

    _redo() { const n = this.redoStack.pop(); if (!n) return; this.undoStack.push(this.st); this.st = n; this._render(); this._popRender(); this.commit(); }

    _hint(text) {
        const b = this.pop && this.pop.querySelector('.dr-hint');
        if (!b) return;
        b.textContent = text;
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => { if (b.isConnected) b.textContent = ''; }, 2200);
    }

    // ----- Dessin : souris, stylet, doigt -----

    // Point du pointeur, en pixels du cadre (le zoom de la page est pris en compte par le rapport entre la taille affichée et la taille du cadre).
    _pt(ev) {
        const r = this.svg.getBoundingClientRect();
        const kx = r.width > 0 ? this.st.w / r.width : 1, ky = r.height > 0 ? this.st.h / r.height : 1;
        return [(ev.clientX - r.left) * kx, (ev.clientY - r.top) * ky];
    }

    _penDown(ev) {
        if (!this.isActive || !this.editable || ev.button > 0) return;
        if (ev.pointerType === 'pen') this._penSeen = true;
        if (ev.pointerType === 'touch' && this._penSeen) return; // paume posée pendant qu'on écrit au stylet : ignorée
        ev.preventDefault();
        ev.stopPropagation();
        const svg = this.svg;
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const pen = DRB_PEN;
        const pressure = DRB_PEN.tool === 'pen' && DRB_PEN.pressure !== false && ev.pointerType === 'pen';   // épaisseur variable : stylet seulement
        const lvl = (e) => (pressure ? drawPressureLevel(e.pressure) : DR_LEVEL_MID);
        const pts = [this._pt(ev).concat(pressure ? [lvl(ev)] : [])];
        const base = this.st;
        let live = null, raf = 0, erased = false;
        if (pen.tool === 'eraser') {
            const erase = (p) => { const nx = drawEraseAt(this.st, p[0], p[1], DRB_PEN.eraser / 2); if (nx) { this.st = nx; erased = true; this._render(); } };
            erase(pts[0]);
            this._ringAt(ev);
            const onMove = (e2) => { if (e2.pointerId === ev.pointerId) { this._ringAt(e2); drbEvents(e2).forEach(e3 => erase(this._pt(e3))); } };
            const onEnd = (e2) => {
                svg.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerup', onEnd); svg.removeEventListener('pointercancel', onEnd);
                try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
                if (e2 && e2.pointerType && e2.pointerType !== 'mouse') this._ringHide();   // au doigt ou au stylet, le rond disparaît quand on lève
                if (!erased) return;
                const cur = this.st; this.st = base;           // _apply range l'état d'avant dans l'historique
                this._apply(cur, base);
            };
            svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onEnd); svg.addEventListener('pointercancel', onEnd);
            return;
        }
        const color = pen.color, width = drbWidthFor(pen), hl = pen.tool === 'hl', smooth = pen.smooth;
        const NS = 'http://www.w3.org/2000/svg';
        live = document.createElementNS(NS, 'path');
        live.setAttribute('pointer-events', 'none');
        const paint = () => {
            raf = 0;
            const sm = drawSmooth(pts, smooth).map(q => (q.length > 2 ? [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, q[2]] : [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]));   // l'aperçu est déjà le trait lissé final
            if (pressure && sm.some(q => Math.round(q[2]) !== DR_LEVEL_MID)) {
                live.setAttribute('d', drawVarPathD(sm, width)); live.setAttribute('fill', color); live.setAttribute('stroke-width', '0.4');
            } else {
                live.setAttribute('d', drawPathD(sm)); live.setAttribute('fill', 'none'); live.setAttribute('stroke-width', String(width));
            }
        };
        const attrs = drawStrokeAttrs({ c: color, w: width, h: hl });
        attrs.replace(/([\w-]+)="([^"]*)"/g, (all, k, v) => { live.setAttribute(k, v); return all; });
        svg.appendChild(live);
        paint();
        const onMove = (e2) => {
            if (e2.pointerId !== ev.pointerId) return;
            drbEvents(e2).forEach(e3 => {
                const q = this._pt(e3).concat(pressure ? [lvl(e3)] : []), last = pts[pts.length - 1];
                if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.6) pts.push(q);
            });
            if (!raf) raf = requestAnimationFrame(paint);
        };
        const end = (e2, keep) => {
            svg.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerup', onUp); svg.removeEventListener('pointercancel', onCancel);
            try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (raf) cancelAnimationFrame(raf);
            live.remove();
            if (!keep) return;
            const next = drawAddStroke(this.st, color, width, hl, pts, smooth);
            if (next) this._apply(next); else this._hint('Dessin plein : effacez des traits');
        };
        const onUp = (e2) => end(e2, true);
        const onCancel = (e2) => end(e2, false);
        svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp); svg.addEventListener('pointercancel', onCancel);
    }

    // Rond de la gomme : centré sur le pointeur, au diamètre de la gomme (en pixels du cadre : il suit le zoom de la page).
    _ringAt(ev) {
        if (!this.isActive || DRB_PEN.tool !== 'eraser') { this._ringHide(); return; }
        const [x, y] = this._pt(ev), d = DRB_PEN.eraser, r = this.ring;
        r.style.width = r.style.height = `${d}px`;
        r.style.left = `${x - d / 2}px`; r.style.top = `${y - d / 2}px`;
        r.style.display = 'block';
    }

    _ringHide() { this.ring.style.display = 'none'; }

    // Poignée du coin bas droit : change la taille du cadre (les traits ne bougent pas).
    _gripDown(ev) {
        if (!this.editable || ev.button > 0) return;
        ev.preventDefault(); ev.stopPropagation();
        if (this.opts.onGrab) this.opts.onGrab(this);
        const g = this.grip;
        try { g.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const r = this.svg.getBoundingClientRect();
        const kx = r.width > 0 ? this.st.w / r.width : 1, ky = r.height > 0 ? this.st.h / r.height : 1;
        const x0 = ev.clientX, y0 = ev.clientY, base = this.st;
        const fit = DRB_PEN.fit !== false;   // le dessin suit le cadre (comme les autres cadres) ou le cadre seul change
        let moved = false;
        const onMove = (e2) => {
            const w = base.w + (e2.clientX - x0) * kx, h = base.h + (e2.clientY - y0) * ky;
            // Proportions conservées : le facteur est la projection du glissement sur la diagonale du cadre.
            const nx = fit ? drawScale(base, (w * base.w + h * base.h) / (base.w * base.w + base.h * base.h)) : drawResize(base, w, h);
            if (nx) { this.st = nx; moved = true; this._render(); if (this.pop) this._popPosition(); }
        };
        const onEnd = () => {
            g.removeEventListener('pointermove', onMove); g.removeEventListener('pointerup', onEnd); g.removeEventListener('pointercancel', onEnd);
            try { g.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            if (!moved) return;
            const cur = this.st; this.st = base;
            this.undoStack.push(base); this.redoStack = []; this.st = cur;
            this._popRender();
            if (this.opts.onMoved) this.opts.onMoved(this); else this.commit();
        };
        g.addEventListener('pointermove', onMove); g.addEventListener('pointerup', onEnd); g.addEventListener('pointercancel', onEnd);
    }

    // ----- Souris et doigt (hors dessin) -----

    _bind() {
        const el = this.el;
        this.editBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        this.editBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (!this.editable) return;
            if (this.isActive) { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); } else this.activate();
        });
        this.grip.addEventListener('pointerdown', (ev) => this._gripDown(ev));
        this.svg.addEventListener('pointerdown', (ev) => this._penDown(ev));
        // Gomme : un rond à la taille réelle de la gomme suit le curseur.
        this.svg.addEventListener('pointermove', (ev) => this._ringAt(ev));
        this.svg.addEventListener('pointerleave', () => this._ringHide());
        // Au repos : un clic le sélectionne, un glisser le déplace ; un double-clic l'ouvre en édition.
        el.addEventListener('pointerdown', (ev) => this._down(ev));
        el.addEventListener('dblclick', (ev) => {
            if (ev.target.closest('.annot-draw-edit, .annot-draw-grip') || this.isActive || !this.editable) return;
            ev.preventDefault(); ev.stopPropagation();
            this.activate();
        });
    }

    _down(ev) {
        if (!this.editable || ev.button > 0 || this.isActive) return;
        if (ev.target.closest && ev.target.closest('.annot-draw-edit, .annot-draw-grip')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const cv = this._canvas();
        if (cv) cv.startMove(this, ev);
    }

    // ----- Fenêtre d'édition -----

    activate() {
        if (!this.editable) return;
        if (DRB_ACTIVE && DRB_ACTIVE !== this) DRB_ACTIVE.deactivate();
        if (typeof CHB_ACTIVE !== 'undefined' && CHB_ACTIVE) CHB_ACTIVE.deactivate();
        if (typeof NTF_ACTIVE !== 'undefined' && NTF_ACTIVE) NTF_ACTIVE.deactivate();
        if (typeof NSE_ACTIVE !== 'undefined' && NSE_ACTIVE) NSE_ACTIVE.deactivate();
        const cv = this._canvas();
        if (cv) cv.clearSelection(true);
        DRB_ACTIVE = this;
        this.undoStack = []; this.redoStack = [];
        this.el.classList.add('is-editing');
        this.el.classList.remove('is-picked');
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
        this.el.classList.remove('is-editing');
        this._ringHide();
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (this._escKey) { document.removeEventListener('keydown', this._escKey, true); this._escKey = null; }
        if (DRB_ACTIVE === this) DRB_ACTIVE = null;
        this._popClose();
        this.commit();
        if (this.opts.onDeactivate) this.opts.onDeactivate(this);
    }

    destroy() {
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (this._escKey) { document.removeEventListener('keydown', this._escKey, true); this._escKey = null; }
        if (DRB_ACTIVE === this) DRB_ACTIVE = null;
        this._popClose();
    }

    _popOpen() {
        if (this.pop) return;
        const pop = document.createElement('div');
        pop.className = 'jm-pop cn-draw-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Outils de dessin');
        pop.addEventListener('mousedown', (ev) => { if (!ev.target.closest('select, input')) ev.preventDefault(); }); // les boutons ne volent pas le focus
        pop.addEventListener('click', (ev) => this._popClick(ev));
        pop.addEventListener('input', (ev) => this._popInput(ev));
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
        this.pop.innerHTML = drawEditorHtml({ pen: DRB_PEN, bg: this.st.bg, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, hasStrokes: this.st.strokes.length > 0 })
            + '<div class="dr-hint" role="status"></div>';
        this.el.classList.toggle('is-eraser', DRB_PEN.tool === 'eraser');
        if (DRB_PEN.tool !== 'eraser') this._ringHide();
        this._popPosition();
    }

    // À côté du cadre (à droite, puis à gauche, puis dessous, dessus : la première place où la fenêtre tient sans le couvrir) ; sinon en bas à droite de l'écran. Déplaçable par son bandeau.
    // Téléphone : bandeau collé au bas de l'écran.
    _popPosition() {
        const pop = this.pop;
        if (!pop) return;
        const phone = typeof acIsPhone === 'function' && acIsPhone();
        pop.classList.toggle('jm-sheet', phone);
        if (phone) { pop.style.left = ''; pop.style.top = ''; return; }
        if (acPopManual(pop)) return;   // déplacée à la main : elle reste où on l'a mise
        // À côté du cadre (à droite, sinon à gauche) quand la place suffit ; sinon dessous, dessus, ou en bas à droite de l'écran.
        const spot = acPopSpot(this.el.getBoundingClientRect(), pop.offsetWidth, pop.offsetHeight, window.innerWidth, window.innerHeight, ['right', 'left', 'below', 'above']);
        pop.style.left = `${spot.x}px`;
        pop.style.top = `${spot.y}px`;
    }

    _popClick(ev) {
        const b = ev.target.closest('[data-dr]');
        if (!b || b.disabled) return;
        const act = b.dataset.dr;
        if (act === 'done') { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); }
        else if (act === 'tool') { DRB_PEN.tool = ['pen', 'hl', 'eraser'].includes(b.dataset.v) ? b.dataset.v : 'pen'; drbSavePen(); this._popRender(); }
        else if (act === 'color') { DRB_PEN.color = DRB_L.drawColor(b.dataset.v) || DRB_PEN.color; if (DRB_PEN.tool === 'eraser') DRB_PEN.tool = 'pen'; drbSavePen(); this._popRender(); }
        else if (act === 'pressure') { DRB_PEN.pressure = DRB_PEN.pressure === false; drbSavePen(); this._popRender(); }
        else if (act === 'fit') { DRB_PEN.fit = DRB_PEN.fit === false; drbSavePen(); this._popRender(); }
        else if (act === 'bg') this._apply(drawSetBg(this.st, b.dataset.v));
        else if (act === 'undo') this._undo();
        else if (act === 'redo') this._redo();
        else if (act === 'clear') this._apply(drawClear(this.st));
    }

    // Fond choisi dans le sélecteur libre : posé quand le choix est validé.
    _popChange(ev) {
        const t = ev.target;
        if (t.matches('[data-dr="bgcustom"]')) { const c = DRB_L.drawColor(t.value); if (c) this._apply(drawSetBg(this.st, c)); this._render(); }
    }

    // Curseur d'épaisseur et sélecteur de couleur : suivis en direct (sans redessiner la fenêtre, pour ne pas lâcher le curseur).
    _popInput(ev) {
        const t = ev.target;
        if (t.matches('[data-dr="width"]')) {
            DRB_PEN.width = Math.max(DRB_L.DR_STROKE_MIN, Math.min(DRB_L.DR_STROKE_MAX, Math.round(Number(t.value)) || 3));
            drbSavePen();
            const out = this.pop.querySelector('[data-out="width"]'); if (out) out.textContent = `${DRB_PEN.width} px`;
            const dot = this.pop.querySelector('.dr-dot'); if (dot) { const d = Math.min(26, drbWidthFor(DRB_PEN)); dot.style.width = dot.style.height = `${d}px`; }
        } else if (t.matches('[data-dr="smooth"]')) {
            DRB_PEN.smooth = Math.max(DRB_L.DR_SMOOTH_MIN, Math.min(DRB_L.DR_SMOOTH_MAX, Math.round(Number(t.value)) || 0));
            drbSavePen();
            const out = this.pop.querySelector('[data-out="smooth"]'); if (out) out.textContent = String(DRB_PEN.smooth);
        } else if (t.matches('[data-dr="erasersize"]')) {
            DRB_PEN.eraser = Math.max(DRB_ERASER_MIN, Math.min(DRB_ERASER_MAX, Math.round(Number(t.value)) || DRB_ERASER_DEFAULT));
            drbSavePen();
            const out = this.pop.querySelector('[data-out="erasersize"]'); if (out) out.textContent = `${DRB_PEN.eraser} px`;
        } else if (t.matches('[data-dr="bgcustom"]')) {
            const c = DRB_L.drawColor(t.value);
            if (c) this.el.style.background = c;   // aperçu pendant le choix ; le fond est posé (et annulable) quand le choix est validé
        } else if (t.matches('[data-dr="custom"]')) {
            const c = DRB_L.drawColor(t.value);
            if (!c) return;
            DRB_PEN.color = c; if (DRB_PEN.tool === 'eraser') DRB_PEN.tool = 'pen';
            drbSavePen();
            const lab = t.closest('.dr-sw-custom'); if (lab) { lab.style.background = c; lab.classList.add('is-on'); }
            this.pop.querySelectorAll('.dr-sw.is-on[data-dr="color"]').forEach(n => n.classList.remove('is-on'));
            const dot = this.pop.querySelector('.dr-dot'); if (dot) dot.style.background = c;
            this.pop.querySelectorAll('[data-dr="tool"]').forEach(n => { const on = n.dataset.v === DRB_PEN.tool; n.classList.toggle('is-on', on); n.setAttribute('aria-pressed', String(on)); });
            this.el.classList.toggle('is-eraser', false);
        }
    }
}

// Petit bloc enregistrable d'un cadre de dessin (voir drawStubHtml) : tout est dans data-draw, sa place et son bord.
function hydrateDrawBlocks(root, opts) {
    root.querySelectorAll('.annot-draw').forEach((el) => {
        if (el.__drawBlock && el.isConnected && el.__drawBlock.el === el && el.querySelector(':scope > .annot-draw-svg')) return;
        new DrawBlockView(el, opts);
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { drawEditorHtml, drbWidthFor };
}
