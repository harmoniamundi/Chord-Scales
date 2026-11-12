// ui/pastilles.js — pastilles de gamme (Intervalles / Notes / Lettres), sans DOM : renvoie le HTML d'une rangée de pastilles.
// Rendu unique partagé par les modes Jam et Entraînement ; le moteur fournit le clic de chaque note (noteOnclick),
// la francisation des noms (angloToFrench) et les attributs du cadre (wrapperClass / wrapperAttrs).
// Chargé par index.html via <script src="ui/pastilles.js"> et testé par ui/pastilles.test.js.

// Fonctions de théorie : globales en navigateur (theory.js), à charger sous Node.
const PAST_T = (typeof getStrictSpelledNotes !== 'undefined') ? { getStrictSpelledNotes, getTargetIntervals, getIntervalLabel } : require('../theory.js');

// Numéro de degré d'une note de gamme (1 à 7) d'après sa lettre, avec ses altérations : b2, b3, #4, b6, bb7…
// L'octave de la tonique s'écrit « 1 » (et non « 8 »). Fonction pure, sans DOM.
const PAST_LETTERS = 'CDEFGAB';
const PAST_MAJOR = [0, 2, 4, 5, 7, 9, 11];
function scaleDegreeLabel(rootName, noteName, interval) {
    if (interval % 12 === 0) return '1';
    const r = PAST_LETTERS.indexOf(String(rootName)[0]);
    const n = PAST_LETTERS.indexOf(String(noteName)[0]);
    if (r < 0 || n < 0) return String(interval);
    const degree = (n - r + 7) % 7;
    let diff = interval - PAST_MAJOR[degree];
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    return (diff < 0 ? 'b'.repeat(-diff) : '#'.repeat(diff)) + (degree + 1);
}

// intervalStyle : 'tensions' (défaut, utilisé par le Jam) = intervalles vus depuis l'accord (b9, 9, 11, 13…) ;
// 'degrees' = degrés de la gamme (1 b2 b3 4 b5 5 b6 b7), octave « 1 ».
function buildPastillesHtml({ visMode, scaleDef, rootName, chordObj, avoidNotes, characteristicInterval, showTargetNotes, large, angloToFrench, noteOnclick, wrapperClass = '', wrapperAttrs = '', intervalStyle = 'tensions' }) {
    const spelled = PAST_T.getStrictSpelledNotes(rootName, scaleDef.intervals);
    const full = [...spelled, PAST_T.getStrictSpelledNotes(rootName, [12])[0]];
    const targets = PAST_T.getTargetIntervals(chordObj);
    const labelOf = (anglo, interval) => {
        if (visMode === 'intervals') return intervalStyle === 'degrees' ? scaleDegreeLabel(rootName, anglo, interval) : PAST_T.getIntervalLabel(interval, chordObj.notes);
        if (visMode === 'notes') return angloToFrench(anglo);
        return anglo;
    };
    const items = full.map((anglo, i) => {
        const isOctave = i >= scaleDef.intervals.length;
        const interval = isOctave ? 12 : scaleDef.intervals[i];
        return { interval, isOctave, label: labelOf(anglo, interval) };
    });
    // Toutes les pastilles ont exactement la même taille, les mêmes proportions et la même police,
    // quel que soit le nombre de notes de la gamme, le mode d'affichage ou la sélection.
    // Taille de référence --w : calculée pour 9 pastilles (gamme de 8 notes + octave) sur une seule ligne.
    // Le cerclage est dessiné par des ombres internes (aucun effet sur la taille, coins intérieurs arrondis,
    // trait noir placé sous la couleur : pas de liseré blanc entre les deux).
    const gap = large ? 6 : 4;
    const maxW = large ? 3.75 : 2.75;
    let badges = '';
    items.forEach(it => {
        const { interval, isOctave, label } = it;
        const check = interval === 12 ? 0 : interval;
        const isAvoid = avoidNotes.includes(check);
        const isChar = characteristicInterval === check;
        const highlightBlue = showTargetNotes && targets.includes(check);
        // (styles en ligne : ces couleurs ne sont pas dans tailwind-built.css)
        let ring = null;
        if (isAvoid) ring = "#ff1744";
        else if (isChar) ring = "#ffab00";
        else if (highlightBlue) ring = "#0a6cff";
        const shadowCss = ring
            ? `box-shadow:inset 0 0 0 calc(var(--w) * 0.12) ${ring}, inset 0 0 0 calc(var(--w) * 0.16) #000;`
            : '';
        // transition:none : la taille du cerclage dépend de --w (unités cqw), résolue après la mise en page ;
        // sans cela, chaque re-rendu (changement de mesure) animerait le cerclage et le ferait « clignoter ».
        const style = `transition:none;flex:none;width:var(--w);aspect-ratio:1 / 1;box-sizing:border-box;display:flex;align-items:center;justify-content:center;line-height:1;white-space:nowrap;font-size:calc(var(--w) * 0.32);color:#000;background:#fff;border-radius:calc(var(--w) * 0.26);${shadowCss}`;
        badges += `<span onclick="${noteOnclick(interval)}" class="font-mono font-bold cursor-pointer" style="${style}">${label}</span>`;
    });
    return `<div class="bg-transparent border border-[#333333] rounded-lg p-3 shadow-sm text-slate-100 w-full mx-auto select-none ${wrapperClass}" ${wrapperAttrs} style="container-type:inline-size;">
                                <div class="flex flex-nowrap" style="--w:min(${maxW}rem, calc((100cqw - ${gap * 8}px) / 9));gap:${gap}px;justify-content:center;">${badges}</div>
                            </div>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildPastillesHtml, scaleDegreeLabel };
}
