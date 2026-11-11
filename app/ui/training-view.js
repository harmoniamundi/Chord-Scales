// ui/training-view.js — l'écran Entraînement sans DOM : en-tête de l'accord choisi (nom, pastilles de notes) et carte de
// chaque gamme (HTML + tâche de dessin de la portée). Le choix de l'accord est dans ui/chord-picker.js.
// Le moteur (ChordScaleApp.update / renderScales) crée les éléments, branche les clics et dessine les portées.
// Chargé par index.html via <script src="ui/training-view.js"> et testé par ui/training-view.test.js.

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const TV_T = (typeof chordRootName !== 'undefined')
    ? { chordRootName, getSpelledChordNotes, stackIntervalsUp, getAvoidNotes }
    : require('../theory.js');
if (typeof buildPastillesHtml === 'undefined' && typeof require === 'function') {
    var { buildPastillesHtml } = require('./pastilles.js');
}
if (typeof scaleHarmonyHtml === 'undefined' && typeof require === 'function') {
    var { scaleHarmonyHtml, scaleHarmonyChosenHtml } = require('./scale-harmony.js');
}

const TV_BADGE_CLASS = 'px-2 py-0.5 bg-[#3b82f6] text-white rounded font-mono font-bold cursor-pointer hover:bg-blue-500 transition shadow-sm';
const TV_CARD_CLASS = 'bg-[#252525] border border-[#333333] hover:border-[#444444] transition rounded-xl p-4 shadow relative group flex flex-col justify-between overflow-hidden';
const TV_STAFF_BOX = 'bg-white border border-slate-300 rounded-lg shadow-sm text-slate-900 w-full mx-auto cursor-pointer select-none transition hover:border-blue-500 h-[140px] flex items-center justify-center overflow-hidden relative';

// En-tête de l'accord choisi : nom de la fondamentale, pastille de qualité, nom complet et notes de l'accord
// (chaque note garde l'intervalle à jouer au clic).
//   p = { rootIndex, chordObj, hasChord (une qualité est-elle choisie ?), rootLabels }
function chordHeaderModel(p) {
    const { chordObj } = p;
    const rootName = TV_T.chordRootName(p.rootIndex, p.hasChord ? chordObj.id : null, p.rootLabels);
    const spelled = TV_T.getSpelledChordNotes(rootName, chordObj);
    const stacked = TV_T.stackIntervalsUp(chordObj.notes);
    return {
        rootName,
        qualityBadge: p.hasChord ? chordObj.name : '-',
        chordName: `${rootName}${chordObj.name}`,
        notes: spelled.map((label, idx) => ({ label, interval: stacked[idx] })),
    };
}

// Clé d'une gamme dans la liste de l'accord (sert aux directions montante/descendante et à la lecture).
function trainingScaleKey(scaleId, index) {
    return `${scaleId}-${index}`;
}

