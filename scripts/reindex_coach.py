import os
import sys

# Add parent directory to path so we can import coach_rag
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from coach_rag import CoachRAGEngine

def main():
    print("--- Chess Coach Reindex Script ---")
    print(f"Working Directory: {os.getcwd()}")
    
    engine = CoachRAGEngine()
    
    # Check if we have the CSV
    csv_path = os.path.join(engine.doc_dir, "openings.csv")
    if not os.path.exists(csv_path):
        print(f"Error: Opening database not found at {csv_path}")
        return

    print(f"Found opening database: {csv_path}")
    print("Starting reindex... This will take a few minutes (Ollama embedding).")
    
    # Force a sync
    needs_sync, changed, deleted, current_mtimes = engine.check_needs_sync()
    
    # If the user is running this script, they likely want to RE-index or fix a broken index.
    # So we force all files to be "changed" if chunks is empty
    if not engine.chunks:
        print("Index is empty, forcing full reindex of all files.")
        changed = []
        import glob
        changed.extend(glob.glob(os.path.join(engine.doc_dir, "**/*.md"), recursive=True))
        changed.extend(glob.glob(os.path.join(engine.doc_dir, "**/*.csv"), recursive=True))

    if not changed and not deleted:
        print("No changes detected in knowledge_base, but re-indexing anyway to be sure.")
        import glob
        changed.extend(glob.glob(os.path.join(engine.doc_dir, "**/*.md"), recursive=True))
        changed.extend(glob.glob(os.path.join(engine.doc_dir, "**/*.csv"), recursive=True))

    engine.sync_index(changed, deleted, current_mtimes)
    
    print("--- Reindex Complete ---")
    print(f"Total chunks in index: {len(engine.chunks)}")
    print(f"Index saved to: {engine.persist_file}")

if __name__ == "__main__":
    main()
