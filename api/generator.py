"""Moteur de composition musicale pianistique basé sur music21.

Intègre :
  1. Forme musicale thématique A – A' – B – A'' et style d'accompagnement cohérent par section
  2. Complémentarité rythmique MD / MG (contrepoint rythmique) et mouvement contraire
  3. Harmonie expressive via music21 : grilles stylistiques, renversements de basse conjoints,
     dominantes secondaires (music21.roman.RomanNumeral) et enrichissements (7e, 9e, sus4, add9)
  4. Sélection « Generate & Rank » (Best-of-N) évaluée avec music21.voiceLeading.VoiceLeadingQuartet
  5. Profils stylistiques (Classique, Baroque, Romantique, Pop/Jazz)
"""

from __future__ import annotations

import math
import random
from fractions import Fraction
from typing import Any

from music21 import (
    chord as m21_chord,
    clef as m21_clef,
    duration as m21_duration,
    key as m21_key,
    meter as m21_meter,
    note as m21_note,
    roman as m21_roman,
    stream as m21_stream,
    tempo as m21_tempo,
    voiceLeading as m21_vl,
)

from .styles import STYLE_PROFILES, STYLES, resolve_style
from .theory import (
    KEYS,
    LETTERS,
    MINOR_TYPES,
    build_scale,
    d_alter_to_m21_pitch,
    d_to_note,
    degree_of,
    get_key,
    letter_of,
    lowest_d_with_letter,
    m21_pitch_to_note_dict,
    note_to_d,
    octave_of,
    public_key_dict,
)

# ── Constantes publiques ───────────────────────────────────────

TIME_SIGNATURES = ["2/4", "3/4", "4/4", "5/4", "2/2", "3/8", "6/8", "12/8"]
LEVELS = ["initiation", "debutant", "intermediaire", "avance", "expert"]
HANDS = ["both", "right", "left"]
ENRICHED_OPTIONS = ["auto", "both", "right", "left", "seventh", "extended", "none"]

VALID_DURATIONS = [24, 16, 12, 8, 6, 4, 3, 2, 1]
N_CANDIDATES = 5

RANDOM_MEASURES = [4, 8, 8, 8, 12, 16]
RANDOM_MIN_NOTES_BY_LEVEL = {
    "initiation": ["C3", "E3", "G3", "C4"],
    "debutant": ["C2", "G2", "C3"],
    "intermediaire": ["C2", "G2", "A2", "E2"],
    "avance": ["A1", "C2", "E2"],
    "expert": ["A1", "C1", "E1", "C2"],
}
RANDOM_MAX_NOTES_BY_LEVEL = {
    "initiation": ["G4", "A4", "C5"],
    "debutant": ["C5", "D5", "E5"],
    "intermediaire": ["E5", "G5", "A5"],
    "avance": ["A5", "C6", "D6"],
    "expert": ["C6", "E6", "G6"],
}
TS_BY_LEVEL = {
    "initiation": ["4/4", "3/4"],
    "debutant": ["4/4", "3/4", "2/4"],
    "intermediaire": ["4/4", "3/4", "2/4", "6/8", "2/2"],
    "avance": TIME_SIGNATURES,
    "expert": TIME_SIGNATURES,
}
MAX_FIFTHS_BY_LEVEL = {
    "initiation": 1,
    "debutant": 2,
    "intermediaire": 4,
    "avance": 7,
    "expert": 7,
}
RANDOM_BPMS_BY_LEVEL = {
    "initiation": [60, 72, 80],
    "debutant": [72, 84, 96],
    "intermediaire": [88, 100, 112, 120],
    "avance": [100, 116, 132, 144],
    "expert": [112, 128, 144, 160],
}

ALLOWED_DEGREES = {
    "initiation": [0, 3, 4],
    "debutant": [0, 1, 3, 4, 5],
    "intermediaire": [0, 1, 3, 4, 5],
    "avance": [0, 1, 2, 3, 4, 5],
    "expert": [0, 1, 2, 3, 4, 5],
}

INTERVAL_WEIGHTS = {
    "initiation": [0.6, 8, 1.2, 0.1, 0, 0, 0, 0],
    "debutant": [0.4, 6, 2.5, 0.8, 0.3, 0, 0, 0],
    "intermediaire": [0.5, 5.5, 2.8, 1.2, 0.8, 0.3, 0, 0.2],
    "avance": [0.4, 4.5, 3, 1.5, 1, 0.6, 0.3, 0.4],
    "expert": [0.3, 4, 3, 1.8, 1.2, 0.8, 0.4, 0.5],
}

# Motifs de temps : valeurs négatives = silences, dict = N-olets (triolets / duolets)
BEAT_PATTERNS: dict[int, dict[str, list[tuple[Any, float]]]] = {
    4: {
        "initiation": [([4], 1.0)],
        "debutant": [([4], 3.0), ([2, 2], 2.0)],
        "intermediaire": [
            ([4], 2.2),
            ([2, 2], 2.8),
            ([3, 1], 1.2),
            ([-2, 2], 1.3),
            ([-4], 0.45),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [2, 2, 2]}, 1.1),
        ],
        "avance": [
            ([4], 1.6),
            ([2, 2], 2.0),
            ([1, 1, 1, 1], 1.3),
            ([2, 1, 1], 1.0),
            ([1, 1, 2], 1.0),
            ([3, 1], 1.0),
            ([1, 2, 1], 1.0),
            ([-2, 2], 1.2),
            ([-2, 1, 1], 0.8),
            ([-4], 0.45),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [2, 2, 2]}, 1.4),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [-2, 2, 2]}, 0.6),
        ],
        "expert": [
            ([4], 1.1),
            ([2, 2], 1.6),
            ([1, 1, 1, 1], 1.8),
            ([1, 1, 2], 1.1),
            ([2, 1, 1], 1.1),
            ([3, 1], 1.0),
            ([1, 2, 1], 1.3),
            ([-2, 2], 1.2),
            ([-2, 1, 1], 0.9),
            ([-1, 1, 2], 0.7),
            ([-4], 0.4),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [2, 2, 2]}, 1.6),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [-2, 2, 2]}, 0.7),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [2, -2, 2]}, 0.5),
        ],
    },
    6: {
        "initiation": [([6], 1.0)],
        "debutant": [([6], 2.5), ([4, 2], 2.0), ([2, 2, 2], 1.5)],
        "intermediaire": [
            ([6], 1.8),
            ([4, 2], 2.2),
            ([2, 2, 2], 2.2),
            ([2, 4], 1.0),
            ([-2, 2, 2], 1.0),
            ([2, -2, 2], 0.8),
            ([-6], 0.4),
            ({"tuplet": {"num": 2, "occupied": 3}, "items": [2, 2]}, 1.2),
        ],
        "avance": [
            ([4, 2], 1.8),
            ([2, 2, 2], 2.0),
            ([3, 1, 2], 1.4),
            ([6], 0.9),
            ([1, 1, 2, 2], 1.0),
            ([-2, 2, 2], 1.0),
            ([-2, 4], 0.8),
            ([2, -2, 2], 0.8),
            ([-6], 0.4),
            ({"tuplet": {"num": 2, "occupied": 3}, "items": [2, 2]}, 1.5),
        ],
        "expert": [
            ([2, 2, 2], 1.7),
            ([3, 1, 2], 1.7),
            ([1, 1, 1, 1, 2], 1.3),
            ([4, 2], 1.2),
            ([6], 0.8),
            ([-2, 2, 2], 1.0),
            ([-2, 4], 0.9),
            ([2, -2, 2], 0.9),
            ([-2, 1, 1, 2], 0.7),
            ([-6], 0.4),
            ({"tuplet": {"num": 2, "occupied": 3}, "items": [2, 2]}, 1.7),
        ],
    },
    2: {
        "initiation": [([2], 1.0)],
        "debutant": [([2], 3.0), ([1, 1], 1.0)],
        "intermediaire": [([2], 1.8), ([1, 1], 1.8), ([-1, 1], 0.8)],
        "avance": [([2], 1.4), ([1, 1], 1.8), ([-1, 1], 1.0), ([-2], 0.35)],
        "expert": [([1, 1], 2.0), ([2], 1.0), ([-1, 1], 1.1), ([-2], 0.35)],
    },
    8: {
        "initiation": [([8], 1.0)],
        "debutant": [([8], 2.0), ([4, 4], 3.0)],
        "intermediaire": [
            ([8], 1.4),
            ([4, 4], 2.5),
            ([4, 2, 2], 1.5),
            ([2, 4, 2], 1.2),
            ([-4, 4], 1.0),
            ([-2, 2, 4], 0.8),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [4, 4, 4]}, 1.0),
        ],
        "avance": [
            ([4, 4], 1.8),
            ([4, 2, 2], 1.8),
            ([2, 2, 4], 1.4),
            ([8], 0.8),
            ([2, 4, 2], 1.4),
            ([-4, 4], 1.0),
            ([-2, 2, 4], 1.0),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [4, 4, 4]}, 1.4),
        ],
        "expert": [
            ([4, 2, 2], 1.7),
            ([2, 2, 2, 2], 1.7),
            ([4, 4], 1.2),
            ([8], 0.8),
            ([2, 4, 2], 1.5),
            ([-4, 4], 1.0),
            ([-2, 2, 4], 1.0),
            ([2, 2, -2, 2], 0.8),
            ({"tuplet": {"num": 3, "occupied": 2}, "items": [4, 4, 4]}, 1.6),
        ],
    },
}

