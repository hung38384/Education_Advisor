"""
Build Vector Database from Markdown Files using Chroma and LangChain

This script:
1. Loads environment variables (GOOGLE_API_KEY)
2. Chunks Markdown files using MarkdownHeaderTextSplitter (preserves tables)
3. Extracts metadata (university code, year) from filenames
4. Generates embeddings using Google Generative AI
5. Stores documents in Chroma with persistence
6. Tests the vector DB with similarity search

Usage:
    python scripts/build_vector_db.py
"""

import logging
import sys
from pathlib import Path
from typing import List, Dict, Any
import re

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain.schema import Document

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
INPUT_DIR = Path(__file__).parent.parent / "data" / "processed_rules"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "chroma_db"
EMBEDDING_MODEL = "models/gemini-embedding-2-preview"
CHUNK_TEST_QUERY = "Quy đổi IELTS 6.5 sang điểm tiếng Anh xét tuyển như thế nào?"
CHUNK_TEST_K = 2


def load_environment() -> bool:
    """
    Load environment variables from .env file.
    
    Returns:
        bool: True if GOOGLE_API_KEY is set, False otherwise
    """
    load_dotenv()
    
    import os
    if not os.getenv("GOOGLE_API_KEY"):
        logger.error("❌ GOOGLE_API_KEY not found in environment variables")
        return False
    
    logger.info("✅ Environment variables loaded successfully")
    return True


def find_markdown_files() -> List[Path]:
    """
    Find all Markdown files ending with '_clean.md' in the input directory.
    
    Returns:
        List[Path]: List of file paths matching the pattern
    """
    if not INPUT_DIR.exists():
        logger.error(f"❌ Input directory not found: {INPUT_DIR}")
        return []
    
    files = list(INPUT_DIR.glob("*_clean.md"))
    
    if not files:
        logger.warning(f"⚠️  No '_clean.md' files found in {INPUT_DIR}")
        return []
    
    logger.info(f"✅ Found {len(files)} Markdown files")
    for file in sorted(files):
        logger.debug(f"   - {file.name}")
    
    return sorted(files)


def extract_metadata_from_filename(filename: str) -> Dict[str, str]:
    """
    Extract university code and year from filename pattern: [UNI-CODE]_DeAn[YEAR]_clean.md
    
    Example: BKA_DeAn2024_clean.md -> {"university": "BKA", "year": "2024"}
    
    Args:
        filename: Filename string (e.g., "BKA_DeAn2024_clean.md")
        
    Returns:
        Dict with 'university' and 'year' keys, or empty dict if pattern doesn't match
    """
    # Pattern: [UNI-CODE]_DeAn[YEAR]_clean.md
    pattern = r"^([A-Z]+)_DeAn(\d{4})_clean\.md$"
    match = re.match(pattern, filename)
    
    if not match:
        logger.warning(f"⚠️  Filename doesn't match expected pattern: {filename}")
        return {}
    
    university = match.group(1)
    year = match.group(2)
    
    return {"university": university, "year": year}


