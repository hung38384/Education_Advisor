"""Debug ChromaDB metadata and search."""
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

chroma_dir = Path("data/chroma_db")
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2-preview")
vs = Chroma(
    persist_directory=str(chroma_dir),
    embedding_function=embeddings,
    collection_name="admission_rules",
)

col = vs._collection
data = col.get(include=["metadatas"])
total = len(data["metadatas"])
print(f"Total docs: {total}")

# Find any non-string metadata values
int_found = False
for i, m in enumerate(data["metadatas"]):
    for k, v in m.items():
        if not isinstance(v, str):
            print(f"  !!! Doc {i}, key={k}: type={type(v).__name__}, val={repr(v)}")
            int_found = True

if not int_found:
    print("All metadata values are strings - OK")

# Test raw chroma query
print("\nTesting raw chroma query...")
try:
    res = col.query(query_texts=["IELTS quy doi"], n_results=2)
    print(f"Raw query OK: {len(res['ids'][0])} results")
    for i, (doc_id, meta) in enumerate(zip(res["ids"][0], res["metadatas"][0])):
        print(f"  Result {i}: id={doc_id[:20]}... meta={meta}")
except Exception as e:
    print(f"Raw query FAILED: {e}")
    import traceback
    traceback.print_exc()

# Test langchain search
print("\nTesting langchain similarity_search...")
try:
    res2 = vs.similarity_search("IELTS quy doi", k=2)
    print(f"Langchain search OK: {len(res2)} results")
    for i, doc in enumerate(res2):
        print(f"  Result {i}: meta={doc.metadata}, content={doc.page_content[:80]}...")
except Exception as e:
    print(f"Langchain search FAILED: {e}")
    import traceback
    traceback.print_exc()
