import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from coach_rag import CoachRAGEngine


CASES = [
    (
        "Teach me the Italian Game",
        {
            "category": "opening",
            "score": 0.95,
            "openingName": "Italian Game",
            "content": "Opening Name: Italian Game",
            "usedInAnswer": False,
        },
        "opening",
    ),
    (
        "What is a fork?",
        {
            "category": "tactic",
            "score": 0.92,
            "openingName": "Unknown",
            "content": "A fork attacks two pieces.",
            "usedInAnswer": False,
        },
        "tactic",
    ),
    (
        "Teach me rook endgames",
        {
            "category": "endgame",
            "score": 0.91,
            "openingName": "Unknown",
            "content": "Rook endgame fundamentals.",
            "usedInAnswer": False,
        },
        "endgame",
    ),
]


def main() -> None:
    engine = CoachRAGEngine()
    assert engine.status == "ready", f"expected ready index, got {engine.status}"
    for question, evidence, expected in CASES:
        result = engine.route_query(question, evidence=[evidence])
        actual = result.get("primaryType") or result.get("type")
        assert actual == expected, f"{question!r}: expected {expected}, got {actual}"
    print(
        f"coach classification: {len(CASES)} cases passed "
        f"with {len(engine.chunks)} indexed chunks and no live inference"
    )


if __name__ == "__main__":
    main()
