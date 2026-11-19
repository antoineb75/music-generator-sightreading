"""Théorie musicale basée sur music21 pour le générateur Partitio.

Convertit les tonalités, gammes (majeur, mineur naturel / harmonique / mélodique),
hauteurs diatoniques absolues D (octave * 7 + indice de lettre) et notes music21.
"""

from __future__ import annotations

from typing import Any
from music21 import key as m21_key, pitch as m21_pitch, scale as m21_scale

LETTERS = ["C", "D", "E", "F", "G", "A", "B"]
FR_LETTERS = ["Do", "Ré", "Mi", "Fa", "Sol", "La", "Si"]
NATURAL_PC = [0, 2, 4, 5, 7, 9, 11]

MAJOR_TONICS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]
MINOR_TONICS = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "D", "G", "C", "F", "Bb", "Eb", "Ab"]
MINOR_TYPES = ["harmonic", "natural", "melodic"]

ACCIDENTAL_SYMBOLS = {-2: "𝄫", -1: "♭", 0: "", 1: "♯", 2: "𝄪"}


def to_m21_tonic(tonic: str) -> str:
    """Convertit la notation bémol 'Bb' en notation music21 'B-'."""
    return tonic.replace("b", "-")


def accidental_symbol(alter: int) -> str:
    return ACCIDENTAL_SYMBOLS.get(alter, "")


def fr_note_name(letter: int, alter: int = 0) -> str:
    return FR_LETTERS[letter] + accidental_symbol(alter)


def letter_of(D: int) -> int:
    return ((D % 7) + 7) % 7


def octave_of(D: int) -> int:
    return D // 7


def d_of(letter: int, octave: int) -> int:
    return octave * 7 + letter


def note_to_d(note_name: str) -> int:
    if not note_name or len(note_name) < 2:
        return 28  # C4
    letter = LETTERS.index(note_name[0].upper()) if note_name[0].upper() in LETTERS else 0
    octave = int(note_name[-1]) if note_name[-1].isdigit() else 4
    return d_of(letter, octave)


def d_to_note(D: int) -> str:
    return f"{LETTERS[letter_of(D)]}{octave_of(D)}"


def lowest_d_with_letter(letter: int, min_d: int) -> int:
    return min_d + ((letter - letter_of(min_d)) % 7)


def degree_of(D: int, key_info: dict[str, Any]) -> int:
    return (letter_of(D) - key_info["tonicLetter"]) % 7


def d_alter_to_m21_pitch(D: int, alter: int) -> m21_pitch.Pitch:
    """Construit un objet music21.pitch.Pitch exact depuis (D, alter)."""
    p = m21_pitch.Pitch(step=LETTERS[letter_of(D)], octave=octave_of(D))
    if alter:
        p.accidental = m21_pitch.Accidental(alter)
    return p


def to_midi(D: int, alter: int) -> int:
    """Retourne le numéro MIDI exact calculé via music21.pitch.Pitch."""
    return int(d_alter_to_m21_pitch(D, alter).midi)


def m21_pitch_to_note_dict(p: m21_pitch.Pitch) -> dict[str, int]:
    """Convertit un music21.pitch.Pitch en dictionnaire {D, alter, midi}."""
    letter = LETTERS.index(p.step)
    octave = p.octave if p.octave is not None else 4
    alter = int(round(p.accidental.alter)) if p.accidental is not None else 0
    D = d_of(letter, octave)
    return {"D": D, "alter": alter, "midi": int(p.midi)}


def _scale_alters_from_m21(sc: m21_scale.ConcreteScale, direction: str = "ascending") -> list[int]:
    """Extrait les altérations des 7 degrés d'une gamme music21."""
    if direction == "descending":
        pitches = sc.getPitches(direction=m21_scale.Direction.DESCENDING)
        # descending returns [tonic+oct, 7, 6, 5, 4, 3, 2, tonic] -> reverse to degrees 0..6
        pitches = list(reversed(pitches))[:7]
    else:
        pitches = sc.getPitches(direction=m21_scale.Direction.ASCENDING)[:7]
    return [int(round(p.accidental.alter)) if p.accidental is not None else 0 for p in pitches]


def _make_key(tonic: str, mode: str) -> dict[str, Any]:
    k21 = m21_key.Key(to_m21_tonic(tonic), mode)
    tonic_pitch = k21.tonic
    letter = LETTERS.index(tonic_pitch.step)
    alter = int(round(tonic_pitch.accidental.alter)) if tonic_pitch.accidental is not None else 0

    nat_scale = m21_scale.MajorScale(tonic_pitch) if mode == "major" else m21_scale.MinorScale(tonic_pitch)
    sig_alters = _scale_alters_from_m21(nat_scale, "ascending")
    signature = [0] * 7
    for i, a in enumerate(sig_alters):
        signature[(letter + i) % 7] = a

    fifths = int(k21.sharps)
    key_id = tonic if mode == "major" else f"{tonic}m"
    sig_label = "" if fifths == 0 else (f"{fifths}♯" if fifths > 0 else f"{-fifths}♭")
    mode_fr = "majeur" if mode == "major" else "mineur"

    return {
        "id": key_id,
        "vexSpec": key_id,
        "tonicLetter": letter,
        "tonicAlter": alter,
        "mode": mode,
        "signature": signature,
        "fifths": fifths,
        "name": f"{fr_note_name(letter, alter)} {mode_fr}",
        "sigLabel": sig_label,
        "_m21_tonic": to_m21_tonic(tonic),
    }


KEYS: list[dict[str, Any]] = [
    *[_make_key(t, "major") for t in MAJOR_TONICS],
    *[_make_key(t, "minor") for t in MINOR_TONICS],
]
KEYS_BY_ID: dict[str, dict[str, Any]] = {k["id"]: k for k in KEYS}


def get_key(key_id: str) -> dict[str, Any]:
    return KEYS_BY_ID.get(key_id, KEYS[0])


def public_key_dict(key_info: dict[str, Any]) -> dict[str, Any]:
    """Retourne le dictionnaire de tonalité sérialisable pour le client JS."""
    return {k: v for k, v in key_info.items() if not k.startswith("_")}


def build_scale(key_info: dict[str, Any], minor_type: str = "harmonic") -> dict[str, Any]:
    """Construit le contexte de gamme via music21.scale."""
    tonic_str = key_info["_m21_tonic"]
    if key_info["mode"] == "major":
        sc = m21_scale.MajorScale(tonic_str)
        alters = _scale_alters_from_m21(sc, "ascending")
        return {
            "minorType": None,
            "melodyUp": alters,
            "melodyDown": alters,
            "harmony": alters,
        }

    nat = _scale_alters_from_m21(m21_scale.MinorScale(tonic_str), "ascending")
    harm = _scale_alters_from_m21(m21_scale.HarmonicMinorScale(tonic_str), "ascending")
    mel_sc = m21_scale.MelodicMinorScale(tonic_str)
    mel_up = _scale_alters_from_m21(mel_sc, "ascending")
    mel_down = _scale_alters_from_m21(mel_sc, "descending")

    if minor_type == "natural":
        return {"minorType": "natural", "melodyUp": nat, "melodyDown": nat, "harmony": nat}
    if minor_type == "melodic":
        return {"minorType": "melodic", "melodyUp": mel_up, "melodyDown": mel_down, "harmony": harm}
    return {"minorType": "harmonic", "melodyUp": harm, "melodyDown": harm, "harmony": harm}
