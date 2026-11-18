// ui/shortcuts.js — raccourcis clavier personnalisables de Chord Scales (sans DOM : testé par ui/shortcuts.test.js).
// Même mécanique que dans le Carnet de notes. Chaque action a un raccourci par défaut ; l'utilisateur peut en choisir un autre
// (bouton ⌨ de l'en-tête). Les choix sont gardés dans le navigateur de l'appareil (localStorage « chordscales-shortcuts-v1 ») :
// { idAction: combinaison }, '' = aucun raccourci.
// Portées (scope) : 'jam' = mode Jam, hors saisie de texte et hors annotations ; 'staff' = portée d'annotation en édition.
// Une même touche peut servir dans deux portées différentes (ex. « b » : boucle dans le Jam, note si dans une portée).
// Combinaison : « Mod+Alt+Shift+touche », Mod = ⌘ sur Mac, Ctrl ailleurs ; touche en minuscule (lettres) ou nom de touche (ArrowUp, F2, Space…).
// Quelques touches restent fixes (flèches, Suppr., Échap, ⌘Z, ⌘C / ⌘X / ⌘V, ⌘A…) : elles ne peuvent pas être prises par une autre action.

const KB_STORAGE_KEY = 'chordscales-shortcuts-v1';

// group : titre de la section dans le panneau ; def : raccourci par défaut ('' = aucun).
const KB_ACTIONS = [
    { id: 'play',      scope: 'jam', group: 'Lecture (mode Jam)', label: 'Lire / mettre en pause la grille', def: 'Space' },
    { id: 'stop',      scope: 'jam', group: 'Lecture (mode Jam)', label: 'Arrêter (retour au début)', def: 'Shift+Space' },
    { id: 'arp',       scope: 'jam', group: 'Lecture (mode Jam)', label: 'Lire la grille en arpèges', def: '' },
    { id: 'loop',      scope: 'jam', group: 'Lecture (mode Jam)', label: 'Boucle', def: 'b' },
    { id: 'metro',     scope: 'jam', group: 'Lecture (mode Jam)', label: 'Métronome', def: 'm' },
    { id: 'subdiv',    scope: 'jam', group: 'Lecture (mode Jam)', label: 'Clic sur les croches', def: '' },
    { id: 'tempoUp',   scope: 'jam', group: 'Lecture (mode Jam)', label: 'Tempo + 5', def: 'Alt+ArrowUp' },
    { id: 'tempoDown', scope: 'jam', group: 'Lecture (mode Jam)', label: 'Tempo − 5', def: 'Alt+ArrowDown' },
    { id: 'chordArp',  scope: 'jam', group: 'Lecture (mode Jam)', label: "Écouter l'accord affiché (arpège)", def: 'c' },
    { id: 'blind',     scope: 'jam', group: 'Affichage (mode Jam)', label: "À l'aveugle", def: '' },
    { id: 'antiseches', scope: 'jam', group: 'Affichage (mode Jam)', label: 'Antisèches (afficher / masquer)', def: 'Alt+a' },
    { id: 'functions', scope: 'jam', group: 'Affichage (mode Jam)', label: 'Fonction tonale (afficher / masquer)', def: 'f' },
    { id: 'fullscreen', scope: 'jam', group: 'Affichage (mode Jam)', label: 'Plein écran de la grille', def: 'Shift+f' },
    { id: 'band',      scope: 'jam', group: 'Affichage (mode Jam)', label: 'Fenêtre Orchestre', def: 'o' },
    { id: 'harmony',   scope: 'jam', group: 'Affichage (mode Jam)', label: 'Fenêtre Harmonisation', def: 'h' },
    { id: 'editBar',   scope: 'jam', group: 'Grille (mode Jam)', label: "Outils d'édition de la grille", def: 'e' },
    { id: 'save',      scope: 'jam', group: 'Grille (mode Jam)', label: 'Sauvegarder la grille', def: 'Mod+s' },
    { id: 'generate',  scope: 'jam', group: 'Grille (mode Jam)', label: 'Générer une nouvelle grille (style choisi)', def: '' },
    { id: 'input',     scope: 'staff', group: 'Portée d\'annotation', label: 'Saisie de notes / sélection', def: 'n' },
    { id: 'dur16',     scope: 'staff', group: 'Portée d\'annotation', label: 'Double-croche', def: '1' },
    { id: 'dur8',      scope: 'staff', group: 'Portée d\'annotation', label: 'Croche', def: '2' },
    { id: 'durq',      scope: 'staff', group: 'Portée d\'annotation', label: 'Noire', def: '3' },
    { id: 'durh',      scope: 'staff', group: 'Portée d\'annotation', label: 'Blanche', def: '4' },
    { id: 'durw',      scope: 'staff', group: 'Portée d\'annotation', label: 'Ronde', def: '5' },
    { id: 'dot',       scope: 'staff', group: 'Portée d\'annotation', label: 'Note pointée', def: '.' },
    { id: 'rest',      scope: 'staff', group: 'Portée d\'annotation', label: 'Silence', def: 'r' },
    { id: 'tuplet',    scope: 'staff', group: 'Portée d\'annotation', label: 'Triolet', def: 't' },
    { id: 'tie',       scope: 'staff', group: 'Portée d\'annotation', label: 'Liaison de prolongation', def: 'l' },
    { id: 'sharp',     scope: 'staff', group: 'Portée d\'annotation', label: 'Dièse', def: '#' },
    { id: 'flat',      scope: 'staff', group: 'Portée d\'annotation', label: 'Bémol', def: '-' },
    { id: 'natural',   scope: 'staff', group: 'Portée d\'annotation', label: 'Bécarre', def: '0' },
    { id: 'note-c',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'Do', def: 'c' },
    { id: 'note-d',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'Ré', def: 'd' },
    { id: 'note-e',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'Mi', def: 'e' },
    { id: 'note-f',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'Fa', def: 'f' },
    { id: 'note-g',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'Sol', def: 'g' },
    { id: 'note-a',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'La', def: 'a' },
    { id: 'note-b',    scope: 'staff', group: 'Portée d\'annotation : notes', label: 'Si', def: 'b' }
];

