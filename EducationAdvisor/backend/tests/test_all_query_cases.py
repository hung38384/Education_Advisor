from __future__ import annotations

import argparse
import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[1]
GRAPH_FILE_PATH = BASE_DIR / "app" / "ai" / "graph.py"


@dataclass(frozen=True)
class QueryCase:
    case_id: str
    user_query: str


DEFAULT_QUERY_CASES: tuple[QueryCase, ...] = (
    QueryCase(
        case_id="BKA",
        user_query=(
            "Năm 2024 ngành IT1 của Bách Khoa lấy bao nhiêu điểm? "
            "Và nếu mình có IELTS 6.5 thì được quy đổi ra mấy điểm tiếng Anh thay cho môn thi THPT?"
        ),
    ),
    QueryCase(
        case_id="TMU",
        user_query=(
            "Năm 2025 ngành TM34 của Đại học Thương mại lấy bao nhiêu điểm? "
            "Và nếu mình có IELTS Academic 7.0 thì được quy đổi ra mấy điểm tiếng Anh thay cho môn thi THPT?"
        ),
    ),
    QueryCase(
        case_id="CTU",
        user_query=(
            "Năm 2025 ngành 7340121 của Đại học Cần Thơ lấy bao nhiêu điểm? "
            "Và nếu mình có học bạ hoặc V-SAT thì được xét tuyển như thế nào?"
        ),
    ),
)


def _load_graph_from_file() -> Any:
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))

    spec = importlib.util.spec_from_file_location("app_ai_graph_file", GRAPH_FILE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Không thể load graph module từ {GRAPH_FILE_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    loaded_graph = getattr(module, "graph", None)
    if loaded_graph is None:
        raise RuntimeError(f"Module {GRAPH_FILE_PATH} không export biến graph")

    return loaded_graph


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        lines: list[str] = []
        for item in content:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    lines.append(text)
            elif isinstance(item, dict):
                text = str(item.get("text", "")).strip()
                if text:
                    lines.append(text)
        return "\n".join(lines).strip()

    if isinstance(content, dict):
        return str(content.get("text", "")).strip()

    return ""


def _run_single_case(graph: Any, case: QueryCase, index: int, total: int) -> bool:
    print("\n" + "=" * 80)
    print(f"CASE {index}/{total}: {case.case_id}")
    print("USER QUERY:")
    print(case.user_query)
    print("-" * 80)

    query_for_graph = case.user_query
    if case.case_id in {"BKA", "TMU", "CTU"}:
        query_for_graph = f"{case.user_query}\n\n[Mã trường: {case.case_id}]"

    try:
        events = graph.stream({"messages": [("user", query_for_graph)]}, stream_mode="values")

        final_response = ""
        fallback_response = ""

        for event in events:
            messages = event.get("messages", [])
            if not messages:
                continue

            message = messages[-1]
            content_text = _extract_text(getattr(message, "content", ""))
            if not content_text:
                continue

            message_type = type(message).__name__
            tool_calls = getattr(message, "tool_calls", None)

            if message_type == "AIMessage" and not tool_calls:
                final_response = content_text
            else:
                fallback_response = content_text

        print("RESPONSE:")
        print(final_response or fallback_response or "(Không có nội dung trả về)")
        print("=" * 80)
        return True

    except Exception as exc:
        print("RESPONSE:")
        print(f"(Lỗi khi chạy case {case.case_id}: {exc})")
        print("=" * 80)
        return False


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Chạy query -> response để kiểm tra nhanh pipeline hiện tại.",
    )

    exclusive = parser.add_mutually_exclusive_group()
    exclusive.add_argument(
        "--query",
        type=str,
        default="",
        help="Chạy 1 câu query tùy chỉnh.",
    )
    exclusive.add_argument(
        "--case",
        type=str,
        choices=[case.case_id for case in DEFAULT_QUERY_CASES],
        help="Chạy 1 case có sẵn (BKA/TMU/CTU).",
    )
    exclusive.add_argument(
        "--all",
        action="store_true",
        help="Chạy tất cả case mặc định.",
    )

    return parser.parse_args()


def _configure_stdio_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8")
            except Exception:
                pass


def main() -> int:
    _configure_stdio_utf8()
    args = _parse_args()

    if args.query and args.query.strip():
        cases = (QueryCase(case_id="CUSTOM", user_query=args.query.strip()),)
    elif args.case:
        selected = next(case for case in DEFAULT_QUERY_CASES if case.case_id == args.case)
        cases = (selected,)
    elif args.all:
        cases = DEFAULT_QUERY_CASES
    else:
        cases = (DEFAULT_QUERY_CASES[0],)

    try:
        graph = _load_graph_from_file()
    except Exception as exc:
        print(f"Không thể khởi tạo graph: {exc}")
        return 1

    total = len(cases)
    all_ok = True
    for index, case in enumerate(cases, start=1):
        ok = _run_single_case(graph, case, index=index, total=total)
        all_ok = all_ok and ok

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
