"""
clean_rules_llm.py

Reads hybrid .md files (output of ingest_pdf.py) and uses Gemini to distill
them into clean, structured Markdown files ready for ChromaDB chunking.

Naming convention:
  Input  → data/processed_rules/<UNI>_DeAn<YEAR>.md
  Output → data/processed_rules/<UNI>_DeAn<YEAR>_clean.md
"""

import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv
import google.generativeai as genai

# --- Load API Key ---
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("❌ Không tìm thấy GOOGLE_API_KEY trong file .env")

genai.configure(api_key=GOOGLE_API_KEY)

# Gemini 2.5 Flash: context window lớn, lý tưởng cho tài liệu dài
# (Model sẽ được khởi tạo sau khi định nghĩa MASTER_PROMPT)


# ============================================================================
# 🧠 MASTER EXTRACTION PROMPT — Phiên bản Nâng cấp Toàn diện
# ============================================================================

MASTER_PROMPT = """\
Bạn là một Chuyên gia Phân tích Dữ liệu Tuyển sinh Đại học Việt Nam cực kỳ kỳ tỉ mỉ và chính xác.
Bạn sẽ nhận một tài liệu Markdown thô được trích xuất từ Đề án Tuyển sinh của một trường đại học.
Nhiệm vụ của bạn là "lọc vàng" — chắt lọc ra MỌI quy tắc toán học, công thức tính điểm và điều kiện
xét tuyển theo từng phương thức, đồng thời loại bỏ hoàn toàn những nội dung không liên quan.

Kết quả cuối cùng phải là một file Markdown cực kỳ CÔ ĐỌNG, CÓ CẤU TRÚC RÕ RÀNG, và ĐẦY ĐỦ
đến mức một AI Agent có thể đọc file này và TỰ TÍNH ĐƯỢC điểm xét tuyển của bất kỳ học sinh nào,
ứng với BẤT KỲ phương thức nào mà trường đó áp dụng.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 NGHIÊM CẤM TUYỆT ĐỐI (KHÔNG ĐƯA VÀO OUTPUT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Điểm chuẩn của các năm trước (historical cutoff scores)
- Học phí, chi phí đào tạo
- Thống kê việc làm, tỷ lệ có việc sau tốt nghiệp
- Danh sách giảng viên, bộ môn, thông tin hành chính
- Thông tin liên hệ (email, điện thoại, địa chỉ)
- Hệ vừa làm vừa học, văn bằng 2, đào tạo từ xa
- Các câu văn mô tả, lời dẫn chung chung (chỉ giữ số liệu và quy tắc)
- Câu mở đầu kiểu "Dưới đây là kết quả trích xuất..." hay "Theo tài liệu..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CẤU TRÚC BẮT BUỘC CỦA FILE OUTPUT (THEO THỨ TỰ NÀY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# [TÊN TRƯỜNG] — Đề án Tuyển sinh [NĂM]

---

## 1. TỔNG QUAN PHƯƠNG THỨC XÉT TUYỂN

Liệt kê TẤT CẢ các phương thức xét tuyển của trường dưới dạng bảng:

| STT | Mã Phương thức | Tên Phương thức | Chỉ tiêu (%) | Đối tượng áp dụng |
|---|---|---|---|---|
| 1 | PT1 | ... | ...% | ... |
| ... | ... | ... | ... | ... |

> Ghi chú: Nếu chỉ tiêu theo số lượng (không phải %), ghi rõ số lượng.

---

## 2. ĐIỀU KIỆN TIÊN QUYẾT & NGƯỠNG ĐẢM BẢO CHẤT LƯỢNG ĐẦU VÀO

Đây là các điều kiện BẮT BUỘC phải đáp ứng TRƯỚC KHI nộp hồ sơ xét tuyển:

- **Ngưỡng điểm học bạ (GPA) sơ tuyển:** [Ghi rõ điều kiện điểm học bạ (GPA) BẮT BUỘC để được nộp hồ sơ xét tuyển cho TẤT CẢ phương thức (kể cả xét điểm thi THPT hay ĐGNL). Ưu tiên tìm các từ khóa như "TBC học tập", "điểm trung bình học tập đạt từ..."]
- **Tốt nghiệp THPT:** Bắt buộc / Không bắt buộc (ghi rõ từng phương thức)
- **Hạnh kiểm:** [Yêu cầu tối thiểu nếu có]
- **Ngưỡng điểm sàn theo phương thức** (nếu trường tự quy định riêng, khác ngưỡng Bộ GD&ĐT):

| Phương thức | Ngưỡng điểm sàn tối thiểu | Ghi chú |
|---|---|---|
| ... | ... | ... |

---

## 3. PHƯƠNG THỨC 1: XÉT TUYỂN TÀI NĂNG / ƯU TIÊN / THẲNG
*(Bỏ qua section này nếu trường không có phương thức này)*

### 3.1 Điều kiện đặc cách
Liệt kê các trường hợp được xét tuyển thẳng hoặc ưu tiên xét tuyển:
- Đối tượng 1: [Mô tả, ví dụ: Thủ khoa trường THPT, Giải Olympic quốc tế, ...]
- Đối tượng 2: [...]

### 3.2 Hồ sơ & quy trình (chỉ giữ thông tin cốt lõi, không lòng vòng)

---

## 4. PHƯƠNG THỨC 2: XÉT HỌC BẠ THPT
*(Bỏ qua section này nếu trường không có phương thức này)*

### 4.1 Công thức tính điểm xét tuyển học bạ

> **CÔNG THỨC:** [Ghi rõ công thức, ví dụ: ĐXT = (Toán×hệ_số + Văn×hệ_số + Môn_3×hệ_số) / Tổng_hệ_số]

Trong đó:
- Điểm môn học = Trung bình cộng điểm môn đó qua [N] học kỳ / [N] năm
- [Giải thích từng thành phần trong công thức]

### 4.2 Tổ hợp môn xét tuyển (theo ngành)

| Mã ngành | Tên ngành | Tổ hợp môn xét tuyển |
|---|---|---|
| ... | ... | A00, A01, ... |

### 4.3 Điều kiện phụ (tie-breaker)
- **Công thức/Quy tắc phụ:** [BẮT BUỘC diễn giải thành công thức toán học hoặc quy tắc logic tĩnh cụ thể. KHÔNG gạch đầu dòng chung chung. Ví dụ: "Tiêu chí 1: Điểm Toán > X. Tiêu chí 2: Tổng điểm 3 môn gốc không nhân hệ số > Y". Liệt kê rõ: Tiêu chí ưu tiên 1, Tiêu chí ưu tiên 2...]

---

## 5. PHƯƠNG THỨC 3: XÉT ĐIỂM THI TỐT NGHIỆP THPT QUỐC GIA (THPT QG)
*(Bỏ qua section này nếu trường không có phương thức này)*

### 5.1 Công thức tính điểm xét tuyển THPT QG

**5.1.a — Công thức KHÔNG nhân hệ số môn chính:**
> **ĐXT = Môn_1 + Môn_2 + Môn_3** (Thang 30)

**5.1.b — Công thức CÓ nhân hệ số môn chính (nếu áp dụng):**
> **ĐXT = Môn_1 + Môn_2 + (Môn_chính × Hệ_số)** → Quy về thang [X]
> *Ví dụ: Hệ số 2 cho môn Toán trong khối A, hoặc hệ số nhân 2 rồi chia 4*

**5.1.c — Điểm cộng ưu tiên:**
> ĐXT_cuối = ĐXT + Điểm_ưu_tiên_đối_tượng + Điểm_ưu_tiên_khu_vực

### 5.2 Tổ hợp môn xét tuyển (theo ngành)
*(Giống cấu trúc bảng ở mục 4.2)*

### 5.3 Điều kiện phụ (tie-breaker)
- **Công thức/Quy tắc phụ:** [BẮT BUỘC diễn giải thành công thức toán học hoặc quy tắc logic tĩnh cụ thể. KHÔNG gạch đầu dòng chung chung. Ví dụ: "Tiêu chí 1: Tổng điểm 3 môn gốc không nhân hệ số". Liệt kê rõ: Tiêu chí ưu tiên 1, Tiêu chí ưu tiên 2...]

---

## 6. PHƯƠNG THỨC 4: XÉT KẾT QUẢ THI ĐÁNH GIÁ TƯ DUY (TSA — ĐH Bách Khoa)
*(Bỏ qua section này nếu trường không có phương thức này)*

### 6.1 Công thức tính điểm xét tuyển theo TSA

> **ĐXT = (Điểm_TSA / Hệ_số_quy_đổi) + Điểm_môn_bổ_trợ × Hệ_số**
> *Ghi rõ công thức chính xác từ tài liệu. Ghi rõ thang điểm TSA (150 hay 300?).*

### 6.2 Tổ hợp & ngành áp dụng
*(Giống cấu trúc bảng ở mục 4.2)*

---

## 7. PHƯƠNG THỨC 5: XÉT KẾT QUẢ THI ĐÁNH GIÁ NĂNG LỰC (ĐGNL)
*(Bỏ qua section này nếu trường không có phương thức này)*

### 7.1 Phân biệt loại bài thi ĐGNL
> Trường chấp nhận bài thi ĐGNL nào? (Khoanh vào các loại áp dụng)
- [ ] ĐGNL của ĐHQG Hà Nội (HSA) — Thang điểm: 150
- [ ] ĐGNL của ĐHQG TP.HCM (APT) — Thang điểm: 1200
- [ ] ĐGNL chung khác

### 7.2 Công thức tính điểm xét tuyển theo ĐGNL

**Nếu dùng HSA (thang 150):**
> **ĐXT = Điểm_HSA / [Hệ_số_quy_đổi]** hoặc **ĐXT = Điểm_HSA × [Hệ_số_nhân]**

**Nếu dùng APT (thang 1200):**
> **ĐXT = Điểm_APT / [Hệ_số_quy_đổi]**

*(Trích nguyên văn công thức từ tài liệu nếu khác với trên)*

---

## 8. PHƯƠNG THỨC 6: XÉT KHẾ HỢP CHỨNG CHỈ NGOẠI NGỮ QUỐC TẾ
*(Bỏ qua section này nếu trường không có phương thức này)*

Đây là phương thức KẾT HỢP điểm thi + chứng chỉ ngoại ngữ (IELTS/TOEFL/TOEIC...).

### 8.1 Công thức tính điểm xét tuyển kết hợp

> **ĐXT = Môn_1 + Môn_2 + Điểm_Ngoại_ngữ_quy_đổi_từ_chứng_chỉ**
> *(Ghi rõ: môn nào được thay thế bởi chứng chỉ, thang điểm tổng là bao nhiêu?)*

### 8.2 Bảng quy đổi điểm chứng chỉ Ngoại ngữ (TRỢ THAY THẾ môn Tiếng Anh THPT)

> **Quy tắc sử dụng điểm quy đổi:** [BẮT BUỘC TRÍCH XUẤT: Có được cộng dồn điểm chứng chỉ với điểm thi môn Ngoại ngữ không? Hay CHỈ ĐƯỢC CHỌN 1 TRONG 2 (lấy điểm chứng chỉ hoặc điểm thi - điểm nào cao hơn thì lấy)? Chứng chỉ cần thay thế cho kỳ thi nào (THPT QG, ĐGNL, hay xét học bạ)?]

| Chứng chỉ | Mức điểm chứng chỉ | Điểm Tiếng Anh quy đổi (thang 10) |
|---|---|---|
| IELTS | ... - ... | ... |
| IELTS | ... - ... | ... |
| TOEFL iBT | ... - ... | ... |
| TOEIC | ... - ... | ... |
| VSTEP | Bậc ... | ... |
| Cambridge | Grade ... | ... |

*(Ghi đầy đủ tất cả mức điểm từ thấp đến cao được liệt kê trong tài liệu)*

### 8.3 Điểm THƯỞNG cho chứng chỉ Ngoại ngữ (nếu có, khác với điểm quy đổi)

> **Quy tắc:** Điểm thưởng được cộng THÊM vào điểm xét tuyển THPT QG (không phải thay thế).

| Chứng chỉ | Mức điểm | Điểm thưởng cộng thêm |
|---|---|---|
| IELTS | >= ... | + ... |
| ... | ... | ... |

*(Nếu trường vừa có quy đổi vừa có điểm thưởng, hãy làm rõ: hai loại này được dùng trong phương thức nào, không được dùng đồng thời)*

---

## 9. PHƯƠNG THỨC ĐẶC BIỆT KHÁC
*(Bỏ qua section này nếu trường không có)*

Mô tả ngắn gọn bất kỳ phương thức nào chưa được liệt kê trên, ví dụ:
- Xét tuyển theo chứng chỉ quốc tế (SAT, ACT, A-Level, IB, v.v.)
- Xét tuyển dành cho học sinh trường THPT chuyên / năng khiếu
- Phỏng vấn / kiểm tra năng khiếu đặc thù (Kiến trúc, Mỹ thuật, Thể dục...)
- Xét tuyển dành cho người tốt nghiệp nước ngoài

Với mỗi phương thức đặc biệt, cần ghi rõ:
- Điều kiện để nộp hồ sơ
- Cách tính điểm (nếu có)
- Ngành áp dụng

---

## 10. CHÚ Ý ĐẶC BIỆT THEO NGÀNH (nếu có)

Một số ngành có quy định riêng biệt khác với quy định chung của trường:

| Mã ngành | Tên ngành | Quy định/Điều kiện đặc thù |
|---|---|---|
| ... | ... | Ví dụ: Yêu cầu môn Vẽ, không áp dụng PT3, chỉ tiêu IELTS cao hơn... |

---

## 11. BẢNG TÓM TẮT NHANH CHO AI AGENT

Phần này là bảng tổng hợp DÀNH RIÊNG để AI đọc và tính toán nhanh. Phải điền đầy đủ.

| Thông tin | Giá trị |
|---|---|
| Tên trường | [Tên đầy đủ] |
| Mã trường (TS247) | [Ví dụ: BKA] |
| Năm Đề án | [Năm] |
| Các phương thức xét tuyển | [PT1, PT2, PT3, ...] |
| Thang điểm THPT QG | 30 |
| Thang điểm ĐGNL HSA | 150 (nếu áp dụng) |
| Thang điểm TSA | 150 hoặc 300 (nếu áp dụng) |
| Có nhân hệ số môn chính? | Có / Không |
| Có điểm thưởng ngoại ngữ? | Có / Không |
| Có quy đổi chứng chỉ ngoại ngữ? | Có / Không |
| Điểm sàn tối thiểu THPT QG | [Số điểm] |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ HƯỚNG DẪN THỰC THI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ TÀI LIỆU CÓ 2 PHẦN — ĐỌC CẢ HAI TRƯỚC KHI VIẾT OUTPUT:
  • PART 1 (MarkItDown): Nguồn chính xác cho CÔNG THỨC và CHỮ. Bảng trong PART 1
    có thể bị vỡ định dạng — KHÔNG dùng bảng từ PART 1.
  • PART 2 (LlamaCloud): Nguồn chính xác cho BẢNG BIỂU. Dùng bảng từ PART 2 thay
    thế cho bảng tương ứng trong PART 1. Nếu PART 2 trống → dùng bảng từ PART 1.

1. Đọc TOÀN BỘ tài liệu (cả PART 1 lẫn PART 2) để nắm toàn bộ nội dung.
2. Chỉ giữ lại section liên quan đến tuyển sinh. BỎ QUA section trống.
3. Bảng biểu: LẤY TỪ PART 2 (LlamaCloud) — giữ nguyên tất cả rows, không lược bỏ.
4. Công thức tính điểm: LẤY TỪ PART 1 (MarkItDown) — trích nguyên văn trước,
   sau đó diễn giải bằng ký hiệu toán học.
5. Nếu mâu thuẫn giữa PART 1 và PART 2: GHI CẢ HAI, đánh dấu ⚠️.
6. Output bằng tiếng Việt. Không có câu dẫn. Bắt đầu thẳng vào `# [TÊN TRƯỜNG]...`.

================================================================================
NỘI DUNG TÀI LIỆU THÔ (BẮT ĐẦU TỪ ĐÂY):
================================================================================
"""

