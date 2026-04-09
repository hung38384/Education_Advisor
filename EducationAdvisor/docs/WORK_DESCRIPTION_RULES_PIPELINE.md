# Mô tả phần việc đang làm: Chuẩn hoá pipeline đọc đề án tuyển sinh (OCR → Structured Extraction → Vector Search)

## 1) Bối cảnh và mục tiêu

Phần việc hiện tại đang tập trung vào việc nâng chất lượng đọc hiểu dữ liệu từ PDF đề án tuyển sinh để agent trả lời chính xác hơn.

Mục tiêu chính:
- Đọc tốt hơn các PDF scan/ảnh (bổ sung OCR).
- Trích xuất dữ liệu theo cấu trúc ổn định (không chỉ văn bản tự do).
- Có cơ chế đánh giá regression để phát hiện tụt chất lượng.
- Tăng chất lượng truy vấn ở tầng vector DB bằng metadata giàu ngữ nghĩa.

---

## 2) Luồng hiện tại đang hoạt động như thế nào

### Bước A — Parse PDF sang raw markdown
- File: `backend/scripts/parse_pdf.py`
- Luồng:
  1. Đọc PDF trong `backend/data/raw_pdfs`.
  2. Chạy OCR (`ocrmypdf`) để tạo bản trung gian trong `backend/data/ocr_pdfs`.
  3. Nếu OCR lỗi, fallback về PDF gốc.
  4. Gửi input (OCR hoặc RAW) vào LlamaParse.
  5. Ghi ra `*_raw.md` trong `backend/data/processed_rules`.

### Bước B — Làm sạch và trích xuất structured data
- File: `backend/scripts/clean_rules_llm.py`
- Luồng:
  1. Đọc `*_raw.md`.
  2. Trích xuất theo nhiều bước (methods/prerequisites/formulas/conversions/tuition/tie-breakers).
  3. Normalize dữ liệu (method_code, amount, coefficients, bonus, source_evidence...).
  4. Validate đối chiếu tín hiệu từ raw.
  5. Xuất đồng thời:
     - `*_structured.json` (máy đọc được)
     - `*_clean.md` (người đọc dễ hiểu)

### Bước C — Build vector DB để phục vụ truy vấn
- File: `backend/scripts/build_vector_db.py`
- Luồng:
  1. Đọc các file `*_clean.md`.
  2. Chunk theo header markdown.
  3. Nạp metadata từ tên file + metadata bổ sung từ `*_structured.json`.
  4. Build Chroma collection `admission_rules`.

### Bước D — Runtime trả lời câu hỏi user
- Files: `backend/app/ai/graph.py`, `backend/app/ai/tools/tools.py`
- Luồng:
  1. User hỏi.
  2. Agent gọi tool `search_admission_rules`.
  3. Tool chạy similarity search trên Chroma.
  4. Trả về chunk + metadata để LLM tổng hợp response cuối cùng.

### Bước E — Đánh giá regression chất lượng extraction (trạng thái hiện tại)
- Trạng thái: **đang triển khai / chưa có đủ artifact trong working tree hiện tại**.
- Hiện **chưa thấy** trong working tree hiện tại:
  - `backend/scripts/evaluate_rules_extraction.py`
  - `backend/tests/fixtures/extraction_eval/regression_eval_cases.json`
  - `backend/tests/fixtures/golden/*_expected_structured.json`
- Vai trò mục tiêu của bước này: đo metric và fail nhanh khi tụt chất lượng khi artifact được bổ sung đầy đủ.

---

## 3) So sánh trước và hiện tại

| Hạng mục | Trước đây | Hiện tại |
|---|---|---|
| Parse PDF | Parse trực tiếp PDF gốc | OCR trước parse, có fallback RAW |
| Clean rules | 1 prompt lớn sinh `_clean.md` | Multi-step extraction + normalize + validate |
| Dữ liệu output | Chủ yếu text sạch | Có thêm `_structured.json` chuẩn schema |
| Vector metadata | `university/year/source` cơ bản | Thêm `structured_sections`, `count_*`, `has_structured` |
| Regression QA | Chưa có gate rõ | Đang triển khai; chưa có đủ script/case eval/golden fixture trong working tree hiện tại |

---