// Raccourcis fixes (affichés dans le panneau, non modifiables) et combinaisons qu'aucune action ne peut prendre.
const KB_FIXED = [
    ['Mod+z', 'Annuler'], ['Mod+Shift+z', 'Rétablir'], ['Mod+c', 'Copier'], ['Mod+x', 'Couper'], ['Mod+v', 'Coller'], ['Mod+d', 'Dupliquer (grille, mode édition)'], ['Mod+a', 'Tout sélectionner'],
    ['ArrowLeft', 'Grille : mesure voisine (après un clic sur un accord) ; portée : note voisine'], ['ArrowUp', 'Portée : note un degré plus haut (⇧ : octave)'],
    ['Delete', 'Supprimer'], ['Escape', 'Désélectionner / quitter la saisie'], ['Enter', 'Éditeur de mesure : valider'], ['1', 'Éditeur de mesure : degrés 1 à 7']
];
const KB_RESERVED = new Set(['Mod+z', 'Mod+Shift+z', 'Mod+y', 'Mod+c', 'Mod+x', 'Mod+v', 'Mod+a', 'Mod+Shift+a', 'Mod+d',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+ArrowLeft', 'Shift+ArrowRight',
    'Delete', 'Backspace', 'Escape', 'Tab', 'Shift+Tab', 'Enter', 'Shift+Enter', 'Mod+q', 'Mod+w', 'Mod+r', 'Mod+t', 'Mod+n']);

const KB_MODIFIER_KEYS = new Set(['Shift', 'Control', 'Meta', 'Alt', 'AltGraph', 'CapsLock', 'Fn', 'OS', 'Dead', 'Unidentified', 'Process']);

let KB_OVERRIDES = {};

function kbStore() { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } }

function kbLoad() {
    KB_OVERRIDES = {};
    const s = kbStore();
    if (!s) return;
    try {
        const o = JSON.parse(s.getItem(KB_STORAGE_KEY) || '{}');
        if (o && typeof o === 'object') KB_ACTIONS.forEach((a) => { if (typeof o[a.id] === 'string' && (o[a.id] === '' || !KB_RESERVED.has(o[a.id]))) KB_OVERRIDES[a.id] = o[a.id]; });
    } catch (e) { /* réglage illisible : défauts */ }
}

function kbSave() {
    const s = kbStore();
    if (!s) return;
    try { if (Object.keys(KB_OVERRIDES).length) s.setItem(KB_STORAGE_KEY, JSON.stringify(KB_OVERRIDES)); else s.removeItem(KB_STORAGE_KEY); } catch (e) { /* stockage plein ou interdit */ }
}

// Combinaison d'un événement clavier ({ key, code, shiftKey|shift, metaKey|meta, ctrlKey|ctrl, altKey|alt }) ; null pour une touche de modification seule.
function kbCombo(ev) {
    if (!ev || typeof ev.key !== 'string' || KB_MODIFIER_KEYS.has(ev.key)) return null;
    const shift = !!(ev.shiftKey || ev.shift), meta = !!(ev.metaKey || ev.meta), ctrl = !!(ev.ctrlKey || ev.ctrl), alt = !!(ev.altKey || ev.alt);
    let key = ev.key;
    // Avec ⌥ (Mac), la touche donne un caractère spécial (⌥N → « ˜ ») : on garde la touche physique, plus lisible.
    if (alt && typeof ev.code === 'string') {
        let m = /^Key([A-Z])$/.exec(ev.code);
        if (m) key = m[1];
        else if ((m = /^Digit(\d)$/.exec(ev.code))) key = m[1];
        else if (ev.code === 'Space') key = ' '; // ⌥Espace donne une espace insécable
    }
    if (key === ' ') key = 'Space';
    const printable = key.length === 1;
    const letter = printable && /^[a-z]$/i.test(key);
    if (printable) key = key.toLowerCase();
    const parts = [];
    if (meta || ctrl) parts.push('Mod');
    if (alt) parts.push('Alt');
    if (shift && (!printable || letter)) parts.push('Shift'); // « # », « . »… s'obtiennent souvent avec Maj : Maj ne compte pas pour eux
    parts.push(key);
    return parts.join('+');
}