// Carte d'une gamme de l'accord choisi.
//   ctx  = { scalesDb, rootName, chordObj, scaleDirections, showAvoidNotes, showCharacteristic, showTargetNotes, visMode, angloToFrench,
//            et pour l'onglet Harmonisation : rootIndex, harmonyTriads, findChordObj, jazz, selected }
//   item = { id, role } (entrée de chordObj.scales), index = sa position
// Renvoie null si la gamme est inconnue, sinon { scaleKey, className, html, staffTask } ; staffTask (mode portée) décrit la
// portée à dessiner dans le canevas une fois la carte insérée.
function trainingScaleCard(ctx, item, index) {
    const scaleDef = ctx.scalesDb[item.id];
    if (!scaleDef) return null;
    const { rootName, chordObj } = ctx;

    const scaleKey = trainingScaleKey(item.id, index);
    const isDesc = !!ctx.scaleDirections[scaleKey];
    const avoidNotes = ctx.showAvoidNotes ? TV_T.getAvoidNotes(item.id, chordObj.id) : [];
    const characteristicInterval = ctx.showCharacteristic ? scaleDef.characteristicInterval : null;

    let visualizationHtml = '';
    let staffTask = null;
    let chosenHtml = '';
    if (ctx.visMode === 'staff') {
        const canvasId = `vexflow-canvas-${index}-${item.id}`;
        visualizationHtml = `
                            <div class="${TV_STAFF_BOX}"
                                 data-scale-key="${scaleKey}"
                                 onclick="app.toggleScalePlayback('${scaleKey}', ${JSON.stringify(scaleDef.intervals)}, '${scaleDef.name}', this)"
                                 oncontextmenu="app.toggleScaleDirection('${scaleKey}', this.closest('.group')); event.preventDefault();">
                                <div id="${canvasId}" class="w-full h-full flex items-center justify-center bg-white relative"></div>
                            </div>
                        `;
        staffTask = { canvasId, intervals: scaleDef.intervals, rootName, isDesc, avoidNotes, characteristicInterval, chordObj };
    } else if (ctx.visMode === 'harmony') {
        // Onglet Harmonisation : un accord par degré de la gamme ; un clic le joue et le choisit dans cette carte. L'accord
        // choisi (à défaut, celui du sélecteur de gauche) s'affiche en haut de la carte, à côté du nom de la gamme.
        const h = {
            intervals: scaleDef.intervals, rootName, rootIndex: ctx.rootIndex, triads: !!ctx.harmonyTriads,
            findChordObj: ctx.findChordObj, jazz: ctx.jazz, selected: (ctx.harmonySel || {})[scaleKey] || ctx.selected,
            onclick: (rootIndex, chordId) => `app.chooseHarmonyChord('${scaleKey}', ${rootIndex}, '${chordId}')`,
            onArpeggio: (rootIndex, chordId) => `app.chooseHarmonyChord('${scaleKey}', ${rootIndex}, '${chordId}', true)`
        };
        visualizationHtml = scaleHarmonyHtml(h);
        chosenHtml = scaleHarmonyChosenHtml({
            ...h,
            onArpeggio: (rootIndex, chordId) => `app.playHarmonyArpeggio(${rootIndex}, '${chordId}')`,
            onNote: (rootIndex, interval) => `app.playHarmonyNote(${rootIndex}, ${interval})`,
            badgeClass: TV_BADGE_CLASS
        });
    } else {
        // Même rendu et même comportement des pastilles que dans le mode Jam.
        visualizationHtml = buildPastillesHtml({
            visMode: ctx.visMode, scaleDef, rootName, chordObj, avoidNotes, characteristicInterval,
            showTargetNotes: ctx.showTargetNotes, large: false,
            angloToFrench: ctx.angloToFrench,
            noteOnclick: (interval) => `app.playSingleNote(${interval}); event.stopPropagation();`,
            wrapperClass: 'cursor-pointer transition hover:border-blue-500',
            wrapperAttrs: `data-scale-key="${scaleKey}"
                                 onclick="app.toggleScalePlayback('${scaleKey}', ${JSON.stringify(scaleDef.intervals)}, '${scaleDef.name}', this)"
                                 oncontextmenu="app.toggleScaleDirection('${scaleKey}', this.closest('.group')); event.preventDefault();"`
        });
    }

    const html = `
                        <div>
                            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                                <div>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h3 class="font-bold text-sm text-white">${rootName} ${scaleDef.name}</h3>
                                        <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1a1a1a] text-slate-300 border border-[#333333]">${scaleDef.category}</span>
                                        ${chosenHtml}
                                    </div>
                                    <div class="flex items-center gap-2 mt-0.5">
                                        <span class="text-xs font-medium text-blue-400">${item.role}</span>
                                        <span class="text-[10px] text-slate-500 scale-dir-badge">• ${isDesc ? 'Descendant' : 'Ascendant'}</span>
                                    </div>
                                </div>
                            </div>
                            <p class="text-xs text-slate-400 mb-3">${scaleDef.desc}</p>
                        </div>
                        <div class="pt-2.5 border-t border-[#333333]">
                            ${visualizationHtml}
                        </div>
                    `;
    return { scaleKey, className: TV_CARD_CLASS, html, staffTask };
}

// ---- Barre de navigation, transposition, modes d'affichage, interrupteur « notes cibles » : classes des boutons ----
const TV_NAV_ON = 'px-3 py-1 rounded-md bg-[#3a3a3c] text-white transition shadow-sm';
const TV_NAV_OFF = 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition';
const TV_CAT_ON = 'flex-1 py-1 rounded-md transition bg-[#3a3a3c] text-white shadow-sm';
const TV_CAT_OFF = 'flex-1 py-1 rounded-md transition text-slate-400 hover:text-white';
const TV_VMODE_ON = 'py-1 px-2.5 rounded-md transition bg-[#3a3a3c] text-white shadow-sm';
const TV_VMODE_OFF = 'py-1 px-2.5 rounded-md transition text-slate-400 hover:text-white';

// Bouton Entraînement / Jam de la barre du haut.
function navButtonClass(isActive) { return isActive ? TV_NAV_ON : TV_NAV_OFF; }
// Bouton d'un groupe à choix unique : transposition (Bb, C, Eb).
function segmentButtonClass(isActive) { return isActive ? TV_CAT_ON : TV_CAT_OFF; }
// Bouton de mode d'affichage (portée, intervalles, notes, lettres).
function visModeButtonClass(isActive) { return isActive ? TV_VMODE_ON : TV_VMODE_OFF; }
// Interrupteur « notes cibles ».
function targetToggleClass(isOn) {
    return `px-2 py-0.5 rounded text-[11px] font-semibold transition ${isOn ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-[#1a1a1a] text-slate-500 border border-[#333333]'}`;
}

// Orthographe de l'Entraînement après le choix d'une moitié de touche noire : remplace la lettre « s » ou « f » de cette touche.
function spellWith(spell, blackIndex, acc) {
    return spell.slice(0, blackIndex) + acc + spell.slice(blackIndex + 1);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        chordHeaderModel, trainingScaleKey, trainingScaleCard, TV_BADGE_CLASS,
        navButtonClass, segmentButtonClass, visModeButtonClass, targetToggleClass, spellWith,
    };
}