## 4) Ví dụ cụ thể (trước vs hiện tại)

## Ví dụ 1 — Parse PDF

### Trước đây
- Parse trực tiếp file PDF gốc:

```python
# parse_pdf.py (old)
documents = parser.load_data(str(pdf_path))
```

### Hiện tại
- Ưu tiên OCR trước, nếu OCR fail thì fallback:

```python
# parse_pdf.py (current)
ok, error = _run_ocr(pdf_path, ocr_pdf_path)
if ok and ocr_pdf_path.exists():
    parse_input_path = ocr_pdf_path
else:
    parse_input_path = pdf_path

documents = parser.load_data(str(parse_input_path))
```

---

## Ví dụ 2 — Clean rules extraction

### Trước đây
- Dùng một prompt lớn, trả về markdown sạch:

```python
# clean_rules_llm.py (old)
response = model.generate_content(full_prompt)
with open(clean_path, "w", encoding="utf-8") as f:
    f.write(response.text)
```

### Hiện tại
- Trích xuất structured nhiều bước, normalize + validate, rồi mới ghi output:

```python
# clean_rules_llm.py (current)
structured = extract_structured_data(raw_path.name, raw_content, extractor)
structured = normalize_structured_data(structured)
errors = validate_structured_data(raw_content, structured)

structured_path.write_text(json.dumps(structured, ensure_ascii=False, indent=2), encoding="utf-8")
clean_path.write_text(render_clean_markdown(structured, source_name=raw_path.name), encoding="utf-8")
```

---

## Ví dụ 3 — Metadata trong vector DB

### Trước đây
- Chunk metadata chủ yếu:

```json
{
  "university": "TMU",
  "year": "2025",
  "source": "TMU_DeAn2025_clean.md"
}
```

### Hiện tại
- Có thêm metadata từ `*_structured.json`:

```json
{
  "university": "TMU",
  "year": "2025",
  "source": "TMU_DeAn2025_clean.md",
  "has_structured": true,
  "structured_sections": ["admission_methods", "conversions", "formulas", "prerequisites", "source_evidence", "tie_breakers", "tuition_facts"],
  "count_admission_methods": 2,
  "count_formulas": 1,
  "count_conversions": 1,
  "count_tuition_facts": 1
}
```

---

## 5) Tác động đến response cuối cùng

Nhờ luồng mới:
- Dữ liệu vào sạch và ổn định hơn (đặc biệt với PDF scan).
- Structured data giúp kiểm soát chất lượng extraction tốt hơn.
- Metadata giàu hơn giúp truy vấn vector đúng ngữ cảnh hơn.
- Regression eval giúp giảm rủi ro “sửa một chỗ hỏng chỗ khác”.

Lưu ý: response runtime vẫn lấy từ Chroma/tool-calling; fixture eval/golden chủ yếu phục vụ kiểm thử và kiểm định chất lượng pipeline.

---

## 6) Các lệnh vận hành liên quan

```bash
# 1) Parse PDF -> raw
python backend/scripts/parse_pdf.py

# 2) Clean + structured extraction
python backend/scripts/clean_rules_llm.py

# 3) Build vector DB
python backend/scripts/build_vector_db.py

# 4) Regression evaluation (planned - chưa có script trong working tree hiện tại)
# python backend/scripts/evaluate_rules_extraction.py
```

---

## 7) Đường đi dữ liệu chi tiết theo file/hàm khởi tạo (không dùng sơ đồ)

### 7.1. Giai đoạn Parse OCR → Raw Markdown

- **File khởi tạo:** `backend/scripts/parse_pdf.py:160`
- **Hàm entrypoint:** `parse_all_pdfs_to_md()` tại `backend/scripts/parse_pdf.py:54`

Luồng dữ liệu:
1. Đọc toàn bộ PDF trong `backend/data/raw_pdfs`.
2. Với từng file, gọi `_run_ocr()` (`backend/scripts/parse_pdf.py:31`).
3. `_run_ocr()` dựng command qua `_build_ocr_command()` (`backend/scripts/parse_pdf.py:20`) rồi chạy `ocrmypdf` bằng `subprocess.run`.
4. Nếu OCR thành công, input parse là file trong `backend/data/ocr_pdfs/*_ocr.pdf`; nếu thất bại thì fallback về PDF gốc.
5. Gọi `LlamaParse.load_data(...)` để parse markdown (`backend/scripts/parse_pdf.py:138`).
6. Gộp text các trang và ghi ra `backend/data/processed_rules/*_raw.md` (`backend/scripts/parse_pdf.py:150`).

