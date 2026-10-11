// local-soundfonts.js — les échantillons des instruments (piano, basses, cuivres, etc.) sont servis par le site lui-même,
// depuis le dossier app/sounds/, et non plus par un serveur externe : c'est ce qui permet de jouer hors ligne.
// Chargé par index.html juste après soundfont-player, avant le script principal. Testé par local-soundfonts.test.js.
// Le service worker (sw.js) charge aussi ce fichier (importScripts) pour connaître la liste des sons à garder en cache.

const LOCAL_SOUNDFONT_DIR = 'app/sounds';

// Même règle de nommage que soundfont-player (« <banque>/<instrument>-mp3.js »), mais vers notre dossier.
// Banque par défaut de la bibliothèque : MusyngKite.
function localSoundfontUrl(name, soundfont, format) {
    const bank = soundfont === 'FluidR3_GM' ? 'FluidR3_GM' : 'MusyngKite';
    const fmt = format === 'ogg' ? 'ogg' : 'mp3';
    return LOCAL_SOUNDFONT_DIR + '/' + bank + '/' + name + '-' + fmt + '.js';
}

// Instruments réellement demandés par l'appli (banque, nom). Si on ajoute un instrument dans index.html, on l'ajoute ici
// ET on copie son fichier dans app/sounds/ ; un test vérifie que les deux restent cohérents.
const LOCAL_SOUNDFONT_INSTRUMENTS = [
    ['FluidR3_GM', 'acoustic_grand_piano'],
    ['FluidR3_GM', 'acoustic_bass'],
    ['FluidR3_GM', 'electric_bass_finger'],
    ['MusyngKite', 'acoustic_guitar_nylon'],
    ['MusyngKite', 'accordion'],
    ['MusyngKite', 'tango_accordion'],
    ['MusyngKite', 'violin'],
    ['MusyngKite', 'electric_guitar_clean'],
    ['MusyngKite', 'contrabass'],
    ['MusyngKite', 'trumpet'],
    ['MusyngKite', 'french_horn'],
    ['MusyngKite', 'trombone'],
    ['MusyngKite', 'tuba']
];
const LOCAL_SOUNDFONT_FILES = LOCAL_SOUNDFONT_INSTRUMENTS.map(([bank, name]) => localSoundfontUrl(name, bank, 'mp3'));

// Fait passer tous les appels Soundfont.instrument(...) par nos fichiers locaux. Une adresse passée explicitement
// (option nameToUrl) garde la priorité. Sans effet si la bibliothèque est absente ou déjà configurée.
function useLocalSoundfonts(sf) {
    if (!sf || typeof sf.instrument !== 'function' || sf.__localSoundfonts) return sf;
    const original = sf.instrument;
    sf.instrument = function (ctx, name, opts) {
        return original.call(sf, ctx, name, Object.assign({ nameToUrl: localSoundfontUrl }, opts || {}));
    };
    sf.__localSoundfonts = true;
    return sf;
}

if (typeof Soundfont !== 'undefined') useLocalSoundfonts(Soundfont);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LOCAL_SOUNDFONT_DIR,
        LOCAL_SOUNDFONT_INSTRUMENTS,
        LOCAL_SOUNDFONT_FILES,
        localSoundfontUrl,
        useLocalSoundfonts
    };
}