function kbBinding(id) {
    if (Object.prototype.hasOwnProperty.call(KB_OVERRIDES, id)) return KB_OVERRIDES[id];
    const a = KB_ACTIONS.find(x => x.id === id);
    return a ? a.def : '';
}

function kbBindings() { const o = {}; KB_ACTIONS.forEach((a) => { o[a.id] = kbBinding(a.id); }); return o; }

// Action liée à une combinaison (dans la portée `scope` si donnée) ; une lettre avec Maj retombe sur la lettre seule si Maj+lettre n'est pas pris.
function kbActionFor(combo, scope) {
    if (!combo) return null;
    const find = (c) => { const a = KB_ACTIONS.find(x => (!scope || x.scope === scope) && kbBinding(x.id) === c); return a ? a.id : null; };
    let id = find(combo);
    if (!id && /(^|\+)Shift\+[a-z]$/.test(combo)) {
        const plain = combo.replace('Shift+', '');
        if (!KB_ACTIONS.some(x => (!scope || x.scope === scope) && kbBinding(x.id) === combo)) id = find(plain);
    }
    return id;
}

function kbMatch(ev, id) { const a = KB_ACTIONS.find(x => x.id === id); const c = kbCombo(ev); return !!a && !!c && kbActionFor(c, a.scope) === id; }

// Change le raccourci d'une action. Renvoie { ok, error?, replaced? } ; une action qui avait déjà cette combinaison la perd (replaced = son id).
function kbSet(id, combo) {
    const a = KB_ACTIONS.find(x => x.id === id);
    if (!a) return { ok: false, error: 'Action inconnue.' };
    if (combo && KB_RESERVED.has(combo)) return { ok: false, error: `${kbLabel(combo)} est réservé (raccourci fixe ou du navigateur).` };
    let replaced = null; // seule une action de la même portée perd la touche (portées distinctes : touches indépendantes)
    if (combo) KB_ACTIONS.forEach((x) => { if (x.id !== id && x.scope === a.scope && kbBinding(x.id) === combo) { replaced = x.id; KB_OVERRIDES[x.id] = ''; } });
    if (combo === a.def) delete KB_OVERRIDES[id]; else KB_OVERRIDES[id] = combo || '';
    kbTidy();
    kbSave();
    return { ok: true, replaced };
}

function kbReset(id) {
    if (id) {
        const a = KB_ACTIONS.find(x => x.id === id);
        if (!a) return { ok: false };
        return kbSet(id, a.def);
    }
    KB_OVERRIDES = {};
    kbSave();
    return { ok: true };
}

// Les surcharges égales au défaut ne sont pas gardées.
function kbTidy() { Object.keys(KB_OVERRIDES).forEach((k) => { const a = KB_ACTIONS.find(x => x.id === k); if (a && KB_OVERRIDES[k] === a.def) delete KB_OVERRIDES[k]; }); }

function kbIsMac() {
    try { return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || ''); } catch (e) { return true; }
}

const KB_KEY_NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espace', Enter: 'Entrée', Escape: 'Échap', Delete: 'Suppr.', Backspace: '⌫', Tab: 'Tab',
    PageUp: 'Page ↑', PageDown: 'Page ↓', Home: 'Début', End: 'Fin', Insert: 'Inser' };

// Texte lisible d'une combinaison : « ⌘S », « ⇧N », « Ctrl+S » hors Mac ; '—' sans raccourci.
function kbLabel(combo, mac) {
    if (!combo) return '—';
    if (mac === undefined) mac = kbIsMac();
    const parts = combo.split('+');
    let key = parts.pop();
    if (key === '') key = '+'; // touche « + » : « Mod++ »
    key = KB_KEY_NAMES[key] || (key.length === 1 ? key.toUpperCase() : key);
    const mods = parts.filter(Boolean);
    if (mac) return mods.map(m => ({ Mod: '⌘', Alt: '⌥', Shift: '⇧' })[m] || m).join('') + key;
    return mods.map(m => ({ Mod: 'Ctrl', Alt: 'Alt', Shift: 'Maj' })[m] || m).concat([key]).join('+');
}

// « (clavier : N) » pour les infobulles, ou '' si l'action n'a pas de raccourci.
function kbHint(id) { const c = kbBinding(id); return c ? ` (clavier : ${kbLabel(c)})` : ''; }

kbLoad();

const Shortcuts = { KB_ACTIONS, KB_FIXED, KB_RESERVED, KB_STORAGE_KEY, kbLoad, kbCombo, kbBinding, kbBindings, kbActionFor, kbMatch, kbSet, kbReset, kbLabel, kbHint, kbIsMac };

if (typeof module !== 'undefined' && module.exports) module.exports = Shortcuts;
