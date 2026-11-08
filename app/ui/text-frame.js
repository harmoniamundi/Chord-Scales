// ui/text-frame.js — cadres de texte dans les annotations (onglet « Annotations » du mode Jam).
// Un cadre est un bloc <div class="annot-frame" data-frame="L,E" data-at="x,y" data-border="0"> posé sur le canevas de la zone d'annotation
// (ui/annot-canvas.js), comme une portée (ui/staff-editor.js), mais où l'on écrit du texte mis en forme (la barre de mise en forme de l'onglet s'applique
// à ce texte). Tout le texte d'une annotation est dans des cadres : on n'écrit jamais dans la zone elle-même. Le cadre a une place à lui (data-at), indépendante
// de celle des autres blocs, et son bord peut être caché (data-border="0" : le texte seul reste visible).
// Deux états, comme pour la portée :
//  - « en édition » (.is-editing) : le texte du cadre est modifiable (crayon ✎, double-clic sur le cadre, ou création par le bouton « Cadre » ;
//    Échap, un second clic sur ✎ ou un clic ailleurs en sort) ;
//  - « au repos » : le cadre se sélectionne d'un clic (Maj / ⌘ / Ctrl pour en choisir plusieurs, Suppr. les enlève), se déplace en le glissant avec les autres
//    blocs sélectionnés (au pixel près, avec repères d'alignement et aimant, y compris dans l'autre zone), et s'agrandit ou se réduit en tirant sur ses bords et ses coins (le curseur qui les survole change de forme). Le texte suit : tirer
//    change l'échelle d'affichage E (25 à 400 %), donc la taille visible de tout ce que contient le cadre ; la mise en page du texte ne bouge pas.
// Le texte enregistré ne garde que ce petit bloc et son texte mis en forme (format et nettoyage : ui/staff-notes.js et grid/grid-format.js).
// Chargé par index.html via <script src="app/ui/text-frame.js"> (après ui/staff-editor.js) et testé par ui/text-frame.test.js.

// Sous Node (tests), le format se charge ; en navigateur ce sont des globaux (ui/staff-notes.js).
const NTF_N = (typeof parseFrameBox !== 'undefined')
    ? { parseFrameBox, formatFrameBox, parseStaffPos, formatStaffPos, clampStaffPos, parseBlockAt, formatBlockAt, clampBlockAt, parseBlockBorder, SN_FRAME_W_DEFAULT, SN_FRAME_SCALE_MIN, SN_FRAME_SCALE_MAX, SN_FRAME_SCALE_DEFAULT }
    : require('./staff-notes.js');

const NTF_EDGE = 6;          // épaisseur (pixels) de la zone sensible le long des bords, à la souris
const NTF_CORNER = 12;       // côté de la zone sensible des coins
const NTF_EDGE_TOUCH = 14;   // au doigt, les zones sont plus larges
const NTF_CORNER_TOUCH = 24;
const NTF_MIN_WIDTH = 40;    // largeur minimale affichée (pixels)

// ----- Fonctions sans état (testées sans navigateur) -----

// Zone sensible sous un point du cadre (x, y en pixels depuis son coin haut gauche, le cadre faisant w × h) :
// 'n', 's', 'e', 'w' (bords), 'nw', 'ne', 'sw', 'se' (coins) ou '' (intérieur ou hors du cadre).
function ntfHitZone(x, y, w, h, edge = NTF_EDGE, corner = NTF_CORNER) {
    if (!(x >= 0 && y >= 0 && x <= w && y <= h)) return '';
    const d = { w: x, e: w - x, n: y, s: h - y };
    const near = Object.keys(d).filter(k => d[k] <= edge);
    if (!near.length) return '';
    const hs = d.w <= corner ? 'w' : (d.e <= corner ? 'e' : '');
    const vs = d.n <= corner ? 'n' : (d.s <= corner ? 's' : '');
    const vertBand = near.includes('n') || near.includes('s');
    const horBand = near.includes('w') || near.includes('e');
    if (vertBand && hs) return (d.n <= edge ? 'n' : 's') + hs;
    if (horBand && vs) return vs + (d.w <= edge ? 'w' : 'e');
    return near.sort((a, b) => d[a] - d[b])[0];
}

