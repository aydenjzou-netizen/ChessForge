from coach_rag import CoachRAGEngine
import os

def test_query(engine, query):
    print(f"\nQUERY: {query}")
    response = engine.query(query)
    print(f"RESPONSE:\n{response}")

def main():
    engine = CoachRAGEngine()
    print(f"Engine Status: {engine.status}")
    print(f"Chunk Count: {len(engine.chunks)}")
    
    if engine.status != "ready":
        print("Error: Engine is not ready.")
        return

    test_query(engine, "Teach me the Italian Game")
    test_query(engine, "What is the Indian Defense?")
    test_query(engine, "Explain the Sicilian Defense")

if __name__ == "__main__":
    main()