SYSTEM_PROMPT = (
    "Bạn là một Chuyên gia Phân tích Dữ liệu Tuyển sinh Đại học Việt Nam cực kỳ tỉ mỉ và chính xác. "
    "Nhiệm vụ của bạn là chắt lọc quy tắc tuyển sinh từ tài liệu thô một cách có cấu trúc."
)

# Khởi tạo model với SYSTEM INSTRUCTION ngắn gọn để định hình vai trò
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    system_instruction=SYSTEM_PROMPT
)



# ============================================================================
# Markdown Normalizer (fixes Gemini single-line output)
# ============================================================================

import re

def normalize_newlines(text: str) -> str:
    """
    Gemini API đôi khi trả về markdown không có ký tự newline chuẩn—
    tất cả nội dung nằm trong 1 dòng dài. Hàm này phục hồi định dạng.
    """
    # Chuẩn hóa CRLF → LF
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Đảm bảo heading H1-H4 có blank line trước và sau
    text = re.sub(r'(?<!\n)(#{1,4} )', r'\n\n\1', text)
    text = re.sub(r'(#{1,4} .+?)(?=\n)', r'\1\n', text)

    # Đã xóa dòng lệnh tự động thêm newline trước '|' vì nó phá nát bảng Markdown.

    # Đảm bảo dấu phân tách --- có newline trước và sau
    text = re.sub(r'(?<!\n)(---+)', r'\n\1', text)
    text = re.sub(r'(---+)(?!\n)', r'\1\n', text)

    # Đảm bảo dấu gạch ngang ━ (decorative divider) có newline
    text = re.sub(r'(?<!\n)(━{3,})', r'\n\1', text)
    text = re.sub(r'(━{3,})(?!\n)', r'\1\n', text)

    # Bullet points phải có newline trước
    text = re.sub(r'(?<!\n)(- )', r'\n\1', text)
    text = re.sub(r'(?<!\n)(\d+\. )', r'\n\1', text)

    # Dọn dẹp blank lines thừa (>2 blank lines → 2 blank lines)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip() + "\n"


