from __future__ import annotations

import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv
import google.generativeai as genai

ExtractorFn = Callable[[str], str]

RAW_MARKER = "\n\n================ RAW DOCUMENT CONTENT BELOW ================"

STEP_METHODS_PREREQUISITES = "STEP_METHODS_PREREQUISITES"
STEP_FORMULAS = "STEP_FORMULAS"
STEP_CONVERSIONS = "STEP_CONVERSIONS"
STEP_TUITION_FACTS = "STEP_TUITION_FACTS"
STEP_TIE_BREAKERS = "STEP_TIE_BREAKERS"

FORMULA_BONUS_TOKENS = ("uu tien", "bonus", "khuyen khich")


def _remove_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.replace("đ", "d").replace("Đ", "D")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower()


def _extract_json_object(value: str) -> str:
    stripped = value.strip()

    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end < start:
        return "{}"

    return stripped[start : end + 1]


def _safe_json_loads(value: str) -> dict[str, Any]:
    try:
        return json.loads(_extract_json_object(value))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON from extractor: {exc}") from exc


def normalize_tuition_amount(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)

    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    match = re.search(r"\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?", text)
    if not match:
        return None

    number = match.group(0)

    if "," in number and "." in number:
        last_comma = number.rfind(",")
        last_dot = number.rfind(".")
        decimal_separator = "," if last_comma > last_dot else "."
        thousand_separator = "." if decimal_separator == "," else ","
        number = number.replace(thousand_separator, "")
        number = number.replace(decimal_separator, ".")
    elif "," in number:
        parts = number.split(",")
        if len(parts) > 1 and all(len(part) == 3 for part in parts[1:]):
            number = "".join(parts)
        else:
            number = number.replace(",", ".")
    elif "." in number:
        parts = number.split(".")
        if len(parts) > 1 and all(len(part) == 3 for part in parts[1:]):
            number = "".join(parts)

    try:
        return float(number)
    except ValueError:
        return None


