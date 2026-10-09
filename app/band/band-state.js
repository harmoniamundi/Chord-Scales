// band/band-state.js — états de départ de l'orchestre de la Jam, sans DOM : mémoire de conduite des voix (piano pop, guitare
// latine, cuivres, accordéon, tango…), phrase et plan en cours, compteurs de lecture. Un seul endroit décrit les valeurs « à zéro »
// utilisées à la construction du moteur, au lancement de la lecture, au changement d'orchestre et au changement de mesure.
// Le moteur applique le résultat avec Object.assign(this, …).
// Chargé par index.html via <script src="band/band-state.js"> et testé par band/band-state.test.js.

// Mémoire des voix d'un orchestre : phrase, plan et conduite des voix de l'orchestre précédent ne doivent pas se retrouver
// dans le suivant (changement d'orchestre, lancement de la lecture, construction).
function bandVoiceState() {
    return {
        _bandPhrase: null, _bandPlan: null,
        _latVoice: null, _latTie: false, _latRunAt: -9,
        _meterVoice: null, _popVoice: null, _popRunAt: -9,
        _brassVoice: null, _brassPrevKey: null, _brassLines: null,
        _balkanVoice: null, _balkanMel: null,
        _pzState: null,
    };
}

// Changement de signature rythmique : le plan et la phrase ne valent plus, ainsi que le dernier voicing de mesure irrégulière.
function bandMeterResetState() {
    return { _bandPlan: null, _bandPhrase: null, _meterVoice: null };
}

// Compteurs d'une lecture : mesures jouées, graine de variation de l'orchestre, remplissage de fin de phrase.
function bandRunState(seed) {
    return { _bandMeasureCounter: 0, _bandSeed: seed, _bandLastFill: false };
}

// Graine de variation d'une lecture (entier de 0 à 999999).
function newBandSeed(rand = Math.random) {
    return Math.floor(rand() * 1000000);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bandVoiceState, bandMeterResetState, bandRunState, newBandSeed };
}