### 7.2. Giai đoạn Structured Extraction + Normalize + Validate

- **File khởi tạo:** `backend/scripts/clean_rules_llm.py:701`
- **Hàm entrypoint:** `clean_admission_rules()` tại `backend/scripts/clean_rules_llm.py:669`

Luồng dữ liệu:
1. Quét toàn bộ `*_raw.md` trong `backend/data/processed_rules`.
2. Với từng file, gọi `process_raw_file()` (`backend/scripts/clean_rules_llm.py:640`).
3. `process_raw_file()` đọc raw markdown, rồi gọi `extract_structured_data()` (`backend/scripts/clean_rules_llm.py:528`).
4. `extract_structured_data()` chạy extraction nhiều bước dựa trên `_step_instructions()` (`backend/scripts/clean_rules_llm.py:472`) và prompt từ `_build_step_prompt()` (`backend/scripts/clean_rules_llm.py:458`), sau đó parse JSON bằng `_safe_json_loads()` (`backend/scripts/clean_rules_llm.py:47`).
5. Kết quả được chuẩn hoá bằng `normalize_structured_data()` (`backend/scripts/clean_rules_llm.py:223`).
6. Kiểm tra nhất quán bằng `validate_structured_data()` (`backend/scripts/clean_rules_llm.py:290`).
7. Nếu hợp lệ, ghi:
   - `*_structured.json` (`backend/scripts/clean_rules_llm.py:658`)
   - `*_clean.md` (`backend/scripts/clean_rules_llm.py:662`)

### 7.3. Giai đoạn Build Vector DB

- **File khởi tạo:** `backend/scripts/build_vector_db.py:372`
- **Hàm entrypoint:** `main()` tại `backend/scripts/build_vector_db.py:314`

Luồng dữ liệu:
1. `find_markdown_files()` lấy danh sách `*_clean.md` (`backend/scripts/build_vector_db.py:65`).
2. `read_markdown_file()` đọc nội dung từng file (`backend/scripts/build_vector_db.py:115`).
3. `chunk_markdown_content()` chunk theo header markdown (`backend/scripts/build_vector_db.py:171`).
4. Trong lúc chunk, nạp metadata từ `*_structured.json` qua `load_structured_metadata()` (`backend/scripts/build_vector_db.py:135`) để enrich metadata.
5. `build_vector_database()` tạo embedding và ghi vào Chroma collection `admission_rules` (`backend/scripts/build_vector_db.py:236`).

### 7.4. Giai đoạn Runtime trả lời câu hỏi

- **File graph:** `backend/app/ai/graph.py`
- **File tools:** `backend/app/ai/tools/tools.py`

Luồng dữ liệu runtime:
1. Trong script kiểm thử graph, câu hỏi được đưa vào `graph.stream(...)` (`backend/app/ai/graph.py:217`).
2. Node `chatbot()` gọi `llm_with_tools.invoke(...)` (`backend/app/ai/graph.py:70`).
3. `tools_condition` quyết định có chuyển sang `ToolNode` (`backend/app/ai/graph.py:97`) để thực thi `search_admission_rules` hay không.
4. `search_admission_rules()` thực hiện `vectorstore.similarity_search(...)` trên Chroma (`backend/app/ai/tools/tools.py:99`).
5. Kết quả gồm chunk + metadata được trả về LLM để tổng hợp đáp án cuối cùng.

### 7.5. Tóm tắt “đầu vào → đầu ra” toàn pipeline

1. `raw_pdfs/*.pdf`
2. `ocr_pdfs/*_ocr.pdf` (nếu OCR thành công)
3. `processed_rules/*_raw.md`
4. `processed_rules/*_structured.json` + `processed_rules/*_clean.md`
5. `data/chroma_db` (collection `admission_rules`)
6. Runtime query → similarity search → final response

> Ghi chú: số dòng tham chiếu trong tài liệu có thể thay đổi khi mã nguồn được chỉnh sửa.
