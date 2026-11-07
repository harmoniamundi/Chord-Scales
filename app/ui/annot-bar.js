// ui/annot-bar.js — barre de mise en forme de l'onglet « Annotations » (mode Jam), comme dans un traitement de texte :
// police, taille (boutons − / + et menu avec curseur), gras / italique / souligné / barré, alignement, puces, couleur du texte,
// surlignage, symboles et nuances, portée à insérer. Fonctions pures : elles ne font que fabriquer le HTML ;
// les clics, la sélection du texte et les menus flottants sont dans index.html (JamEngine, « Onglet Annotations »).
// Chargé par index.html via <script src="ui/annot-bar.js"> et testé par ui/annot-bar.test.js.

const ANNOT_SIZE_MIN = 8;
const ANNOT_SIZE_MAX = 72;
const ANNOT_SIZE_DEFAULT = 15;
// Crans des boutons − / + (comme dans un traitement de texte) et tailles proposées dans le menu.
const ANNOT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72];
const ANNOT_SIZE_PRESETS = [10, 12, 14, 16, 20, 24, 32, 48];

// Polices : libellé affiché → valeur CSS (les mêmes que NOTE_FONTS de grid/grid-format.js, qui ne laisse passer que celles-ci).
// « Real Book » (Kalam, la police des accords de la grille, fournie avec l'appli) est la première et la police par défaut des zones
// (voir .jam-annot-text dans style.css). Les autres sont des polices du système, avec des polices de rechange pour Mac, Windows et Linux :
// une police absente de la machine est remplacée par la suivante de sa liste.
const ANNOT_FONT_DEFAULT_CSS = 'Kalam,cursive';
const ANNOT_FONT_CHOICES = [
    { label: 'Real Book', css: ANNOT_FONT_DEFAULT_CSS },
    { label: 'Système', css: "system-ui,-apple-system,'Segoe UI',sans-serif" },
    { label: 'Arial', css: 'Arial,Helvetica,sans-serif' },
    { label: 'Verdana', css: 'Verdana,Geneva,sans-serif' },
    { label: 'Trebuchet', css: "'Trebuchet MS',sans-serif" },
    { label: 'Gill Sans', css: "'Gill Sans','Gill Sans MT',Calibri,sans-serif" },
    { label: 'Futura', css: "Futura,'Century Gothic','Trebuchet MS',sans-serif" },
    { label: 'Georgia', css: 'Georgia,serif' },
    { label: 'Times', css: "'Times New Roman',Times,serif" },
    { label: 'Palatino', css: "'Palatino Linotype',Palatino,'Book Antiqua',serif" },
    { label: 'Baskerville', css: "Baskerville,'Baskerville Old Face',Georgia,serif" },
    { label: 'Machine à écrire', css: "'Courier New',Courier,monospace" },
    { label: 'Code (Menlo)', css: "Menlo,Monaco,Consolas,'DejaVu Sans Mono',monospace" },
    { label: 'Titre (Impact)', css: "Impact,'Arial Narrow',sans-serif" },
    { label: 'Feutre (Marker Felt)', css: "'Marker Felt','Segoe Print','Comic Sans MS',cursive" },
    { label: 'Stylo (Bradley Hand)', css: "'Bradley Hand','Segoe Script','Comic Sans MS',cursive" },
    { label: 'Calligraphie', css: "'Snell Roundhand','Brush Script MT','Lucida Handwriting',cursive" }
];

const ANNOT_TEXT_COLORS = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#6b7280'];
const ANNOT_HILITE_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e5e7eb'];
const ANNOT_SYMBOLS = ['♭', '♯', '♮', 'Δ', 'ø', '°', '⁷', '⁹', '¹¹', '¹³', '♩', '♪', '♫', '‖', '→', '↑', '↓', '↗', '↘', '✓', '×'];
const ANNOT_NUANCES = ['p', 'mp', 'mf', 'f', 'ff', 'cresc.', 'dim.', 'rit.', 'a tempo', 'solo', 'tutti'];