# ============================================================================
# Chunking Helpers
# ============================================================================

# Kích thước tối đa mỗi chunk (ký tự). ~40K ký tự ≈ 10K tokens (an toàn)
CHUNK_SIZE = 40_000

# Nếu output < ngưỡng này → coi là lỗi, cần chạy lại
MIN_OUTPUT_CHARS = 500


def split_into_chunks(text: str, chunk_size: int = CHUNK_SIZE) -> List[str]:
    """
    Chia text thành các chunks <= chunk_size ký tự.
    Cố gắng cắt tại ranh giới dòng để tránh vỡ giữa bảng.
    """
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            # Tìm newline gần nhất để cắt gọn
            newline_pos = text.rfind("\n", start, end)
            if newline_pos > start:
                end = newline_pos + 1
        chunks.append(text[start:end])
        start = end
    return chunks


CHUNK_PROMPT_TEMPLATE = """\
Bạn là chuyên gia trích xuất dữ liệu tuyển sinh đại học.
Đây là PHẦN {chunk_idx}/{total_chunks} của tài liệu đề án tuyển sinh.

NHIỆM VỤ: Trích xuất TẤT CẢ thông tin tuyển sinh trong đoạn này ra định dạng Markdown cấu trúc.
- Giữ NGUYÊN VẸN tất cả con số, tỷ lệ, điểm chuẩn, mã ngành, mã phương thức.
- Giữ NGUYÊN VẸN tất cả bảng biểu (Markdown table format).
- Giữ NGUYÊN VẸN tất cả công thức tính điểm.
- KHÔNG thêm, KHÔNG bịa, KHÔNG lược bỏ dữ liệu.
- Nếu đoạn này không chứa thông tin tuyển sinh (ví dụ: danh sách việc làm, cam kết chất lượng) → trả về chuỗi rỗng.

OUTPUT: Markdown thuần túy, tiếng Việt.

NỘI DUNG CẦN TRÍCH XUẤT:
================================================================================
{chunk_content}
================================================================================
"""