MULTI_BEAT_PATTERNS_4: dict[str, list[tuple[Any, float]]] = {
    "intermediaire": [
        ([2, 4, 2], 1.5),
        ([-4, 4], 1.0),
        ([-2, 2, -2, 2], 0.8),
    ],
    "avance": [
        ([2, 4, 2], 1.6),
        ([-4, 4], 1.0),
        ([-2, 2, -2, 2], 1.0),
        ({"tuplet": {"num": 3, "occupied": 2}, "items": [4, 4, 4]}, 1.2),
    ],
    "expert": [
        ([2, 4, 2], 1.6),
        ([-4, 4], 1.0),
        ([-2, 2, -2, 2], 1.2),
        ([2, 2, -2, 2], 0.7),
        ({"tuplet": {"num": 3, "occupied": 2}, "items": [4, 4, 4]}, 1.5),
    ],
}


# ── Helpers déterministes ──────────────────────────────────────


class SeededRng:
    def __init__(self, seed: int):
        self._rng = random.Random(int(seed) & 0xFFFFFFFF)

    def next(self) -> float:
        return self._rng.random()

    def pick(self, items: list[Any]) -> Any:
        return items[int(self._rng.random() * len(items))]

    def chance(self, p: float) -> bool:
        return self._rng.random() < p

    def weighted(self, items: list[tuple[Any, float]]) -> Any:
        total = sum(max(0.0, w) for _, w in items)
        if total <= 0:
            return items[0][0] if items else None
        r = self._rng.random() * total
        for val, w in items:
            r -= max(0.0, w)
            if r <= 0:
                return val
        return items[-1][0]


def clamp_measures(n: Any) -> int:
    try:
        v = int(round(float(n)))
    except (TypeError, ValueError):
        v = 8
    return max(1, min(32, v))


def clamp_bpm(n: Any) -> int:
    try:
        v = int(round(float(n)))
    except (TypeError, ValueError):
        v = 90
    return max(40, min(240, v))


def meter_info(ts: str) -> dict[str, Any]:
    m21_ts = m21_meter.TimeSignature(ts)
    num = int(m21_ts.numerator)
    den = int(m21_ts.denominator)
    measure_len = (num * 16) // den
    compound = False
    if den == 8 and num % 3 == 0 and num > 3:
        beat_len = 6
        compound = True
    elif den == 8:
        beat_len = 2
    elif den == 2:
        beat_len = 8
    else:
        beat_len = 4
    return {
        "ts": f"{num}/{den}",
        "num": num,
        "den": den,
        "measureLen": measure_len,
        "beatLen": beat_len,
        "compound": compound,
        "beats": measure_len // beat_len,
    }


def decompose(length: int) -> list[int]:
    out: list[int] = []
    rest = length
    while rest > 0:
        d = next(v for v in VALID_DURATIONS if v <= rest)
        out.append(d)
        rest -= d
    return out


# ── Résolution des paramètres ──────────────────────────────────


def resolve_params(settings: dict[str, Any], rng: SeededRng) -> dict[str, Any]:
    r = settings.get("random") or {}
    level = rng.pick(LEVELS) if r.get("level") else settings.get("level", "debutant")
    if level not in LEVELS:
        level = "debutant"

    hands = rng.pick(HANDS) if r.get("hands") else settings.get("hands", "both")
    if hands not in HANDS:
        hands = "both"

    time_signature = rng.pick(TS_BY_LEVEL[level]) if r.get("timeSignature") else settings.get("timeSignature", "4/4")
    if time_signature not in TIME_SIGNATURES:
        time_signature = "4/4"

    measures = rng.pick(RANDOM_MEASURES) if r.get("measures") else clamp_measures(settings.get("measures", 8))

    max_fifths = MAX_FIFTHS_BY_LEVEL[level]
    if r.get("key"):
        key_id = rng.pick([k for k in KEYS if abs(k["fifths"]) <= max_fifths])["id"]
    else:
        key_id = settings.get("key", "C")

    minor_type = rng.pick(MINOR_TYPES) if r.get("minorType") else settings.get("minorType", "harmonic")
    if minor_type not in MINOR_TYPES:
        minor_type = "harmonic"

    bpm = rng.pick(RANDOM_BPMS_BY_LEVEL[level]) if r.get("bpm") else clamp_bpm(settings.get("bpm", 90))

    raw_style = "auto" if r.get("style") else (settings.get("style") or "auto")
    if raw_style not in STYLES:
        raw_style = "auto"
    style = resolve_style(raw_style, level, rng)

    min_note = rng.pick(RANDOM_MIN_NOTES_BY_LEVEL[level]) if r.get("minNote") else (settings.get("minNote") or "C2")
    max_note = rng.pick(RANDOM_MAX_NOTES_BY_LEVEL[level]) if r.get("maxNote") else (settings.get("maxNote") or "C6")

    min_d = note_to_d(min_note)
    max_d = note_to_d(max_note)
    if min_d > max_d:
        min_d, max_d = max_d, min_d
        min_note, max_note = max_note, min_note
    if max_d - min_d < 4:
        max_d = min_d + 4
        max_note = d_to_note(max_d)

    enriched_chords = rng.pick(ENRICHED_OPTIONS) if r.get("enrichedChords") else (settings.get("enrichedChords") or "auto")
    if enriched_chords not in ENRICHED_OPTIONS:
        enriched_chords = "auto"

    if enriched_chords == "none":
        enrich_right, enrich_left, ext_type = False, False, "none"
    elif enriched_chords == "seventh":
        enrich_right, enrich_left, ext_type = True, True, "seventh"
    elif enriched_chords == "extended":
        enrich_right, enrich_left, ext_type = True, True, "extended"
    elif enriched_chords == "right":
        enrich_right, enrich_left = True, False
        ext_type = "extended" if level in ("avance", "expert") else "seventh"
    elif enriched_chords == "left":
        enrich_right, enrich_left = False, True
        ext_type = "extended" if level in ("avance", "expert") else "seventh"
    elif enriched_chords == "both":
        enrich_right, enrich_left = True, True
        ext_type = "extended" if level in ("avance", "expert") else "seventh"
    else:
        if level == "initiation":
            enrich_right, enrich_left, ext_type = False, False, "none"
        elif level == "debutant":
            enrich_right, enrich_left, ext_type = False, True, "seventh"
        elif level == "intermediaire":
            enrich_right, enrich_left, ext_type = True, True, "seventh"
        else:
            enrich_right, enrich_left, ext_type = True, True, "extended"

    return {
        "level": level,
        "hands": hands,
        "timeSignature": time_signature,
        "measures": measures,
        "key": key_id,
        "minorType": minor_type,
        "bpm": bpm,
        "style": style,
        "minNote": min_note,
        "maxNote": max_note,
        "minD": min_d,
        "maxD": max_d,
        "enrichedChords": enriched_chords,
        "enrichRight": enrich_right,
        "enrichLeft": enrich_left,
        "extensionType": ext_type,
    }


# ── Forme musicale A - A' - B - A'' & Rythme ──────────────────