// Taille suivante (dir = 1) ou précédente (dir = -1) dans les crans ; reste dans les bornes.
function nextAnnotSize(px, dir) {
    const v = Math.round(Number(px)) || ANNOT_SIZE_DEFAULT;
    if (dir > 0) { const n = ANNOT_SIZE_STEPS.find(s => s > v); return n === undefined ? ANNOT_SIZE_MAX : n; }
    const smaller = ANNOT_SIZE_STEPS.filter(s => s < v);
    return smaller.length ? smaller[smaller.length - 1] : ANNOT_SIZE_MIN;
}

function clampAnnotSize(px) {
    const v = Math.round(Number(px));
    if (!Number.isFinite(v)) return ANNOT_SIZE_DEFAULT;
    return Math.max(ANNOT_SIZE_MIN, Math.min(ANNOT_SIZE_MAX, v));
}

// Valeur CSS de police → libellé du menu (null si ce n'est pas l'une des polices proposées). Seule la première famille compte.
function annotFontLabel(cssFamily) {
    const first = String(cssFamily || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    const hit = ANNOT_FONT_CHOICES.find(f => f.css.split(',')[0].replace(/^["']|["']$/g, '').toLowerCase() === first);
    return hit ? hit.label : null;
}

function annotAlignIcon(kind) {
    const x = { left: [1, 9], center: [4, 8], right: [7, 8] }[kind]; // début et longueur des lignes courtes
    return `<svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 2h14M${x[0]} 5.5h${x[1]}M1 9h14M${x[0]} 12.5h${x[1]}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
}

// La barre elle-même (toujours visible dans l'onglet ; les boutons n'agissent que lorsqu'une zone de texte est active).
function annotBarHtml() {
    const btn = (label, attrs, title, cls = '') => `<button type="button" class="ab-btn ${cls}" ${attrs} title="${title}" aria-label="${title}">${label}</button>`;
    const fonts = ANNOT_FONT_CHOICES.map(f => `<option value="${f.css.replace(/"/g, '&quot;')}" style="font-family:${f.css.replace(/"/g, '&quot;')}">${f.label}</option>`).join('');
    return `<div id="jam-annot-bar" class="annot-bar is-idle" role="toolbar" aria-label="Mise en forme du texte">
        <select class="ab-sel ab-font" data-font title="Police" aria-label="Police">${fonts}</select>
        <div class="ab-grp" role="group" aria-label="Taille du texte">
            ${btn('−', 'data-size-step="-1"', 'Diminuer la taille du texte', 'ab-step')}
            ${btn(`<span data-size-label>${ANNOT_SIZE_DEFAULT}</span><small>px</small>`, 'data-menu="size" aria-haspopup="true"', 'Taille du texte : ouvrir le curseur', 'ab-size')}
            ${btn('+', 'data-size-step="1"', 'Augmenter la taille du texte', 'ab-step')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Style">
            ${btn('<b>G</b>', 'data-cmd="bold" data-state="bold"', 'Gras (⌘B)')}
            ${btn('<i>I</i>', 'data-cmd="italic" data-state="italic"', 'Italique (⌘I)')}
            ${btn('<u>S</u>', 'data-cmd="underline" data-state="underline"', 'Souligné (⌘U)')}
            ${btn('<s>B</s>', 'data-cmd="strikeThrough" data-state="strikeThrough"', 'Barré')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Couleurs">
            ${btn('<span class="ab-a">A</span><i class="ab-bar" data-color-bar></i>', 'data-menu="color" aria-haspopup="true"', 'Couleur du texte', 'ab-color')}
            ${btn('<span class="ab-hl">ab</span>', 'data-menu="hilite" aria-haspopup="true"', 'Surlignage', 'ab-color')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Paragraphe">
            ${btn(annotAlignIcon('left'), 'data-cmd="justifyLeft"', 'Aligner à gauche')}
            ${btn(annotAlignIcon('center'), 'data-cmd="justifyCenter"', 'Centrer')}
            ${btn(annotAlignIcon('right'), 'data-cmd="justifyRight"', 'Aligner à droite')}
            ${btn('• Liste', 'data-cmd="insertUnorderedList" data-state="insertUnorderedList"', 'Liste à puces', 'ab-txt')}
        </div>
        <span class="ab-sep"></span>
        <div class="ab-grp" role="group" aria-label="Insérer">
            ${btn('♯ ♩ ▾', 'data-menu="insert" aria-haspopup="true"', 'Insérer un symbole ou une nuance', 'ab-txt')}
            ${btn('<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><path d="M1 3h16M1 6.5h16M1 10h16M1 13.5h16" stroke="currentColor" stroke-width="1.2" fill="none"/><ellipse cx="9" cy="10" rx="2.6" ry="1.9" transform="rotate(-20 9 10)" fill="currentColor"/><path d="M11.4 9V1.5" stroke="currentColor" stroke-width="1.3"/></svg> Portée', 'data-insert-staff="1"', 'Insérer une portée éditable à l\'endroit du curseur', 'ab-txt ab-staff')}
            ${btn('Coller portée', 'data-paste-staff="1"', 'Coller la dernière portée copiée à l\'endroit du curseur (copier : clic sur la poignée ⠿ d\'une portée puis ⌘C, ou bouton Copier de la portée)', 'ab-txt')}
        </div>
        <span class="ab-sep"></span>
        ${btn('Effacer la mise en forme', 'data-clear="1"', 'Retire gras, couleur, taille, police… de la sélection', 'ab-txt ab-clear')}
        <div id="jam-annot-staff-host" class="ab-staff-host"></div>
    </div>`;
}

// Contenu des menus flottants. state : { size } pour le menu de taille.
function annotMenuHtml(kind, state = {}) {
    const sw = (color, attr, label) => `<button type="button" class="annot-sw" ${attr}="${color}" style="background:${color}" title="${color}" aria-label="${label} ${color}"></button>`;
    const chip = (label, attrs, title, cls = '') => `<button type="button" class="jm-chip annot-chip ${cls}" ${attrs} title="${title}" aria-label="${title}">${label}</button>`;
    if (kind === 'size') {
        const size = clampAnnotSize(state.size);
        return `<div class="ab-menu-title">Taille du texte</div>
            <div class="ab-size-row">
                <input type="range" class="ab-range" min="${ANNOT_SIZE_MIN}" max="${ANNOT_SIZE_MAX}" step="1" value="${size}" data-size-range aria-label="Taille du texte, en pixels">
                <output class="ab-size-out" data-size-out>${size}</output><small>px</small>
            </div>
            <div class="jm-row ab-presets">${ANNOT_SIZE_PRESETS.map(p => chip(String(p), `data-size="${p}"`, `${p} px`)).join('')}</div>
            <div class="ab-hint">Sans texte sélectionné, la taille s'applique à ce que vous écrivez ensuite.</div>`;
    }
    if (kind === 'color') {
        return `<div class="ab-menu-title">Couleur du texte</div>
            <div class="jm-row annot-colors">${ANNOT_TEXT_COLORS.map(c => sw(c, 'data-color', 'Couleur')).join('')}
                <label class="annot-sw annot-sw-custom" title="Autre couleur…"><input type="color" data-color-custom value="#dc2626" aria-label="Autre couleur de texte"></label></div>`;
    }
    if (kind === 'hilite') {
        return `<div class="ab-menu-title">Surlignage</div>
            <div class="jm-row annot-colors">${ANNOT_HILITE_COLORS.map(c => sw(c, 'data-hilite', 'Surlignage')).join('')}
                <button type="button" class="jm-chip annot-chip annot-none" data-hilite="transparent" title="Retirer le surlignage">Aucun</button></div>`;
    }
    if (kind === 'insert') {
        return `<div class="ab-menu-title">Symboles</div>
            <div class="jm-row">${ANNOT_SYMBOLS.map(x => chip(x, `data-ins="${x}"`, `Insérer ${x}`, 'annot-sym')).join('')}</div>
            <div class="ab-menu-title ab-menu-gap">Nuances et indications</div>
            <div class="jm-row">${ANNOT_NUANCES.map(x => chip(x, `data-ins="${x}"`, `Insérer « ${x} »`, 'annot-nu')).join('')}</div>`;
    }
    return '';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ANNOT_SIZE_MIN, ANNOT_SIZE_MAX, ANNOT_SIZE_DEFAULT, ANNOT_SIZE_STEPS, ANNOT_FONT_DEFAULT_CSS, ANNOT_FONT_CHOICES, nextAnnotSize, clampAnnotSize, annotFontLabel, annotBarHtml, annotMenuHtml };
}
