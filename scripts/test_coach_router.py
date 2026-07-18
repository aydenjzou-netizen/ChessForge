import sys
import os
import time

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from coach_rag import CoachRAGEngine

def test_router():
    engine = CoachRAGEngine()
    
    test_queries = [
        "Teach me the Italian Game",
        "What is the Fried Liver Attack?",
        "What is a fork?",
        "Teach me pins and skewers",
        "What is opposition?",
        "How do I win rook endgames?",
        "What tactics happen in the Sicilian?",
        "What endgames come from the Queen's Gambit?",
        "How do I improve at chess?",
        "hello"
    ]
    
    print("\n=== STARTING ROUTER TESTS ===\n")
    
    for query in test_queries:
        print(f"\nTESTING QUERY: {query}")
        print("-" * 30)
        # We call query() which now includes the router logging
        response = engine.query(query)
        # print(f"RESPONSE PREVIEW: {response[:100]}...")
        print("-" * 30)
        time.sleep(1) # Small delay for Ollama if needed

if __name__ == "__main__":
    test_router()
