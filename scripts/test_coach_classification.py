import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from coach_rag import classify_coach_query

test_cases = [
    "Teach me the Italian Game",
    "What is the Sicilian Defense?",
    "Explain the King's Indian",
    "What gambits come from the Queen's Gambit?",
    "What should I play after 1.e4 e5 2.Nf3?",
    "What is a fork?",
    "Teach me pins and skewers",
    "How do I find checkmate tactics?",
    "Explain discovered attacks",
    "What is a deflection?",
    "How do I win king and pawn endgames?",
    "Teach me rook endgames",
    "What is opposition?",
    "How do I checkmate with king and queen?",
    "What are passed pawns?",
    "hello",
    "how do I improve at chess?"
]

print("--- Chess Coach Classification Tests ---")
for query in test_cases:
    result = classify_coach_query(query)
    print(f"\nUser query: {query}")
    print(f"Classified as: {result['type']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Reason: {result['reason']}")