def call_gemini_with_retry(prompt: str, retries: int = 2) -> str:
    """Gọi Gemini với retry đơn giản nếu thất bại."""
    for attempt in range(retries + 1):
        try:
            # Tắt toàn bộ Safety Filters để tránh bị chặn bởi các từ khóa chuyên ngành như "Kỹ thuật Hạt nhân"
            safety_settings = [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
            ]
            response = model.generate_content(
                prompt,
                safety_settings=safety_settings,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,  # Tăng nhẹ để tránh bị kẹt output
                ),
            )
            try:
                # Tránh lỗi ValueError khi parts rỗng
                if response.candidates:
                    first_candidate = response.candidates[0]
                    
                    if first_candidate.finish_reason != 1:
                        print(f"   ⚠️  CẢNH BÁO: Gemini dừng bất thường (finish_reason={first_candidate.finish_reason}). "
                              f"Có thể do bộ lọc Safety hoặc Max Tokens.")
                              
                    if not first_candidate.content.parts:
                        print(f"   ⚠️  Lần {attempt+1} trả về kết quả rỗng (finish_reason={first_candidate.finish_reason}). Thử lại...")
                        if attempt < retries:
                            continue
                        return ""
                return response.text or ""
            except ValueError as ve:
                print(f"   ⚠️  Lần {attempt+1} lỗi trích xuất text: {ve}. Thử lại...")
                if attempt < retries:
                    continue
                return ""
        except Exception as e:
            if attempt < retries:
                print(f"   ⚠️  Lần {attempt+1} thất bại: {e}. Thử lại...")
            else:
                raise
    return ""  # fallback


