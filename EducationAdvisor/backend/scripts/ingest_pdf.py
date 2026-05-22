"""
Agentic RAG - Hybrid PDF to Markdown Extractor (Ensemble Parsing)

Implements a two-step hybrid parsing strategy:
  1. MarkItDown (Microsoft) - Fast text, headings, and formula extraction
  2. LlamaCloud REST API   - Superior table and complex layout extraction
     (Called directly via httpx to avoid llama-parse SDK Pydantic conflicts)

Both outputs are merged into a single .md file for manual/AI cleaning
before the Chunking & Embedding steps are enabled.

Usage:
    python scripts/ingest_pdf.py [OPTIONS]

Options:
    --pdf PATTERN    PDF file or glob pattern to ingest

Examples:
    python scripts/ingest_pdf.py
    python scripts/ingest_pdf.py --pdf "data/raw_pdfs/BKA_DeAn2024.pdf"
    python scripts/ingest_pdf.py --pdf "data/raw_pdfs/*.pdf"
"""

import sys
import os
import time
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

# Load environment variables FIRST (needed for LLAMA_CLOUD_API_KEY)
from dotenv import load_dotenv
load_dotenv()

import httpx
from markitdown import MarkItDown

from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================================================
# Configuration
# ============================================================================

class IngestionConfig:
    """Configuration for the PDF ingestion pipeline."""

    # Paths (relative to CWD = backend/)
    DATA_DIR = Path("data/raw_pdfs")
    CHROMA_DB_PATH = Path("data/chroma_db")
    PROCESSED_DIR = Path("data/processed_rules")

    # ChromaDB collection
    COLLECTION_NAME = "admission_rules"

    # Markdown Header Splitting — hierarchy of headers
    HEADERS_TO_SPLIT_ON = [
        ("#", "Header_1"),
        ("##", "Header_2"),
        ("###", "Header_3"),
    ]

    # Max chunk size after header splitting
    CHUNK_SIZE_THRESHOLD = 4000  # characters

    # Recursive splitting parameters (fallback for oversized chunks)
    RECURSIVE_CHUNK_SIZE = 2000
    RECURSIVE_CHUNK_OVERLAP = 200

    # Separators for recursive splitting (preserves markdown tables)
    RECURSIVE_SEPARATORS = [
        "\n\n\n",  # Triple newline (section break)
        "\n\n",    # Double newline (paragraph break)
        "\n",      # Single newline (line break)
        " ",       # Space
    ]

    # Embedding model
    EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


# ============================================================================
# LlamaCloud REST API Client (no SDK dependency)
# ============================================================================

