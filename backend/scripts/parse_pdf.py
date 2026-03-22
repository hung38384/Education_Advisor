import os
import nest_asyncio
from pathlib import Path
from dotenv import load_dotenv
from llama_parse import LlamaParse

# Fix lỗi vòng lặp sự kiện bất đồng bộ trên Windows
nest_asyncio.apply()

# Load API key từ file .env
load_dotenv()

def parse_all_pdfs_to_md():
    # Setup đường dẫn
    base_dir = Path(__file__).parent.parent
    input_dir = base_dir / "data" / "raw_pdfs"
    output_dir = base_dir / "data" / "processed_rules"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Khởi tạo LlamaParse 1 lần để dùng chung cho mọi file
    parser = LlamaParse(
        api_key=os.getenv("LLAMA_CLOUD_API_KEY"),
        result_type="markdown",
        verbose=True
    )

    # Quét toàn bộ file .pdf trong thư mục raw_pdfs
    pdf_files = list(input_dir.glob("*.pdf"))
    
    if not pdf_files:
        print("⚠️ Không tìm thấy file PDF nào trong thư mục raw_pdfs!")
        return

    print(f"🔍 Tìm thấy {len(pdf_files)} file PDF. Bắt đầu xử lý hàng loạt...")

    for pdf_path in pdf_files:
        output_md_path = output_dir / f"{pdf_path.stem}_raw.md"
        
        # Kiểm tra nếu file md đã tồn tại thì bỏ qua (Tiết kiệm thời gian và Quota)
        if output_md_path.exists():
            print(f"⏭️ File {output_md_path.name} đã tồn tại. Bỏ qua!")
            continue

        print(f"\n🚀 Đang gửi {pdf_path.name} lên LlamaParse (Vui lòng đợi 1-2 phút)...")

        try:
            # Thực hiện bóc tách PDF
            documents = parser.load_data(str(pdf_path))

            if not documents:
                print(f"❌ Lỗi: Không đọc được dữ liệu từ {pdf_path.name}")
                continue

            # Gom tất cả các trang lại thành 1 chuỗi Markdown
            full_markdown = "\n\n".join([doc.text for doc in documents])

            # Lưu ra file
            with open(output_md_path, "w", encoding="utf-8") as f:
                f.write(full_markdown)

            print(f"✅ BINGO! Đã xử lý xong: {output_md_path.name}")
            
        except Exception as e:
            print(f"❌ Lỗi khi xử lý {pdf_path.name}: {e}")

if __name__ == "__main__":
    parse_all_pdfs_to_md()