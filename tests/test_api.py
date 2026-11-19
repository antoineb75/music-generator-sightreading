"""Tests unitaires de l'API Python (FastAPI + music21) de Partitio."""

import unittest

from fastapi.testclient import TestClient

from api.generator import HANDS, LEVELS, TIME_SIGNATURES, generate_score
from api.main import app
from api.theory import build_scale, degree_of, get_key


class TestMusic21GeneratorAndApi(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health_endpoint(self) -> None:
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["engine"], "music21")
        self.assertTrue(body["music21_version"])

    def test_minor_scales_with_music21(self) -> None:
        k = get_key("Am")
        self.assertEqual(build_scale(k, "natural")["melodyUp"], [0, 0, 0, 0, 0, 0, 0])
        self.assertEqual(build_scale(k, "harmonic")["melodyUp"], [0, 0, 0, 0, 0, 0, 1])
        self.assertEqual(build_scale(k, "melodic")["melodyUp"], [0, 0, 0, 0, 0, 1, 1])
        self.assertEqual(build_scale(k, "melodic")["melodyDown"], [0, 0, 0, 0, 0, 0, 0])

    def test_reproducibility_with_seed(self) -> None:
        settings = {
            "level": "intermediaire",
            "timeSignature": "4/4",
            "measures": 8,
            "key": "G",
            "hands": "both",
            "random": {"key": True, "timeSignature": True, "level": True},
        }
        s1 = generate_score(settings, seed=424242)
        s2 = generate_score(settings, seed=424242)
        self.assertEqual(s1, s2)

    def test_all_time_signatures_and_levels_complete_measures(self) -> None:
        seed = 1
        for ts in TIME_SIGNATURES:
            for level in LEVELS:
                for hands in HANDS:
                    score = generate_score(
                        {"timeSignature": ts, "level": level, "hands": hands, "measures": 6, "key": "C"},
                        seed=seed,
                    )
                    seed += 1
                    self.assertEqual(score["engine"], "music21")
                    L = score["meter"]["measureLen"]
                    self.assertEqual(len(score["measures"]), 6)
                    for m in score["measures"]:
                        for staff in (m["treble"], m["bass"]):
                            if staff is None:
                                continue
                            total = sum(e["dur"] for e in staff)
                            self.assertAlmostEqual(total, L, places=5, msg=f"{ts} {level} {hands}")
                            pos = 0.0
                            for e in staff:
                                self.assertAlmostEqual(e["start"], pos, places=5)
                                pos += e["dur"]
                                if not e["rest"] and len(e["notes"]) > 1:
                                    span = e["notes"][-1]["D"] - e["notes"][0]["D"]
                                    self.assertLessEqual(span, 8, f"Écart injouable {span}")

    def test_strict_ambitus_and_downbeat_consonance(self) -> None:
        for level in LEVELS:
            for seed in range(1, 12):
                score = generate_score(
                    {
                        "timeSignature": "4/4",
                        "measures": 8,
                        "level": level,
                        "key": "C",
                        "hands": "both",
                        "minNote": "E2",
                        "maxNote": "F5",
                    },
                    seed=seed,
                )
                min_d = score["params"]["minD"]
                max_d = score["params"]["maxD"]
                all_ds = [
                    n["D"]
                    for m in score["measures"]
                    for staff in (m["treble"], m["bass"])
                    if staff
                    for e in staff
                    if not e["rest"]
                    for n in e["notes"]
                ]
                self.assertEqual(min(all_ds), min_d)
                self.assertEqual(max(all_ds), max_d)

                key_info = get_key(score["key"]["id"])
                for m in score["measures"]:
                    t0 = next((e for e in (m["treble"] or []) if not e["rest"] and e["start"] == 0), None)
                    if not t0:
                        continue
                    slot = next(sl for sl in score["slots"] if sl["m"] == m["index"] and sl["start"] == 0)
                    deg = slot["degree"]
                    triad = [deg, (deg + 3) % 7, (deg + 4) % 7] if slot["sus4"] else [deg, (deg + 2) % 7, (deg + 4) % 7]
                    self.assertIn(degree_of(t0["notes"][-1]["D"], key_info), triad)

    def test_rhythmic_complexity_and_api_post_generate(self) -> None:
        has_rest = has_triplet = has_duplet = has_offbeat = False
        for ts in ("4/4", "6/8"):
            for seed in range(1, 10):
                res = self.client.post(
                    "/api/generate",
                    json={
                        "settings": {
                            "timeSignature": ts,
                            "measures": 8,
                            "level": "avance",
                            "key": "D",
                            "hands": "both",
                            "bpm": 108,
                        },
                        "seed": seed,
                    },
                )
                self.assertEqual(res.status_code, 200)
                score = res.json()
                self.assertEqual(score["seed"], seed)
                self.assertEqual(score["engine"], "music21")
                self.assertGreaterEqual(score["music21Parts"], 2)
                for m in score["measures"]:
                    for staff in (m["treble"], m["bass"]):
                        for ev in staff or []:
                            if ev["rest"]:
                                has_rest = True
                            if ev.get("tuplet", {}).get("num") == 3:
                                has_triplet = True
                            if ev.get("tuplet", {}).get("num") == 2:
                                has_duplet = True
                            if not ev["rest"] and ev["start"] % score["meter"]["beatLen"] != 0:
                                has_offbeat = True

        self.assertTrue(has_rest)
        self.assertTrue(has_offbeat)
        self.assertTrue(has_triplet)
        self.assertTrue(has_duplet)

    def test_frontend_static_served(self) -> None:
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("Partitio", res.text)
        self.assertIn("select-style", res.text)

    def test_styles_inversions_and_quality_score(self) -> None:
        has_inversion = False
        for style in ("classique", "baroque", "romantique", "pop"):
            score = generate_score(
                {"timeSignature": "4/4", "measures": 8, "level": "avance", "key": "C", "hands": "both", "style": style},
                seed=123,
            )
            self.assertEqual(score["params"]["style"], style)
            self.assertIsInstance(score["qualityScore"], float)
            if any("bassDegree" in s for s in score["slots"]):
                has_inversion = True
        self.assertTrue(has_inversion, "Doit générer des renversements de basse conjoints")


if __name__ == "__main__":
    unittest.main()
