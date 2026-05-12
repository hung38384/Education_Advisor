#!/usr/bin/env python3
"""
clean_rules_batch.py

Wrapper để chạy clean_rules_llm.py từng batch với delay an toàn.
Giải pháp cho rate limit Gemini 5 request/minute.

Giải thích:
- 5 requests/minute = 1 request mỗi 12 giây
- Script này chạy từng file với delay 13 giây giữa các request
- Hoặc nhóm file theo pattern (ví dụ: BKA*.md, TMU*.md, ...)

Usage:
    python scripts/clean_rules_batch.py              # Chạy toàn bộ với delay an toàn
    python scripts/clean_rules_batch.py --pattern BKA  # Chỉ clean BKA*
    python scripts/clean_rules_batch.py --force      # Ghi đè file đã tồn tại
    python scripts/clean_rules_batch.py --delay 30   # Delay 30 giây giữa các file
"""

import os
import sys
import time
import logging
from pathlib import Path
from glob import glob
import subprocess

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def get_raw_markdown_files(pattern: str = None) -> list:
    """Lấy danh sách file markdown thô cần clean."""
    base_dir = Path(__file__).parent.parent / "data" / "processed_rules"
    
    # File thô: *.md nhưng không phải *_clean.md và không phải *_raw.md
    raw_files = [
        f for f in base_dir.glob("*.md")
        if not f.name.endswith("_clean.md") and not f.name.endswith("_raw.md")
    ]
    
    # Hoặc naming cũ: *_raw.md
    raw_files.extend(base_dir.glob("*_raw.md"))
    
    # Filter theo pattern nếu có
    if pattern:
        raw_files = [f for f in raw_files if pattern.upper() in f.name.upper()]
    
    return sorted(set(raw_files))


def estimate_time(files: list, delay: float) -> str:
    """Ước tính thời gian hoàn thành."""
    total_seconds = len(files) * delay
    minutes = int(total_seconds // 60)
    seconds = int(total_seconds % 60)
    return f"{minutes}m{seconds}s"


def clean_single_file(file_path: Path, force: bool = False) -> bool:
    """Clean một file bằng Gemini (gọi subprocess)."""
    try:
        script_path = Path(__file__).parent / "clean_rules_llm.py"
        cmd = [
            sys.executable,
            str(script_path),
            "--file", file_path.name
        ]
        if force:
            cmd.append("--force")
        
        # Chạy subprocess
        result = subprocess.run(
            cmd,
            capture_output=False,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        
        return result.returncode == 0
    except Exception as e:
        logger.error(f"❌ Error cleaning {file_path.name}: {e}")
        return False


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Batch clean admission rules với delay an toàn cho rate limit Gemini",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ:
  python scripts/clean_rules_batch.py              # Toàn bộ, 13s delay
  python scripts/clean_rules_batch.py --pattern BKA  # Chỉ BKA files
  python scripts/clean_rules_batch.py --delay 20   # Delay 20s
  python scripts/clean_rules_batch.py --force      # Ghi đè file đã tồn tại
  python scripts/clean_rules_batch.py --dry-run    # Test, không clean thật
        """
    )
    parser.add_argument(
        "--pattern",
        type=str,
        default=None,
        help="Chỉ clean file có tên chứa pattern này (ví dụ: BKA, TMU, ...)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=13,
        help="Delay giữa các request (giây). Default: 13s (= 5 req/min)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ghi đè file _clean.md đã tồn tại"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Test: liệt kê file nhưng không clean thật"
    )
    
    args = parser.parse_args()
    
    # Lấy danh sách file
    raw_files = get_raw_markdown_files(args.pattern)
    if not raw_files:
        logger.warning("❌ Không tìm thấy file markdown thô nào để clean!")
        return 1
    
    logger.info(f"\n{'='*70}")
    logger.info(f"📊 BATCH CLEANING PLAN")
    logger.info(f"{'='*70}")
    logger.info(f"Pattern: {args.pattern or 'ALL'}")
    logger.info(f"Files to clean: {len(raw_files)}")
    logger.info(f"Delay per file: {args.delay}s")
    logger.info(f"Estimated time: {estimate_time(raw_files, args.delay)}")
    logger.info(f"Force reprocess: {args.force}")
    logger.info(f"Dry-run mode: {args.dry_run}")
    logger.info(f"{'='*70}\n")
    
    if args.dry_run:
        logger.info("🔍 DRY-RUN MODE: Listing files to be cleaned\n")
        for i, f in enumerate(raw_files, 1):
            logger.info(f"  {i:2d}. {f.name}")
        logger.info(f"\n✅ Dry-run complete. {len(raw_files)} files would be cleaned.")
        return 0
    
    # Xác nhận trước khi chạy
    print(f"\n⚠️  Bạn sắp clean {len(raw_files)} file(s) với delay {args.delay}s mỗi file.")
    print(f"    Thời gian ước tính: {estimate_time(raw_files, args.delay)}")
    response = input("\n▶️  Tiếp tục? (y/n): ").strip().lower()
    if response != 'y':
        logger.info("❌ Đã hủy.")
        return 1
    
    # Chạy batch
    logger.info(f"\n{'='*70}")
    logger.info("🚀 STARTING BATCH CLEANING")
    logger.info(f"{'='*70}\n")
    
    start_time = time.time()
    success_count = 0
    error_count = 0
    
    for idx, file_path in enumerate(raw_files, 1):
        logger.info(f"\n[{idx}/{len(raw_files)}] Processing: {file_path.name}")
        
        # Clean file
        if clean_single_file(file_path, force=args.force):
            success_count += 1
        else:
            error_count += 1
        
        # Delay trước file tiếp theo (ngoại trừ file cuối)
        if idx < len(raw_files):
            logger.info(f"   ⏳ Waiting {args.delay}s before next request...")
            time.sleep(args.delay)
    
    elapsed = time.time() - start_time
    elapsed_str = f"{int(elapsed//60)}m{int(elapsed%60)}s"
    
    # Summary
    logger.info(f"\n{'='*70}")
    logger.info("📊 BATCH COMPLETE")
    logger.info(f"{'='*70}")
    logger.info(f"✅ Success: {success_count}/{len(raw_files)}")
    logger.info(f"❌ Errors: {error_count}/{len(raw_files)}")
    logger.info(f"⏱️  Elapsed time: {elapsed_str}")
    logger.info(f"{'='*70}\n")
    
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