def _normalize_method_code(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _build_source_evidence(raw_value: Any) -> list[dict[str, Any]]:
    if isinstance(raw_value, list):
        evidence_list: list[dict[str, Any]] = []
        for item in raw_value:
            if isinstance(item, dict):
                evidence_list.append(item)
            elif isinstance(item, str) and item.strip():
                evidence_list.append({"quote": item.strip()})
        return evidence_list

    if isinstance(raw_value, str) and raw_value.strip():
        return [{"quote": raw_value.strip()}]

    return []


def _extract_formula_bonus(expression: str) -> float | None:
    text = _remove_accents(expression)

    for token in FORMULA_BONUS_TOKENS:
        match = re.search(rf"{token}\s*[:=]?\s*(\d+(?:[\.,]\d+)?)", text)
        if match:
            return normalize_tuition_amount(match.group(1))

    return None


def _parse_formula_expression(
    expression: str,
) -> tuple[list[str], dict[str, float], float | None]:
    if not isinstance(expression, str) or not expression.strip():
        return [], {}, None

    normalized_expr = _remove_accents(expression)
    tokens = re.findall(r"[a-zA-ZÀ-ỹđĐ]+", expression)

    subjects: list[str] = []
    coefficients: dict[str, float] = {}

    for token in tokens:
        token_clean = token.strip()
        token_ascii = _remove_accents(token_clean)

        if token_ascii in {
            "toan",
            "van",
            "anh",
            "ly",
            "hoa",
            "sinh",
            "su",
            "dia",
            "gdcd",
            "tin",
            "congnghe",
        }:
            canonical = token_clean.capitalize()
            if canonical not in subjects:
                subjects.append(canonical)

    for subject in subjects:
        subject_ascii = _remove_accents(subject)
        match = re.search(
            rf"{subject_ascii}\s*\*\s*(\d+(?:[\.,]\d+)?)", _remove_accents(expression)
        )
        if match:
            coeff = normalize_tuition_amount(match.group(1))
            coefficients[subject] = coeff if coeff is not None else 1.0
        else:
            coefficients[subject] = 1.0

    bonus = _extract_formula_bonus(normalized_expr)
    return subjects, coefficients, bonus


def _normalize_formula_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized_item = dict(item)
    expression = str(normalized_item.get("expression") or "").strip()
    normalized_item["expression"] = expression

    subjects, coefficients, bonus = _parse_formula_expression(expression)

    if isinstance(normalized_item.get("subjects"), list):
        subjects = [
            str(s).strip()
            for s in normalized_item.get("subjects", [])
            if str(s).strip()
        ] or subjects

    if isinstance(normalized_item.get("coefficients"), dict):
        parsed_coefficients: dict[str, float] = {}
        for key, value in normalized_item["coefficients"].items():
            parsed = normalize_tuition_amount(value)
            if parsed is not None:
                parsed_coefficients[str(key)] = parsed
        if parsed_coefficients:
            coefficients = parsed_coefficients

    if isinstance(normalized_item.get("bonus"), (int, float, str)):
        parsed_bonus = normalize_tuition_amount(normalized_item.get("bonus"))
        bonus = parsed_bonus if parsed_bonus is not None else bonus

    tie_breakers = normalized_item.get("tie_breakers")
    if not isinstance(tie_breakers, list):
        tie_breakers = []

    if not tie_breakers:
        expression_ascii = _remove_accents(expression)
        if "neu bang diem" in expression_ascii and "toan" in expression_ascii:
            tie_breakers = [{"condition": "equal_score", "priority_subject": "Toán"}]

    source_evidence = _build_source_evidence(normalized_item.get("source_evidence"))

    normalized_item["subjects"] = subjects
    normalized_item["coefficients"] = coefficients
    normalized_item["bonus"] = bonus
    normalized_item["tie_breakers"] = tie_breakers
    normalized_item["source_evidence"] = source_evidence

    return normalized_item


def normalize_structured_data(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)

    methods = normalized.get("admission_methods")
    if isinstance(methods, list):
        for item in methods:
            if not isinstance(item, dict):
                continue
            item["method_code"] = _normalize_method_code(item.get("method_code"))
            item["source_evidence"] = _build_source_evidence(
                item.get("source_evidence")
            )

    formulas = normalized.get("formulas")
    if isinstance(formulas, list):
        normalized["formulas"] = [
            _normalize_formula_item(item) if isinstance(item, dict) else item
            for item in formulas
        ]

    tuition_facts = normalized.get("tuition_facts")
    if isinstance(tuition_facts, list):
        for item in tuition_facts:
            if not isinstance(item, dict):
                continue
            item["amount"] = normalize_tuition_amount(item.get("amount"))
            item["source_evidence"] = _build_source_evidence(
                item.get("source_evidence")
            )

    tie_breakers = normalized.get("tie_breakers")
    if isinstance(tie_breakers, list):
        normalized_tie_breakers: list[dict[str, Any]] = []
        for item in tie_breakers:
            if not isinstance(item, dict):
                continue
            item_copy = dict(item)
            item_copy["source_evidence"] = _build_source_evidence(
                item_copy.get("source_evidence")
            )
            normalized_tie_breakers.append(item_copy)
        normalized["tie_breakers"] = normalized_tie_breakers
    else:
        normalized["tie_breakers"] = []

    source_evidence = normalized.get("source_evidence")
    normalized["source_evidence"] = _build_source_evidence(source_evidence)

    return normalized


def _has_tuition_signal(raw_content: str) -> bool:
    text = _remove_accents(raw_content)
    return any(token in text for token in ("hoc phi", "trieu dong", "dong/nam", "vnd"))


def _extract_method_codes_from_raw(raw_content: str) -> set[str]:
    text = _remove_accents(raw_content)
    candidates = re.findall(r"phuong thuc\s*(?:xet tuyen\s*)?(\d{3})", text)
    return {candidate.strip() for candidate in candidates}


def _has_formula_signal(raw_content: str) -> bool:
    text = _remove_accents(raw_content)
    return any(token in text for token in ("cong thuc", "tinh diem", "he so"))


def validate_structured_data(raw_content: str, structured: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    tuition_facts = structured.get("tuition_facts")
    has_tuition_facts = isinstance(tuition_facts, list) and len(tuition_facts) > 0

    top_level_tie_breakers = structured.get("tie_breakers")
    has_tie_breakers = (
        isinstance(top_level_tie_breakers, list) and len(top_level_tie_breakers) > 0
    )

    if _has_tuition_signal(raw_content) and not has_tuition_facts:
        errors.append("Thiếu tuition_facts dù raw có tín hiệu học phí.")

    if has_tuition_facts:
        valid_amount_count = 0
        for item in tuition_facts:
            if isinstance(item, dict) and isinstance(item.get("amount"), (int, float)):
                valid_amount_count += 1
        if valid_amount_count == 0:
            errors.append("tuition_facts có dữ liệu nhưng không có amount hợp lệ.")

    raw_method_codes = _extract_method_codes_from_raw(raw_content)
    structured_method_codes: set[str] = set()
    methods = structured.get("admission_methods")
    if isinstance(methods, list):
        for item in methods:
            if isinstance(item, dict):
                method_code = _normalize_method_code(item.get("method_code"))
                if method_code:
                    structured_method_codes.add(method_code)

    missing_method_codes = sorted(
        code for code in raw_method_codes if code not in structured_method_codes
    )
    if missing_method_codes:
        errors.append(
            "Thiếu method_code trong structured so với raw: "
            + ", ".join(missing_method_codes)
        )

    formulas = structured.get("formulas")
    if _has_formula_signal(raw_content):
        has_complete_formula = False
        has_formula_tie_breakers = False
        has_formula_source_evidence = False
        if isinstance(formulas, list):
            for item in formulas:
                if not isinstance(item, dict):
                    continue
                expression = str(item.get("expression") or "").strip()
                subjects = item.get("subjects")
                coefficients = item.get("coefficients")
                tie_breakers = item.get("tie_breakers")
                source_evidence = item.get("source_evidence")

                if (
                    expression
                    and isinstance(subjects, list)
                    and isinstance(coefficients, dict)
                    and subjects
                    and coefficients
                ):
                    has_complete_formula = True
                if isinstance(tie_breakers, list) and tie_breakers:
                    has_formula_tie_breakers = True
                if isinstance(source_evidence, list) and source_evidence:
                    has_formula_source_evidence = True

        if not has_complete_formula:
            errors.append(
                "Thiếu formula đầy đủ (expression/subjects/coefficients) dù raw có tín hiệu công thức."
            )

        raw_ascii = _remove_accents(raw_content)
        if "neu bang diem" in raw_ascii and not (
            has_formula_tie_breakers or has_tie_breakers
        ):
            errors.append(
                "Raw có tín hiệu tie-breaker nhưng structured thiếu tie_breakers."
            )

        if not has_formula_source_evidence and not structured.get("source_evidence"):
            errors.append("Thiếu source_evidence cho phần formulas.")

    return errors


def _render_list(items: list[Any], empty_text: str = "Không có dữ liệu.") -> list[str]:
    if not items:
        return [f"- {empty_text}"]
    return [f"- {item}" for item in items]


def render_clean_markdown(structured: dict[str, Any], source_name: str = "") -> str:
    methods = structured.get("admission_methods") or []
    prerequisites = structured.get("prerequisites") or []
    formulas = structured.get("formulas") or []
    conversions = structured.get("conversions") or []
    tuition_facts = structured.get("tuition_facts") or []

    lines: list[str] = ["# Quy tắc xét tuyển đã chuẩn hoá"]
    if source_name:
        lines.append("")
        lines.append(f"Nguồn: {source_name}")

    lines.extend(["", "## 1. Các phương thức xét tuyển"])
    if methods:
        for item in methods:
            if isinstance(item, dict):
                code = item.get("method_code") or ""
                name = item.get("method_name") or ""
                if code and name:
                    lines.append(f"- [{code}] {name}")
                elif name:
                    lines.append(f"- {name}")
                elif code:
                    lines.append(f"- Mã phương thức: {code}")
    else:
        lines.append("- Không có dữ liệu.")

    lines.extend(["", "## 2. Điều kiện tiên quyết"])
    lines.extend(_render_list(prerequisites))

    lines.extend(["", "## 3. Công thức tính điểm xét tuyển"])
    if formulas:
        for item in formulas:
            if isinstance(item, dict):
                name = item.get("name") or "Công thức"
                expression = item.get("expression") or ""
                lines.append(f"- {name}: {expression}".strip())
            else:
                lines.append(f"- {item}")
    else:
        lines.append("- Không có dữ liệu.")

    lines.extend(["", "## 4. Bảng quy đổi chứng chỉ ngoại ngữ"])
    if conversions:
        for item in conversions:
            if isinstance(item, dict):
                from_value = item.get("from") or ""
                to_value = item.get("to") or ""
                lines.append(f"- {from_value} -> {to_value}".strip())
            else:
                lines.append(f"- {item}")
    else:
        lines.append("- Không có dữ liệu.")

    lines.extend(["", "## 5. Học phí"])
    if tuition_facts:
        for item in tuition_facts:
            if isinstance(item, dict):
                program = item.get("program_name") or "Chương trình"
                amount = item.get("amount")
                unit = item.get("unit") or "triệu đồng/năm"
                if isinstance(amount, (int, float)):
                    lines.append(f"- {program}: {amount:g} {unit}")
                else:
                    lines.append(f"- {program}: {unit}")
            else:
                lines.append(f"- {item}")
    else:
        lines.append("- Không có dữ liệu.")

    lines.append("")
    return "\n".join(lines)


def _build_step_prompt(
    raw_filename: str, step_marker: str, instruction: str, raw_content: str
) -> str:
    return (
        f"{step_marker}\n"
        "Bạn là chuyên gia trích xuất dữ liệu đề án tuyển sinh.\n"
        f"Tệp nguồn: {raw_filename}\n"
        "Chỉ trả về JSON hợp lệ, không thêm giải thích.\n"
        f"Yêu cầu: {instruction}\n"
        f"{RAW_MARKER}\n\n"
        f"{raw_content}"
    )


def _step_instructions() -> list[tuple[str, str]]:
    return [
        (
            STEP_METHODS_PREREQUISITES,
            (
                "Trích xuất admission_methods và prerequisites, kèm source_evidence nếu có. "
                'JSON mẫu: {"admission_methods":[{"method_code":"409","method_name":"...","source_evidence":[{"quote":"..."}]}],"prerequisites":["..."],"source_evidence":[{"quote":"..."}]}'
            ),
        ),
        (
            STEP_FORMULAS,
            (
                "Trích xuất formulas và tie_breakers, kèm source_evidence nếu có. "
                'JSON mẫu: {"formulas":[{"name":"THPT","expression":"(Toan+Van+Anh)/3","tie_breakers":[{"condition":"equal_score","priority_subject":"Toán"}],"source_evidence":[{"quote":"..."}]}],"tie_breakers":[{"condition":"equal_score","priority_subject":"Toán"}]}'
            ),
        ),
        (
            STEP_CONVERSIONS,
            (
                "Trích xuất conversions cho quy đổi chứng chỉ, kèm source_evidence nếu có. "
                'JSON mẫu: {"conversions":[{"from":"IELTS 6.5","to":"9.5 điểm tiếng Anh","source_evidence":[{"quote":"..."}]}]}'
            ),
        ),
        (
            STEP_TUITION_FACTS,
            (
                "Trích xuất tuition_facts, kèm source_evidence nếu có. "
                'JSON mẫu: {"tuition_facts":[{"program_name":"Ngôn ngữ Anh","amount":"22,9","unit":"triệu đồng/năm","source_evidence":[{"quote":"..."}]}]}'
            ),
        ),
        (
            STEP_TIE_BREAKERS,
            (
                "Trích xuất tie_breakers tổng quát của đề án. "
                'JSON mẫu: {"tie_breakers":[{"condition":"equal_score","priority_subject":"Toán","source_evidence":[{"quote":"..."}]}]}'
            ),
        ),
    ]


def _get_default_extractor() -> ExtractorFn:
    load_dotenv()
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Không tìm thấy GOOGLE_API_KEY trong file .env")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")

    def _extract(prompt: str) -> str:
        response = model.generate_content(prompt)
        return getattr(response, "text", "") or ""

    return _extract


def extract_structured_data(
    raw_filename: str, raw_content: str, extractor: ExtractorFn
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "admission_methods": [],
        "prerequisites": [],
        "formulas": [],
        "conversions": [],
        "tuition_facts": [],
        "tie_breakers": [],
        "source_evidence": [],
    }

    for marker, instruction in _step_instructions():
        prompt = _build_step_prompt(raw_filename, marker, instruction, raw_content)
        response_text = extractor(prompt)
        payload = _safe_json_loads(response_text)

        for key in result.keys():
            value = payload.get(key)
            if isinstance(value, list):
                result[key].extend(value)

    return result


def compute_field_metrics(
    gold_structured: dict[str, Any], predicted_structured: dict[str, Any]
) -> dict[str, float]:
    def _safe_div(numerator: float, denominator: float) -> float:
        if denominator == 0:
            return 0.0
        return numerator / denominator

    def _coverage_score(predicted_count: float, gold_count: float) -> float:
        if gold_count == 0:
            return 1.0 if predicted_count == 0 else 0.0
        return min(1.0, _safe_div(predicted_count, gold_count))

    gold_methods = {
        code
        for item in gold_structured.get("admission_methods", [])
        if isinstance(item, dict)
        for code in [_normalize_method_code(item.get("method_code"))]
        if code
    }
    pred_methods = {
        code
        for item in predicted_structured.get("admission_methods", [])
        if isinstance(item, dict)
        for code in [_normalize_method_code(item.get("method_code"))]
        if code
    }

    method_tp = float(len(gold_methods & pred_methods))
    method_precision = _safe_div(method_tp, float(len(pred_methods)))
    method_recall = _safe_div(method_tp, float(len(gold_methods)))
    method_f1 = _safe_div(
        2 * method_precision * method_recall, method_precision + method_recall
    )

    def _formula_complete_count(payload: dict[str, Any]) -> int:
        formulas = payload.get("formulas")
        if not isinstance(formulas, list):
            return 0
        count = 0
        for item in formulas:
            if not isinstance(item, dict):
                continue
            expression = str(item.get("expression") or "").strip()
            subjects = item.get("subjects")
            coefficients = item.get("coefficients")
            if (
                expression
                and isinstance(subjects, list)
                and subjects
                and isinstance(coefficients, dict)
                and coefficients
            ):
                count += 1
        return count

    gold_formula_total = float(len(gold_structured.get("formulas", []) or []))
    pred_formula_complete = float(_formula_complete_count(predicted_structured))
    formula_completeness_rate = _safe_div(pred_formula_complete, gold_formula_total)

    gold_tie_breakers = float(len(gold_structured.get("tie_breakers", []) or []))
    pred_tie_breakers = float(len(predicted_structured.get("tie_breakers", []) or []))
    tie_breaker_coverage = _coverage_score(pred_tie_breakers, gold_tie_breakers)

    gold_evidence = float(len(gold_structured.get("source_evidence", []) or []))
    pred_evidence = float(len(predicted_structured.get("source_evidence", []) or []))
    source_evidence_coverage = _coverage_score(pred_evidence, gold_evidence)

    overall_score = (
        method_f1
        + formula_completeness_rate
        + tie_breaker_coverage
        + source_evidence_coverage
    ) / 4.0

    return {
        "method_code_precision": method_precision,
        "method_code_recall": method_recall,
        "method_code_f1": method_f1,
        "formula_completeness_rate": formula_completeness_rate,
        "tie_breaker_coverage": tie_breaker_coverage,
        "source_evidence_coverage": source_evidence_coverage,
        "overall_score": overall_score,
    }


def process_raw_file(
    raw_path: Path, extractor: ExtractorFn | None = None
) -> tuple[Path, Path]:
    extractor = extractor or _get_default_extractor()

    raw_content = raw_path.read_text(encoding="utf-8")
    structured = extract_structured_data(raw_path.name, raw_content, extractor)
    structured = normalize_structured_data(structured)

    errors = validate_structured_data(raw_content, structured)
    if errors:
        raise ValueError("; ".join(errors))

    structured_path = raw_path.with_name(
        raw_path.name.replace("_raw.md", "_structured.json")
    )
    clean_path = raw_path.with_name(raw_path.name.replace("_raw.md", "_clean.md"))

    structured_path.write_text(
        json.dumps(structured, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    clean_path.write_text(
        render_clean_markdown(structured, source_name=raw_path.name), encoding="utf-8"
    )

    return structured_path, clean_path


def clean_admission_rules(
    processed_dir: Path | None = None, extractor: ExtractorFn | None = None
) -> None:
    if processed_dir is None:
        base_dir = Path(__file__).parent.parent
        processed_dir = base_dir / "data" / "processed_rules"

    raw_files = sorted(processed_dir.glob("*_raw.md"))
    if not raw_files:
        print("Không tìm thấy file _raw.md nào để xử lý")
        return

    print(f"Tìm thấy {len(raw_files)} file RAW. Bắt đầu extraction nhiều bước...")

    for raw_path in raw_files:
        structured_path = raw_path.with_name(
            raw_path.name.replace("_raw.md", "_structured.json")
        )
        clean_path = raw_path.with_name(raw_path.name.replace("_raw.md", "_clean.md"))

        if structured_path.exists() and clean_path.exists():
            print(f"Bỏ qua {raw_path.name} vì đã có đủ clean + structured")
            continue

        try:
            out_structured, out_clean = process_raw_file(raw_path, extractor=extractor)
            print(f"Đã tạo: {out_structured.name} và {out_clean.name}")
        except Exception as exc:
            print(f"Lỗi khi xử lý {raw_path.name}: {exc}")


if __name__ == "__main__":
    clean_admission_rules()