def read_markdown_file(filepath: Path) -> str:
    """
    Read content from a Markdown file.
    
    Args:
        filepath: Path to the Markdown file
        
    Returns:
        str: File content
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        logger.debug(f"✅ Read {filepath.name} ({len(content)} chars)")
        return content
    except Exception as e:
        logger.error(f"❌ Failed to read {filepath.name}: {e}")
        return ""


def chunk_markdown_content(
    content: str,
    filename: str
) -> List[Document]:
    """
    Split Markdown content using MarkdownHeaderTextSplitter on headers only.
    This preserves Markdown tables and formatting.
    
    Args:
        content: Markdown file content
        filename: Source filename for metadata
        
    Returns:
        List[Document]: Chunked documents with metadata
    """
    if not content.strip():
        logger.warning(f"⚠️  Empty content from {filename}")
        return []
    
    # Extract metadata from filename
    metadata = extract_metadata_from_filename(filename)
    if not metadata:
        logger.warning(f"⚠️  Skipping {filename} - invalid filename format")
        return []
    
    # Add source to metadata
    metadata["source"] = filename
    
    try:
        # Initialize MarkdownHeaderTextSplitter with specific headers
        # Split only on H1 (#) and H2 (##) headers
        splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=[
                ("#", "Header_1"),
                ("##", "Header_2"),
            ]
        )
        
        # Split content
        splits = splitter.split_text(content)
        
        # Add file metadata to each chunk
        documents = []
        for split in splits:
            # split is already a Document with page_content and metadata
            # Add our metadata to it
            split.metadata.update(metadata)
            documents.append(split)
        
        logger.info(
            f"   ✅ Chunked {filename}: {len(documents)} chunks "
            f"(university={metadata['university']}, year={metadata['year']})"
        )
        return documents
    
    except Exception as e:
        logger.error(f"   ❌ Error chunking {filename}: {e}")
        return []


def build_vector_database(documents: List[Document]) -> Chroma:
    """
    Build and persist a Chroma vector database with the provided documents.
    
    Args:
        documents: List of Document objects with content and metadata
        
    Returns:
        Chroma: Initialized and persisted vector store
    """
    if not documents:
        logger.error("❌ No documents to process")
        return None
    
    logger.info(f"\n🔨 Building vector database with {len(documents)} documents...")
    
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    try:
        # Initialize embeddings
        logger.info(f"🔄 Initializing embeddings (model: {EMBEDDING_MODEL})...")
        embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
        
        # Create Chroma vector store with persistence
        logger.info(f"💾 Creating Chroma database at {OUTPUT_DIR}...")
        vector_store = Chroma.from_documents(
            documents=documents,
            embedding=embeddings,
            persist_directory=str(OUTPUT_DIR),
            collection_name="admission_rules",
        )
        
        logger.info(f"✅ Vector database created successfully")
        logger.info(f"   Total documents indexed: {len(documents)}")
        logger.info(f"   Persist directory: {OUTPUT_DIR}")
        
        return vector_store
    
    except Exception as e:
        logger.error(f"❌ Failed to build vector database: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def test_vector_search(vector_store: Chroma, query: str, k: int = 2) -> None:
    """
    Test the vector store with a similarity search query.
    
    Args:
        vector_store: Chroma vector store instance
        query: Test query string
        k: Number of results to retrieve
    """
    logger.info(f"\n🔍 Testing similarity search with query: \"{query}\"")
    logger.info(f"   Retrieving top {k} results...\n")
    
    try:
        results = vector_store.similarity_search(query, k=k)
        
        if not results:
            logger.warning("⚠️  No results found")
            return
        
        for idx, doc in enumerate(results, 1):
            logger.info(f"--- Result {idx} ---")
            logger.info(f"📄 Content ({len(doc.page_content)} chars):")
            logger.info(f"   {doc.page_content[:500]}...")  # Show first 500 chars
            logger.info(f"📋 Metadata: {doc.metadata}")
            logger.info()
    
    except Exception as e:
        logger.error(f"❌ Search failed: {e}")
        import traceback
        logger.error(traceback.format_exc())


def main() -> bool:
    """
    Main orchestration function.
    
    Returns:
        bool: True if successful, False otherwise
    """
    logger.info("=" * 70)
    logger.info("🚀 Building Vector Database from Markdown Files")
    logger.info("=" * 70)
    
    # Step 1: Load environment
    if not load_environment():
        return False
    
    # Step 2: Find Markdown files
    markdown_files = find_markdown_files()
    if not markdown_files:
        logger.error("❌ No Markdown files to process")
        return False
    
    # Step 3: Chunk all files
    logger.info(f"\n📚 Processing {len(markdown_files)} files...\n")
    all_documents = []
    
    for filepath in markdown_files:
        logger.info(f"Processing {filepath.name}...")
        
        # Read content
        content = read_markdown_file(filepath)
        if not content:
            continue
        
        # Chunk content
        documents = chunk_markdown_content(content, filepath.name)
        all_documents.extend(documents)
    
    if not all_documents:
        logger.error("❌ No documents created from chunking")
        return False
    
    logger.info(f"\n✅ Total documents created: {len(all_documents)}")
    
    # Step 4: Build vector database
    vector_store = build_vector_database(all_documents)
    if not vector_store:
        return False
    
    # Step 5: Test search
    test_vector_search(vector_store, CHUNK_TEST_QUERY, k=CHUNK_TEST_K)
    
    logger.info("=" * 70)
    logger.info("✅ Vector database build completed successfully!")
    logger.info("=" * 70)
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
