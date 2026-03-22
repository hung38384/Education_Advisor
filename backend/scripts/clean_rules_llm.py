import os
import glob
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai

# Load API Key
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("❌ Không tìm thấy GOOGLE_API_KEY trong file .env")

genai.configure(api_key=GOOGLE_API_KEY)

# Sử dụng Gemini 2.5 Flash (nhanh, rẻ, context window cực lớn, hoàn hảo cho việc đọc text)
model = genai.GenerativeModel('gemini-2.5-flash')

# ==========================================
# 🧠 THE GOLDEN EXTRACTOR PROMPT
# ==========================================
MASTER_PROMPT = """
Act as an Expert University Admissions Data Analyst. I will provide you with a raw markdown document extracted from a university's admission scheme. Your task is to distill this document into a CLEAN, STRICT, and HIGHLY STRUCTURED markdown file containing ONLY the essential mathematical and logical rules for admissions.

🚨 STRICT EXCLUSIONS (DO NOT INCLUDE THESE):
- Do NOT include historical admission scores (Điểm chuẩn năm trước).
- Do NOT include tuition fees (Học phí).
- Do NOT include employment statistics (Tình hình việc làm).
- Do NOT include lists of faculty members, administrative info, or contact details.
- Do NOT include secondary degree (văn bằng 2) or part-time (vừa làm vừa học) admissions.

✅ REQUIRED SECTIONS (EXTRACT EXACTLY THESE):

# 1. Các phương thức xét tuyển (Admission Methods)
List all the admission methods mentioned (e.g., Xét tuyển tài năng, Xét tuyển theo điểm thi THPT, Xét tuyển theo kỳ thi Đánh giá tư duy). Briefly bullet-point the requirements for each.

# 2. Điều kiện tiên quyết (Prerequisites & Thresholds)
Extract any absolute minimum requirements to apply. 
- Example: Minimum GPA (Điểm TBC học tập).
- Example: Minimum IELTS/VSTEP for English-taught or International programs.

# 3. Công thức tính điểm xét tuyển (Score Calculation Formulas)
Extract the exact mathematical formulas used to calculate the admission score. Pay extreme attention to coefficients (hệ số).
- Formula for THPT (without main subject).
- Formula for THPT (with main subject - e.g., multiplied by 3/4 or x2).
- Formula for ĐGTD (Thinking Assessment) if any.
- Mention the tie-breaker rule (Điều kiện phụ) if candidates have the same score.

# 4. Bảng quy đổi chứng chỉ Ngoại ngữ (Language Certificate Conversions)
Extract and format EXACTLY into Markdown tables:
- The bonus points (điểm thưởng) for VSTEP/IELTS.
- The score conversion (điểm quy đổi) replacing the English THPT exam score for VSTEP/IELTS.

Output the final result entirely in Vietnamese, using clean Markdown formatting (H1, H2, bullet points, tables). DO NOT add any conversational filler like "Here is the extracted data". Just output the Markdown.

================ RAW DOCUMENT CONTENT BELOW ================
"""

def clean_admission_rules():
    base_dir = Path(__file__).parent.parent
    processed_dir = base_dir / "data" / "processed_rules"
    
    # Tìm tất cả các file _raw.md
    raw_files = list(processed_dir.glob("*_raw.md"))
    
    if not raw_files:
        print("⚠️ Không tìm thấy file _raw.md nào để xử lý!")
        return

    print(f"🔍 Tìm thấy {len(raw_files)} file RAW. Bắt đầu dùng Gemini để 'lọc vàng'...")

    for raw_path in raw_files:
        # Đổi tên file từ BKA_DeAn2024_raw.md -> BKA_DeAn2024_clean.md
        clean_filename = raw_path.name.replace("_raw.md", "_clean.md")
        clean_path = processed_dir / clean_filename

        if clean_path.exists():
            print(f"⏭️ File {clean_filename} đã tồn tại. Bỏ qua!")
            continue

        print(f"\n🤖 Đang cho Gemini đọc file: {raw_path.name}...")
        
        try:
            # Đọc nội dung file thô
            with open(raw_path, "r", encoding="utf-8") as f:
                raw_content = f.read()

            # Nối Prompt và Content
            full_prompt = MASTER_PROMPT + "\n\n" + raw_content

            # Gọi Gemini xử lý
            response = model.generate_content(full_prompt)

            # Lưu file đã làm sạch
            with open(clean_path, "w", encoding="utf-8") as f:
                f.write(response.text)

            print(f"✅ XUẤT SẮC! Đã lưu luật siêu sạch tại: {clean_filename}")

        except Exception as e:
            print(f"❌ Lỗi khi xử lý {raw_path.name}: {e}")

if __name__ == "__main__":
    clean_admission_rules()