class LlamaCloudClient:
    """
    Lightweight REST client for the LlamaCloud / LlamaParse API.

    Avoids the llama-parse Python SDK which has Pydantic v1/v2 conflicts.
    Docs: https://docs.cloud.llamaindex.ai/llamaparse/getting_started/python
    """

    BASE_URL = "https://api.cloud.llamaindex.ai/api/parsing"
    POLL_INTERVAL = 3      # seconds between status polls
    MAX_POLL_RETRIES = 40  # max ~2 minutes total wait

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    def parse_pdf_to_markdown(self, pdf_path: Path) -> Optional[str]:
        """
        Upload a PDF to LlamaCloud and retrieve the parsed Markdown.

        Returns Markdown string on success, None on failure.
        """
        logger.info(f"   🌐 LlamaCloud: Uploading {pdf_path.name}…")

        # 1. Upload file and get job_id
        job_id = self._upload(pdf_path)
        if not job_id:
            return None

        logger.info(f"   ✅ Upload successful. Job ID: {job_id}")

        # 2. Poll until job is done
        status = self._wait_for_job(job_id)
        if status != "SUCCESS":
            logger.error(f"   ❌ LlamaCloud job ended with status: {status}")
            return None

        # 3. Fetch markdown result
        markdown = self._fetch_result(job_id)
        return markdown

    def _upload(self, pdf_path: Path) -> Optional[str]:
        """Upload the PDF file and return the job ID."""
        upload_url = f"{self.BASE_URL}/upload"
        try:
            with open(pdf_path, "rb") as f:
                files = {
                    "file": (pdf_path.name, f, "application/pdf"),
                }
                data = {
                    "result_type": "markdown"
                }
                with httpx.Client(timeout=120.0) as client:
                    response = client.post(
                        upload_url,
                        headers=self.headers,
                        files=files,
                        data=data,
                    )
                    response.raise_for_status()
                    result = response.json()
                    return result.get("id") or result.get("job_id")

        except httpx.HTTPStatusError as exc:
            logger.error(
                f"   ❌ LlamaCloud upload failed (HTTP {exc.response.status_code}): "
                f"{exc.response.text[:300]}"
            )
        except Exception as exc:
            logger.error(f"   ❌ LlamaCloud upload error: {exc}")
        return None

    def _wait_for_job(self, job_id: str) -> str:
        """Poll the job status until SUCCESS, ERROR, or timeout."""
        status_url = f"{self.BASE_URL}/job/{job_id}"
        logger.info(f"   ⏳ Waiting for LlamaCloud job to finish…")

        for attempt in range(self.MAX_POLL_RETRIES):
            try:
                with httpx.Client(timeout=30.0) as client:
                    response = client.get(status_url, headers=self.headers)
                    response.raise_for_status()
                    data = response.json()
                    status = data.get("status", "UNKNOWN").upper()

                    logger.info(
                        f"   [{attempt + 1}/{self.MAX_POLL_RETRIES}] "
                        f"Status: {status}"
                    )

                    if status in ("SUCCESS", "ERROR", "CANCELLED"):
                        return status

            except Exception as exc:
                logger.warning(f"   ⚠️  Poll attempt {attempt + 1} failed: {exc}")

            time.sleep(self.POLL_INTERVAL)

        logger.error("   ❌ LlamaCloud job timed out after max retries")
        return "TIMEOUT"

    def _fetch_result(self, job_id: str) -> Optional[str]:
        """Fetch the parsed Markdown text from a completed job."""
        result_url = f"{self.BASE_URL}/job/{job_id}/result/markdown"
        logger.info("   📥 Fetching markdown result from LlamaCloud…")
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.get(result_url, headers=self.headers)
                response.raise_for_status()
                data = response.json()

                # The API returns { "markdown": "..." } or pages list
                if "markdown" in data:
                    text = data["markdown"]
                elif "pages" in data:
                    text = "\n\n---\n\n".join(
                        p.get("md", "") for p in data["pages"]
                    )
                else:
                    # Fallback: raw text key
                    text = data.get("text", "")

                if text.strip():
                    logger.info(
                        f"   ✅ LlamaCloud returned {len(text):,} characters"
                    )
                else:
                    logger.warning("   ⚠️  LlamaCloud result was empty")
                return text

        except Exception as exc:
            logger.error(f"   ❌ Failed to fetch LlamaCloud result: {exc}")
            return None


# ============================================================================
# Hybrid PDF Parser
# ============================================================================

