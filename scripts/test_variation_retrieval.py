import requests
import json

def test_coach_router():
    url = "http://localhost:8001/api/coach"
    queries = [
        "Teach me the Italian Game",
        "Teach me the Catalan Opening",
        "What is the Sicilian Defense?"
    ]

    for q in queries:
        print(f"\nQuery: {q}")
        try:
            resp = requests.post(url, json={"message": q})
            print(f"Status Code: {resp.status_code}")
            data = resp.json()
            
            classification = data.get('classification', {})
            print(f"Classification: {classification.get('primaryType')}")
            print(f"Answer length: {len(data.get('answer', ''))}")
            
            evidence_used = data.get('evidenceUsed', [])
            print(f"Evidence used: {len(evidence_used)}")

            opening_lines = data.get('openingLines', [])
            print(f"Openings Found: {len(opening_lines)}")
            
            for o in opening_lines:
                print(f"  - Opening: {o['openingName']}")
                for g in o['groups']:
                    print(f"    - Group: {g['groupTitle']} ({g['groupType']}) - {len(g['lines'])} lines")
                    for l in g['lines']:
                        print(f"      * {l['displayTitle']} ({l['lineType']}) - {l['moves'][:30]}...")

            # Fallback check
            if len(opening_lines) == 0 and any(ev['category'] == 'opening' and ev.get('moves') for ev in evidence_used):
                 print("FAILED: Evidence had moves but openingLines was empty.")
            else:
                 print("PASSED: Inclusion logic verified.")
            
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    test_coach_router()
