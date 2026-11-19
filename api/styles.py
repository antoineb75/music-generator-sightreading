"""Profils stylistiques inspirés du corpus music21 (Classique, Baroque, Romantique, Pop/Jazz).

Fournit pour chaque style :
  - des grilles harmoniques idiomatiques (majeur / mineur),
  - des préférences d'accompagnement main gauche (cohérence de style par pièce),
  - des taux de renversements de basse (basses conjointes) et de dominantes secondaires,
  - des pondérations d'intervalles mélodiques et d'articulation.
"""

from __future__ import annotations

from typing import Any

STYLES = ["auto", "classique", "baroque", "romantique", "pop"]
CONCRETE_STYLES = ["classique", "baroque", "romantique", "pop"]

STYLE_LABELS = {
    "auto": "Automatique",
    "classique": "Classique (Mozart)",
    "baroque": "Baroque (Bach)",
    "romantique": "Romantique (Chopin)",
    "pop": "Pop / Jazz",
}

STYLE_PROFILES: dict[str, dict[str, Any]] = {
    "classique": {
        "major_progressions": [
            [0, 3, 4, 0],
            [0, 1, 4, 0],
            [0, 5, 1, 4],
            [0, 4, 5, 3],
            [0, 3, 1, 4],
        ],
        "minor_progressions": [
            [0, 3, 4, 0],
            [0, 5, 3, 4],
            [0, 1, 4, 0],
            [0, 3, 5, 4],
        ],
        "binary_accomp": ["alberti", "stride", "arpeggio", "offbeat"],
        "waltz_accomp": ["waltz", "waltz_offbeat", "waltz_triplet"],
        "compound_accomp": ["barcarolle", "duplet_barc", "offbeat_barc"],
        "secondary_dom_prob": 0.25,
        "inversion_prob": 0.35,
        "pedal": True,
        "step_bias": 1.15,
    },
    "baroque": {
        "major_progressions": [
            [0, 3, 1, 4],
            [0, 5, 1, 4],
            [0, 4, 5, 2, 3, 0, 1, 4],
            [0, 3, 4, 5],
        ],
        "minor_progressions": [
            [0, 3, 4, 0],
            [0, 3, 5, 1, 4, 0],
            [0, 5, 3, 4],
            [0, 4, 5, 3],
        ],
        "binary_accomp": ["arpeggio", "alberti", "triplet_arp", "stride"],
        "waltz_accomp": ["waltz", "waltz_triplet", "waltz_offbeat"],
        "compound_accomp": ["barcarolle", "duplet_barc", "offbeat_barc"],
        "secondary_dom_prob": 0.32,
        "inversion_prob": 0.45,
        "pedal": False,
        "step_bias": 1.25,
    },
    "romantique": {
        "major_progressions": [
            [0, 5, 3, 4],
            [0, 2, 5, 3],
            [0, 3, 5, 4],
            [0, 5, 1, 4],
        ],
        "minor_progressions": [
            [0, 5, 3, 4],
            [0, 3, 5, 4],
            [0, 5, 1, 4],
            [0, 3, 0, 4],
        ],
        "binary_accomp": ["arpeggio", "triplet_arp", "offbeat", "alberti"],
        "waltz_accomp": ["waltz", "waltz_triplet", "waltz_offbeat"],
        "compound_accomp": ["barcarolle", "duplet_barc", "offbeat_barc"],
        "secondary_dom_prob": 0.30,
        "inversion_prob": 0.40,
        "pedal": True,
        "step_bias": 1.0,
    },
    "pop": {
        "major_progressions": [
            [0, 4, 5, 3],
            [0, 5, 3, 4],
            [5, 3, 0, 4],
            [0, 3, 5, 4],
            [1, 4, 0, 5],
        ],
        "minor_progressions": [
            [0, 5, 3, 4],
            [0, 3, 5, 4],
            [0, 5, 3, 1],
            [0, 4, 5, 3],
        ],
        "binary_accomp": ["syncopated", "offbeat", "arpeggio", "stride"],
        "waltz_accomp": ["waltz_offbeat", "waltz", "waltz_triplet"],
        "compound_accomp": ["offbeat_barc", "barcarolle", "duplet_barc"],
        "secondary_dom_prob": 0.15,
        "inversion_prob": 0.25,
        "pedal": True,
        "step_bias": 0.95,
    },
}


def resolve_style(style: str | None, level: str, rng: Any) -> str:
    """Résout 'auto' vers un style concret adapté au niveau."""
    if style in CONCRETE_STYLES:
        return style
    if level in ("initiation", "debutant"):
        return rng.pick(["classique", "pop"])
    return rng.pick(CONCRETE_STYLES)
