import os
import shutil
import subprocess
import nest_asyncio
from pathlib import Path
from dotenv import load_dotenv
from llama_parse import LlamaParse

# Fix lỗi vòng lặp sự kiện bất đồng bộ trên Windows
nest_asyncio.apply()

# Load API key từ file .env
load_dotenv()

OCR_DIR_NAME = "ocr_pdfs"
OCR_SUFFIX = "_ocr.pdf"
OCR_TIMEOUT_SECONDS = 300


def _build_ocr_command(input_pdf: Path, output_pdf: Path) -> list[str]:
    return [
        "ocrmypdf",
        "--skip-text",
        "--rotate-pages",
        "--deskew",
        str(input_pdf),
        str(output_pdf),
    ]


def _run_ocr(input_pdf: Path, output_pdf: Path) -> tuple[bool, str | None]:
    if shutil.which("ocrmypdf") is None:
        return False, "ocrmypdf command not found"

    command = _build_ocr_command(input_pdf, output_pdf)
    try:
        print(f"OCR_START {input_pdf.name}")
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=OCR_TIMEOUT_SECONDS,
        )
        if completed.returncode == 0:
            print(f"OCR_OK {output_pdf.name}")
            return True, None
        stderr_output = completed.stderr or completed.stdout or "ocr failed"
        return False, stderr_output.strip()
    except Exception as exc:
        return False, str(exc)


def parse_all_pdfs_to_md() -> None:
    # Setup đường dẫn
    base_dir = Path(__file__).parent.parent
    input_dir = base_dir / "data" / "raw_pdfs"
    ocr_dir = base_dir / "data" / OCR_DIR_NAME
    output_dir = base_dir / "data" / "processed_rules"
    ocr_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Khởi tạo LlamaParse 1 lần để dùng chung cho mọi file
    parser = LlamaParse(
        api_key=os.getenv("LLAMA_CLOUD_API_KEY"),
        result_type="markdown",
        verbose=True,
    )

    # Quét toàn bộ file .pdf trong thư mục raw_pdfs
    pdf_files = list(input_dir.glob("*.pdf"))

    if not pdf_files:
        print("⚠️ Không tìm thấy file PDF nào trong thư mục raw_pdfs!")
        return

    print(f"🔍 Tìm thấy {len(pdf_files)} file PDF. Bắt đầu xử lý hàng loạt...")

    for pdf_path in pdf_files:
        ocr_pdf_path = ocr_dir / f"{pdf_path.stem}{OCR_SUFFIX}"
        output_md_path = output_dir / f"{pdf_path.stem}_raw.md"

        if output_md_path.exists():
            print("⏭️ File", output_md_path.name, "đã tồn tại. Bỏ qua!")
            continue

        parse_input_path = pdf_path

        if ocr_pdf_path.exists():
            print(f"OCR_SKIP_EXISTING {ocr_pdf_path.name}")
            parse_input_path = ocr_pdf_path
        else:
            print(
                "OCR_ORIENTATION_DETECTED "
                f"{pdf_path.name}: orientation_detection=n/a; "
                "auto_rotate=enabled"
            )
            print(
                "OCR_ORIENTATION_APPLIED "
                f"{pdf_path.name}: orientation_detection=n/a; "
                "auto_rotate=enabled"
            )
            ok, error = _run_ocr(pdf_path, ocr_pdf_path)
            if ok:
                if ocr_pdf_path.exists():
                    parse_input_path = ocr_pdf_path
                else:
                    print(
                        f"OCR_FAIL_OUTPUT_MISSING {pdf_path.name}: "
                        "ocr succeeded but output file is missing"
                    )
                    print(
                        "OCR_FAIL_FALLBACK_RAW "
                        f"{pdf_path.name}: "
                        "missing OCR output"
                    )
            else:
                fallback_reason = error or "không xác định"
                message_parts = [
                    "OCR_FAIL_FALLBACK_RAW ",
                    f"{pdf_path.name}: ",
                    fallback_reason,
                ]
                print("".join(message_parts))

        if parse_input_path == ocr_pdf_path:
            print(f"PARSE_INPUT OCR {ocr_pdf_path.name}")
        else:
            print(f"PARSE_INPUT RAW {pdf_path.name}")

        print(
            f"\n🚀 Đang gửi {parse_input_path.name} lên LlamaParse "
            "(Vui lòng đợi 1-2 phút)..."
        )

        try:
            # Thực hiện bóc tách PDF
            documents = parser.load_data(str(parse_input_path))

            if not documents:
                error_message = "❌ Lỗi: Không đọc được dữ liệu từ "
                error_message += parse_input_path.name
                print(error_message)
                continue

            # Gom tất cả các trang lại thành 1 chuỗi Markdown
            full_markdown = "\n\n".join([doc.text for doc in documents])

            # Lưu ra file
            with open(output_md_path, "w", encoding="utf-8") as f:
                f.write(full_markdown)

            print(f"✅ BINGO! Đã xử lý xong: {output_md_path.name}")

        except Exception as e:
            print(f"❌ Lỗi khi xử lý {parse_input_path.name}: {e}")


if __name__ == "__main__":
    parse_all_pdfs_to_md()