# ============================================================================
# Main Logic
# ============================================================================

def clean_admission_rules(force_reprocess: bool = False):
    base_dir = Path(__file__).parent.parent
    processed_dir = base_dir / "data" / "processed_rules"

    if not processed_dir.exists():
        print(f"❌ Thư mục không tồn tại: {processed_dir}")
        return

    # Hỗ trợ cả 2 naming convention:
    # - Pipeline mới (ingest_pdf.py):     <UNI>_DeAn<YEAR>.md
    # - Pipeline cũ (đặt tên _raw.md):   <UNI>_DeAn<YEAR>_raw.md
    raw_files_new = [
        f for f in processed_dir.glob("*.md")
        if not f.name.endswith("_clean.md") and not f.name.endswith("_raw.md")
    ]
    raw_files_old = list(processed_dir.glob("*_raw.md"))
    raw_files = raw_files_new + raw_files_old

    if not raw_files:
        print(
            "⚠️  Không tìm thấy file .md nào để xử lý!\n"
            f"   Hãy chạy scripts/ingest_pdf.py trước để tạo file Markdown thô.\n"
            f"   Thư mục kiểm tra: {processed_dir}"
        )
        return

    print(f"🔍 Tìm thấy {len(raw_files)} file Markdown thô. Bắt đầu 'lọc vàng' bằng Gemini...")

    for raw_path in sorted(raw_files):
        # Tạo tên file output
        if raw_path.name.endswith("_raw.md"):
            clean_filename = raw_path.name.replace("_raw.md", "_clean.md")
        else:
            clean_filename = raw_path.stem + "_clean.md"

        clean_path = processed_dir / clean_filename

        # Kiểm tra file đã tồn tại và có nội dung hợp lệ
        if clean_path.exists() and not force_reprocess:
            existing_size = clean_path.stat().st_size
            if existing_size >= MIN_OUTPUT_CHARS:
                print(f"⏭️  File {clean_filename} đã tồn tại ({existing_size:,} bytes) → bỏ qua.")
                continue
            else:
                print(f"♻️  File {clean_filename} tồn tại nhưng quá nhỏ ({existing_size} bytes) → xử lý lại.")

        print(f"\n{'=' * 65}")
        print(f"🤖 Đang xử lý: {raw_path.name}")
        print(f"{'=' * 65}")

        try:
            # Đọc nội dung thô
            with open(raw_path, "r", encoding="utf-8") as f:
                raw_content = f.read()

            if not raw_content.strip():
                print(f"⚠️  File {raw_path.name} rỗng — bỏ qua.")
                continue

            char_count = len(raw_content)
            print(f"   📄 Kích thước: {char_count:,} ký tự (~{char_count // 4:,} tokens)")

            # ── Chiến lược: Full-context trong 1 lần gọi Gemini ────────
            # Gemini 2.5 Flash có context window 1M tokens.
            # File 205K ký tự ≈ 51K tokens → nằm gọn trong context.
            # KHÔNG chunk: để Gemini đọc cả PART 1 (công thức) + PART 2
            # (bảng LlamaCloud) cùng lúc, sau đó merge thông minh.
            # ──────────────────────────────────────────────────────────────
            print(f"   ⚡ Gọi Gemini 1 lần với full context ({char_count:,} ký tự)...")
            trigger_prompt = (
                "\n\n================================================================================\n"
                "KẾT THÚC TÀI LIỆU THÔ.\n\n"
                "Dựa vào nội dung tài liệu thô cung cấp ở trên, HÃY BẮT ĐẦU TRÍCH XUẤT VÀ TRẢ VỀ TOÀN BỘ KẾT QUẢ DƯỚI ĐỊNH DẠNG "
                "MARKDOWN CÓ CẤU TRÚC THEO ĐÚNG YÊU CẦU CỦA ĐOẠN 'MASTER PROMPT' Ở TRÊN NGAY BÂY GIỜ.\n"
                "LƯU Ý ĐẶC BIỆT TRÁNH LỖI ĐỨT GÃY: BẠN PHẢI SINH TOÀN BỘ VĂN BẢN CHO ĐẾN KHI HOÀN THÀNH MỤC '11. BẢNG TÓM TẮT NHANH CHO AI AGENT'.\n"
                "NẾU TÀI LIỆU BỊ THIẾU THÔNG TIN Ở BẤT KỲ MỤC/CỘT NÀO TRONG BẢNG, HÃY GHI 'Không có thông tin chi tiết' VÀ TIẾP TỤC, TUYỆT ĐỐI KHÔNG DỪNG LẠI GIỮA CHỪNG.\n"
            )
            data_section = "NỘI DUNG TÀI LIỆU THÔ (BẮT ĐẦU TỪ ĐÂY):\n================================================================================\n" + raw_content + trigger_prompt
            
            # Gộp MASTER_PROMPT và tài liệu thô vào user_prompt để tránh thất thoát chỉ thị
            full_user_prompt = MASTER_PROMPT + "\n\n" + data_section
            clean_content = normalize_newlines(call_gemini_with_retry(full_user_prompt))

            # Kiểm tra output có hợp lệ không
            out_chars = len(clean_content)
            if out_chars < MIN_OUTPUT_CHARS:
                print(f"   ❌ Output quá nhỏ ({out_chars} ký tự) — có thể Gemini gặp lỗi. Không lưu file.")
                print(f"   👉 Nội dung Gemini trả về:\n{clean_content}\n")
                debug_path = processed_dir / (raw_path.stem + "_debug_short.md")
                with open(debug_path, "w", encoding="utf-8") as f:
                    f.write(clean_content)
                print(f"   (Đã lưu nội dung ngắn vào {debug_path.name})")
                print(f"      Hãy kiểm tra GOOGLE_API_KEY và thử lại.")
                continue

            # Lưu file đã làm sạch
            with open(clean_path, "w", encoding="utf-8") as f:
                f.write(clean_content)

            print(f"   ✅ Hoàn thành! Đã lưu: {clean_filename}")
            print(f"      Input: {char_count:,} ký tự → Output: {out_chars:,} ký tự")
            print(f"      Tỷ lệ nén: {(1 - out_chars/char_count)*100:.1f}%")

        except Exception as e:
            print(f"   ❌ Lỗi khi xử lý {raw_path.name}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\n{'=' * 65}")
    print("🏁 Hoàn tất! Kiểm tra thư mục:")
    print(f"   {processed_dir}")
    print("   → Các file *_clean.md là input cho build_vector_db.py")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    # Thêm --force để ghi đè file đã tồn tại
    import sys
    force = "--force" in sys.argv
    if force:
        print("⚡ Chế độ FORCE: sẽ ghi đè tất cả file *_clean.md hiện có.")
    clean_admission_rules(force_reprocess=force)