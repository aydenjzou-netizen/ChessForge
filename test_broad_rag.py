from coach_rag import CoachRAGEngine
import time

print("Initializing engine and rebuilding index (this will take a few minutes for 3600 chunks)...")
engine = CoachRAGEngine()

queries = [
    "Teach me the Indian Defense",
    "What are the main Indian Defense variations?",
    "Explain King's Indian Defense",
    "How is Nimzo-Indian different from Queen's Indian?",
    "Teach me the Italian Game",
    "What gambits come from the Italian Game?"
]

for q in queries:
    print("\n" + "="*50)
    ans = engine.query(q, top_k=5)
    print("\nANSWER:\n")
    print(ans)
    print("="*50)