// Forme du curseur qui survole une zone sensible.
function ntfCursor(zone) {
    return ({ n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' })[zone] || '';
}

// Nouvelle échelle (%) quand on tire la poignée `zone` de (dx, dy) pixels, le cadre faisant w0 × h0 pixels à l'écran à l'échelle s0.
// Un coin suit la diagonale (la projection du déplacement sur elle), un bord suit sa seule direction ; le cadre garde ses proportions.
// opts.min / opts.max : bornes de l'échelle (25 à 400 % par défaut) ; opts.maxScale : échelle maximale (le cadre ne dépasse pas la largeur de la zone) ; opts.baseWidth : largeur de mise en page (fixe l'échelle minimale
// pour que le cadre ne devienne pas plus étroit que NTF_MIN_WIDTH pixels).
// Renvoie { s, ax, ay } : s = échelle, (ax, ay) = point du cadre qui reste en place pendant le tirage (0, .5 ou 1 sur chaque axe : le coin ou le bord opposé).
function ntfResizeScale(zone, w0, h0, s0, dx, dy, opts = {}) {
    const sx = zone.includes('e') ? 1 : (zone.includes('w') ? -1 : 0);
    const sy = zone.includes('s') ? 1 : (zone.includes('n') ? -1 : 0);
    let r = 1;
    if (sx && sy) r = 1 + (sx * dx * w0 + sy * dy * h0) / (w0 * w0 + h0 * h0);
    else if (sx) r = (w0 + sx * dx) / w0;
    else if (sy) r = (h0 + sy * dy) / h0;
    let lo = opts.min > 0 ? opts.min : NTF_N.SN_FRAME_SCALE_MIN, hi = opts.max > 0 ? opts.max : NTF_N.SN_FRAME_SCALE_MAX; // une portée a ses propres bornes (50 à 200 %)
    if (opts.baseWidth > 0) lo = Math.max(lo, Math.ceil(NTF_MIN_WIDTH / opts.baseWidth * 100));
    if (opts.maxScale > 0) hi = Math.min(hi, Math.max(lo, s0, Math.floor(opts.maxScale))); // déjà plus grand que la zone : on peut seulement réduire, sans saut
    const s = Math.max(lo, Math.min(hi, Math.round(s0 * (Number.isFinite(r) ? r : 1))));
    return { s, ax: sx > 0 ? 0 : (sx < 0 ? 1 : 0.5), ay: sy > 0 ? 0 : (sy < 0 ? 1 : 0.5) };
}

// Petit bloc enregistré dans l'annotation pour un cadre : sa largeur / échelle, sa place sur le canevas, son bord (caché si border === false)
// et son texte (déjà en HTML restreint).
function noteFrameStubHtml(box, at, innerHtml, border) {
    const b = NTF_N.formatFrameBox(box || { w: NTF_N.SN_FRAME_W_DEFAULT });
    const p = NTF_N.formatBlockAt(at);
    return `<div class="annot-frame" data-frame="${b}"${p ? ` data-at="${p}"` : ''}${border === false ? ' data-border="0"' : ''}>${innerHtml || ''}</div>`;
}

// ----- Cadre -----

let NTF_ACTIVE = null; // le cadre dont le texte est en cours d'édition (un seul à la fois)

// opts : isEditable() → l'annotation est modifiable ; keepOpen(cible) → un clic sur cette cible (barre, menus) ne fait pas sortir de l'édition ;
//        onChange(view) après chaque changement (texte à la sortie de l'édition, place, taille) ; onActivate(view) / onDeactivate(view) ;
//        onFocusBack(view) quand on sort de l'édition au clavier ou par le crayon (le focus revient à la zone) ;
//        canvas() → le canevas de la zone (ui/annot-canvas.js) : sélection et déplacement des blocs ;
//        onGrab(view) quand le cadre est saisi (redimensionnement) ; onMoved(view) quand il vient d'être redimensionné.
class NoteFrameView {
    constructor(el, opts) {
        this.el = el;
        this.opts = opts;
        this.box = NTF_N.parseFrameBox(el.getAttribute('data-frame') || '') || { w: NTF_N.SN_FRAME_W_DEFAULT, s: NTF_N.SN_FRAME_SCALE_DEFAULT };
        this._initPlace();
        const inner = el.innerHTML;
        el.__noteFrame = this;
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Cadre de texte');
        el.innerHTML = '<button type="button" class="annot-frame-edit" contenteditable="false" title="Écrire dans le cadre (un second clic en sort)" aria-label="Écrire dans le cadre">✎</button>'
            + '<div class="annot-frame-clip"><div class="annot-frame-body" data-placeholder="Écrivez ici…"></div></div>';
        this.editBtn = el.querySelector('.annot-frame-edit');
        this.body = el.querySelector('.annot-frame-body');
        this.body.innerHTML = inner;
        this._showPos();
        this._layout();
        this._bind();
        this._observe();
    }

    get editable() { return !!this.opts.isEditable(); }

    get isActive() { return this.el.classList.contains('is-editing'); }

    _canvas() { return this.opts.canvas ? this.opts.canvas() : null; }

    // Place du cadre : data-at (place sur le canevas de la zone). Un cadre écrit avant les canevas n'a que l'ancien décalage data-pos, relatif à sa place
    // dans le texte : `legacy` jusqu'à ce que la zone ait reconstruit la mise en page (index.html, _annotMigrate).
    _initPlace() {
        const at = NTF_N.parseBlockAt(this.el.getAttribute('data-at') || '');
        this.legacy = !at;
        this.pos = at || NTF_N.parseStaffPos(this.el.getAttribute('data-pos') || '') || { x: 0, y: 0 };
        this.border = NTF_N.parseBlockBorder(this.el.getAttribute('data-border'));
        this.el.classList.toggle('no-border', !this.border);
    }

    // La zone d'annotation qui contient le cadre (sa largeur limite celle du cadre).
    _zone() { return this.el.closest('.jam-annot-text') || this.el.parentElement; }

    // Taille du cadre : le texte est mis en page à la largeur box.w, puis agrandi / réduit à l'échelle box.s (transformation CSS) ;
    // le cadre prend la taille obtenue. La hauteur suit le texte (observée : taper une ligne de plus agrandit le cadre).
    _layout() {
        const k = this.box.s / 100;
        this.body.style.width = `${this.box.w}px`;
        this.body.style.transform = k === 1 ? '' : `scale(${k})`;
        const h = this.body.offsetHeight;
        this.el.style.width = `${Math.round(this.box.w * k)}px`;
        this.el.style.height = h ? `${Math.max(12, Math.round(h * k))}px` : '';
    }

    _observe() {
        if (this._ro || typeof ResizeObserver === 'undefined') return;
        this._ro = new ResizeObserver(() => {
            if (!this.el.isConnected) { this.destroy(); return; }
            this._layout();
        });
        this._ro.observe(this.body);
    }

    destroy() {
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (NTF_ACTIVE === this) NTF_ACTIVE = null;
    }

    // ----- Édition du texte -----

    activate() {
        if (!this.editable) return;
        if (NTF_ACTIVE && NTF_ACTIVE !== this) NTF_ACTIVE.deactivate();
        if (typeof NSE_ACTIVE !== 'undefined' && NSE_ACTIVE) NSE_ACTIVE.deactivate();
        const cv = this._canvas();
        if (cv) cv.clearSelection(true); // un cadre en édition n'est pas « sélectionné » : la barre s'applique à son texte
        NTF_ACTIVE = this;
        this.el.classList.add('is-editing');
        this.el.classList.remove('is-picked');
        this.el.style.cursor = '';
        this.body.setAttribute('contenteditable', 'true');
        this.body.setAttribute('role', 'textbox');
        this.body.setAttribute('aria-multiline', 'true');
        this.body.setAttribute('spellcheck', 'false');
        if (this.opts.onActivate) this.opts.onActivate(this);
        try { this.body.focus({ preventScroll: true }); } catch (e) { /* non pris en charge */ }
        const sel = window.getSelection();
        if (sel) { const r = document.createRange(); r.selectNodeContents(this.body); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
        if (!this._outside) {
            this._outside = (ev) => {
                const t = ev.target;
                if (!t || this.el.contains(t)) return;
                if (this.opts.keepOpen && this.opts.keepOpen(t)) return;
                this.deactivate();
            };
            document.addEventListener('pointerdown', this._outside, true);
        }
    }

    deactivate() {
        if (!this.isActive) return;
        this.el.classList.remove('is-editing');
        ['contenteditable', 'role', 'aria-multiline', 'spellcheck'].forEach(a => this.body.removeAttribute(a));
        if (this._outside) { document.removeEventListener('pointerdown', this._outside, true); this._outside = null; }
        if (NTF_ACTIVE === this) NTF_ACTIVE = null;
        this._layout();
        this.commit();
        if (this.opts.onDeactivate) this.opts.onDeactivate(this);
    }

    // ----- Enregistrement -----

    commit() {
        this.el.setAttribute('data-frame', NTF_N.formatFrameBox(this.box));
        this._showPos();
        if (this.opts.onChange) this.opts.onChange(this);
    }

    // Bord du cadre visible ou non (le texte, lui, reste affiché) ; renvoie true si cela change.
    setBorder(on) {
        on = !!on;
        if (on === this.border) return false;
        this.border = on;
        this.el.classList.toggle('no-border', !on);
        if (on) this.el.removeAttribute('data-border'); else this.el.setAttribute('data-border', '0');
        return true;
    }

    // ----- Souris et doigt -----

    _bind() {
        const el = this.el;
        // Crayon ✎ : ouvre le texte en édition, un second clic en sort.
        this.editBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        this.editBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (!this.editable) return;
            if (this.isActive) { this.deactivate(); if (this.opts.onFocusBack) this.opts.onFocusBack(this); } else this.activate();
        });
        // Au repos : un clic le sélectionne, un glisser au milieu le déplace, un glisser sur un bord ou un coin le redimensionne.
        el.addEventListener('pointerdown', (ev) => this._down(ev));
        el.addEventListener('pointermove', (ev) => this._hover(ev));
        el.addEventListener('pointerleave', () => { if (!this._resizing) el.style.cursor = ''; });
        el.addEventListener('dblclick', (ev) => {
            if (ev.target.closest('.annot-frame-edit') || this.isActive || !this.editable) return;
            ev.preventDefault(); ev.stopPropagation();
            this.activate();
        });
        this.body.addEventListener('keydown', (ev) => {
            // ⌘A / Ctrl+A dans un cadre en édition : sélectionne le texte du cadre, pas toute la zone (la frappe suivante effacerait tous les blocs)
            if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && String(ev.key).toLowerCase() === 'a' && this.isActive) {
                ev.preventDefault();
                const sel = window.getSelection();
                if (sel) { const r = document.createRange(); r.selectNodeContents(this.body); sel.removeAllRanges(); sel.addRange(r); }
                return;
            }
            if (ev.key !== 'Escape' || !this.isActive) return;
            ev.preventDefault(); ev.stopPropagation();
            this.deactivate();
            if (this.opts.onFocusBack) this.opts.onFocusBack(this);
        });
    }

    // Zone sensible sous le pointeur ('' = le milieu du cadre, ou le crayon).
    _zoneAt(ev) {
        if (ev.target.closest && ev.target.closest('.annot-frame-edit')) return '';
        const r = this.el.getBoundingClientRect();
        const touch = ev.pointerType === 'touch';
        return ntfHitZone(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height, touch ? NTF_EDGE_TOUCH : NTF_EDGE, touch ? NTF_CORNER_TOUCH : NTF_CORNER);
    }

    // Survol à la souris : le curseur change de forme sur les bords et les coins.
    _hover(ev) {
        if (ev.buttons || this._resizing || ev.pointerType === 'touch') return;
        this.el.style.cursor = (!this.editable || this.isActive) ? '' : ntfCursor(this._zoneAt(ev));
    }

    _down(ev) {
        if (!this.editable || ev.button > 0 || this.isActive) return;
        if (ev.target.closest && ev.target.closest('.annot-frame-edit')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const zone = this._zoneAt(ev);
        const cv = this._canvas();
        const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        if (zone && !additive) this._resizeDown(ev, zone);
        else if (cv) cv.startMove(this, ev);
    }

    // ----- Redimensionner : bords et coins (hors édition) -----

    // Largeur maximale du cadre : celle de la zone (échelle maximale correspondante).
    _maxScale() {
        const z = this._zone();
        if (!z) return NTF_N.SN_FRAME_SCALE_MAX;
        const px = (v) => parseFloat(v) || 0;
        const zs = getComputedStyle(z);
        const room = z.clientWidth - px(zs.paddingLeft) - px(zs.paddingRight) - 12;
        return Math.max(NTF_N.SN_FRAME_SCALE_MIN, room / this.box.w * 100);
    }

    _resizeDown(ev, zone) {
        const el = this.el;
        const cv = this._canvas();
        if (cv) cv.select([el], 'set', true);
        if (this.opts.onGrab) this.opts.onGrab(this);
        const r0 = el.getBoundingClientRect();
        const s0 = this.box.s, pos0 = { ...this.pos };
        const x0 = ev.clientX, y0 = ev.clientY;
        const maxScale = this._maxScale();
        let changed = false;
        this._resizing = true;
        el.style.cursor = ntfCursor(zone);
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* non pris en charge */ }
        const apply = (s, ax, ay) => {
            this.box = { w: this.box.w, s };
            this._layout();
            const r1 = el.getBoundingClientRect();
            // le coin ou le bord opposé à la poignée reste en place
            this.placeAt({ left: r0.left + ax * (r0.width - r1.width), top: r0.top + ay * (r0.height - r1.height) }, false);
        };
        const end = (drop) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onCancel);
            document.removeEventListener('keydown', onKey, true);
            try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
            this._resizing = false;
            el.style.cursor = '';
            if (!drop) {
                if (changed) { this.pos = pos0; this.box = { w: this.box.w, s: s0 }; this._layout(); this._showPos(); }
                return;
            }
            if (!changed) { this._pick(); return; }
            this.commit();
            if (this.opts.onMoved) this.opts.onMoved(this);
            this._pick();
        };
        const onMove = (e2) => {
            const res = ntfResizeScale(zone, r0.width, r0.height, s0, e2.clientX - x0, e2.clientY - y0, { maxScale, baseWidth: this.box.w });
            if (!changed && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 3) return;
            if (res.s === this.box.s) { changed = changed || res.s !== s0; return; }
            changed = true;
            apply(res.s, res.ax, res.ay);
        };
        const onUp = () => end(true);
        const onCancel = () => end(false);
        const onKey = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); end(false); } };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
        document.addEventListener('keydown', onKey, true);
    }

    // ----- Place du cadre sur le canevas -----

    // Affiche la place (data-at) : le cadre est positionné en absolu dans sa zone. Un cadre « hérité » (pas encore migré) garde l'ancien décalage relatif.
    _showPos() {
        const { x, y } = this.pos;
        if (this.legacy) {
            this.el.style.left = x ? `${x}px` : '';
            this.el.style.top = y ? `${y}px` : '';
            const t = NTF_N.formatStaffPos(this.pos);
            if (t) this.el.setAttribute('data-pos', t); else this.el.removeAttribute('data-pos');
            return;
        }
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.setProperty('--bx', `${x}px`); // origine du zoom de la zone (voir style.css)
        this.el.style.setProperty('--by', `${y}px`);
        this.el.setAttribute('data-at', NTF_N.formatBlockAt(this.pos));
        this.el.removeAttribute('data-pos');
    }

    // Pose la place (entiers positifs, sur le canevas) ; renvoie true si elle a changé. N'enregistre rien (voir commit).
    setAt(pos) {
        const x = NTF_N.clampBlockAt(pos.x), y = NTF_N.clampBlockAt(pos.y);
        if (!this.legacy && x === this.pos.x && y === this.pos.y) return false;
        this.legacy = false;
        this.pos = { x, y };
        this._showPos();
        return true;
    }

    // Place le cadre pour que son coin haut gauche tombe en `desired` { left, top } (pixels de l'écran).
    placeAt(desired) {
        const z = this._zone();
        if (!z) return;
        const r = z.getBoundingClientRect();
        const k = typeof acZoomOf === 'function' ? acZoomOf(z) : 1; // la zone peut être agrandie : les places sont celles du canevas à 100 %
        this.setAt({ x: Math.max(0, (desired.left - r.left - z.clientLeft + z.scrollLeft) / k), y: Math.max(0, (desired.top - r.top - z.clientTop + z.scrollTop) / k) });
    }

    // Sélectionne le cadre (seul) : la zone prend le focus pour que Suppr., les flèches et ⌘C s'appliquent à lui.
    _pick() {
        const cv = this._canvas();
        if (cv) cv.select([this.el], 'set', true);
    }
}

// Transforme chaque bloc « annot-frame » de `root` en cadre de texte (affiché sans pouvoir être modifié si l'annotation est en lecture seule).
function hydrateNoteFrames(root, opts) {
    root.querySelectorAll('.annot-frame').forEach((el) => {
        if (el.__noteFrame && el.isConnected && el.__noteFrame.el === el && el.querySelector(':scope > .annot-frame-clip')) return;
        new NoteFrameView(el, opts);
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NTF_EDGE, NTF_CORNER, NTF_MIN_WIDTH, ntfHitZone, ntfCursor, ntfResizeScale, noteFrameStubHtml };
}