def section_of_measure(m: int, n: int) -> str:
    if n < 4:
        return "A"
    if n < 8:
        return "A" if m < n // 2 else "A2"
    block = (m // 2) % 4
    return ("A", "A2", "B", "A3")[block]


def _expand_pattern(pattern: Any, start_pos: int, span: int, tuplet_id: str) -> list[dict[str, Any]]:
    if isinstance(pattern, list):
        out: list[dict[str, Any]] = []
        p = start_pos
        for raw in pattern:
            dur = abs(raw)
            out.append({"start": p, "dur": dur, "rest": raw < 0})
            p += dur
        return out
    tuplet = pattern["tuplet"]
    items = pattern["items"]
    note_dur = span / len(items)
    return [
        {
            "start": start_pos + idx * note_dur,
            "dur": note_dur,
            "notationDur": abs(raw),
            "tuplet": {"id": tuplet_id, "num": tuplet["num"], "occupied": tuplet["occupied"]},
            "rest": raw < 0,
        }
        for idx, raw in enumerate(items)
    ]


def _clone_rhythm(rhythm: list[dict[str, Any]], m: int) -> list[dict[str, Any]]:
    cloned: list[dict[str, Any]] = []
    for idx, ev in enumerate(rhythm):
        ev_copy = dict(ev)
        if "tuplet" in ev_copy:
            ev_copy["tuplet"] = {**ev_copy["tuplet"], "id": f"tp-{m}-c{idx}"}
        cloned.append(ev_copy)
    return cloned


def gen_measure_rhythm(rng: SeededRng, meter: dict[str, Any], level: str, is_last: bool, m: int = 0) -> list[dict[str, Any]]:
    L = meter["measureLen"]
    B = meter["beatLen"]
    n_beats = L // B

    if is_last:
        p = 0
        out = []
        for d in decompose(L):
            out.append({"start": p, "dur": d, "rest": False})
            p += d
        return out

    if level == "initiation":
        if L == 16 and rng.chance(0.4):
            return [{"start": 0, "dur": 16, "rest": False}]
        if L == 8 and rng.chance(0.5):
            return [{"start": 0, "dur": 4, "rest": False}, {"start": 4, "dur": 4, "rest": False}]
        if L == 12 and meter["compound"] and rng.chance(0.5):
            return [{"start": 0, "dur": 6, "rest": False}, {"start": 6, "dur": 6, "rest": False}]

    if level == "debutant" and rng.chance(0.35):
        if L == 16:
            if rng.chance(0.5):
                return [
                    {"start": 0, "dur": 8, "rest": False},
                    {"start": 8, "dur": 4, "rest": False},
                    {"start": 12, "dur": 4, "rest": False},
                ]
            return [
                {"start": 0, "dur": 4, "rest": False},
                {"start": 4, "dur": 4, "rest": False},
                {"start": 8, "dur": 8, "rest": False},
            ]
        if L == 12 and not meter["compound"]:
            return [{"start": 0, "dur": 8, "rest": False}, {"start": 8, "dur": 4, "rest": False}]

    patterns = BEAT_PATTERNS.get(B, BEAT_PATTERNS[4])[level]
    multi_patterns = MULTI_BEAT_PATTERNS_4.get(level) if B == 4 else None
    multi_chance = 0.35 if level == "expert" else (0.28 if level == "avance" else 0.2)

    evs: list[dict[str, Any]] = []
    pos = 0
    b = 0
    while b < n_beats:
        can_multi = multi_patterns is not None and (n_beats - b >= 2) and not (m == 0 and b == 0)
        if can_multi and rng.chance(multi_chance):
            chosen = rng.weighted(multi_patterns)
            evs.extend(_expand_pattern(chosen, pos, 2 * B, f"tp-{m}-{b}"))
            pos += 2 * B
            b += 2
            continue

        pool = patterns
        if m == 0 and b == 0:
            filtered = [item for item in patterns if not (isinstance(item[0], list) and len(item[0]) == 1 and item[0][0] < 0)]
            if filtered:
                pool = filtered

        chosen = rng.weighted(pool)
        evs.extend(_expand_pattern(chosen, pos, B, f"tp-{m}-{b}"))
        pos += B
        b += 1

    if all(e["rest"] for e in evs):
        evs[0]["rest"] = False
    return evs


def build_piece_rhythms(rng: SeededRng, meter: dict[str, Any], level: str, n: int) -> list[list[dict[str, Any]]]:
    """Construit la trame rythmique selon une forme thématique cohérente A - A' - B - A''."""
    rhythms: list[list[dict[str, Any]]] = []
    half_m = (n // 2) - 1 if n >= 4 else -1
    L = meter["measureLen"]
    B = meter["beatLen"]
    for m in range(n):
        if m == n - 1:
            rhythms.append(gen_measure_rhythm(rng, meter, level, True, m))
            continue
        # Respiration naturelle en fin de demi-cadence (note tenue + soupir de respiration)
        if m == half_m and level in ("intermediaire", "avance", "expert") and B == 4 and L in (12, 16) and rng.chance(0.5):
            if L == 16:
                rhythms.append([
                    {"start": 0, "dur": 8, "rest": False},
                    {"start": 8, "dur": 4, "rest": False},
                    {"start": 12, "dur": 4, "rest": True},
                ])
            else:
                rhythms.append([
                    {"start": 0, "dur": 8, "rest": False},
                    {"start": 8, "dur": 4, "rest": True},
                ])
            continue
        sec = section_of_measure(m, n)
        if sec == "A2" and (m % 2 == 0) and len(rhythms) >= 1 and rng.chance(0.65):
            # Rappel du motif A en début de phrase A'
            rhythms.append(_clone_rhythm(rhythms[0], m))
        elif sec == "A3" and (m % 2 == 0) and len(rhythms) >= 1 and rng.chance(0.75):
            # Retour franc du motif A en A''
            rhythms.append(_clone_rhythm(rhythms[0], m))
        elif sec == "A3" and (m % 2 == 1) and len(rhythms) >= 2 and m < n - 1 and rng.chance(0.5):
            rhythms.append(_clone_rhythm(rhythms[1], m))
        else:
            rhythms.append(gen_measure_rhythm(rng, meter, level, False, m))
    return rhythms


# ── Harmonie expressive (Grilles, Renversements & Dominantes secondaires) ─


def _secondary_dominant_alters(rn_symbol: str, key_info: dict[str, Any]) -> tuple[int, dict[int, int]] | None:
    """Calcule le degré fondamental et les altérations chromatiques d'une dominante secondaire via music21."""
    try:
        k21 = m21_key.Key(key_info["_m21_tonic"], key_info["mode"])
        rn = m21_roman.RomanNumeral(rn_symbol, k21)
        root_letter = LETTERS.index(rn.root().step)
        root_deg = (root_letter - key_info["tonicLetter"]) % 7
        alters: dict[int, int] = {}
        for p in rn.pitches:
            deg = (LETTERS.index(p.step) - key_info["tonicLetter"]) % 7
            alt = int(round(p.accidental.alter)) if p.accidental is not None else 0
            alters[deg] = alt
        return root_deg, alters
    except Exception:
        return None


def plan_harmony(
    rng: SeededRng,
    meter: dict[str, Any],
    level: str,
    n: int,
    mode: str,
    enrich_active: bool,
    extension_type: str,
    min_d: int,
    key_info: dict[str, Any],
    style: str,
) -> list[dict[str, Any]]:
    profile = STYLE_PROFILES[style]
    L = meter["measureLen"]
    slots: list[dict[str, Any]] = []
    for m in range(n):
        splittable = m < n - 1 and level not in ("initiation", "debutant") and meter["beats"] == 4
        split_prob = 0.5 if level == "expert" else (0.35 if level == "avance" else 0.2)
        if splittable and rng.chance(split_prob):
            slots.append({"m": m, "start": 0, "len": L // 2})
            slots.append({"m": m, "start": L // 2, "len": L // 2})
        else:
            slots.append({"m": m, "start": 0, "len": L})

    allowed = [d for d in ALLOWED_DEGREES[level] if not (mode == "minor" and d == 2)]
    min_degree = degree_of(min_d, key_info)

    # Choix d'une grille stylistique idiomatique filtrée par les degrés autorisés
    prog_pool = profile["major_progressions"] if mode == "major" else profile["minor_progressions"]
    valid_progs = [p for p in prog_pool if all(d in allowed for d in p)]
    chosen_prog = rng.pick(valid_progs) if valid_progs else [0, 3, 4, 0]

    for i, s in enumerate(slots):
        if i == 0:
            s["degree"] = 0
        elif i == len(slots) - 1:
            s["degree"] = 0
        elif i == len(slots) - 2:
            s["degree"] = 4
        elif i == len(slots) - 3 and len(slots) >= 4:
            pre_dom = [d for d in (1, 3) if d in allowed and d != slots[i - 1]["degree"]]
            s["degree"] = rng.pick(pre_dom) if pre_dom else (3 if 3 in allowed else 4)
        else:
            # Suivre la grille stylistique avec variations organiques
            target_deg = chosen_prog[i % len(chosen_prog)]
            prev = slots[i - 1]["degree"]
            if target_deg in allowed and target_deg != prev and rng.chance(0.7):
                s["degree"] = target_deg
            else:
                transitions = {
                    0: [(3, 3.0), (5, 3.0), (1, 2.0), (4, 2.0), (2, 1.0)],
                    1: [(4, 4.0), (2, 1.0), (5, 1.0)],
                    2: [(5, 3.0), (3, 3.0), (1, 1.0)],
                    3: [(4, 3.0), (1, 2.5), (0, 2.0), (5, 1.0)],
                    4: [(0, 3.5), (5, 2.5), (3, 1.5)],
                    5: [(1, 3.0), (3, 3.0), (4, 2.0), (2, 1.0)],
                }
                weighted_cands = transitions.get(prev, [(d, 1.0) for d in allowed])
                filtered = [(d, w) for d, w in weighted_cands if d in allowed and d != prev]
                s["degree"] = rng.weighted(filtered) if filtered else 0

        s["seventh"] = False
        s["ninth"] = False
        s["sus4"] = False
        s["add9"] = False

        if enrich_active and extension_type == "seventh":
            if s["degree"] == 4:
                s["seventh"] = rng.chance(0.85)
            elif s["degree"] in (0, 1, 3, 5) and rng.chance(0.4):
                s["seventh"] = True
        elif enrich_active and extension_type == "extended":
            if s["degree"] == 4:
                s["seventh"] = True
                if rng.chance(0.7):
                    s["ninth"] = True
                elif rng.chance(0.3):
                    s["sus4"] = True
            elif s["degree"] in (0, 1, 3, 5):
                s["seventh"] = rng.chance(0.8)
                if s["seventh"] and rng.chance(0.6):
                    s["ninth"] = True
                elif rng.chance(0.35):
                    s["add9"] = True

    # Demi-cadence au milieu des pièces >= 4 mesures
    if n >= 4 and len(slots) >= 4:
        mid_m = (n // 2) - 1
        mid_indices = [idx for idx, s in enumerate(slots) if s["m"] == mid_m]
        if mid_indices:
            mid_idx = mid_indices[-1]
            if 0 < mid_idx < len(slots) - 2:
                slots[mid_idx]["degree"] = 4
                if enrich_active and extension_type != "none":
                    slots[mid_idx]["seventh"] = True

    # Intégration organique du degré de minD
    if n >= 3 and min_degree != 0 and min_degree in allowed:
        if not any(s["degree"] == min_degree for s in slots):
            cand_idx = max(1, min(len(slots) - 3, int(len(slots) * 0.35)))
            slots[cand_idx]["degree"] = min_degree

    # Dominantes secondaires (V7/V, V7/vi) en Avancé / Virtuose via music21.roman.RomanNumeral
    if level in ("avance", "expert") and len(slots) >= 4:
        sec_prob = profile["secondary_dom_prob"]
        for i in range(1, len(slots) - 2):
            nxt_deg = slots[i + 1]["degree"]
            if nxt_deg == 4 and slots[i]["degree"] in (1, 3) and rng.chance(sec_prob):
                res = _secondary_dominant_alters("V7/V", key_info)
                if res:
                    root_deg, alters = res
                    slots[i]["degree"] = root_deg
                    slots[i]["seventh"] = True
                    slots[i]["sus4"] = False
                    slots[i]["chromaticAlters"] = alters
            elif mode == "major" and nxt_deg == 5 and slots[i]["degree"] in (2, 0) and rng.chance(sec_prob * 0.7):
                res = _secondary_dominant_alters("V7/vi", key_info)
                if res:
                    root_deg, alters = res
                    slots[i]["degree"] = root_deg
                    slots[i]["seventh"] = True
                    slots[i]["sus4"] = False
                    slots[i]["chromaticAlters"] = alters

    # Renversements de basse (1er renversement = tierce à la basse) pour créer une ligne de basse conjointe
    if level in ("intermediaire", "avance", "expert") and len(slots) >= 3:
        inv_prob = profile["inversion_prob"]
        for i in range(1, len(slots) - 1):
            cur = slots[i]
            if cur.get("sus4"):
                continue
            third_deg = (cur["degree"] + 2) % 7
            prev_bass = slots[i - 1].get("bassDegree", slots[i - 1]["degree"])
            next_root = slots[i + 1]["degree"]
            # Renversement particulièrement fluide si la tierce relie conjointement la basse précédente ou suivante
            step_prev = min((third_deg - prev_bass) % 7, (prev_bass - third_deg) % 7) == 1
            step_next = min((third_deg - next_root) % 7, (next_root - third_deg) % 7) == 1
            if (step_prev or step_next) and rng.chance(inv_prob):
                cur["bassDegree"] = third_deg

    # Retards (suspensions 4 -> 3) sur mesures scindées en 2 demi-mesures (Baroque / Classique / Romantique)
    if level in ("avance", "expert") and style in ("baroque", "classique", "romantique"):
        for i in range(1, len(slots) - 2):
            if slots[i]["m"] == slots[i + 1]["m"] and not slots[i].get("chromaticAlters") and rng.chance(0.35):
                target_deg = slots[i + 1]["degree"]
                slots[i]["degree"] = target_deg
                slots[i]["sus4"] = True
                slots[i].pop("bassDegree", None)
                slots[i + 1]["sus4"] = False

    # Couleurs cadentielles stylistiques sur l'accord final
    final_slot = slots[-1]
    if style == "baroque" and mode == "minor" and level in ("avance", "expert") and rng.chance(0.45):
        # Tierce picarde (tierce mineure haussée d'un demi-ton sur la tonique finale)
        nat_scale = build_scale(key_info, "natural")
        final_slot["chromaticAlters"] = {2: nat_scale["harmony"][2] + 1}
    elif style == "pop" and level in ("intermediaire", "avance", "expert") and enrich_active and rng.chance(0.5):
        final_slot["add9"] = True

    return slots


def chord_degrees(slot: dict[str, Any]) -> list[int]:
    d = slot["degree"]
    if slot["sus4"]:
        degs = [d, (d + 3) % 7, (d + 4) % 7]
        if slot["seventh"]:
            degs.append((d + 6) % 7)
        if slot["ninth"]:
            degs.append((d + 1) % 7)
        return degs
    degs = [d, (d + 2) % 7, (d + 4) % 7]
    if slot["seventh"]:
        degs.append((d + 6) % 7)
    if slot["ninth"]:
        degs.append((d + 1) % 7)
    if slot["add9"] and not slot["ninth"]:
        degs.append((d + 1) % 7)
    return degs


def chord_at(slots: list[dict[str, Any]], m: int, pos: float) -> dict[str, Any]:
    for s in slots:
        if s["m"] == m and s["start"] <= pos < s["start"] + s["len"]:
            return s
    return slots[-1]


def slot_alter(slot: dict[str, Any], deg: int, default_alter: int) -> int:
    chrom = slot.get("chromaticAlters")
    if chrom and deg in chrom:
        return chrom[deg]
    return default_alter


# ── Mélodie chantante (Main droite ou Main gauche seule) ───────


def melody_range(clef_name: str, min_d: int, max_d: int, hands: str) -> tuple[int, int]:
    if hands in ("right", "left"):
        return min_d, max_d
    span = max_d - min_d
    if span <= 7:
        split = round(min_d + span * 0.45)
        return (max(min_d, split), max_d) if clef_name == "treble" else (min_d, min(max_d, split + 1))
    pivot = max(min_d + 4, min(max_d - 5, round(min_d + span * 0.45)))
    return (max(min_d, pivot - 1), max_d) if clef_name == "treble" else (min_d, min(max_d, pivot + 1))


def gen_melody(
    rng: SeededRng,
    ctx: dict[str, Any],
    rhythms: list[list[dict[str, Any]]],
    clef_name: str,
    hand: str,
) -> list[list[dict[str, Any]]]:
    key_info = ctx["key"]
    scale = ctx["scale"]
    meter = ctx["meter"]
    slots = ctx["slots"]
    level = ctx["level"]
    n = ctx["n"]
    min_d = ctx["minD"]
    max_d = ctx["maxD"]
    hands = ctx["hands"]
    profile = STYLE_PROFILES[ctx["style"]]

    lo, hi = melody_range(clef_name, min_d, max_d, hands)
    IW = list(INTERVAL_WEIGHTS[level])
    IW[1] *= profile["step_bias"]

    d_range = list(range(lo, hi + 1)) or list(range(min_d, max_d + 1))
    mid_d = (lo + hi) / 2.0
    in_range_tonics = [x for x in d_range if degree_of(x, key_info) == 0]
    ref_tonic = min(in_range_tonics, key=lambda t: abs(t - mid_d)) if in_range_tonics else round(mid_d)

    pitched: list[tuple[int, dict[str, Any]]] = []
    for m, rhythm in enumerate(rhythms):
        for ev in rhythm:
            if not ev["rest"]:
                pitched.append((m, ev))
    N = len(pitched)

    def nearest(cands: list[int], target: int) -> int:
        return min(cands, key=lambda x: abs(x - target))

    def pick_consonant_idx(ideal_idx: int, target_d: int) -> int:
        if N < 4:
            return 0
        t_deg = degree_of(target_d, key_info)
        best_idx = max(1, min(N - 2, ideal_idx))
        best_score = -1e9
        for j in range(1, N - 1):
            jm, jev = pitched[j]
            degs = chord_degrees(chord_at(slots, jm, jev["start"]))
            in_triad = t_deg in degs[:3]
            in_chord = t_deg in degs
            score = (100 if in_triad else (40 if in_chord else (10 if jev["start"] > 0 else -50))) - abs(j - ideal_idx)
            if score > best_score:
                best_score = score
                best_idx = j
        return best_idx

    target_climax_idx = pick_consonant_idx(int(N * 0.65), max_d) if (hand == "right" or hands == "left") else -1
    target_min_idx = pick_consonant_idx(int(N * 0.25), min_d) if (hands == "right" and N >= 4) else -1

    prev: int | None = None
    prev2: int | None = None
    last_int = 0
    direction = 1 if rng.chance(0.5) else -1
    theme_intervals: list[int] = []
    half_measure = (n // 2) - 1 if n >= 4 else -1

    # Indices de début de chaque section A' / A'' pour le rappel motivique (marche harmonique)
    section_starts: dict[int, int] = {}
    for idx, (pm, _) in enumerate(pitched):
        sec = section_of_measure(pm, n)
        if sec in ("A2", "A3") and pm not in section_starts and (pm % 2 == 0):
            section_starts[pm] = idx

    for i, (m, ev) in enumerate(pitched):
        ch = chord_at(slots, m, ev["start"])
        cdegs = chord_degrees(ch)
        triad_degs = cdegs[:3]
        is_ct = lambda D: degree_of(D, key_info) in cdegs  # noqa: E731

        if i == N - 1:
            tonics = [x for x in d_range if degree_of(x, key_info) == 0]
            D = nearest(tonics, prev if prev is not None else ref_tonic) if tonics else d_range[0]
        elif i == target_climax_idx and (hand == "right" or hands == "left"):
            D = max_d
        elif i == target_min_idx and hands == "right":
            D = min_d
        elif i == 0:
            triad_cands = [x for x in d_range if degree_of(x, key_info) in triad_degs]
            cands = triad_cands or [x for x in d_range if is_ct(x)]
            if cands:
                D = rng.weighted(
                    [(x, (3.0 if degree_of(x, key_info) == 0 else 1.0) / (1.0 + abs(x - ref_tonic))) for x in cands]
                )
            else:
                D = ref_tonic
        elif i == N - 2:
            final_tonics = [x for x in d_range if degree_of(x, key_info) == 0]
            target_tonic = nearest(final_tonics, prev if prev is not None else ref_tonic) if final_tonics else ref_tonic
            cands = [
                x for x in d_range
                if degree_of(x, key_info) in (1, 6) and abs(x - target_tonic) == 1
            ]
            weighted = [(x, IW[abs(x - prev)] if abs(x - prev) < len(IW) else 1.0) for x in cands]
            if any(w > 0 for _, w in weighted):
                D = rng.weighted(weighted)
            else:
                D = nearest(cands or d_range, prev)
        else:
            is_bar_start = ev["start"] == 0
            strong = (ev["start"] % meter["beatLen"]) == 0
            progress = i / max(1, N)
            prev_deg = degree_of(prev, key_info)
            has_triad = any(degree_of(x, key_info) in triad_degs for x in d_range)
            has_ct = any(is_ct(x) for x in d_range)
            is_half_end = m == half_measure and (i + 1 >= N or pitched[i + 1][0] > half_measure)

            sec_start = section_starts.get(m, section_starts.get(m - 1, -1))
            motif_offset = (i - sec_start) if sec_start >= 0 else -1
            expected_motif = theme_intervals[motif_offset - 1] if 0 < motif_offset <= len(theme_intervals) else None

            weights: list[tuple[int, float]] = []
            for x in d_range:
                iv = abs(x - prev)
                w = IW[iv] if iv < len(IW) else 0.0
                if not w:
                    continue
                if iv == 0 and prev == prev2:
                    continue
                ct = is_ct(x)
                x_deg = degree_of(x, key_info)
                in_triad = x_deg in triad_degs

                if is_bar_start:
                    if has_ct and not ct:
                        continue
                    if has_triad and not in_triad:
                        continue
                else:
                    w *= (1.3 if ct else 0.1) if strong else (1.0 if ct else 0.85)

                if (x - prev) * direction > 0:
                    w *= 1.8
                if iv >= 3 and ((prev_deg == 3 and x_deg == 6) or (prev_deg == 6 and x_deg == 3)):
                    w *= 0.15
                if iv == 6:
                    w *= 0.25
                if expected_motif is not None and (x - prev) == expected_motif:
                    w *= 2.4
                if is_half_end and ct:
                    w *= 2.5
                if abs(last_int) >= 3:
                    if 1 <= iv <= 2 and math.copysign(1, x - prev) == -math.copysign(1, last_int):
                        w *= 3.5
                    if iv >= 3:
                        w *= 0.2
                if target_climax_idx > 0 and i < target_climax_idx and (target_climax_idx - i) <= 4:
                    if abs(max_d - x) < abs(max_d - prev):
                        w *= 2.6
                if 0.45 <= progress <= 0.75:
                    if x > mid_d:
                        w *= 1.4
                elif progress > 0.75:
                    if abs(x - ref_tonic) < abs(prev - ref_tonic):
                        w *= 1.3
                weights.append((x, w))

            if weights:
                D = rng.weighted(weights)
            else:
                ct_cands = [x for x in d_range if degree_of(x, key_info) in triad_degs] or [x for x in d_range if is_ct(x)] or d_range
                D = nearest(ct_cands, prev)

        last_int = 0 if prev is None else D - prev
        if 1 <= i <= 6:
            theme_intervals.append(last_int)
        prev2 = prev
        prev = D
        if i == target_climax_idx:
            direction = -1
        elif i == target_min_idx:
            direction = 1
        elif D >= hi - 1:
            direction = -1
        elif D <= lo + 1:
            direction = 1
        elif rng.chance(0.25):
            direction = -direction
        ev["D"] = D

    # Altérations mélodiques (avec gestion du mineur mélodique et des dominantes secondaires)
    alter_of = [0] * N
    is_melodic = scale["minorType"] == "melodic"
    for i, (m, ev) in enumerate(pitched):
        ch = chord_at(slots, m, ev["start"])
        deg = degree_of(ev["D"], key_info)
        ct = deg in chord_degrees(ch)
        nxt = pitched[i + 1][1]["D"] if i + 1 < N else None
        if ch.get("chromaticAlters") and deg in ch["chromaticAlters"]:
            alter_of[i] = ch["chromaticAlters"][deg]
        elif is_melodic and deg == 6:
            alter_of[i] = scale["melodyUp"][6] if (ct or (nxt is not None and nxt > ev["D"])) else scale["melodyDown"][6]
        elif not (is_melodic and deg == 5):
            alter_of[i] = scale["harmony"][deg] if ct else scale["melodyUp"][deg]

    if is_melodic:
        for i, (m, ev) in enumerate(pitched):
            ch = chord_at(slots, m, ev["start"])
            if degree_of(ev["D"], key_info) != 5 or (ch.get("chromaticAlters") and 5 in ch["chromaticAlters"]):
                continue
            ct = 5 in chord_degrees(ch)

            def raised7(j: int) -> bool:
                return (
                    0 <= j < N
                    and degree_of(pitched[j][1]["D"], key_info) == 6
                    and abs(pitched[j][1]["D"] - ev["D"]) == 1
                    and alter_of[j] == scale["melodyUp"][6]
                )

            nxt = pitched[i + 1][1]["D"] if i + 1 < N else None
            up = (nxt is not None and nxt > ev["D"]) or raised7(i + 1) or raised7(i - 1)
            alter_of[i] = scale["harmony"][5] if (ct and not up) else (scale["melodyUp"][5] if up else scale["melodyDown"][5])

    events: list[list[dict[str, Any]]] = [[] for _ in range(n)]
    is_enriched_right = bool(ctx["enrichRight"] and hand == "right")
    pitched_map = {id(ev): idx for idx, (_, ev) in enumerate(pitched)}
    prev_inner_d: int | None = None

    for m, rhythm in enumerate(rhythms):
        for i, ev in enumerate(rhythm):
            out: dict[str, Any] = {
                "id": f"{hand}-{m}-{i}",
                "hand": hand,
                "start": ev["start"],
                "dur": ev["dur"],
                "rest": bool(ev["rest"]),
                "notes": [],
            }
            if "notationDur" in ev:
                out["notationDur"] = ev["notationDur"]
            if "tuplet" in ev:
                out["tuplet"] = ev["tuplet"]

            if not ev["rest"]:
                idx = pitched_map[id(ev)]
                alter = alter_of[idx]
                out["notes"].append(m21_pitch_to_note_dict(d_alter_to_m21_pitch(ev["D"], alter)))

                if is_enriched_right:
                    is_last_note = m == n - 1 and i == len(rhythm) - 1
                    is_strong_beat = ev["dur"] >= 4 or ev["start"] == 0 or (ev["start"] % meter["beatLen"] == 0)
                    prob = 0.75 if level == "expert" else (0.6 if level == "avance" else 0.4)
                    if is_last_note or (is_strong_beat and rng.chance(prob)):
                        ch = chord_at(slots, m, ev["start"])
                        degs = chord_degrees(ch)
                        candidates: list[int] = []
                        for deg in degs:
                            letter = (key_info["tonicLetter"] + deg) % 7
                            for oct_num in range(octave_of(ev["D"]), 0, -1):
                                cand_d = oct_num * 7 + letter
                                interval = ev["D"] - cand_d
                                if min_d <= cand_d <= max_d and 2 <= interval <= 7 and cand_d not in candidates:
                                    candidates.append(cand_d)
                        # Conduite de la 2e voix intérieure (alto conjoint par rapport à prev_inner_d)
                        if prev_inner_d is not None and level in ("avance", "expert") and not is_last_note:
                            candidates.sort(key=lambda c: (abs(c - prev_inner_d), ev["D"] - c))
                        else:
                            candidates.sort(reverse=True)
                        max_add = (2 if level in ("avance", "expert") else 1) if is_last_note else (2 if level == "expert" else 1)
                        chosen_inner = candidates[:max_add]
                        if chosen_inner:
                            prev_inner_d = chosen_inner[0]
                        for c_d in chosen_inner:
                            c_deg = degree_of(c_d, key_info)
                            c_alter = slot_alter(ch, c_deg, scale["harmony"][c_deg])
                            out["notes"].append(m21_pitch_to_note_dict(d_alter_to_m21_pitch(c_d, c_alter)))
                        out["notes"].sort(key=lambda nd: nd["D"])

            events[m].append(out)

    return events


# ── Accompagnement (Main gauche : Style cohérent, Contrepoint & Voice Leading) ─


def _slot_treble_stats(treble: list[list[dict[str, Any]]] | None, slot: dict[str, Any], beat_len: int) -> tuple[float, int | None]:
    """Calcule la densité rythmique et la hauteur d'attaque de la MD sur un slot."""
    if not treble:
        return 1.5, None
    m_evs = treble[slot["m"]]
    in_slot = [e for e in m_evs if not e["rest"] and slot["start"] <= e["start"] < slot["start"] + slot["len"]]
    beats = max(1.0, slot["len"] / max(1, beat_len))
    density = len(in_slot) / beats
    first_d = in_slot[0]["notes"][-1]["D"] if in_slot and in_slot[0]["notes"] else None
    return density, first_d


def gen_accompaniment(
    rng: SeededRng,
    ctx: dict[str, Any],
    treble: list[list[dict[str, Any]]] | None = None,
) -> list[list[dict[str, Any]]]:
    key_info = ctx["key"]
    scale = ctx["scale"]
    meter = ctx["meter"]
    slots = ctx["slots"]
    level = ctx["level"]
    n = ctx["n"]
    min_d = ctx["minD"]
    max_d = ctx["maxD"]
    profile = STYLE_PROFILES[ctx["style"]]

    letter_of_deg = lambda deg: (key_info["tonicLetter"] + deg) % 7  # noqa: E731
    min_letter = letter_of(min_d)

    def fit_d(D: int) -> int:
        res = D
        while res < min_d and res + 7 <= max_d:
            res += 7
        while res > max_d and res - 7 >= min_d:
            res -= 7
        return max(min_d, min(max_d, res))

    def closest_octave(letter: int, target: float, lo_bound: int, hi_bound: int) -> int:
        cands = [oct_num * 7 + letter for oct_num in range(0, 9) if lo_bound <= oct_num * 7 + letter <= hi_bound]
        if not cands:
            return fit_d(lowest_d_with_letter(letter, int(round(target))))
        return min(cands, key=lambda c: abs(c - target))

    # Choix d'un style d'accompagnement cohérent pour la section A et d'une variante pour B
    if meter["num"] == 3 and meter["den"] == 4:
        avail = ["waltz", "waltz_offbeat"] if level == "intermediaire" else profile["waltz_accomp"]
        style_a = rng.pick(avail)
        style_b = rng.pick([x for x in avail if x != style_a] or avail)
    elif meter["compound"] and meter["beatLen"] == 6:
        avail = profile["compound_accomp"]
        style_a = rng.pick(avail)
        style_b = rng.pick([x for x in avail if x != style_a] or avail)
    else:
        if level == "intermediaire":
            avail = [x for x in profile["binary_accomp"] if x in ("alberti", "stride", "offbeat", "triplet_arp")] or ["alberti", "stride", "offbeat"]
        else:
            avail = profile["binary_accomp"]
        style_a = rng.pick(avail)
        style_b = rng.pick([x for x in avail if x != style_a] or avail)

    min_slot_idx = next((idx for idx, s in enumerate(slots) if letter_of_deg(s.get("bassDegree", s["degree"])) == min_letter), -1)
    per_measure: list[list[dict[str, Any]]] = [[] for _ in range(n)]
    prev_base_d: int | None = None
    prev_upper_center: float | None = None
    prev_treble_d: int | None = None

    for slot_idx, slot in enumerate(slots):
        span = max_d - min_d
        pivot = max(min_d + 4, min(max_d - 5, round(min_d + span * 0.45)))
        base_target = max(min_d, min(pivot - 5, 16))

        treble_density, treble_d = _slot_treble_stats(treble, slot, meter["beatLen"])
        treble_dir = 0 if (treble_d is None or prev_treble_d is None) else (1 if treble_d > prev_treble_d else (-1 if treble_d < prev_treble_d else 0))
        if treble_d is not None:
            prev_treble_d = treble_d

        bass_deg = slot.get("bassDegree", slot["degree"])
        is_min_slot = slot_idx == min_slot_idx or letter_of_deg(bass_deg) == min_letter
        if is_min_slot:
            r = min_d
        else:
            # Mouvement contraire subtil : si la mélodie monte, cibler légèrement plus bas (et inversement)
            contrary_shift = -2.0 * treble_dir if prev_base_d is not None else 0.0
            target_b = (prev_base_d if prev_base_d is not None else base_target) + contrary_shift
            r = closest_octave(
                letter_of_deg(bass_deg),
                target_b,
                min_d,
                max(min_d, min(pivot - 2, base_target + 5)),
            )
        prev_base_d = r

        degs = chord_degrees(slot)
        upper_degs = degs[1:] if (slot["seventh"] or slot["ninth"]) else degs
        upper_target = max(min_d + 2, min(pivot, 21))
        voice_target = prev_upper_center if prev_upper_center is not None else float(upper_target)

        upper = sorted(
            closest_octave(letter_of_deg(d), voice_target, max(min_d, r + 1), min(max_d, pivot + 2))
            for d in upper_degs
        )
        if len(upper) > 1 and upper[-1] - upper[0] > 7:
            upper = sorted(fit_d(lowest_d_with_letter(letter_of_deg(d), upper_target)) for d in upper_degs)
        if upper:
            prev_upper_center = sum(upper) / len(upper)

        ninth_d = fit_d(lowest_d_with_letter(letter_of_deg((slot["degree"] + 1) % 7), int(round(voice_target))))
        seventh_d = fit_d(lowest_d_with_letter(letter_of_deg((slot["degree"] + 6) % 7), int(round(voice_target))))

        evs: list[dict[str, Any]] = []

        def add(pos: float, dur: float, Ds: list[int], is_rest: bool = False, extra: dict[str, Any] | None = None) -> None:
            payload: dict[str, Any] = {"start": slot["start"] + pos, "dur": dur, "rest": is_rest, "slot": slot}
            if extra:
                payload.update(extra)
            if is_rest:
                payload["Ds"] = []
                evs.append(payload)
                return
            filtered = sorted({fit_d(d) for d in Ds})
            if len(filtered) > 1 and filtered[-1] - filtered[0] > 8:
                filtered = [filtered[0]]
            payload["Ds"] = filtered
            evs.append(payload)

        def add_tuplet(pos: float, t_span: int, num: int, occupied: int, notation_dur: int, items: list[dict[str, Any]], tag: str) -> None:
            note_dur = t_span / len(items)
            tuplet = {"id": f"lh-{slot['m']}-{slot_idx}-{tag}", "num": num, "occupied": occupied}
            for idx, item in enumerate(items):
                add(
                    pos + idx * note_dur,
                    note_dur,
                    item.get("Ds", []),
                    bool(item.get("rest", False)),
                    {"notationDur": notation_dur, "tuplet": tuplet},
                )

        def fill(Ds: list[int]) -> None:
            p = 0
            for d in decompose(slot["len"]):
                add(p, d, Ds)
                p += d

        u0 = upper[0] if len(upper) > 0 else (r + 2)
        u1 = upper[1] if len(upper) > 1 else ninth_d
        u_last = upper[-1] if len(upper) > 0 else (r + 4)

        sec = section_of_measure(slot["m"], n)
        active_style = style_b if sec == "B" else style_a
        # Contrepoint rythmique : si la MD est très dense, alléger la MG ; si la MD est calme, animer la MG
        md_busy = treble_density >= 2.6

        if slot["m"] == n - 1:
            fill([r] if level in ("initiation", "debutant") else [r, r + 4])
        elif meter["num"] == 3 and meter["den"] == 4:
            if level == "initiation":
                fill([r])
            elif level == "debutant" or md_busy:
                add(0, 4, [r])
                add(4, 4, upper)
                add(8, 4, upper)
            elif active_style == "waltz_offbeat":
                add(0, 4, [r])
                add(4, 2, [], True)
                add(6, 2, upper)
                if level == "intermediaire":
                    add(8, 4, upper)
                else:
                    add(8, 2, [], True)
                    add(10, 2, upper)
            elif active_style == "waltz_triplet" and level in ("avance", "expert"):
                add(0, 4, [r])
                add_tuplet(4, 4, 3, 2, 2, [{"Ds": [r + 4]}, {"Ds": [u0]}, {"Ds": [u_last]}], "w3")
                add(8, 4, upper)
            else:
                add(0, 4, [r])
                add(4, 4, upper)
                add(8, 4, upper)
        elif meter["num"] == 3 and meter["den"] == 8:
            if level in ("initiation", "debutant"):
                fill([r])
            elif (not md_busy) and rng.chance(0.3):
                add(0, 2, [r])
                add(2, 2, [], True)
                add(4, 2, upper)
            else:
                add(0, 2, [r])
                add(2, 2, upper)
                add(4, 2, upper)
        elif meter["compound"] and meter["beatLen"] == 6:
            n_beats = slot["len"] // 6
            if level in ("initiation", "debutant"):
                for b in range(n_beats):
                    add(b * 6, 6, [r if (b == 0 or b % 2 == 0) else (r + 4)])
            else:
                for b in range(n_beats):
                    if active_style == "duplet_barc" and not md_busy:
                        add_tuplet(b * 6, 6, 2, 3, 2, [{"Ds": [r if b == 0 else (r + 4)]}, {"Ds": upper}], f"d-{b}")
                    elif active_style == "offbeat_barc" and not md_busy:
                        add(b * 6, 2, [r if b == 0 else (r + 4)])
                        add(b * 6 + 2, 2, [], True)
                        add(b * 6 + 4, 2, upper)
                    else:
                        add(b * 6, 2, [r])
                        add(b * 6 + 2, 2, [upper[0] if upper else (r + 4)])
                        add(b * 6 + 4, 2, [upper[1] if len(upper) > 1 else (r + 7)])
        else:
            if level == "initiation":
                fill([r])
            elif level == "debutant":
                if rng.chance(0.5) or slot["len"] <= 8:
                    fill([r, r + 4])
                else:
                    for b in range(slot["len"] // 4):
                        add(b * 4, 4, [r])
            elif md_busy and slot["len"] % 4 == 0:
                # Contrepoint rythmique : MD chargée -> MG aérée (basse + accord)
                for b in range(slot["len"] // 4):
                    add(b * 4, 4, [r] if b % 2 == 0 else upper)
            elif active_style == "alberti" and slot["len"] >= 8:
                alb_seq = [r, u_last, u0, u_last]
                for k, p in enumerate(range(0, slot["len"], 2)):
                    add(p, 2, [alb_seq[k % len(alb_seq)]])
            elif active_style == "arpeggio" and slot["len"] >= 8:
                arp = [r, r + 4, upper[0] if upper else seventh_d, u1]
                for k, p in enumerate(range(0, slot["len"], 2)):
                    add(p, 2, [arp[k % len(arp)]])
            elif active_style == "offbeat" and slot["len"] >= 8 and slot["len"] % 4 == 0:
                add(0, 4, [r])
                for b in range(1, slot["len"] // 4):
                    add(b * 4, 2, [], True)
                    add(b * 4 + 2, 2, upper)
            elif active_style == "syncopated" and slot["len"] >= 8 and slot["len"] % 8 == 0:
                for k in range(slot["len"] // 8):
                    add(k * 8, 2, [r])
                    add(k * 8 + 2, 4, upper)
                    add(k * 8 + 6, 2, [r + 4])
            elif active_style == "triplet_arp" and slot["len"] >= 8 and slot["len"] % 4 == 0:
                n_beats = slot["len"] // 4
                for b in range(n_beats):
                    if b == 0:
                        if level == "intermediaire":
                            add(0, 4, [r])
                        else:
                            add_tuplet(0, 4, 3, 2, 2, [{"Ds": [r]}, {"Ds": [r + 4]}, {"Ds": [upper[0] if upper else seventh_d]}], f"t-{b}")
                    elif level == "expert" and rng.chance(0.35):
                        add_tuplet(b * 4, 4, 3, 2, 2, [{"Ds": [], "rest": True}, {"Ds": upper}, {"Ds": [u1]}], f"t-{b}")
                    else:
                        add_tuplet(b * 4, 4, 3, 2, 2, [{"Ds": [r + 4]}, {"Ds": [u0]}, {"Ds": [u1]}], f"t-{b}")
            else:
                for b in range(slot["len"] // 4):
                    add(b * 4, 4, [r] if b % 2 == 0 else upper)

        per_measure[slot["m"]].extend(evs)

    result: list[list[dict[str, Any]]] = []
    for m, evs in enumerate(per_measure):
        evs.sort(key=lambda e: e["start"])
        m_out: list[dict[str, Any]] = []
        for i, ev in enumerate(evs):
            ev_slot = ev["slot"]
            base_ev: dict[str, Any] = {
                "id": f"left-{m}-{i}",
                "hand": "left",
                "start": ev["start"],
                "dur": ev["dur"],
                "rest": bool(ev["rest"]),
            }
            if "notationDur" in ev:
                base_ev["notationDur"] = ev["notationDur"]
            if "tuplet" in ev:
                base_ev["tuplet"] = ev["tuplet"]
            if ev["rest"]:
                base_ev["notes"] = []
            else:
                Ds = sorted(set(ev["Ds"]))
                base_ev["notes"] = [
                    m21_pitch_to_note_dict(
                        d_alter_to_m21_pitch(D, slot_alter(ev_slot, degree_of(D, key_info), scale["harmony"][degree_of(D, key_info)]))
                    )
                    for D in Ds
                ]
            m_out.append(base_ev)
        result.append(m_out)
    return result


# ── Évaluation de qualité musicale (Generate & Rank via music21) ─


def evaluate_candidate(measures: list[dict[str, Any]]) -> float:
    """Évalue la qualité contrapuntique et mélodique d'une partition candidate."""
    score = 100.0
    prev_sop: dict[str, int] | None = None
    prev_bas: dict[str, int] | None = None

    sop_line: list[int] = []
    for m in measures:
        treble = m.get("treble") or []
        bass = m.get("bass") or []
        for e in treble:
            if not e["rest"] and e["notes"]:
                sop_line.append(e["notes"][-1]["D"])

        t0 = next((e for e in treble if not e["rest"] and e["start"] == 0 and e["notes"]), None)
        b0 = next((e for e in bass if not e["rest"] and e["start"] == 0 and e["notes"]), None)
        if t0 and b0:
            cur_sop = t0["notes"][-1]
            cur_bas = b0["notes"][0]
            if prev_sop is not None and prev_bas is not None:
                try:
                    vlq = m21_vl.VoiceLeadingQuartet(
                        m21_note.Note(d_alter_to_m21_pitch(prev_sop["D"], prev_sop["alter"])),
                        m21_note.Note(d_alter_to_m21_pitch(cur_sop["D"], cur_sop["alter"])),
                        m21_note.Note(d_alter_to_m21_pitch(prev_bas["D"], prev_bas["alter"])),
                        m21_note.Note(d_alter_to_m21_pitch(cur_bas["D"], cur_bas["alter"])),
                    )
                    if vlq.parallelFifth() or vlq.parallelOctave():
                        score -= 25.0
                    elif vlq.contraryMotion():
                        score += 6.0
                except Exception:
                    pass
            prev_sop, prev_bas = cur_sop, cur_bas

    # Équilibre mouvements conjoints / sauts dans la mélodie
    if len(sop_line) >= 4:
        ivs = [abs(sop_line[i] - sop_line[i - 1]) for i in range(1, len(sop_line))]
        step_ratio = sum(1 for iv in ivs if iv == 1) / len(ivs)
        repeat_ratio = sum(1 for iv in ivs if iv == 0) / len(ivs)
        score -= abs(step_ratio - 0.65) * 20.0
        if repeat_ratio > 0.25:
            score -= (repeat_ratio - 0.25) * 30.0

    return round(score, 2)


# ── Construction du music21.stream.Score ───────────────────────


def _make_m21_duration(ev: dict[str, Any]) -> m21_duration.Duration:
    nd = ev.get("notationDur", ev["dur"])
    if "tuplet" in ev:
        tp = ev["tuplet"]
        d = m21_duration.Duration(quarterLength=Fraction(int(nd), 4))
        d.appendTuplet(m21_duration.Tuplet(numberNotesActual=tp["num"], numberNotesNormal=tp["occupied"]))
        return d
    return m21_duration.Duration(quarterLength=Fraction(int(nd), 4))


def build_music21_score(
    measures_data: list[dict[str, Any]],
    key_info: dict[str, Any],
    meter: dict[str, Any],
    bpm: int,
) -> m21_stream.Score:
    score = m21_stream.Score()
    has_treble = any(m["treble"] is not None for m in measures_data)
    has_bass = any(m["bass"] is not None for m in measures_data)

    for staff_key, part_id, clef_cls in (
        ("treble", "RightHand", m21_clef.TrebleClef),
        ("bass", "LeftHand", m21_clef.BassClef),
    ):
        if (staff_key == "treble" and not has_treble) or (staff_key == "bass" and not has_bass):
            continue
        part = m21_stream.Part(id=part_id)
        for m_data in measures_data:
            m21_m = m21_stream.Measure(number=m_data["index"] + 1)
            if m_data["index"] == 0:
                m21_m.insert(0, clef_cls())
                m21_m.insert(0, m21_key.Key(key_info["_m21_tonic"], key_info["mode"]))
                m21_m.insert(0, m21_meter.TimeSignature(meter["ts"]))
                if staff_key == "treble" or not has_treble:
                    ref_q = 1.5 if meter["compound"] else 1.0
                    m21_m.insert(0, m21_tempo.MetronomeMark(number=bpm, referent=m21_duration.Duration(ref_q)))

            for ev in (m_data[staff_key] or []):
                dur = _make_m21_duration(ev)
                if ev["rest"]:
                    obj: m21_note.GeneralNote = m21_note.Rest(duration=dur)
                elif len(ev["notes"]) == 1:
                    n = ev["notes"][0]
                    obj = m21_note.Note(d_alter_to_m21_pitch(n["D"], n["alter"]), duration=dur)
                else:
                    pitches = [d_alter_to_m21_pitch(n["D"], n["alter"]) for n in ev["notes"]]
                    obj = m21_chord.Chord(pitches, duration=dur)
                m21_m.append(obj)
            part.append(m21_m)
        score.insert(0, part)
    return score


# ── Génération d'un candidat + Sélection Best-of-N ─────────────


def _generate_candidate(
    params: dict[str, Any],
    key_info: dict[str, Any],
    scale: dict[str, Any],
    meter: dict[str, Any],
    cand_seed: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rng = SeededRng(cand_seed)
    n = params["measures"]

    slots = plan_harmony(
        rng,
        meter,
        params["level"],
        n,
        key_info["mode"],
        params["enrichRight"] or params["enrichLeft"],
        params["extensionType"],
        params["minD"],
        key_info,
        params["style"],
    )

    ctx = {
        "key": key_info,
        "scale": scale,
        "meter": meter,
        "slots": slots,
        "level": params["level"],
        "n": n,
        "hands": params["hands"],
        "style": params["style"],
        "minD": params["minD"],
        "maxD": params["maxD"],
        "enrichRight": params["enrichRight"],
        "enrichLeft": params["enrichLeft"],
        "extensionType": params["extensionType"],
    }

    rhythms = build_piece_rhythms(rng, meter, params["level"], n)

    treble = None
    bass = None
    if params["hands"] == "left":
        bass = gen_melody(rng, ctx, rhythms, "bass", "left")
    else:
        treble = gen_melody(rng, ctx, rhythms, "treble", "right")
        if params["hands"] == "both":
            bass = gen_accompaniment(rng, ctx, treble=treble)

    measures = [
        {
            "index": m,
            "treble": treble[m] if treble is not None else None,
            "bass": bass[m] if bass is not None else None,
        }
        for m in range(n)
    ]

    # 1. Contrôle strict de l'ambitus [minD, maxD]
    for ms in measures:
        for staff in (ms["treble"], ms["bass"]):
            if not staff:
                continue
            for ev in staff:
                if ev["rest"]:
                    continue
                ev_slot = chord_at(slots, ms["index"], ev["start"])
                for note in ev["notes"]:
                    if note["D"] < params["minD"] or note["D"] > params["maxD"]:
                        res = note["D"]
                        while res < params["minD"] and res + 7 <= params["maxD"]:
                            res += 7
                        while res > params["maxD"] and res - 7 >= params["minD"]:
                            res -= 7
                        res = max(params["minD"], min(params["maxD"], res))
                        deg = degree_of(res, key_info)
                        alter = slot_alter(ev_slot, deg, scale["harmony"][deg])
                        note.update(m21_pitch_to_note_dict(d_alter_to_m21_pitch(res, alter)))
                ev["notes"].sort(key=lambda nd: nd["D"])

    # 2. Garantie d'apparition de minD et maxD (en respectant la consonance et l'écartement)
    def pick_extremum_event(all_entries: list[tuple[int, dict[str, Any]]], target_d: int, is_max: bool) -> tuple[int, dict[str, Any]]:
        t_deg = degree_of(target_d, key_info)

        def score_entry(item: tuple[int, dict[str, Any]]) -> int:
            m_idx, ev = item
            ch = chord_at(slots, m_idx, ev["start"])
            degs = chord_degrees(ch)
            in_triad = t_deg in degs[:3]
            in_chord = t_deg in degs
            is_root = ch.get("bassDegree", ch["degree"]) == t_deg
            on_bar_start = ev["start"] == 0
            single_bonus = 15 if len(ev["notes"]) == 1 else 0
            if not is_max and on_bar_start:
                s = 100 if is_root else (-20 if in_triad else -100)
            else:
                s = 100 if in_triad else (50 if in_chord else (-50 if on_bar_start else 10))
            return s + single_bonus

        best_score = max(score_entry(item) for item in all_entries)
        pool = [item for item in all_entries if score_entry(item) == best_score]
        return max(pool, key=lambda it: it[1]["notes"][-1]["D"]) if is_max else min(pool, key=lambda it: it[1]["notes"][0]["D"])

    if treble is not None:
        if not any(any((not e["rest"]) and any(nt["D"] == params["maxD"] for nt in e["notes"]) for e in (m["treble"] or [])) for m in measures):
            all_pitched = [(m["index"], e) for m in measures for e in (m["treble"] or []) if (not e["rest"]) and e["notes"]]
            if all_pitched:
                m_idx, target_ev = pick_extremum_event(all_pitched, params["maxD"], True)
                ch = chord_at(slots, m_idx, target_ev["start"])
                deg = degree_of(params["maxD"], key_info)
                alter = slot_alter(ch, deg, scale["harmony"][deg])
                target_ev["notes"][-1] = m21_pitch_to_note_dict(d_alter_to_m21_pitch(params["maxD"], alter))
                target_ev["notes"] = [nt for nt in target_ev["notes"] if params["maxD"] - nt["D"] <= 8]
                target_ev["notes"].sort(key=lambda nd: nd["D"])
        if params["hands"] == "right":
            if not any(any((not e["rest"]) and any(nt["D"] == params["minD"] for nt in e["notes"]) for e in (m["treble"] or [])) for m in measures):
                all_pitched = [(m["index"], e) for m in measures for e in (m["treble"] or []) if (not e["rest"]) and e["notes"]]
                if all_pitched:
                    m_idx, target_ev = pick_extremum_event(all_pitched, params["minD"], False)
                    ch = chord_at(slots, m_idx, target_ev["start"])
                    deg = degree_of(params["minD"], key_info)
                    alter = slot_alter(ch, deg, scale["harmony"][deg])
                    target_ev["notes"][0] = m21_pitch_to_note_dict(d_alter_to_m21_pitch(params["minD"], alter))
                    target_ev["notes"] = [nt for nt in target_ev["notes"] if nt["D"] - params["minD"] <= 8]
                    target_ev["notes"].sort(key=lambda nd: nd["D"])

    if bass is not None:
        if not any(any((not e["rest"]) and any(nt["D"] == params["minD"] for nt in e["notes"]) for e in (m["bass"] or [])) for m in measures):
            all_pitched = [(m["index"], e) for m in measures for e in (m["bass"] or []) if (not e["rest"]) and e["notes"]]
            if all_pitched:
                m_idx, target_ev = pick_extremum_event(all_pitched, params["minD"], False)
                ch = chord_at(slots, m_idx, target_ev["start"])
                deg = degree_of(params["minD"], key_info)
                alter = slot_alter(ch, deg, scale["harmony"][deg])
                target_ev["notes"][0] = m21_pitch_to_note_dict(d_alter_to_m21_pitch(params["minD"], alter))
                target_ev["notes"] = [nt for nt in target_ev["notes"] if nt["D"] - params["minD"] <= 8]
                target_ev["notes"].sort(key=lambda nd: nd["D"])
        if params["hands"] == "left":
            if not any(any((not e["rest"]) and any(nt["D"] == params["maxD"] for nt in e["notes"]) for e in (m["bass"] or [])) for m in measures):
                all_pitched = [(m["index"], e) for m in measures for e in (m["bass"] or []) if (not e["rest"]) and e["notes"]]
                if all_pitched:
                    m_idx, target_ev = pick_extremum_event(all_pitched, params["maxD"], True)
                    ch = chord_at(slots, m_idx, target_ev["start"])
                    deg = degree_of(params["maxD"], key_info)
                    alter = slot_alter(ch, deg, scale["harmony"][deg])
                    target_ev["notes"][-1] = m21_pitch_to_note_dict(d_alter_to_m21_pitch(params["maxD"], alter))
                    target_ev["notes"] = [nt for nt in target_ev["notes"] if params["maxD"] - nt["D"] <= 8]
                    target_ev["notes"].sort(key=lambda nd: nd["D"])

    return slots, measures


def generate_score(settings: dict[str, Any] | None = None, seed: int | None = None) -> dict[str, Any]:
    settings = settings or {}
    if seed is None:
        seed = random.randint(100000, 999999)
    rng = SeededRng(seed)
    params = resolve_params(settings, rng)
    key_info = get_key(params["key"])
    scale = build_scale(key_info, params["minorType"])
    meter = meter_info(params["timeSignature"])
    n = params["measures"]

    # Sélection « Generate & Rank » (Best-of-N) déterministe
    best_score = -1e9
    best_slots: list[dict[str, Any]] = []
    best_measures: list[dict[str, Any]] = []
    for k in range(N_CANDIDATES):
        cand_seed = ((seed * 1664525) + 1013904223 + k * 7919) & 0xFFFFFFFF
        slots, measures = _generate_candidate(params, key_info, scale, meter, cand_seed)
        q_score = evaluate_candidate(measures)
        if q_score > best_score:
            best_score = q_score
            best_slots = slots
            best_measures = measures

    # Nettoyage des champs internes avant sérialisation JSON
    public_slots = [
        {k: v for k, v in s.items() if k != "chromaticAlters"}
        for s in best_slots
    ]

    m21_score = build_music21_score(best_measures, key_info, meter, params["bpm"])

    return {
        "seed": seed,
        "engine": "music21",
        "qualityScore": best_score,
        "params": params,
        "key": public_key_dict(key_info),
        "scale": scale,
        "meter": meter,
        "slots": public_slots,
        "measures": best_measures,
        "totalUnits": n * meter["measureLen"],
        "music21Parts": len(m21_score.parts),
    }