class PDFParser:
    """
    Hybrid PDF parser combining MarkItDown and LlamaCloud.

    - Step A: MarkItDown    → fast text, headings, formulas (local, no API)
    - Step B: LlamaCloud    → accurate tables and complex layouts (cloud API)
    - Step C: Merge both results into a single Markdown string
    - Step D: Save to data/processed_rules/<stem>.md
    """

    _DIVIDER = "# " + "=" * 42

    def __init__(self):
        logger.info("⚙️  Initializing Hybrid PDF Parser (MarkItDown + LlamaCloud)…")

        # MarkItDown (local, always available)
        self.md_converter = MarkItDown()
        logger.info("   ✅ MarkItDown initialized (text & formulas)")

        # LlamaCloud REST client (tables)
        llama_key = os.getenv("LLAMA_CLOUD_API_KEY", "").strip()
        if not llama_key:
            logger.warning(
                "   ⚠️  LLAMA_CLOUD_API_KEY not found in .env.\n"
                "      LlamaCloud (tables) will be skipped — "
                "only MarkItDown output will be saved.\n"
                "      Set LLAMA_CLOUD_API_KEY to get accurate table extraction."
            )
            self.llama_client = None
        else:
            self.llama_client = LlamaCloudClient(api_key=llama_key)
            logger.info("   ✅ LlamaCloud REST client initialized (tables)")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def parse_pdf_to_markdown(self, pdf_path: Path) -> Optional[str]:
        """
        Parse a PDF using the hybrid strategy:
          PART 1: MarkItDown → text + formulas (always runs)
          PART 2: LlamaCloud → clean tables   (runs if API key set)

        Both parts saved in one .md file for Gemini cleaning step.
        """
        if not pdf_path.exists():
            logger.error(f"❌ PDF not found: {pdf_path}")
            return None
        if pdf_path.suffix.lower() != ".pdf":
            logger.error(f"❌ Not a PDF file: {pdf_path}")
            return None

        logger.info(f"\n{'─' * 70}")
        logger.info(f"📄 Hybrid parsing: {pdf_path.name}")
        logger.info(f"{'─' * 70}")

        markitdown_content = self._run_markitdown(pdf_path)
        llamacloud_content = self._run_llamacloud(pdf_path)

        if not markitdown_content and not llamacloud_content:
            logger.error(f"❌ Both parsers failed for {pdf_path.name}. Aborting.")
            return None

        combined = self._combine(markitdown_content, llamacloud_content)

        saved_path = self._save(combined, pdf_path)
        if saved_path:
            logger.info(f"💾 Saved hybrid output → {saved_path}")
        else:
            logger.warning("⚠️  Could not save combined markdown to disk.")

        return combined

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _run_markitdown(self, pdf_path: Path) -> str:
        """PART 1: extract text, headings, formulas with MarkItDown."""
        logger.info("🔵 [PART 1] MarkItDown: extracting text & formulas…")
        try:
            result = self.md_converter.convert(str(pdf_path))
            content = result.text_content or ""
            if content.strip():
                logger.info(f"   ✅ MarkItDown: {len(content):,} characters")
            else:
                logger.warning("   ⚠️  MarkItDown returned empty content")
            return content
        except Exception as exc:
            logger.error(f"   ❌ MarkItDown failed: {exc}")
            return ""

    def _run_llamacloud(self, pdf_path: Path) -> str:
        """Step B — Extract tables and complex layouts via LlamaCloud REST API."""
        logger.info("🟣 [Step B] LlamaCloud: extracting tables & complex data…")
        if self.llama_client is None:
            logger.warning(
                "   ⏭️  Skipping LlamaCloud (no API key). "
                "Set LLAMA_CLOUD_API_KEY in .env to enable."
            )
            return ""
        result = self.llama_client.parse_pdf_to_markdown(pdf_path)
        return result or ""

    def _combine(self, markitdown_content: str, llamacloud_content: str) -> str:
        """Step C — Merge both parser outputs into one structured Markdown."""
        logger.info("🟢 [Step C] Combining MarkItDown + LlamaCloud outputs…")

        part1_header = (
            f"{self._DIVIDER}\n"
            "# PART 1: TEXT & FORMULAS (Extracted by MarkItDown)\n"
            f"{self._DIVIDER}"
        )
        part2_header = (
            f"{self._DIVIDER}\n"
            "# PART 2: TABLES & COMPLEX DATA (Extracted by LlamaCloud)\n"
            f"{self._DIVIDER}"
        )

        part1 = markitdown_content.strip() if markitdown_content.strip() \
            else "_[MarkItDown failed — no content]_"
        part2 = llamacloud_content.strip() if llamacloud_content.strip() \
            else "_[LlamaCloud failed or skipped — no content]_"

        combined = (
            f"{part1_header}\n\n{part1}\n\n\n"
            f"{part2_header}\n\n{part2}\n"
        )
        logger.info(f"   ✅ Combined output: {len(combined):,} characters total")
        return combined

    def _save(self, content: str, pdf_path: Path) -> Optional[Path]:
        """Step D — Persist the combined Markdown to PROCESSED_DIR."""
        try:
            output_dir = IngestionConfig.PROCESSED_DIR
            output_dir.mkdir(parents=True, exist_ok=True)
            md_file = output_dir / f"{pdf_path.stem}.md"
            with open(md_file, "w", encoding="utf-8") as fh:
                fh.write(content)
            return md_file
        except Exception as exc:
            logger.error(f"   ❌ Failed to save markdown: {exc}")
            return None

    def cleanup(self) -> None:
        """No-op — kept for pipeline compatibility."""
        pass


# ============================================================================
# TEMPORARILY DISABLED — Chunker & ChromaDB Ingestor
# (Enable after manually cleaning the .md files, then run build_vector_db.py)
# ============================================================================

class MarkdownChunker:
    """TEMPORARILY DISABLED — waiting for cleaned .md files."""
    def __init__(self):
        pass
    def chunk_markdown(self, markdown_content: str) -> List[Dict[str, Any]]:
        return []


class ChromaDBIngestor:
    """TEMPORARILY DISABLED — waiting for cleaned .md files."""
    def __init__(self, embedding_model: str = None):
        pass
    def ingest_documents(self, documents: List[Document], source_filename: str) -> int:
        return 0
    def verify_collection(self) -> Dict[str, Any]:
        return {"error": "ChromaDB ingestor is disabled — clean .md files first."}
    def clear_collection(self) -> None:
        pass


