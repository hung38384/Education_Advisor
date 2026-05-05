"""
Agentic RAG Pipeline - Environment Cleanup Utility

Safely removes leftover data from old RAG systems (LlamaParse, old ChromaDB, caches)
before initializing the new pipeline. Prevents data corruption from stale artifacts.

Usage:
    python scripts/clean_env.py

Warning:
    This script PERMANENTLY DELETES files. Always backup important data before running.
    Original PDF files are preserved; only parsed outputs are removed.
"""

import sys
import time
import logging
from pathlib import Path
from typing import List, Tuple
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================================================
# Configuration
# ============================================================================

class CleanupConfig:
    """Configuration for cleanup operations."""
    
    # Paths to remove (relative to project root)
    CHROMA_DB_PATHS = [
        "data/chroma_db",
        ".chroma",
    ]

    # Cache directories to remove
    CACHE_PATHS = [
        ".cache",
        "__pycache__",
        ".langchain_cache",
        ".llamaindex_cache",
        "cache",
    ]

    # Data directory for selective cleanup
    DATA_DIR = Path("data")
    
    # Extensions to remove from DATA_DIR (keep PDFs)
    EXTENSIONS_TO_REMOVE = [".md", ".txt", ".json"]
    
    # Files/patterns to preserve
    PRESERVE_PATTERNS = ["*.pdf", "README*"]
    
    # Confirmation timeout (seconds)
    CONFIRMATION_TIMEOUT = 3


class EnvironmentCleaner:
    """
    Safely cleans old RAG pipeline artifacts from the project environment.
    
    Operations:
    - Removes ChromaDB vector database directory
    - Deletes intermediate parsed files (.md, .txt) from data folder
    - Cleans cache directories
    - Preserves original PDF files and important configs
    """
    
    def __init__(self, project_root: Path = None):
        """
        Initialize the cleaner.
        
        Args:
            project_root: Root directory of the project. Defaults to current directory.
        """
        self.project_root = project_root or Path.cwd()
        self.deleted_items: List[Tuple[str, str]] = []  # (type, path)
        self.skipped_items: List[Tuple[str, str]] = []  # (reason, path)
        self.errors: List[Tuple[str, str]] = []  # (error, path)
    
    def _delete_directory(self, path: Path, description: str) -> bool:
        """
        Safely delete a directory and all its contents.
        
        Args:
            path: Path to directory
            description: Human-readable description of what's being deleted
            
        Returns:
            True if deleted, False if skipped/error
        """
        full_path = self.project_root / path if not path.is_absolute() else path
        
        if not full_path.exists():
            logger.warning(f"⏭️  Skip (not found): {description}")
            self.skipped_items.append(("not_found", str(full_path)))
            return False
        
        try:
            logger.info(f"🗑️  Deleting: {description}")
            if full_path.is_dir():
                shutil.rmtree(full_path)
            else:
                full_path.unlink()
            
            logger.info(f"   ✅ Deleted: {full_path}")
            self.deleted_items.append(("directory", str(full_path)))
            return True
        
        except PermissionError as e:
            logger.error(f"   ❌ Permission denied: {e}")
            self.errors.append(("permission_error", str(full_path)))
            return False
        
        except Exception as e:
            logger.error(f"   ❌ Error: {e}")
            self.errors.append(("unknown_error", str(full_path)))
            return False
    
    def _delete_file(self, path: Path, description: str = None) -> bool:
        """
        Safely delete a single file.
        
        Args:
            path: Path to file
            description: Human-readable description
            
        Returns:
            True if deleted, False otherwise
        """
        if not path.exists():
            return False
        
        try:
            path.unlink()
            desc = description or str(path)
            logger.info(f"   ✅ Deleted: {desc}")
            self.deleted_items.append(("file", str(path)))
            return True
        
        except Exception as e:
            logger.error(f"   ❌ Failed to delete {path}: {e}")
            self.errors.append(("file_error", str(path)))
            return False
    
    def clean_chroma_db(self) -> int:
        """
        Remove ChromaDB vector database directories.
        
        Returns:
            Number of items deleted
        """
        logger.info("\n" + "=" * 70)
        logger.info("🗄️  Cleaning Vector Database (ChromaDB)")
        logger.info("=" * 70)
        
        deleted_count = 0
        for chroma_path in CleanupConfig.CHROMA_DB_PATHS:
            if self._delete_directory(Path(chroma_path), f"ChromaDB: {chroma_path}"):
                deleted_count += 1
        
        return deleted_count
    
    def clean_parsed_files(self) -> int:
        """
        Remove intermediate parsed files (.md, .txt) from data directory.
        Preserves original PDF files.
        
        Returns:
            Number of files deleted
        """
        logger.info("\n" + "=" * 70)
        logger.info("📄 Cleaning Parsed/Intermediate Files")
        logger.info("=" * 70)
        
        data_dir = self.project_root / CleanupConfig.DATA_DIR
        
        if not data_dir.exists():
            logger.warning(f"⏭️  Data directory not found: {data_dir}")
            self.skipped_items.append(("not_found", str(data_dir)))
            return 0
        
        logger.info(f"📁 Scanning: {data_dir}")
        deleted_count = 0
        
        try:
            for file_path in data_dir.rglob("*"):
                # Skip directories
                if file_path.is_dir():
                    continue
                
                # Check if file extension matches removal list
                if file_path.suffix.lower() in CleanupConfig.EXTENSIONS_TO_REMOVE:
                    if self._delete_file(file_path, f"Parsed file: {file_path.name}"):
                        deleted_count += 1
                
                # Keep PDFs
                elif file_path.suffix.lower() == ".pdf":
                    logger.info(f"   ✓ Preserved: {file_path.name} (PDF)")
                    self.skipped_items.append(("preserved_pdf", str(file_path)))
        
        except Exception as e:
            logger.error(f"❌ Error scanning data directory: {e}")
            self.errors.append(("scan_error", str(data_dir)))
        
        return deleted_count
    
    def clean_caches(self) -> int:
        """
        Remove cache directories from project root and subdirectories.
        
        Returns:
            Number of cache directories deleted
        """
        logger.info("\n" + "=" * 70)
        logger.info("🧹 Cleaning Cache Directories")
        logger.info("=" * 70)
        
        deleted_count = 0
        for cache_path in CleanupConfig.CACHE_PATHS:
            full_path = self.project_root / cache_path
            
            # Also search for nested __pycache__ directories
            if cache_path == "__pycache__":
                logger.info(f"🔍 Searching for nested {cache_path}...")
                for pycache in self.project_root.rglob("__pycache__"):
                    if self._delete_directory(pycache, f"Cache: {pycache.relative_to(self.project_root)}"):
                        deleted_count += 1
            else:
                if self._delete_directory(full_path, f"Cache: {cache_path}"):
                    deleted_count += 1
        
        return deleted_count
    
    def print_summary(self) -> None:
        """Print cleanup summary report."""
        logger.info("\n" + "=" * 70)
        logger.info("📊 CLEANUP SUMMARY")
        logger.info("=" * 70)
        
        total_deleted = len(self.deleted_items)
        total_skipped = len(self.skipped_items)
        total_errors = len(self.errors)
        
        # Deleted items
        if self.deleted_items:
            logger.info(f"\n✅ Successfully Deleted ({total_deleted}):")
            for item_type, item_path in self.deleted_items:
                logger.info(f"   [{item_type}] {item_path}")
        
        # Skipped items
        if self.skipped_items:
            logger.info(f"\n⏭️  Skipped ({total_skipped}):")
            for reason, item_path in self.skipped_items:
                logger.info(f"   [{reason}] {item_path}")
        
        # Errors
        if self.errors:
            logger.info(f"\n❌ Errors ({total_errors}):")
            for error, item_path in self.errors:
                logger.info(f"   [{error}] {item_path}")
        
        # Final statistics
        logger.info("\n" + "-" * 70)
        logger.info(f"Total Deleted:  {total_deleted}")
        logger.info(f"Total Skipped:  {total_skipped}")
        logger.info(f"Total Errors:   {total_errors}")
        logger.info("=" * 70)
        
        if total_errors == 0:
            logger.info("\n✅ Cleanup completed successfully!")
        else:
            logger.warning(f"\n⚠️  Cleanup completed with {total_errors} error(s).")


