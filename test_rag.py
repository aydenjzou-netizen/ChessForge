from coach_rag import CoachRAGEngine

print("Initializing engine...")
engine = CoachRAGEngine()

print("\n--- Query ---")
print(engine.query("What are the moves for the Grob Opening?", top_k=2))