# ============================================================================
# Pipeline Orchestrator
# ============================================================================

class PDFIngestionPipeline:
    """
    Orchestrates the PDF ingestion pipeline.

    CURRENT MODE: PDF → Hybrid Markdown (saves and STOPS).
    Chunking and ChromaDB embedding are disabled until .md files are cleaned.
    """

    def __init__(self):
        self.parser = PDFParser()
        # DISABLED until data is clean:
        # self.chunker = MarkdownChunker()
        # self.ingestor = ChromaDBIngestor()

        self.stats: Dict[str, Any] = {
            "pdfs_processed": 0,
            "errors": [],
        }

    def ingest_pdf(self, pdf_path: Path) -> int:
        """
        Extract one PDF to hybrid Markdown and save.
        Stops before chunking/embedding.

        Returns 1 on success, 0 on failure.
        """
        logger.info(f"\n{'=' * 70}")
        logger.info(f"📥 Processing: {pdf_path.name}")
        logger.info(f"{'=' * 70}")

        try:
            combined_md = self.parser.parse_pdf_to_markdown(pdf_path)
            if not combined_md:
                self.stats["errors"].append(f"Failed to parse: {pdf_path.name}")
                return 0

            self.stats["pdfs_processed"] += 1

            output_name = f"{pdf_path.stem}.md"
            logger.info(
                f"🎉 SUCCESS: {pdf_path.name} → "
                f"{IngestionConfig.PROCESSED_DIR}/{output_name}"
            )
            logger.info(
                "👉 Next step: review & clean the .md file, "
                "then run build_vector_db.py"
            )
            return 1

        except Exception as exc:
            logger.error(f"❌ Error processing {pdf_path.name}: {exc}")
            self.stats["errors"].append(f"{pdf_path.name}: {exc}")
            return 0

    def process_directory(self, pdf_dir: Path = None) -> None:
        """Process all PDFs found in a directory."""
        pdf_dir = pdf_dir or IngestionConfig.DATA_DIR

        if not pdf_dir.exists():
            logger.error(f"❌ Directory not found: {pdf_dir}")
            return

        pdf_files = sorted(pdf_dir.glob("**/*.pdf"))
        if not pdf_files:
            logger.warning(f"⚠️  No PDF files found in {pdf_dir}")
            return

        logger.info(f"\n{'=' * 70}")
        logger.info("🚀 Starting Hybrid PDF Extraction Pipeline")
        logger.info(f"{'=' * 70}")
        logger.info(f"📂 Found {len(pdf_files)} PDF(s) in {pdf_dir}")

        for pdf_path in pdf_files:
            self.ingest_pdf(pdf_path)

        self._print_summary()

    def _print_summary(self) -> None:
        logger.info(f"\n{'=' * 70}")
        logger.info("📊 EXTRACTION SUMMARY")
        logger.info(f"{'=' * 70}")
        logger.info(f"✅ PDFs successfully extracted: {self.stats['pdfs_processed']}")
        if self.stats["errors"]:
            logger.info(f"❌ Errors: {len(self.stats['errors'])}")
            for err in self.stats["errors"]:
                logger.info(f"   • {err}")
        logger.info(f"{'=' * 70}\n")

    def cleanup(self) -> None:
        self.parser.cleanup()


# ============================================================================
# Entry Point
# ============================================================================

def main() -> int:
    import argparse

    arg_parser = argparse.ArgumentParser(
        description="Hybrid PDF extractor: MarkItDown + LlamaCloud → Markdown",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    arg_parser.add_argument(
        "--pdf",
        type=str,
        default=None,
        help="Specific PDF file or glob pattern (e.g. 'data/raw_pdfs/*.pdf')",
    )
    arg_parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG logging",
    )
    args = arg_parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        pipeline = PDFIngestionPipeline()

        if args.pdf:
            from glob import glob
            pdf_files = sorted(glob(args.pdf))
            if pdf_files:
                for pdf_path_str in pdf_files:
                    pipeline.ingest_pdf(Path(pdf_path_str))
            else:
                logger.error(f"❌ No files match pattern: {args.pdf}")
                return 1
        else:
            pipeline.process_directory()

        pipeline.cleanup()

        if pipeline.stats["errors"]:
            logger.warning(
                f"⚠️  Completed with {len(pipeline.stats['errors'])} error(s)"
            )
            return 1

        logger.info("✅ Hybrid extraction pipeline completed successfully!")
        return 0

    except Exception as exc:
        logger.error(f"❌ Fatal error: {exc}")
        import traceback
        logger.error(traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(main())