def confirm_cleanup() -> bool:
    """
    Request user confirmation before cleanup with a timeout warning.
    
    Returns:
        True if user confirms, False otherwise
    """
    print("\n" + "=" * 70)
    print("⚠️  WARNING: DESTRUCTIVE OPERATION")
    print("=" * 70)
    print("\nThis script will PERMANENTLY DELETE:")
    print("  • ChromaDB vector database directory")
    print("  • Intermediate parsed files (.md, .txt)")
    print("  • Cache directories")
    print("\nOriginal PDF files and project code will be preserved.")
    print("\n" + "=" * 70)
    
    # Countdown
    print(f"\n⏱️  Proceeding in {CleanupConfig.CONFIRMATION_TIMEOUT} seconds...")
    print("   Type 'Y' to confirm or 'N' to cancel.\n")
    
    for countdown in range(CleanupConfig.CONFIRMATION_TIMEOUT, 0, -1):
        print(f"\r   [{countdown}] seconds remaining... ", end="", flush=True)
        time.sleep(1)
    
    print("\n")
    
    # Get user input
    try:
        response = input("🔴 Type 'Y' to confirm cleanup (or anything else to cancel): ").strip().upper()
        if response == "Y":
            print("✅ Confirmed. Starting cleanup...\n")
            return True
        else:
            print("❌ Cleanup cancelled by user.\n")
            return False
    
    except KeyboardInterrupt:
        print("\n❌ Cleanup cancelled by user (Ctrl+C).\n")
        return False


def main() -> int:
    """
    Main entry point for the cleanup utility.
    
    Returns:
        Exit code (0 for success, 1 for cancel/error)
    """
    try:
        # Request confirmation
        if not confirm_cleanup():
            return 1
        
        # Initialize cleaner
        project_root = Path.cwd()
        logger.info(f"Project root: {project_root}\n")
        
        cleaner = EnvironmentCleaner(project_root)
        
        # Execute cleanup operations
        chroma_deleted = cleaner.clean_chroma_db()
        parsed_deleted = cleaner.clean_parsed_files()
        cache_deleted = cleaner.clean_caches()
        
        # Print summary
        cleaner.print_summary()
        
        # Return appropriate exit code
        if cleaner.errors:
            logger.warning("\n⚠️  Some errors occurred during cleanup.")
            return 1
        else:
            logger.info("\n🎉 Environment cleanup completed successfully!")
            print("\n✨ Your project is ready for the new RAG pipeline!\n")
            return 0
    
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
