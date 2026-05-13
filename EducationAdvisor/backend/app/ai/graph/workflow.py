"""
Multi-Agent Supervisor Workflow Using LangGraph

Architecture:
- Supervisor: Routes queries to appropriate expert agents
- CareerProfiler: Analyzes personality and suggests fields
- AcademicExpert: Handles score conversions and admissions rules
- DataStrategist: Analyzes historical data and admission chances

Workflow:
user query → supervisor → selects expert → expert executes → back to supervisor
→ (if more needed) select another expert → ... → FINISH
"""

import os
import sys
import logging
import time
import datetime
import re
import json
from pathlib import Path
from typing import Literal

# =============================================================================
# TEMPORAL ANCHORING: "Đồng hồ sinh học" cho toàn bộ hệ thống Agent
# Khi user không nhập năm, hệ thống tự neo vào năm hiện tại
# =============================================================================
CURRENT_YEAR: int = datetime.datetime.now().year

# Tắt Telemetry của ChromaDB để tránh lỗi và nghẽn
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# Load environment
from dotenv import load_dotenv

load_dotenv()

# Setup path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

# LangGraph imports
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import create_react_agent

# LangChain imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, BaseMessage, AIMessage
from pydantic import BaseModel, Field

# Import custom modules
from app.ai.graph.state import AgentState
from app.ai.tools.tools import (
    search_admission_rules,
    get_historical_scores,
    find_eligible_majors_by_score,
    compare_major_cutoffs,
    get_major_cutoffs_all_methods,
)
from app.ai.prompts.system_prompts import (
    SUPERVISOR_PROMPT,
    CAREER_PROFILER_PROMPT,
    ACADEMIC_EXPERT_PROMPT,
    DATA_STRATEGIST_PROMPT,
    LOOKUP_AGENT_PROMPT,
)

# Import Receptionist Node (Entity Extraction & Disambiguation)
from app.ai.nodes.receptionist import normalize_vietnamese_text, receptionist_node

# Import ML Recommender (Hybrid AI - TabNet)
from app.ai.ml.ml_recommender import get_recommender

# Import University Registry (Multi-University Support)
from app.ai.university_registry import get_university_info, get_university_name

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================================================
# 1. Lazy AI Runtime Initialization
# ============================================================================

_llm_bundle = None
_expert_agents = None
_ai_workflow = None


def get_llms():
    """Initialize LLM clients lazily so FastAPI can import this module safely."""
    global _llm_bundle

    if _llm_bundle is not None:
        return _llm_bundle

    logger.info("Initializing LLM Models (with Fallbacks)...")

    strict_gemini = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.0,
        max_retries=3,
    )

    creative_gemini = ChatGoogleGenerativeAI(
        model="gemini-3-flash-preview",
        google_api_key=os.environ.get("GEMINI_API_KEY"),
        temperature=0.7,
        max_retries=3,
    )

    try:
        groq_strict = ChatGroq(
            model="llama-3.1-8b-instant",
            api_key=os.environ.get("GROQ_API_KEY"),
            temperature=0.0,
            max_retries=3,
        )
        groq_creative = ChatGroq(
            model="llama-3.1-8b-instant",
            api_key=os.environ.get("GROQ_API_KEY"),
            temperature=0.7,
            max_retries=3,
        )

        strict_llm = strict_gemini.with_fallbacks([groq_strict])
        creative_llm = creative_gemini.with_fallbacks([groq_creative])
        groq_llm = groq_strict.with_fallbacks([strict_gemini])
        logger.info("LLM fallbacks configured successfully")
    except Exception as e:
        logger.warning(f"Failed to load Groq: {e}. Falling back to pure Gemini")
        strict_llm = strict_gemini
        creative_llm = creative_gemini
        groq_llm = strict_gemini

    _llm_bundle = {
        "strict_llm": strict_llm,
        "creative_llm": creative_llm,
        "groq_llm": groq_llm,
    }
    logger.info("LLMs initialized")
    return _llm_bundle

# ============================================================================
# 2. Create Expert Agents with Proper System Prompts
# ============================================================================

def create_expert_agent(llm, tools, system_prompt):
    """
    Create a ReAct agent with a custom system prompt.
    
    Args:
        llm: Language model
        tools: List of tools the agent can use
        system_prompt: System message template
        
    Returns:
        Function that acts as an agent node
    """
    # FIX: Tắt parallel_tool_calls để tránh Groq gọi tool hàng chục lần song song
    # Groq LLaMA mặc định bật parallel_tool_calls → gây loop 50+ lần → nổ token
    if tools:
        llm_with_tools = llm.bind_tools(tools, parallel_tool_calls=False)
    else:
        llm_with_tools = llm
    return create_react_agent(model=llm_with_tools, tools=tools, state_modifier=system_prompt)



def get_expert_agents():
    """Create and cache ReAct agents only when the workflow first runs."""
    global _expert_agents

    if _expert_agents is not None:
        return _expert_agents

    llms = get_llms()
    groq_llm = llms["groq_llm"]

    logger.info("Creating Career Profiler Agent...")
    career_agent = create_expert_agent(
        llm=groq_llm,
        tools=[],
        system_prompt=CAREER_PROFILER_PROMPT,
    )
    logger.info("Career Profiler Agent created")

    logger.info("Creating Academic Expert Agent...")
    academic_agent = create_expert_agent(
        llm=groq_llm,
        tools=[search_admission_rules],
        system_prompt=ACADEMIC_EXPERT_PROMPT,
    )
    logger.info("Academic Expert Agent created")

    logger.info("Creating Data Strategist Agent...")
    strategist_agent = create_expert_agent(
        llm=groq_llm,
        tools=[get_historical_scores],
        system_prompt=DATA_STRATEGIST_PROMPT,
    )
    logger.info("Data Strategist Agent created")

    _expert_agents = {
        "career_agent": career_agent,
        "academic_agent": academic_agent,
        "strategist_agent": strategist_agent,
    }
    return _expert_agents

# ============================================================================
# 3. Node Wrappers - Inject user_profile into system message
# ============================================================================

UNIVERSITY_ALIAS_MAP = {
    "BKA": ["bka", "bach khoa ha noi", "hust", "dai hoc bach khoa ha noi"],
    "QSB": ["qsb", "hcmut", "bach khoa hcm", "bach khoa tphcm", "dai hoc bach khoa tp hcm"],
    "QHI": ["qhi", "uet", "cong nghe dhqg", "dai hoc cong nghe"],
    "BVH": ["bvh", "ptit", "buu chinh vien thong"],
    "SPK": ["spk", "hcmute", "su pham ky thuat tphcm"],
    "KHA": ["kha", "neu", "kinh te quoc dan", "dai hoc kinh te quoc dan"],
    "NTH": ["nth", "ftu", "ngoai thuong", "dai hoc ngoai thuong"],
    "KSA": ["ksa", "ueh", "kinh te hcm", "kinh te tphcm"],
    "TMU": ["tmu", "thuong mai", "dai hoc thuong mai"],
    "LPH": ["lph", "hlu", "luat ha noi", "dai hoc luat ha noi"],
    "YHB": ["yhb", "hmu", "y ha noi", "dai hoc y ha noi"],
    "DKH": ["dkh", "hup", "duoc ha noi", "dai hoc duoc ha noi"],
    "YDS": ["yds", "ump", "y duoc tphcm", "y duoc ho chi minh"],
    "QHX": ["qhx", "ussh", "nhan van ha noi", "khoa hoc xa hoi nhan van"],
    "QHF": ["qhf", "ulis", "ngoai ngu dhqg", "dai hoc ngoai ngu"],
    "SPH": ["sph", "hnue", "su pham ha noi"],
    "HQT": ["hqt", "dav", "ngoai giao", "hoc vien ngoai giao"],
    "TCT": ["tct", "ctu", "can tho", "dai hoc can tho"],
    "DDT": ["ddt", "dtu", "duy tan", "dai hoc duy tan"],
    "DTT": ["dtt", "tdtu", "ton duc thang", "dai hoc ton duc thang"],
}

UNIVERSITY_DISPLAY_NAMES = {
    "BKA": "Đại học Bách khoa Hà Nội",
    "QSB": "Đại học Bách khoa - ĐHQG TP.HCM",
    "QHI": "Đại học Công nghệ - ĐHQGHN",
    "BVH": "Học viện Công nghệ Bưu chính Viễn thông",
    "SPK": "Đại học Sư phạm Kỹ thuật TP.HCM",
    "KHA": "Đại học Kinh tế Quốc dân",
    "NTH": "Đại học Ngoại thương",
    "KSA": "Đại học Kinh tế TP.HCM",
    "TMU": "Đại học Thương mại",
    "LPH": "Đại học Luật Hà Nội",
    "YHB": "Đại học Y Hà Nội",
    "DKH": "Đại học Dược Hà Nội",
    "YDS": "Đại học Y Dược TP.HCM",
    "QHX": "Đại học Khoa học Xã hội và Nhân văn - ĐHQGHN",
    "QHF": "Đại học Ngoại ngữ - ĐHQGHN",
    "SPH": "Đại học Sư phạm Hà Nội",
    "HQT": "Học viện Ngoại giao",
    "TCT": "Đại học Cần Thơ",
    "DDT": "Đại học Duy Tân",
    "DTT": "Đại học Tôn Đức Thắng",
}

ADMISSION_KEYWORDS = {
    "tuyen sinh", "xet tuyen", "diem chuan", "diem san", "chi tieu",
    "phuong thuc", "nganh", "khoi", "to hop", "hoc ba", "thpt", "thi",
    "do nganh", "co hoi", "dai hoc", "truong", "ielts", "tsa", "hsa",
    "dgnl", "dgtd", "vsat", "hoc phi", "chuong trinh", "ma nganh",
}

BLOCKLIST_KEYWORDS = {
    "system prompt", "developer message", "api key", "secret", "password",
    "token", "ignore previous", "bo qua huong dan", "jailbreak", "hack",
    "malware", "sql injection", "lay key", "lo thong tin", "weather",
    "thoi tiet", "chung khoan", "crypto", "viet code", "lap trinh",
    "prompt", "huong dan noi bo", "noi bo he thong", "cau hinh he thong",
    "source code", "ma nguon", "core cua he thong",
}


def _get_latest_user_query(state: dict) -> str:
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, tuple) and len(msg) >= 2 and msg[0] == "user":
            return str(msg[1])
        if hasattr(msg, "type") and getattr(msg, "type", None) == "human":
            return str(msg.content)
        if isinstance(msg, HumanMessage):
            return str(msg.content)
    return ""


def _current_university(state: dict) -> str | None:
    profile = state.get("user_profile", {}) or {}
    return (profile.get("target_university") or state.get("target_university") or None)


def _detect_mentioned_university(query: str) -> str | None:
    normalized = normalize_vietnamese_text(query)
    for code, aliases in UNIVERSITY_ALIAS_MAP.items():
        if re.search(rf"\b{re.escape(code.lower())}\b", normalized):
            return code
        for alias in aliases:
            if alias and alias in normalized:
                return code
    return None


def _detect_mentioned_universities(query: str) -> list[str]:
    normalized = normalize_vietnamese_text(query)
    detected: list[str] = []
    for code, aliases in UNIVERSITY_ALIAS_MAP.items():
        matched = re.search(rf"\b{re.escape(code.lower())}\b", normalized)
        if not matched:
            matched = any(alias and alias in normalized for alias in aliases)
        if matched and code not in detected:
            detected.append(code)
    return detected


def _display_university_name(code: str) -> str:
    normalized_code = str(code or "").upper()
    return UNIVERSITY_DISPLAY_NAMES.get(normalized_code) or get_university_name(normalized_code)


def _latest_admission_year_for_lookup(state: dict) -> str:
    profile_year = (state.get("user_profile", {}) or {}).get("target_year")
    if profile_year:
        return str(profile_year)
    return str(max(CURRENT_YEAR - 1, 2025))


def _summarize_admission_methods(university_code: str, year: str, raw_context: str) -> str:
    prompt = f"""Bạn là trợ lý tuyển sinh. Hãy đọc dữ liệu quy chế dưới đây và trả lời DUY NHẤT câu hỏi: trường có những phương thức tuyển sinh nào.

Yêu cầu bắt buộc:
- Chỉ bám vào trường {university_code}, năm {year}.
- Chỉ liệt kê các phương thức tuyển sinh.
- Không nhắc tên file, nguồn, metadata, tag "[Kết quả]".
- Không trình bày điểm sàn, thang điểm, bảng quy đổi, điều kiện chi tiết nếu người dùng không hỏi.
- Nếu dữ liệu trùng lặp, gộp lại.
- Trả lời ngắn gọn bằng tiếng Việt, dạng bullet.

Dữ liệu:
{raw_context}
"""
    try:
        response = get_llms()["strict_llm"].invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        if isinstance(content, list):
            text_blocks = [item.get("text", "") for item in content if isinstance(item, dict)]
            content = "\n".join(text_blocks)
        cleaned = str(content).strip()
        forbidden_markers = ["[Kết quả", "Nguồn:", "_clean.md", "source", "metadata"]
        for marker in forbidden_markers:
            cleaned = cleaned.replace(marker, "")
        return cleaned
    except Exception as e:
        logger.error(f"Failed to summarize admission methods: {e}", exc_info=True)
        return (
            "Mình đã tìm thấy dữ liệu quy chế tuyển sinh, nhưng chưa thể tóm tắt tự động ở thời điểm này. "
            "Bạn vui lòng thử lại sau hoặc hỏi cụ thể một phương thức tuyển sinh."
        )


def _summarize_admission_rules(university_code: str, year: str, raw_context: str) -> str:
    prompt = f"""Bạn là trợ lý tuyển sinh. Hãy tóm tắt quy chế xét tuyển của trường {university_code} năm {year} từ dữ liệu dưới đây.

Yêu cầu bắt buộc:
- Chỉ bám vào trường {university_code}, năm {year}.
- Trả lời đúng phạm vi "quy chế xét tuyển": phương thức chính, nguyên tắc xét tuyển, điều kiện/lưu ý quan trọng nếu có.
- Không nhắc tên file, nguồn, metadata, tag "[Kết quả]", tên collection, ChromaDB, MongoDB hay log nội bộ.
- Không đổ toàn bộ bảng Markdown nếu người dùng chỉ hỏi chung.
- Nếu dữ liệu trùng lặp, gộp lại.
- Trả lời ngắn gọn bằng tiếng Việt, dạng bullet.

Dữ liệu:
{raw_context}
"""
    try:
        response = get_llms()["strict_llm"].invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        if isinstance(content, list):
            text_blocks = [item.get("text", "") for item in content if isinstance(item, dict)]
            content = "\n".join(text_blocks)
        cleaned = str(content).strip()
        cleaned = re.sub(r"\[[^\]\n]{0,80}\]\s*:?", "", cleaned)
        cleaned = re.sub(r"(?im)^\s*(Nguồn|Source|Metadata)\s*:.*$", "", cleaned)
        cleaned = cleaned.replace("_clean.md", "")
        return cleaned.strip()
    except Exception as e:
        logger.error(f"Failed to summarize admission rules: {e}", exc_info=True)
        return (
            "Mình đã tìm thấy dữ liệu quy chế xét tuyển, nhưng chưa thể tóm tắt tự động ở thời điểm này. "
            "Bạn vui lòng hỏi cụ thể hơn về phương thức, điều kiện xét tuyển hoặc cách tính điểm."
        )


def _is_rules_lookup(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    return (
        any(term in normalized for term in ["quy che", "quy dinh", "de an", "thong tin tuyen sinh"])
        and any(term in normalized for term in ["xet tuyen", "tuyen sinh"])
    )


def _extract_year_from_query(query: str) -> str | None:
    normalized = normalize_vietnamese_text(query)
    match = re.search(r"\b(20\d{2}|19\d{2})\b", normalized)
    return match.group(1) if match else None


def _extract_compared_major_names(query: str) -> list[str]:
    normalized = normalize_vietnamese_text(query)
    normalized = re.sub(r"\b(20\d{2}|19\d{2})\b", " ", normalized)
    normalized = re.sub(
        r"\b(thpt_qg|thpt qg|diem thi thpt|hoc ba|tsa|dgtd|hsa|dgnl|apt|ielts|chung chi quoc te)\b",
        " ",
        normalized,
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()

    patterns = [
        r"\bcua\s+(.+?)\s+va\s+(.+)$",
        r"\bnganh\s+(.+?)\s+(?:co\s+)?(?:diem\s+)?(?:cao hon|thap hon|so voi|hon)\s+(?:nganh\s+)?(.+)$",
        r"\bso sanh\s+(?:diem chuan\s+)?(.+?)\s+va\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if not match:
            continue
        names = [re.sub(r"^(nganh|cua)\s+", "", part).strip(" .,:;") for part in match.groups()]
        names = [name for name in names if len(name) >= 2]
        if len(names) >= 2:
            return names[:2]
    return []


def _format_major_cutoff_comparison(university_code: str, year: str, method_tag: str, result_text: str) -> str:
    try:
        payload = json.loads(result_text)
    except json.JSONDecodeError:
        return (
            f"Mình chưa đọc được dữ liệu điểm chuẩn của {_display_university_name(university_code)} ({university_code}) "
            f"năm {year} theo phương thức {method_tag}. Bạn vui lòng thử lại hoặc cung cấp mã ngành cụ thể."
        )

    matched = payload.get("matched") or []
    missing = payload.get("missing") or []
    if len(matched) < 2 or missing:
        missing_text = ", ".join(str(item) for item in missing) if missing else "một trong hai ngành"
        return (
            f"Mình chưa tìm thấy đủ dữ liệu điểm chuẩn cho {missing_text} tại "
            f"{_display_university_name(university_code)} ({university_code}) năm {year} theo phương thức {method_tag}. "
            "Bạn vui lòng dùng đúng tên ngành hoặc mã ngành trong đề án tuyển sinh để mình so sánh chính xác."
        )

    first, second = matched[0], matched[1]
    first_score = float(first.get("score") or 0)
    second_score = float(second.get("score") or 0)
    first_name = first.get("major_name") or first.get("requested_name")
    second_name = second.get("major_name") or second.get("requested_name")
    first_code = first.get("major_code") or "không rõ mã"
    second_code = second.get("major_code") or "không rõ mã"

    if first_score > second_score:
        verdict = f"{first_name} cao hơn {second_name} {first_score - second_score:.2f} điểm."
    elif second_score > first_score:
        verdict = f"{second_name} cao hơn {first_name} {second_score - first_score:.2f} điểm."
    else:
        verdict = f"Hai ngành có cùng mức điểm chuẩn {first_score:.2f}."

    return (
        f"So sánh điểm chuẩn {method_tag} năm {year} của {_display_university_name(university_code)} ({university_code}):\n\n"
        f"- {first_name} ({first_code}): {first_score:.2f} điểm\n"
        f"- {second_name} ({second_code}): {second_score:.2f} điểm\n\n"
        f"Kết luận: {verdict}"
    )


def _is_major_all_methods_cutoff_query(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    all_methods_terms = [
        "tat ca phuong thuc",
        "cac phuong thuc",
        "moi phuong thuc",
        "toan bo phuong thuc",
    ]
    return (
        "diem" in normalized
        and "nganh" in normalized
        and any(term in normalized for term in all_methods_terms)
    )


def _extract_single_major_name_for_cutoff(query: str) -> str | None:
    normalized = normalize_vietnamese_text(query)
    normalized = re.sub(r"\b(20\d{2}|19\d{2})\b", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    patterns = [
        r"\bdiem\s+(?:chuan\s+)?nganh\s+(.+?)\s+(?:theo|nam|o|cua)\b",
        r"\bnganh\s+(.+?)\s+(?:theo|nam|o|cua)\b",
        r"\bdiem\s+(?:chuan\s+)?(?:cua\s+)?(.+?)\s+(?:theo tat ca phuong thuc|cac phuong thuc|moi phuong thuc|toan bo phuong thuc)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if not match:
            continue
        major_name = match.group(1).strip(" .,:;")
        major_name = re.sub(r"^(nganh|cua)\s+", "", major_name).strip()
        if len(major_name) >= 2:
            return major_name
    return None


def _format_major_all_methods_cutoffs(university_code: str, year: str, result_text: str) -> str:
    try:
        payload = json.loads(result_text)
    except json.JSONDecodeError:
        return (
            f"Mình chưa đọc được dữ liệu điểm chuẩn của {_display_university_name(university_code)} ({university_code}) "
            f"năm {year}. Bạn vui lòng thử lại hoặc cung cấp mã ngành cụ thể."
        )

    requested_major = payload.get("requested_major") or "ngành này"
    if payload.get("status") != "success" or not payload.get("cutoffs"):
        return (
            f"Mình chưa tìm thấy điểm chuẩn của ngành {requested_major} tại "
            f"{_display_university_name(university_code)} ({university_code}) năm {year}. "
            "Bạn vui lòng kiểm tra lại tên ngành hoặc dùng mã ngành chính xác trong đề án tuyển sinh."
        )

    major_name = payload.get("matched_major_name") or requested_major
    major_code = payload.get("matched_major_code") or "không rõ mã"
    lines = [
        f"Điểm chuẩn ngành {major_name} ({major_code}) của {_display_university_name(university_code)} ({university_code}) năm {year}:",
        "",
    ]
    for item in payload["cutoffs"]:
        method = item.get("method_tag") or "Không rõ phương thức"
        alias = item.get("method_alias")
        score = float(item.get("score") or 0)
        method_label = f"{method} ({alias})" if alias else method
        lines.append(f"- {method_label}: {score:.2f} điểm")
    lines.append("")
    lines.append("Lưu ý: các phương thức có thể dùng thang điểm khác nhau, nên chỉ so sánh trực tiếp khi cùng phương thức.")
    return "\n".join(lines)


def _is_gibberish(query: str) -> bool:
    normalized = normalize_vietnamese_text(query).replace(" ", "")
    if len(normalized) < 8:
        return False
    vowels = sum(1 for ch in normalized if ch in "aeiouy")
    return " " not in query.strip() and vowels / max(len(normalized), 1) < 0.18


def _is_admission_related(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    if not normalized:
        return False
    if any(keyword in normalized for keyword in BLOCKLIST_KEYWORDS):
        return False
    if _is_gibberish(query):
        return False
    if any(keyword in normalized for keyword in ADMISSION_KEYWORDS):
        return True
    if re.search(r"\b\d+(?:\.\d+)?\s*diem\b", normalized):
        return True
    return False


def _is_methods_lookup(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    return (
        ("phuong thuc" in normalized or "cach xet" in normalized)
        and ("nao" in normalized or "nhung" in normalized or "cac" in normalized)
        and ("tuyen sinh" in normalized or "xet tuyen" in normalized or "truong" in normalized)
    )


def _is_comparison_query(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    comparison_terms = [
        "so voi",
        "cai nao hon",
        "truong nao hon",
        "nganh nao hon",
        "cao hon",
        "thap hon",
        "nen chon",
        "khac gi",
        "tot hon",
        "hon nhau",
    ]
    return any(term in normalized for term in comparison_terms)


def _is_major_cutoff_comparison_query(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    return (
        "diem" in normalized
        and any(term in normalized for term in ["cao hon", "thap hon", "hon nganh", "so voi", "so sanh"])
        and ("nganh" in normalized or "diem chuan" in normalized)
    )


def _is_cutoff_ranking_query(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    return (
        "nganh" in normalized
        and any(
            term in normalized
            for term in [
                "diem cao nhat",
                "diem chuan cao nhat",
                "cao nhat",
                "diem thap nhat",
                "diem chuan thap nhat",
                "thap nhat",
            ]
        )
    )


def _is_subjective_best_major_query(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    return (
        "nganh" in normalized
        and any(term in normalized for term in ["tot nhat", "nen hoc nganh nao", "nganh nao tot"])
        and "diem" not in normalized
    )


def _extract_plain_score(query: str) -> float | None:
    normalized = normalize_vietnamese_text(query)
    match = re.search(r"\b(\d+(?:\.\d+)?)\s*diem\b", normalized)
    if not match:
        match = re.search(r"\bem co\s*(\d+(?:\.\d+)?)\b", normalized)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _is_eligible_major_query(query: str) -> bool:
    normalized = normalize_vietnamese_text(query)
    score = _extract_plain_score(query)
    if score is None:
        return False
    intent_terms = ["do nganh nao", "vao nganh nao", "nganh nao", "co the do", "co the vao", "du nganh"]
    return any(term in normalized for term in intent_terms)


def _make_final_message(content: str, pending_clarification: dict | None = None) -> dict:
    return {
        "messages": [AIMessage(content=content, name="Synthesis")],
        "next_agent": "END",
        "pending_clarification": pending_clarification,
    }


def _format_eligible_major_result(target_uni: str, score: float, method_tag: str, year: str | None, result: str) -> str:
    try:
        data = json.loads(result)
        data_year = data.get("year")
        data_year_text = f", năm {data_year}" if data_year else ""
        data_year_text_no_comma = f" năm {data_year}" if data_year else ""
        if data.get("status") == "success" and data.get("eligible_majors"):
            lines = [
                f"Mình đã lọc các ngành của {_display_university_name(target_uni)} ({target_uni}) theo điểm {score:g}, "
                f"phương thức {method_tag}{data_year_text}.",
                "",
                "Các ngành có điểm chuẩn không vượt quá mức điểm này, sắp theo mức gần điểm của bạn nhất:",
            ]
            for item in data["eligible_majors"]:
                major_name = item.get("major_name") or "Chưa có tên ngành"
                major_code = item.get("major_code") or "N/A"
                cutoff = item.get("cutoff_score")
                lines.append(f"- {major_name} ({major_code}): {cutoff} điểm")
            lines.append("")
            lines.append("Lưu ý: đây là lọc theo dữ liệu điểm chuẩn lịch sử; bạn vẫn nên kiểm tra lại tổ hợp/phương thức trong đề án tuyển sinh của trường.")
            return "\n".join(lines)
        if data.get("status") == "not_found":
            return (
                f"Mình chưa tìm thấy ngành nào của {_display_university_name(target_uni)} ({target_uni}) có điểm chuẩn không vượt quá {score:g} "
                f"theo phương thức {method_tag}{data_year_text_no_comma}. "
                "Bạn có thể thử phương thức khác hoặc cung cấp thêm năm xét tuyển cụ thể."
            )
    except Exception:
        pass
    return (
        f"Mình đã lọc các ngành của {_display_university_name(target_uni)} ({target_uni}) theo điểm {score:g}, "
        f"phương thức {method_tag}{f', năm {year}' if year else ''}. Kết quả gần ngưỡng nhất được ưu tiên trước:\n\n{result}"
    )


def _missing_slots(data: dict, required_slots: list[str]) -> list[str]:
    return [slot for slot in required_slots if data.get(slot) in (None, "", [])]


def _build_pending(intent: str, required_slots: list[str], **slots) -> dict:
    payload = {"intent": intent, **slots}
    payload["missing_slots"] = _missing_slots(payload, required_slots)
    return payload


def _apply_followup_to_pending(pending: dict | None, query: str, state: AgentState, target_uni: str | None) -> dict | None:
    if not pending:
        return None

    data = dict(pending)
    data["target_university"] = data.get("target_university") or target_uni

    year = _extract_year_from_query(query)
    if year:
        data["year"] = year

    score = _extract_plain_score(query)
    if score is not None:
        data["score"] = score

    from app.utils.taxonomy_engine import get_standard_method_tag

    method_tag = get_standard_method_tag(query, str(data.get("target_university") or target_uni or ""))
    if method_tag:
        data["method_tag"] = method_tag

    if data.get("intent") == "major_all_methods_cutoff":
        major_name = _extract_single_major_name_for_cutoff(query)
        if major_name:
            data["major_name"] = major_name
        required = ["target_university", "major_name", "year"]
        data["missing_slots"] = _missing_slots(data, required)
        if not data["missing_slots"]:
            result = get_major_cutoffs_all_methods(
                university=data["target_university"],
                major_name=data["major_name"],
                year=str(data["year"]),
            )
            return _make_final_message(
                _format_major_all_methods_cutoffs(data["target_university"], str(data["year"]), result),
                pending_clarification=None,
            )
        return _make_final_message(
            "Mình đã nhận thêm thông tin, nhưng vẫn còn thiếu dữ kiện để tra điểm chuẩn. "
            "Bạn vui lòng cung cấp nốt: " + ", ".join(data["missing_slots"]) + ".",
            pending_clarification=data,
        )

    if data.get("intent") == "eligible_major_by_score":
        required = ["target_university", "score", "method_tag"]
        data["missing_slots"] = _missing_slots(data, required)
        if not data["missing_slots"]:
            result = find_eligible_majors_by_score(
                university=data["target_university"],
                score=float(data["score"]),
                method_tag=data["method_tag"],
                year=str(data["year"]) if data.get("year") else None,
                limit=10,
            )
            return _make_final_message(
                _format_eligible_major_result(
                    data["target_university"],
                    float(data["score"]),
                    data["method_tag"],
                    str(data["year"]) if data.get("year") else None,
                    result,
                ),
                pending_clarification=None,
            )
        return _make_final_message(
            "Mình đã nhận thêm thông tin, nhưng vẫn cần biết điểm này thuộc phương thức nào: "
            "điểm thi THPT, học bạ, TSA/ĐGTD, HSA/ĐGNL hay phương thức khác?",
            pending_clarification=data,
        )

    if data.get("intent") == "major_cutoff_comparison":
        major_names = _extract_compared_major_names(query)
        if len(major_names) >= 2:
            data["major_names"] = major_names
        required = ["target_university", "year", "method_tag", "major_names"]
        data["missing_slots"] = _missing_slots(data, required)
        if not data["missing_slots"]:
            comparison_result = compare_major_cutoffs(
                university=data["target_university"],
                major_names=data["major_names"],
                method_tag=data["method_tag"],
                year=str(data["year"]),
            )
            return _make_final_message(
                _format_major_cutoff_comparison(
                    data["target_university"],
                    str(data["year"]),
                    data["method_tag"],
                    comparison_result,
                ),
                pending_clarification=None,
            )
        return _make_final_message(
            "Mình đã nhận thêm thông tin, nhưng vẫn cần đủ năm, phương thức và tên/mã hai ngành để so sánh điểm chuẩn.",
            pending_clarification=data,
        )

    return None


def preflight_node(state: AgentState) -> dict:
    """Handle safety, context, and deterministic fast-path edge cases before LLM routing."""
    query = _get_latest_user_query(state)
    normalized = normalize_vietnamese_text(query)
    current_uni = _current_university(state)
    mentioned_universities = _detect_mentioned_universities(query)
    mentioned_uni = mentioned_universities[0] if mentioned_universities else None
    target_uni = str(current_uni or mentioned_uni or "").upper() or None

    followup_result = _apply_followup_to_pending(
        state.get("pending_clarification"),
        query,
        state,
        target_uni,
    )
    if followup_result:
        return followup_result

    if not _is_admission_related(query):
        return _make_final_message(
            "Mình chỉ hỗ trợ các câu hỏi trong phạm vi tuyển sinh, ngành học, phương thức xét tuyển, điểm chuẩn và tư vấn chọn ngành. "
            "Vui lòng đặt câu hỏi liên quan đến tuyển sinh đại học để mình hỗ trợ chính xác."
        )

    current_uni_code = str(current_uni).upper() if current_uni else None
    other_mentioned_unis = [code for code in mentioned_universities if code != current_uni_code]

    if current_uni_code and other_mentioned_unis:
        mentioned_uni = other_mentioned_unis[0]
        current_name = _display_university_name(str(current_uni))
        mentioned_name = _display_university_name(mentioned_uni)
        return _make_final_message(
            f"Bạn đang ở hộp thoại tư vấn của {current_name} ({str(current_uni).upper()}). "
            f"Câu hỏi của bạn lại nhắc đến {mentioned_name} ({mentioned_uni}). "
            "Để tránh dùng nhầm dữ liệu tuyển sinh giữa hai trường, bạn nên chuyển sang hộp thoại của trường đó rồi hỏi tiếp."
        )

    if _is_comparison_query(query) and len(mentioned_universities) >= 2:
        names = ", ".join(
            f"{_display_university_name(code)} ({code})" for code in mentioned_universities[:3]
        )
        return _make_final_message(
            f"Câu hỏi của bạn đang so sánh giữa nhiều trường/ngành: {names}. "
            "Hệ thống hiện chỉ tư vấn chắc chắn trong phạm vi một trường ở mỗi hộp thoại để tránh đối chiếu sai mã ngành. "
            "Ngoài ra, mã ngành giữa các trường không luôn tương đương nhau; ví dụ IT1 là mã của BKA, còn UET thường dùng mã khác như CN1. "
            "Bạn vui lòng mở đúng hộp thoại của trường muốn tư vấn, hoặc nêu rõ hai ngành tương ứng cần so sánh."
        )

    if _is_major_all_methods_cutoff_query(query):
        if not target_uni:
            return _make_final_message(
                "Bạn muốn xem điểm chuẩn của ngành này ở trường nào? Vui lòng chọn hoặc nhập mã trường trước."
            )
        year = _extract_year_from_query(query) or (state.get("user_profile", {}) or {}).get("target_year")
        if not year:
            return _make_final_message(
                f"Mình hiểu bạn muốn xem điểm chuẩn theo tất cả phương thức tại {_display_university_name(target_uni)} ({target_uni}), "
                "nhưng cần biết năm tuyển sinh để tra đúng dữ liệu. Ví dụ: “điểm ngành Công nghệ thông tin theo tất cả phương thức năm 2025”.",
                pending_clarification=_build_pending(
                    "major_all_methods_cutoff",
                    ["target_university", "major_name", "year"],
                    target_university=target_uni,
                    major_name=_extract_single_major_name_for_cutoff(query),
                    year=None,
                ),
            )
        major_name = _extract_single_major_name_for_cutoff(query)
        if not major_name:
            return _make_final_message(
                "Bạn muốn xem điểm chuẩn của ngành nào? Vui lòng nêu rõ tên ngành hoặc mã ngành.",
                pending_clarification=_build_pending(
                    "major_all_methods_cutoff",
                    ["target_university", "major_name", "year"],
                    target_university=target_uni,
                    major_name=None,
                    year=str(year),
                ),
            )
        result = get_major_cutoffs_all_methods(
            university=target_uni,
            major_name=major_name,
            year=str(year),
        )
        return _make_final_message(
            _format_major_all_methods_cutoffs(target_uni, str(year), result)
        )

    if _is_major_cutoff_comparison_query(query):
        if not target_uni:
            return _make_final_message(
                "Bạn muốn so sánh điểm chuẩn giữa các ngành của trường nào? Vui lòng chọn hoặc nhập mã trường trước."
            )
        from app.utils.taxonomy_engine import get_standard_method_tag

        method_tag = get_standard_method_tag(query, target_uni)
        year = _extract_year_from_query(query) or (state.get("user_profile", {}) or {}).get("target_year")
        major_names = _extract_compared_major_names(query)
        if method_tag and year and len(major_names) >= 2:
            comparison_result = compare_major_cutoffs(
                university=target_uni,
                major_names=major_names,
                method_tag=method_tag,
                year=str(year),
            )
            return _make_final_message(
                _format_major_cutoff_comparison(target_uni, str(year), method_tag, comparison_result)
            )
        return _make_final_message(
            f"Mình hiểu bạn muốn so sánh điểm chuẩn giữa các ngành trong {_display_university_name(target_uni)} ({target_uni}). "
            "Điểm chuẩn chỉ nên so sánh khi cùng năm và cùng phương thức xét tuyển. "
            "Bạn vui lòng nêu rõ năm, phương thức và tên/mã hai ngành cần so sánh, ví dụ: "
            "“So sánh điểm chuẩn THPT_QG năm 2025 của Marketing và Hệ thống thông tin”.",
            pending_clarification=_build_pending(
                "major_cutoff_comparison",
                ["target_university", "year", "method_tag", "major_names"],
                target_university=target_uni,
                year=str(year) if year else None,
                method_tag=method_tag,
                major_names=major_names if len(major_names) >= 2 else None,
            ),
        )

    if _is_cutoff_ranking_query(query):
        if not target_uni:
            return _make_final_message(
                "Bạn muốn xem ngành có điểm chuẩn cao nhất của trường nào? Vui lòng chọn hoặc nhập mã trường trước."
            )
        return _make_final_message(
            f"Mình có thể tìm ngành có điểm chuẩn cao nhất của {_display_university_name(target_uni)} ({target_uni}), "
            "nhưng cần biết **năm** và **phương thức xét tuyển** để so sánh đúng. "
            "Ví dụ: “Ngành nào điểm chuẩn THPT_QG cao nhất năm 2025?” hoặc “Ngành nào điểm HSA cao nhất năm 2024?”. "
            "Không nên gộp mọi phương thức lại vì thang điểm và cách xét tuyển khác nhau."
        )

    if _is_subjective_best_major_query(query):
        return _make_final_message(
            "Không có một ngành “tốt nhất” tuyệt đối cho mọi học sinh. Ngành phù hợp phụ thuộc vào sở thích, năng lực, MBTI, điểm mạnh môn học và mục tiêu nghề nghiệp của bạn. "
            "Bạn có thể cho mình biết thêm bạn thích lĩnh vực nào, điểm mạnh các môn, hoặc mục tiêu nghề nghiệp để mình tư vấn ngành phù hợp hơn."
        )

    if _is_rules_lookup(query):
        if not target_uni:
            return _make_final_message(
                "Bạn muốn xem quy chế xét tuyển của trường nào? Vui lòng chọn hoặc nhập mã trường trước."
            )
        year = _latest_admission_year_for_lookup(state)
        lookup_query = f"Quy chế xét tuyển của {target_uni} năm {year}"
        result = search_admission_rules.invoke({
            "query": lookup_query,
            "university": target_uni,
            "year": year,
        })
        summary = _summarize_admission_rules(target_uni, year, result)
        return _make_final_message(
            f"Tóm tắt quy chế xét tuyển của {_display_university_name(target_uni)} ({target_uni}) năm {year}:\n\n{summary}"
        )

    if _is_methods_lookup(query):
        if not target_uni:
            return _make_final_message(
                "Bạn muốn xem phương thức tuyển sinh của trường nào? Vui lòng chọn hoặc nhập mã trường trước."
            )
        year = _latest_admission_year_for_lookup(state)
        lookup_query = f"Các phương thức tuyển sinh của {target_uni} năm {year}"
        result = search_admission_rules.invoke({
            "query": lookup_query,
            "university": target_uni,
            "year": year,
        })
        summary = _summarize_admission_methods(target_uni, year, result)
        return _make_final_message(
            f"Các phương thức tuyển sinh của {_display_university_name(target_uni)} ({target_uni}) năm {year}:\n\n{summary}"
        )

    if _is_eligible_major_query(query):
        if not target_uni:
            return _make_final_message(
                "Bạn muốn lọc ngành theo điểm cho trường nào? Vui lòng chọn hoặc nhập mã trường trước."
            )

        score = _extract_plain_score(query)
        from app.utils.taxonomy_engine import get_standard_method_tag

        method_tag = get_standard_method_tag(query, target_uni)
        if not method_tag:
            return _make_final_message(
                f"Mình đã hiểu bạn có khoảng {score:g} điểm và muốn biết có thể đỗ ngành nào ở {_display_university_name(target_uni)} ({target_uni}). "
                "Tuy nhiên cần biết điểm này thuộc phương thức nào để tránh lọc sai ngành: điểm thi THPT, học bạ, TSA/ĐGTD, HSA/ĐGNL hay phương thức khác?",
                pending_clarification=_build_pending(
                    "eligible_major_by_score",
                    ["target_university", "score", "method_tag"],
                    target_university=target_uni,
                    score=score,
                    method_tag=None,
                    year=_extract_year_from_query(query) or (state.get("user_profile", {}) or {}).get("target_year"),
                ),
            )

        year_match = re.search(r"\b(20\d{2}|19\d{2})\b", normalized)
        year = year_match.group(1) if year_match else (state.get("user_profile", {}) or {}).get("target_year")
        result = find_eligible_majors_by_score(
            university=target_uni,
            score=score,
            method_tag=method_tag,
            year=str(year) if year else None,
            limit=10,
        )
        return _make_final_message(_format_eligible_major_result(target_uni, score, method_tag, year, result))

    if current_uni:
        profile = dict(state.get("user_profile", {}) or {})
        profile.setdefault("target_university", str(current_uni).upper())
        return {
            "user_profile": profile,
            "target_university": str(current_uni).upper(),
            "next_agent": "receptionist",
        }

    return {"next_agent": "receptionist"}

def career_profiler_node(state: AgentState) -> dict:
    """
    Node CareerProfiler theo kiến trúc Hybrid AI.

    Luồng xử lý:
        1. [ML]  Gọi TabNet predict_top_3() → lấy Top 3 ngành + độ tự tin (%)
        2. [LLM] Nhúng kết quả ML vào prompt → LLM CHỈ giải thích lý do
                 phù hợp và nêu 2 khó khăn mỗi ngành (không tự đề xuất ngành khác)
        3. Gộp phần tóm tắt ML + giải thích LLM → AIMessage name="CareerProfiler"

    Args:
        state: AgentState của LangGraph, chứa messages và user_profile.

    Returns:
        dict cập nhật state: thêm AIMessage vào messages, cập nhật called_agents.
    """
    logger.info("🎯 Career Profiler [Hybrid AI]: Đang phân tích hồ sơ...")
    time.sleep(3)  # Rate limiting — tránh vượt quota API

    # -----------------------------------------------------------------------
    # Lấy câu hỏi gốc của người dùng từ lịch sử messages
    # -----------------------------------------------------------------------
    query = ""
    for msg in state["messages"]:
        if isinstance(msg, tuple) and msg[0] == "user":
            query = msg[1]
            break
        elif hasattr(msg, "type") and msg.type == "human":
            query = msg.content
            break

    if not query:
        query = state["messages"][-1].content if state["messages"] else ""

    # Lấy user_profile từ state (dict hồ sơ học sinh)
    user_profile: dict = state.get("user_profile", {})

    # =========================================================================
    # BƯỚC 1: GỌI ML (TabNet) — Dự đoán Top 3 ngành nghề
    # =========================================================================
    ml_top3: list[dict] = []
    ml_summary_text = ""

    try:
        logger.info("   🤖 [Bước 1] Gọi TabNet predict_top_3()...")

        # Lấy singleton instance (tải model 1 lần duy nhất từ app/ml/weights/)
        recommender = get_recommender()
        ml_top3 = recommender.predict_top_3(user_profile)

        # Tạo phần tóm tắt kết quả ML dạng text để nhúng vào báo cáo cuối
        ml_lines = ["\n📊 **KẾT QUẢ DỰ ĐOÁN TỪ MÔ HÌNH AI (TabNet):**"]
        for item in ml_top3:
            ml_lines.append(
                f"  - Top {item['rank']}: **{item['name']}** "
                f"(Độ phù hợp: {item['confidence']}%)"
            )
        ml_summary_text = "\n".join(ml_lines)

        logger.info(f"   ✅ [Bước 1] ML dự đoán xong: {[i['name'] for i in ml_top3]}")

    except KeyError as e:
        # Xử lý khi user_profile bị thiếu key quan trọng
        logger.error(f"   ❌ [Bước 1] user_profile thiếu key: {e}")
        ml_summary_text = (
            f"\n⚠️ Mô hình ML không thể dự đoán do hồ sơ thiếu thông tin: {e}. "
            "Vui lòng bổ sung mbti, ielts, và transcript."
        )
    except RuntimeError as e:
        # Xử lý lỗi nội bộ của model (file corrupt, shape mismatch...)
        logger.error(f"   ❌ [Bước 1] Lỗi khi chạy model ML: {e}")
        ml_summary_text = f"\n⚠️ Mô hình ML gặp lỗi kỹ thuật: {e}."
    except Exception as e:
        # Catch-all cho các lỗi không lường trước
        logger.error(f"   ❌ [Bước 1] Lỗi không xác định từ ML: {e}", exc_info=True)
        ml_summary_text = f"\n⚠️ Không thể chạy mô hình ML: {e}."

    # =========================================================================
    # BƯỚC 2: XÂY DỰNG PROMPT CHO LLM
    # LLM TUYỆT ĐỐI KHÔNG được tự đề xuất ngành. Chỉ giải thích kết quả ML.
    # =========================================================================
    logger.info("   📝 [Bước 2] Xây dựng prompt cho LLM...")

    if ml_top3:
        # Định dạng Top 3 ra dạng text rõ ràng để nhúng vào prompt
        top3_formatted = "\n".join(
            f"  {i['rank']}. {i['name']} (Độ phù hợp: {i['confidence']}%)"
            for i in ml_top3
        )
    else:
        # Trường hợp ML thất bại: dùng thông tin từ profile để LLM phân tích
        top3_formatted = "(Mô hình ML không cung cấp được kết quả)"

    user_profile_str = str(user_profile)

    # Prompt cứng — khóa chặt LLM, không cho phép tự bịa ngành khác
    hybrid_prompt = f"""Bạn là Chuyên gia Hướng nghiệp tại một trường Đại học uy tín.

Hồ sơ học sinh:
{user_profile_str}

Câu hỏi của học sinh: {query}

--- KẾT QUẢ TỪ HỆ THỐNG AI PHÂN TÍCH HỒ SƠ (TABNET) ---
Mô hình Machine Learning đã phân tích hồ sơ và đưa ra Top 3 ngành phù hợp:
{top3_formatted}
---

NHIỆM VỤ CỦA BẠN (Tuân thủ nghiêm ngặt):
1. TUYỆT ĐỐI KHÔNG đề xuất thêm bất kỳ ngành nào khác ngoài Top 3 ở trên. Đây là kết quả bắt buộc.
2. Với MỖI ngành trong Top 3, bạn PHẢI:
   a. Giải thích RÕ RÀNG vì sao hồ sơ này (MBTI, điểm số, IELTS) phù hợp với ngành đó.
   b. Nêu đúng 2 KHÓ KHĂN THỰC TẾ của ngành đó để học sinh chuẩn bị tâm lý.
3. Dùng định dạng Markdown cho đẹp và dễ đọc.
4. Viết thân thiện, ngắn gọn, không dùng thuật ngữ kỹ thuật khó hiểu.

Bắt đầu phân tích:"""

    # =========================================================================
    # BƯỚC 3: GỌI LLM — Chỉ giải thích, không dự đoán
    # =========================================================================
    logger.info("   🌐 [Bước 3] Gọi LLM để giải thích kết quả ML...")

    try:
        context_msg = HumanMessage(content=hybrid_prompt)
        # Dùng career_agent (creative_llm, temperature=0.2) đã được khởi tạo bên trên
        llm_result = get_expert_agents()["career_agent"].invoke({"messages": [context_msg]})
        llm_response_text = llm_result["messages"][-1].content
        logger.info("   ✅ [Bước 3] LLM giải thích xong")

    except Exception as e:
        logger.error(f"   ❌ [Bước 3] Lỗi khi gọi LLM: {e}", exc_info=True)
        llm_response_text = (
            f"⚠️ Hệ thống LLM gặp lỗi khi tạo giải thích: {e}. "
            "Kết quả dự đoán từ mô hình AI vẫn còn hiệu lực."
        )

    # =========================================================================
    # BƯỚC 4: GỘP KẾT QUẢ ML + LLM → 1 AIMessage DUY NHẤT
    # Không thay đổi cấu trúc state["messages"] của LangGraph
    # =========================================================================
    logger.info("   🔗 [Bước 4] Gộp kết quả ML + LLM thành báo cáo hoàn chỉnh...")

    # Phần header báo cáo tổng hợp
    combined_content = (
        "[Báo cáo từ CareerProfiler — Hybrid AI]:\n"
        f"{ml_summary_text}\n\n"
        "---\n"
        "🧠 **PHÂN TÍCH CHI TIẾT TỪ CHUYÊN GIA:**\n\n"
        f"{llm_response_text}"
    )

    # Tạo AIMessage có name="CareerProfiler" — đúng chuẩn LangGraph
    signed_msg = AIMessage(
        content=combined_content,
        name="CareerProfiler",
    )
    logger.info("   ✅ Career Profiler [Hybrid AI] hoàn tất báo cáo")

    # Cập nhật called_agents để Supervisor biết CareerProfiler đã chạy xong
    called_agents = state.get("called_agents", [])
    if "CareerProfiler" not in called_agents:
        called_agents = called_agents + ["CareerProfiler"]

    return {"messages": [signed_msg], "called_agents": called_agents}


def academic_expert_node(state: dict) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("📚 Academic Expert: Retrieving context and analyzing...")
    time.sleep(3)  # Rate limiting
    
    # 1. Trích xuất câu hỏi và hồ sơ
    query = ""
    for msg in state["messages"]:
        if isinstance(msg, tuple) and msg[0] == "user":
            query = msg[1]
            break
        elif hasattr(msg, "type") and msg.type == "human":
            query = msg.content
            break
            
    if not query:
        query = state["messages"][-1].content if state["messages"] else ""
        
    user_profile = state.get("user_profile", {})
    user_profile_str = str(user_profile)
    
    # =====================================================================
    # 2. MULTI-UNIVERSITY: Lấy thông tin trường từ user_profile + registry
    # =====================================================================
    target_uni = user_profile.get("target_university")
    if not target_uni:
        signed_msg = AIMessage(
            content=(
                "[Báo cáo từ AcademicExpert]:\n"
                "Hệ thống chưa xác định được trường mục tiêu, nên không tra cứu quy chế tuyển sinh để tránh dùng nhầm quy định của trường khác."
            ),
            name="AcademicExpert",
        )
        called_agents = state.get("called_agents", [])
        if "AcademicExpert" not in called_agents:
            called_agents = called_agents + ["AcademicExpert"]
        return {"messages": [signed_msg], "called_agents": called_agents}
    target_uni = str(target_uni)
    # TEMPORAL ANCHORING: Nếu user không nhập năm → mặc định = năm hiện tại
    target_year = str(user_profile.get("target_year", CURRENT_YEAR))
    uni_info = get_university_info(target_uni)
    uni_name = uni_info["name"]
    
    logger.info(f"   🏫 Target: {uni_name} ({target_uni}) - Năm {target_year} (system clock: {CURRENT_YEAR})")

    # =====================================================================
    # 3. BƯỚC PRE-FETCHING — Tự tay gọi ChromaDB (filter theo trường)
    # =====================================================================
    # Áp dụng vocabulary_map nếu có (VD: BKA: TSA → ĐGTD)
    optimized_query = query
    vocab_map = uni_info.get("vocabulary_map", {})
    for user_term, doc_term in vocab_map.items():
        if user_term.upper() in query.upper():
            optimized_query = query.replace(user_term, doc_term)
            logger.info(f"   🔧 Vocabulary map: '{user_term}' → '{doc_term}'")
            break
    
    retrieved_docs = search_admission_rules.invoke({
        "query": optimized_query, 
        "university": target_uni, 
        "year": target_year
    })
    
    # DEBUG log
    print(f"\n{'='*60}")
    print(f"📥 [DEBUG] DỮ LIỆU TỪ CHROMADB ({target_uni}) TRẢ VỀ CHO AI:")
    print(retrieved_docs[:500] + "..." if len(retrieved_docs) > 500 else retrieved_docs)
    print(f"{'='*60}\n")

    # =====================================================================
    # 4. NHỒI DỮ LIỆU VÀO PROMPT CHO LLM (Generic cho mọi trường)
    # =====================================================================
    forced_context = f"""THÔNG TIN HỆ THỐNG: Năm hiện tại là {CURRENT_YEAR}. Nếu người dùng không chỉ định năm cụ thể, hãy mặc định tư vấn dựa trên quy chế và dữ liệu tuyển sinh mới nhất (của năm {CURRENT_YEAR} hoặc năm gần nhất trước đó có dữ liệu).

TRƯỜNG ĐÍCH: {uni_name} (Mã: {target_uni})
NĂM XÉT TUYỂN MỤC TIÊU: {target_year}

Hồ sơ học sinh:
{user_profile_str}

Câu hỏi: {query}

[TÀI LIỆU QUY CHẾ CỦA TRƯỜNG {target_uni} NĂM {target_year} ĐÃ ĐƯỢC HỆ THỐNG TRÍCH XUẤT]:
{retrieved_docs}

LỆNH BẮT BUỘC:
1. Bạn CHỈ ĐƯỢC PHÉP đọc [TÀI LIỆU QUY CHẾ] ở trên để trả lời. TUYỆT ĐỐI không dùng tool tìm kiếm nữa.
2. Chỉ sử dụng quy chế của NĂM {target_year}. TUYỆT ĐỐI KHÔNG dùng luật/công thức của năm khác.
3. Hãy tìm công thức tính điểm và bảng quy đổi phù hợp, rồi ráp số vào tính toán!"""

    from langchain_core.messages import HumanMessage, AIMessage
    context_msg = HumanMessage(content=forced_context)
    
    # 5. Gọi LLM
    result = get_expert_agents()["academic_agent"].invoke({"messages": [context_msg]})
    
    final_msg = result["messages"][-1] if isinstance(result, dict) and "messages" in result else result
    
    # KÝ TÊN VÀ ĐÁNH DẤU BÁO CÁO
    signed_msg = AIMessage(
        content=f"[Báo cáo từ AcademicExpert — Trường {target_uni}]:\n{final_msg.content}", 
        name="AcademicExpert"
    )
    logger.info(f"   ✅ Academic Expert response added ({target_uni})")
    
    called_agents = state.get("called_agents", [])
    if "AcademicExpert" not in called_agents:
        called_agents = called_agents + ["AcademicExpert"]
    
    return {"messages": [signed_msg], "called_agents": called_agents}


def data_strategist_node(state: AgentState) -> dict:
    logger.info("📊 Data Strategist: Analyzing admission chances...")
    time.sleep(3)  # Rate limiting
    
    # Extract query
    query = ""
    for msg in state["messages"]:
        if isinstance(msg, tuple) and msg[0] == "user":
            query = msg[1]
            break
        elif hasattr(msg, "type") and msg.type == "human":
            query = msg.content
            break
    
    if not query:
        query = state["messages"][-1].content if state["messages"] else ""
    
    user_profile = state.get("user_profile", {})
    user_profile_str = str(user_profile)
    
    # MULTI-UNIVERSITY: Inject university info
    target_uni = user_profile.get("target_university")
    if not target_uni:
        signed_msg = AIMessage(
            content=(
                "[Báo cáo từ DataStrategist]:\n"
                "Hệ thống chưa xác định được trường mục tiêu, nên không tra cứu điểm chuẩn để tránh dùng nhầm dữ liệu của trường khác."
            ),
            name="DataStrategist",
        )
        called_agents = state.get("called_agents", [])
        if "DataStrategist" not in called_agents:
            called_agents = called_agents + ["DataStrategist"]
        return {"messages": [signed_msg], "called_agents": called_agents}
    uni_info = get_university_info(target_uni)
    uni_name = uni_info["name"]
    
    # TEMPORAL ANCHORING: Nếu user không nhập năm → mặc định = năm hiện tại
    target_year = str(user_profile.get("target_year", CURRENT_YEAR))
    logger.info(f"   📅 Temporal Lock: target_year={target_year} cho {target_uni} (system clock: {CURRENT_YEAR})")
    
    # Chuẩn hóa tham số: Lấy major_code
    major_code = user_profile.get("target_major", "")
    if not major_code:
        logger.warning("   Missing target_major; skipping cutoff comparison to avoid cross-major score lookup")
        signed_msg = AIMessage(
            content=(
                f"[Báo cáo từ DataStrategist — Trường {target_uni}]:\n"
                f"Hệ thống chưa xác định được mã ngành cụ thể cho trường {target_uni}. "
                "Vì vậy, hệ thống không so sánh điểm chuẩn để tránh lấy nhầm điểm của ngành khác. "
                "Vui lòng cung cấp mã ngành hoặc tên ngành rõ hơn."
            ),
            name="DataStrategist",
        )
        called_agents = state.get("called_agents", [])
        if "DataStrategist" not in called_agents:
            called_agents = called_agents + ["DataStrategist"]
        return {"messages": [signed_msg], "called_agents": called_agents}
    
    # 🆕 LẤY ĐIỂM ĐÃ TÍNH TỪ SCORE CALCULATOR
    calculated_details = state.get("calculated_details", {})
    calculated_score = state.get("calculated_score")
    
    # =================================================================
    # REFACTOR: Chuyển quyền quyết định 100% cho Taxonomy Engine
    # Để đảm bảo khả năng scale lên 20+ trường, không hardcode "DGTD_TSA" hay "CHUNG_CHI_QUOC_TE".
    # =================================================================
    from app.utils.taxonomy_engine import get_standard_method_tag
    confirmed_method_tag = get_standard_method_tag(query, target_uni)
    logger.info(f"   🔍 Taxonomy Engine resolved method_tag: {confirmed_method_tag} cho trường {target_uni}")
    
    if not confirmed_method_tag:
        signed_msg = AIMessage(
            content=(
                f"[Báo cáo từ DataStrategist — Trường {target_uni}]:\n"
                "Hệ thống chưa xác định chắc chắn phương thức xét tuyển từ câu hỏi. "
                "Vì vậy, hệ thống không tra cứu điểm chuẩn để tránh so sánh nhầm phương thức. "
                "Vui lòng nêu rõ phương thức, ví dụ: THPT_QG, học bạ, TSA, HSA, hoặc xét tuyển kết hợp chứng chỉ quốc tế."
            ),
            name="DataStrategist",
        )
        called_agents = state.get("called_agents", [])
        if "DataStrategist" not in called_agents:
            called_agents = called_agents + ["DataStrategist"]
        return {"messages": [signed_msg], "called_agents": called_agents}

    tsa = calculated_details.get("tsa_score")
    ielts = calculated_details.get("ielts_score")
    bonus = calculated_details.get("ielts_bonus", 0)
    
    # CẢNH BÁO DEBUG: Nếu hồ sơ có điểm thi đặc thù nhưng Taxonomy Engine lại trả về xét điểm thi phổ thông
    if confirmed_method_tag == "THPT_QG" and (tsa is not None and float(tsa) > 0):
        logger.warning(
            f"   ⚠️ LƯU Ý DEBUG: Taxonomy Engine trả về 'THPT_QG' nhưng hồ sơ "
            f"có tsa={tsa}. Kiểm tra lại logic mapping của "
            f"Taxonomy Engine cho trường {target_uni} nếu thấy bất thường."
        )
    
    # Tóm tắt điểm đã tính (nếu có) — nằm NGOÀI việc resolve method_tag
    calculation_summary = ""
    if calculated_score is not None:
        display_tsa = tsa if tsa is not None and str(tsa).strip() != "" else "Không có"
        display_ielts = ielts if ielts is not None and str(ielts).strip() != "" else "Không có"
        
        calculation_summary = f"""
[✅ ĐIỂM ĐÃ ĐƯỢC TÍNH TOÁN BỞI SCORE CALCULATOR]
- Điểm TSA/ĐGTD gốc: {display_tsa}
- Điểm IELTS: {display_ielts}
- Phương thức xét tuyển: {confirmed_method_tag}
- 🎯 TỔNG ĐIỂM CUỐI CÙNG (dùng để so sánh): {calculated_score}
"""
    
    # Lấy báo cáo của Academic Expert
    academic_report = ""
    for msg in reversed(state.get("messages", [])):
        msg_name = getattr(msg, "name", "")
        msg_content = getattr(msg, "content", str(msg))
        if msg_name == "AcademicExpert" or "[Báo cáo từ AcademicExpert]" in msg_content:
            academic_report = msg_content
            break
    
    # 🆕 Lấy báo cáo tính toán từ ScoreCalculator
    score_calc_report = ""
    for msg in reversed(state.get("messages", [])):
        msg_name = getattr(msg, "name", "")
        msg_content = getattr(msg, "content", str(msg))
        if msg_name == "ScoreCalculator":
            score_calc_report = msg_content
            break
            
    # =================================================================
    # FIX DOMAIN LOGIC: Gọi tool trực tiếp bằng Python, BỎ QUA LLM
    # -----------------------------------------------------------------
    # Trước đây: ReAct agent (LLM) tự gọi get_historical_scores
    #   → LLM truyền sai method_tag (VD: THPT_QG thay vì DGTD_TSA)
    #   → So sánh chéo thang: 83.0 (TSA/100) vs 28.53 (THPT/30) = "AN TOÀN" (SAI!)
    # 
    # Bây giờ: Python gọi tool trực tiếp với tham số chính xác từ Taxonomy Engine
    #   → Đảm bảo 100% đúng method_tag, không hallucination
    # =================================================================
    import re
    import json
    
    logger.info(f"   🎯 [Direct Call] get_historical_scores(university='{target_uni}', major='{major_code}', year='{target_year}', method_tag='{confirmed_method_tag}')")
    
    try:
        tool_result = get_historical_scores.invoke({
            "university": target_uni,
            "major": major_code,
            "year": target_year,
            "method_tag": confirmed_method_tag,
        })
        logger.info(f"   📊 Tool result (first 300 chars): {str(tool_result)[:300]}")
    except Exception as e:
        logger.error(f"   ❌ Direct tool call failed: {e}")
        tool_result = ""
    
    # Parse JSON từ kết quả tool (tool trả về text + JSON)
    cutoff = None
    result_text = str(tool_result)
    json_start = result_text.find("{")
    json_text = result_text[json_start:].strip() if json_start >= 0 else ""
    if json_text:
        try:
            data = json.loads(json_text)
            if data.get("status") == "success" and data.get("history"):
                cutoff = float(data["history"][0].get("score", 0))
                logger.info(f"   ✅ Parsed cutoff_score = {cutoff} from JSON history")
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
            logger.warning(f"   ⚠️ Failed to parse JSON history: {e}")
    
    # Fallback: thử regex số từ text output
    if cutoff is None or cutoff == 0:
        score_match = re.search(r'=\s*([\d.]+)\s*điểm', str(tool_result))
        if score_match:
            try:
                cutoff = float(score_match.group(1))
                logger.info(f"   ✅ Parsed cutoff_score = {cutoff} from text regex")
            except ValueError:
                pass
    
    # =================================================================
    # SCALE MISMATCH GUARD: Phát hiện so sánh chéo thang điểm
    # -----------------------------------------------------------------
    # TSA/ĐGTD: thang 100 (điểm thường 50-95)
    # THPT/Học bạ: thang 30 (điểm thường 15-30)
    # Nếu calculated > 40 mà cutoff < 40 → chắc chắn sai thang!
    # =================================================================
    final_msg_content = ""
    
    if cutoff is not None and cutoff > 0 and calculated_score is not None:
        # Guard: phát hiện sai thang điểm
        is_scale_mismatch = (
            (calculated_score > 40 and cutoff < 40) or  # TSA vs THPT
            (calculated_score < 40 and cutoff > 40)      # THPT vs TSA
        )
        
        if is_scale_mismatch:
            logger.error(
                f"   🚨 SCALE MISMATCH DETECTED! "
                f"calculated={calculated_score} vs cutoff={cutoff} "
                f"(method_tag={confirmed_method_tag})"
            )
            final_msg_content = (
                f"⚠️ CẢNH BÁO: Hệ thống phát hiện sai lệch thang điểm!\n"
                f"- Điểm xét tuyển của bạn: {calculated_score} (phương thức {confirmed_method_tag})\n"
                f"- Điểm chuẩn truy xuất được: {cutoff}\n"
                f"- Hai con số này có vẻ thuộc 2 thang điểm khác nhau.\n"
                f"- Vui lòng kiểm tra lại phương thức xét tuyển và liên hệ bộ phận tuyển sinh."
            )
        else:
            # So sánh hợp lệ — cùng thang điểm
            diff = calculated_score - cutoff
            
            if diff >= 0:
                label = "AN TOÀN"
            elif diff >= -1.0:
                label = "THỬ THÁCH"
            else:
                label = "TRƯỢT"
                
            final_msg_content = (
                f"- Điểm xét tuyển của học sinh: {calculated_score}\n"
                f"- Điểm chuẩn thực tế ({confirmed_method_tag}, năm {target_year}): {cutoff}\n"
                f"- Chênh lệch: {diff:.2f}\n"
                f"- Đánh giá cơ hội đỗ: BẮT BUỘC DÁN NHÃN **{label}**"
            )
            logger.info(f"   ✅ Comparison: {calculated_score} vs {cutoff} = {label} (diff={diff:.2f})")
    
    elif cutoff is None or cutoff == 0:
        final_msg_content = (
            f"Hệ thống không tìm thấy điểm chuẩn phương thức {confirmed_method_tag} "
            f"năm {target_year} cho trường {target_uni} ngành {major_code}. "
            f"Không thể đánh giá cơ hội đỗ."
        )
        logger.warning(f"   ⚠️ No cutoff found for {confirmed_method_tag}")
    else:
        # calculated_score is None — chưa có điểm tính toán
        final_msg_content = (
            f"Thông tin điểm chuẩn {confirmed_method_tag} năm {target_year}: {cutoff}\n"
            f"(Chưa có điểm xét tuyển của học sinh để so sánh)"
        )
            
    signed_msg = AIMessage(
        content=f"[Báo cáo từ DataStrategist — Trường {target_uni}]:\n{final_msg_content}", 
        name="DataStrategist"
    )
    logger.info(f"   ✅ Data Strategist response added ({target_uni})")
    
    called_agents = state.get("called_agents", [])
    if "DataStrategist" not in called_agents:
        called_agents = called_agents + ["DataStrategist"]
    
    return {"messages": [signed_msg], "called_agents": called_agents}


class ScoreCalculationResult(BaseModel):
    extracted_formula: str = Field(description="Công thức tính điểm được trích xuất từ quy chế. Ghi rõ các thành phần điểm và hệ số nếu có.")
    conversion_details: str = Field(description="Chi tiết quy đổi điểm chứng chỉ quốc tế (IELTS) nếu có trong quy chế.")
    math_steps: str = Field(description="Các bước tính toán chi tiết với số liệu thực tế của học sinh. Ví dụ: Toán 8.5 + Vật lý 7.0 + IELTS quy đổi 9.5")
    total_score: float = Field(description="Tổng điểm xét tuyển cuối cùng bằng số thập phân (ví dụ: 25.0 hoặc 82.0)")

def score_calculator_node(state: AgentState) -> dict:
    """
    🧮 Score Calculator Node - Dynamic Calculation Bridge using LLM Structured Output
    
    Trách nhiệm:
    1. Trích xuất điểm từ hồ sơ học sinh
    2. Tìm công thức xét tuyển từ ChromaDB dựa trên trường/phương thức
    3. Trích xuất đúng bảng quy đổi IELTS từ ChromaDB
    4. Dùng LLM ép kiểu JSON để tính toán tường minh từng bước (hạn chế ảo giác)
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info("🧮 Score Calculator: Tính toán điểm xét tuyển...")
    time.sleep(3)  # Rate limiting
    
    # 1. Trích xuất dữ liệu từ hồ sơ
    user_profile = state.get("user_profile", {})
    target_uni = user_profile.get("target_university")
    if not target_uni:
        calculation_msg = AIMessage(
            content=(
                "[📊 SCORE CALCULATION REPORT]\n"
                "Hệ thống chưa xác định được trường mục tiêu, nên không tính điểm xét tuyển để tránh áp dụng nhầm công thức."
            ),
            name="ScoreCalculator",
        )
        called_agents = state.get("called_agents", [])
        if "ScoreCalculator" not in called_agents:
            called_agents = called_agents + ["ScoreCalculator"]
        return {
            "messages": [calculation_msg],
            "called_agents": called_agents,
            "calculated_score": None,
            "calculated_details": {},
        }
    target_uni = str(target_uni)
    target_year = str(user_profile.get("target_year", CURRENT_YEAR))
    
    # Prefer values provided in the user's latest question; fall back to profile
    query_text = ""
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, tuple) and msg[0] == "user":
            query_text = msg[1]
            break
        elif hasattr(msg, "type") and getattr(msg, "type", None) == "human":
            query_text = msg.content
            break

    import re
    assessment_from_query = None
    tsa_from_query = None
    ielts_from_query = None
    if query_text:
        # Try to extract TSA from explicit mention first
        match = re.search(r"(?:TSA|ĐGTD|đánh giá tư duy)[^\d]*(\d+(?:\.\d+)?)", query_text, re.IGNORECASE)
        if match:
            try:
                tsa_from_query = float(match.group(1))
                logger.info(f"   📖 Trích xuất từ query: TSA = {tsa_from_query}")
            except Exception:
                tsa_from_query = None

        assessment_labels = r"TSA|ĐGTD|DGTD|đánh giá tư duy|danh gia tu duy|HSA|ĐGNL|DGNL|đánh giá năng lực|danh gia nang luc|V-SAT|VSAT"
        for pattern in (
            rf"(?:{assessment_labels})[^\d]*(\d+(?:\.\d+)?)",
            rf"(\d+(?:\.\d+)?)\s*(?:điểm)?\s*(?:{assessment_labels})",
        ):
            match_assessment = re.search(pattern, query_text, re.IGNORECASE)
            if match_assessment:
                try:
                    assessment_from_query = float(match_assessment.group(1))
                    logger.info(f"   📖 Trích xuất từ query: điểm bài thi riêng/ĐGNL/TSA = {assessment_from_query}")
                    break
                except Exception:
                    assessment_from_query = None

        # Extract IELTS if mentioned in query
        match2 = re.search(r"(?:IELTS|ielts)[^\d]*(\d+(?:\.\d+)?)", query_text, re.IGNORECASE)
        if match2:
            try:
                ielts_from_query = float(match2.group(1))
                logger.info(f"   📖 Trích xuất từ query: IELTS = {ielts_from_query}")
            except Exception:
                ielts_from_query = None

    # Prefer query values when present; otherwise use profile
    if assessment_from_query is not None:
        tsa_score = assessment_from_query
        tsa_source = "query"
    elif tsa_from_query is not None:
        tsa_score = tsa_from_query
        tsa_source = "query"
    else:
        tsa_score = user_profile.get("tsa_score")
        tsa_source = "profile" if user_profile.get("tsa_score") is not None else "unknown"

    if ielts_from_query is not None:
        ielts_score = ielts_from_query
        ielts_source = "query"
    else:
        ielts_score = user_profile.get("ielts")
        ielts_source = "profile" if user_profile.get("ielts") is not None else "unknown"

    logger.info(f"   📊 Dữ liệu học sinh: TSA={tsa_score} (from {tsa_source}), IELTS={ielts_score} (from {ielts_source})")
    
    # 2. Tìm công thức xét tuyển và bảng điểm IELTS từ ChromaDB
    logger.info(f"   🔍 Tìm quy chế và bảng quy đổi điểm từ ChromaDB ({target_uni})...")
    
    formula_query = f"Công thức tính điểm xét tuyển của {target_uni} năm {target_year}"
    formula_rules = search_admission_rules.invoke({
        "query": formula_query,
        "university": target_uni,
        "year": target_year
    })

    ielts_query = f"Bảng quy đổi điểm thưởng chứng chỉ ngoại ngữ quốc tế IELTS của {target_uni} năm {target_year}"
    ielts_rules = search_admission_rules.invoke({
        "query": ielts_query,
        "university": target_uni,
        "year": target_year
    })
    
    admission_rules = formula_rules + "\n\n--- THÔNG TIN QUY ĐỔI/THƯỞNG IELTS ---\n\n" + ielts_rules
    
    logger.info(f"   📋 Đã lấy tài liệu quy chế để tính toán")
    
    # Lấy báo cáo của Academic Expert để tránh ScoreCalculator bị ảo giác
    academic_report = ""
    for msg in reversed(state.get("messages", [])):
        msg_name = getattr(msg, "name", "")
        msg_content = getattr(msg, "content", str(msg))
        if msg_name == "AcademicExpert" or "[Báo cáo từ AcademicExpert]" in msg_content:
            academic_report = msg_content
            break

    prompt = f"""Bạn là Chuyên gia Tính Điểm Tuyển Sinh siêu cấp chính xác.
Nhiệm vụ của bạn là tính điểm xét tuyển cuối cùng cho thí sinh dựa vào hồ sơ và quy chế. KHÔNG ĐƯỢC BỊA ĐẶT CÔNG THỨC.

TRƯỜNG ĐÍCH: {target_uni} (Năm: {target_year})
PHƯƠNG THỨC/NGÀNH: {user_profile.get('target_major', 'Không xác định')}

[CÂU HỎI & BỔ SUNG CỦA THÍ SINH (ƯU TIÊN LẤY SỐ LIỆU TỪ ĐÂY)]
{query_text}

[HỒ SƠ THÍ SINH CƠ BẢN (CHỈ DÙNG NẾU CÂU HỎI KHÔNG NHẮC ĐẾN)]
- Điểm TSA/ĐGTD: {tsa_score}
- Điểm IELTS: {ielts_score}
- Điểm THPT (Học bạ/Thi): {user_profile.get('transcript', dict())}

[BÁO CÁO TỪ ACADEMIC EXPERT (ĐÃ PHÂN TÍCH QUY CHẾ VÀ TÌM CÔNG THỨC CHUẨN)]
{academic_report}

[QUY CHẾ TỪ CHROMADB (DÙNG ĐỂ TÌM THÊM BẢNG QUY ĐỔI NẾU CẦN)]
{admission_rules}

HƯỚNG DẪN BẮT BUỘC:
1. LUÔN ƯU TIÊN SỬ DỤNG CÔNG THỨC TỪ [BÁO CÁO TỪ ACADEMIC EXPERT]. Chỉ khi nào báo cáo này thiếu công thức thì mới tự tìm trong ChromaDB.
2. Lấy dữ liệu điểm từ [CÂU HỎI & BỔ SUNG CỦA THÍ SINH]. Nếu câu hỏi có cung cấp điểm môn học (ví dụ: Toán 8.5, Lý 7.0), điểm IELTS hay bài thi, BẮT BUỘC phải lấy số đó để tính toán (ghi đè hồ sơ cũ).
3. Nếu hồ sơ/câu hỏi có IELTS, bạn PHẢI tìm BẢNG QUY ĐỔI hoặc ĐIỂM THƯỞNG tương ứng và quy đổi theo công thức.
4. Thay các số liệu vào CÔNG THỨC.
5. TÍNH TOÁN CẨN THẬN từng bước một (cộng/nhân/chia) và ghi vào `math_steps`.
6. Đưa ra tổng điểm cuối cùng (kiểu float) vào `total_score`.
"""

    logger.info(f"   🤖 Đang gọi strict_llm để phân tích công thức và tính toán...")
    try:
        structured_llm = get_llms()["strict_llm"].with_structured_output(ScoreCalculationResult)
        result = structured_llm.invoke(prompt)
        
        total_score = result.total_score
        calculation_report = f"""
[📊 SCORE CALCULATION REPORT]
Trường: {target_uni} - Năm: {target_year}

📌 DỮ LIỆU ĐẦU VÀO:
- TSA/ĐGTD: {tsa_score}
- IELTS: {ielts_score}
- Môn học: {user_profile.get('transcript', {})}

🔧 CÔNG THỨC & QUY ĐỔI TỪ ĐỀ ÁN:
- Công thức áp dụng: {result.extracted_formula}
- Quy đổi IELTS: {result.conversion_details}

🧮 CHI TIẾT TÍNH TOÁN:
{result.math_steps}

🎯 KẾT QUẢ TÍNH TOÁN:
✅ Tổng điểm xét tuyển: {total_score}

⚠️ LƯU Ý CHO DATA STRATEGIST:
Dùng chính xác số {total_score} để so sánh với điểm chuẩn.
"""
        logger.info(f"   ✅ Calculation complete. Total: {total_score}")
    except Exception as e:
        logger.error(f"   ❌ Lỗi khi tính điểm bằng LLM: {e}", exc_info=True)
        calculation_report = f"[📊 SCORE CALCULATION REPORT]\nLỗi tính điểm: {e}"
        total_score = None

    # 4. Lưu kết quả vào state
    from langchain_core.messages import AIMessage
    calculation_msg = AIMessage(
        content=calculation_report,
        name="ScoreCalculator"
    )
    
    called_agents = state.get("called_agents", [])
    if "ScoreCalculator" not in called_agents:
        called_agents = called_agents + ["ScoreCalculator"]
    
    return {
        "messages": [calculation_msg],
        "called_agents": called_agents,
        "calculated_score": total_score,
        "calculated_details": {
            "tsa_score": tsa_score,
            "ielts_score": ielts_score,
            "total_score": total_score,
        }
    }


# ============================================================================
# 4. LookupAgent Node (Fast Lane)
# ============================================================================

def lookup_agent_node(state: AgentState) -> dict:
    """
    Node cho LookupAgent: trả lời nhanh các câu hỏi tra cứu đơn thuần.
    Luồng này bỏ qua Synthesis và đi thẳng đến END.
    """
    logger.info("🔎 LookupAgent: Đang xử lý tra cứu nhanh...")
    
    # Dùng Gemini LLM để test (Groq gặp vấn đề HTTP 400)
    tools = [search_admission_rules, get_historical_scores]
    lookup_agent = create_expert_agent(
        llm=get_llms()["strict_llm"],  # Dùng Gemini thay vì Groq
        tools=tools,
        system_prompt=LOOKUP_AGENT_PROMPT,
    )
    
    # Log query để debug - phải lấy từ state["messages"] đúng cách
    user_query = ""
    messages = state.get("messages", [])
    
    # Try to find user query - state["messages"] có thể là tuple hoặc BaseMessage
    if messages:
        if isinstance(messages[0], tuple) and messages[0][0] == "user":
            user_query = messages[0][1]
        elif hasattr(messages[0], "content"):
            user_query = messages[0].content
    
    logger.info(f"   📝 Query: {user_query}")
    logger.info(f"   🔧 Available tools: {[t.name for t in tools]}")
    
    user_profile = state.get("user_profile", {}) or {}
    target_uni = user_profile.get("target_university") or state.get("target_university")
    if target_uni and messages:
        context = (
            f"Ngữ cảnh hội thoại hiện tại: người dùng đang hỏi trong hộp thoại của "
            f"{get_university_name(str(target_uni))} (mã {str(target_uni).upper()}). "
            "Nếu câu hỏi dùng từ 'trường' mà không nêu tên trường khác, hãy hiểu là trường này. "
            "Chỉ dùng dữ liệu tuyển sinh của trường này khi gọi tool."
        )
        if isinstance(messages[0], tuple) and messages[0][0] == "user":
            messages = [("user", f"{context}\n\nCâu hỏi: {messages[0][1]}")] + list(messages[1:])
        elif hasattr(messages[0], "content"):
            messages = [HumanMessage(content=f"{context}\n\nCâu hỏi: {messages[0].content}")] + list(messages[1:])
        else:
            messages = [("user", context)] + list(messages)

    result = lookup_agent.invoke({"messages": messages})
    
    # Log all messages to debug tool calls
    if isinstance(result, dict) and "messages" in result:
        logger.info(f"   📊 Agent trả về {len(result['messages'])} messages")
        for i, msg in enumerate(result["messages"]):
            msg_name = getattr(msg, "name", "")
            msg_type = getattr(msg, "type", "")
            logger.info(f"      [{i}] {msg_type} (name={msg_name})")
    
    final_msg = result["messages"][-1] if isinstance(result, dict) and "messages" in result else result
    
    from langchain_core.messages import AIMessage
    
    # In ra nội dung để debug
    final_content = getattr(final_msg, "content", str(final_msg))
    logger.info(f"   💬 Final response: {final_content[:200]}")
    
    signed_msg = AIMessage(
        content=f"[Báo cáo từ LookupAgent]:\n{final_content}",
        name="LookupAgent"
    )
    called_agents = state.get("called_agents", [])
    if "LookupAgent" not in called_agents:
        called_agents = called_agents + ["LookupAgent"]
    
    logger.info("   ✅ LookupAgent hoàn tất, đi thẳng đến END")
    return {"messages": [signed_msg], "called_agents": called_agents}


# ============================================================================
# 5. Supervisor Node with Structured Output
# ============================================================================

class RouteResponse(BaseModel):
    """Supervisor's routing decision."""
    next_agent: Literal["LookupAgent", "CareerProfiler", "AcademicExpert", "ScoreCalculator", "DataStrategist", "FINISH"] = Field(
        description="Which agent to route to next or FINISH if complete"
    )


def supervisor_node(state: AgentState) -> dict:
    """
    Supervisor node - Routes queries to appropriate agents.
    
    Routing Logic:
    1. Detect simple factual lookups → LookupAgent (Fast Lane)
    2. Otherwise → Sequential routing: CareerProfiler → AcademicExpert → ScoreCalculator → DataStrategist → FINISH (Slow Lane)
    """
    logger.info("🧑‍💼 Supervisor analyzing request...")
    time.sleep(3)  # Rate limiting: 3 seconds delay
    
    # =========================================================================
    # BƯỚC 1: PHÁT HIỆN CÂU HỎI TRA CỨU ĐƠN THUẦN (FAST LANE)
    # =========================================================================
    called_agents = state.get("called_agents", [])
    
    # Lấy câu hỏi gốc
    user_query = ""
    for msg in state.get("messages", []):
        if isinstance(msg, tuple) and msg[0] == "user":
            user_query = msg[1]
            break
        elif hasattr(msg, "type") and msg.type == "human":
            user_query = msg.content
            break
    
    # Nếu chưa gọi bất kỳ agent nào, kiểm tra xem là tra cứu hay tư vấn
    if not called_agents and user_query:
        # Keywords cho câu hỏi tra cứu đơn thuần (Factual Lookup)
        lookup_keywords = [
            "điểm chuẩn", "điểm chính thức", "điểm tối thiểu", "passing score",
            "chỉ tiêu tuyển sinh", "quota", "năng lực", "capacity",
            "ngành nào", "khối nào", "xét tuyển", "tuyển sinh",
            "quy chế", "quy định", "regulation", "admission rules",
            "hạn chót", "deadline", "deadline",
            "yêu cầu", "requirement", "điều kiện", "condition"
        ]
        
        # Dấu hiệu câu hỏi TƯ VẤN CÁ NHÂN HÓA (Personalized Counseling)
        personalized_keywords = [
            "tôi có", "em có", "học sinh có", "profile",
            "IELTS", "TOEFL", "MBTI", "tính cách", "personality",
            "điểm THPT", "transcript", "GPA", "hoạch định", "planning",
            "tương lai", "future", "cho em", "cho tôi", "lựa chọn", "suggestion"
        ]
        
        query_lower = user_query.lower()
        
        # Kiểm tra xem câu hỏi có phải TRA CỨU ĐƠN THUẦN không
        is_lookup = any(kw in query_lower for kw in lookup_keywords)
        is_personalized = any(kw in query_lower for kw in personalized_keywords)
        
        # Nếu là tra cứu đơn thuần VÀ KHÔNG phải tư vấn cá nhân hóa → LookupAgent
        if is_lookup and not is_personalized:
            logger.info(f"   🚀 Detected FACTUAL LOOKUP → Routing to LookupAgent (Fast Lane)")
            logger.info(f"      Query: {user_query[:100]}...")
            return {"next_agent": "LookupAgent"}
    
    # =========================================================================
    # BƯỚC 2: TUẦN TỰ ĐỊNH TUYẾN (SLOW LANE)
    # =========================================================================
    logger.info(f"   🚀 Detected PERSONALIZED COUNSELING → Slow Lane")
    
    # Sequential routing: define the order (includes ScoreCalculator)
    agent_sequence = ["CareerProfiler", "AcademicExpert", "ScoreCalculator", "DataStrategist"]
    
    # Find next agent to call
    next_agent = None
    for agent in agent_sequence:
        if agent not in called_agents:
            next_agent = agent
            break
    
    # If all agents have been called, finish
    if next_agent is None:
        next_agent = "FINISH"
    
    logger.info(f"   📋 Routing to: {next_agent}")
    logger.info(f"      (Already called: {called_agents})")
    
    return {"next_agent": next_agent}


# ============================================================================
# Response Synthesis Node
# ============================================================================

def _extract_verified_admission_assessment(data_report: str) -> str | None:
    """Extract deterministic admission comparison from DataStrategist output."""
    if not data_report:
        return None

    score_match = re.search(r"Điểm xét tuyển của học sinh:\s*([\d.]+)", data_report)
    cutoff_match = re.search(
        r"Điểm chuẩn thực tế\s*\(([^,]+),\s*năm\s*([^)]+)\):\s*([\d.]+)",
        data_report,
    )
    diff_match = re.search(r"Chênh lệch:\s*([+-]?[\d.]+)", data_report)
    label_match = re.search(r"\*\*(AN TOÀN|THỬ THÁCH|TRƯỢT)\*\*", data_report)

    if not score_match or not cutoff_match:
        return None

    score = score_match.group(1)
    method_tag = cutoff_match.group(1)
    year = cutoff_match.group(2)
    cutoff = cutoff_match.group(3)
    diff = diff_match.group(1) if diff_match else None
    label = label_match.group(1) if label_match else None

    if label == "AN TOÀN":
        advice = "cơ hội của bạn ở ngưỡng **Rất An Toàn**. Bạn có thể tự tin đặt nguyện vọng."
    elif label == "THỬ THÁCH":
        advice = "đây là lựa chọn **có tính cạnh tranh cao**. Điểm của bạn đang sát mức điểm chuẩn, nên chuẩn bị thêm phương án dự phòng."
    elif label == "TRƯỢT":
        advice = "ngành này hiện **rất khó khăn** với mức điểm này. Bạn nên cân nhắc phương thức khác hoặc ngành thay thế."
    else:
        advice = "hãy dùng chênh lệch này để cân nhắc thứ tự nguyện vọng."

    diff_line = f"\n- Chênh lệch: {diff}" if diff is not None else ""
    return (
        "📊 **Đánh giá cơ hội:**\n"
        f"- Điểm xét tuyển của bạn: {score}\n"
        f"- Điểm chuẩn thực tế ({method_tag}, năm {year}): {cutoff}"
        f"{diff_line}\n"
        f"- Kết luận: {advice}"
    )


def _repair_synthesis_contradictions(final_response: str, data_report: str) -> str:
    """Prevent final synthesis from contradicting verified DataStrategist data."""
    verified_assessment = _extract_verified_admission_assessment(data_report)
    if not verified_assessment:
        return final_response

    contradiction_phrases = [
        "chưa truy xuất được dữ liệu điểm chuẩn",
        "không truy xuất được dữ liệu điểm chuẩn",
        "chưa tìm thấy thông tin điểm chuẩn",
        "không tìm thấy thông tin điểm chuẩn",
    ]
    lower_response = final_response.lower()
    if not any(phrase in lower_response for phrase in contradiction_phrases):
        return final_response

    assessment_section_pattern = re.compile(
        r"(?s)(?:[-*]\s*)?(?:📊\s*)?\*\*Đánh giá cơ hội:\*\*.*?(?=\n(?:[-*]\s*)?(?:🎯|🧮|📊)\s*\*\*|\Z)"
    )
    if assessment_section_pattern.search(final_response):
        return assessment_section_pattern.sub(verified_assessment, final_response, count=1)

    return f"{final_response}\n\n{verified_assessment}"


def synthesis_node(state: AgentState) -> dict:
    """
    Final synthesis node that compiles all expert responses into a coherent answer.
    """
    logger.info("✨ Synthesizing final response...")
    time.sleep(3)  # Rate limiting
    
    # 1. Trích xuất câu hỏi gốc của người dùng để Synthesis Agent nắm bối cảnh
    user_query = ""
    for msg in state.get("messages", []):
        if isinstance(msg, tuple) and msg[0] == "user":
            user_query = msg[1]
            break
        elif hasattr(msg, "type") and msg.type == "human":
            user_query = msg.content
            break
            
    if not user_query and state.get("messages"):
        last_msg = state["messages"][0]
        user_query = getattr(last_msg, "content", str(last_msg))

    expert_responses = []
    data_strategist_report = ""
    # 2. Collect messages from experts and label their sources clearly
    for msg in state.get("messages", []):
        if hasattr(msg, "name") and msg.name in ["CareerProfiler", "AcademicExpert", "ScoreCalculator", "DataStrategist"]:
            if msg.name == "DataStrategist":
                data_strategist_report = str(msg.content)
            expert_responses.append(f"--- BÁO CÁO TỪ {msg.name.upper()} ---\n{msg.content}")
            
    if not expert_responses:
        final_response = "Xin lỗi, hệ thống không thu thập được đủ báo cáo từ các chuyên gia để đưa ra câu trả lời."
    else:
        combined_response = "\n\n".join(expert_responses)
        
        # 3. Prompt tổng hợp với Bố cục rõ ràng
        synthesis_prompt = f"""Bạn là chuyên gia tư vấn tuyển sinh thân thiện, chuyên nghiệp và thấu cảm.
Nhiệm vụ: Đọc câu hỏi của học sinh và tổng hợp các báo cáo chuyên gia thô cứng bên dưới thành MỘT bức thư tư vấn hoàn chỉnh, logic và dễ hiểu.

CÂU HỎI CỦA HỌC SINH:
"{user_query}"

QUY TẮC BẮT BUỘC KHẮT KHE:
1. NGÔN NGỮ TỰ NHIÊN: Khi nhận được kết quả phân loại từ Data Strategist, TUYỆT ĐỐI KHÔNG lặp lại các lệnh nội bộ như "BẮT BUỘC DÁN NHÃN". Hãy chuyển hóa thành lời khuyên thấu cảm:
   - Nếu là AN TOÀN -> "Với mức điểm này, cơ hội đỗ của bạn ở ngưỡng **Rất An Toàn** 🎉. Bạn hoàn toàn có thể tự tin đặt nguyện vọng."
   - Nếu là THỬ THÁCH -> "Đây là một lựa chọn **có tính cạnh tranh cao** ⚡. Điểm của bạn đang sát mức điểm chuẩn, hãy chuẩn bị thêm phương án dự phòng nhé."
   - Nếu là TRƯỢT -> "Với mức điểm hiện tại, ngành này sẽ **rất khó khăn** 😥. Chênh lệch điểm khá lớn, bạn nên xem xét các phương thức khác hoặc tìm ngành thay thế."
2. TÔN TRỌNG SỐ LIỆU TUYỆT ĐỐI: Dùng ĐÚNG số điểm xét tuyển (từ ScoreCalculator) và điểm chuẩn (từ DataStrategist). KHÔNG tự tính lại, KHÔNG làm tròn sai, KHÔNG tự bịa tỷ lệ phần trăm (%).
3. XỬ LÝ THIẾU DỮ LIỆU: 
   - NẾU Data Strategist cung cấp điểm chuẩn cụ thể (ví dụ 26.5): Hãy lấy số đó để so sánh. TUYỆT ĐỐI KHÔNG dùng câu "Hệ thống hiện chưa truy xuất được...".
   - CHỈ KHI Data Strategist báo lỗi hoặc không có số liệu: MỚI ĐƯỢC phép nói "Hệ thống hiện chưa truy xuất được dữ liệu điểm chuẩn lịch sử của phương thức này để so sánh" và bỏ qua phần đánh giá cơ hội đỗ.
4. TINH GỌN: Không copy y nguyên các phép tính dài dòng của Academic Expert. Chỉ lấy kết luận cuối cùng.

5. NIỀM TIN TUYỆT ĐỐI VÀO PHƯƠNG THỨC: 
   - Số liệu điểm chuẩn mà Data Strategist cung cấp CHÍNH LÀ của phương thức mà học sinh đang hỏi (hệ thống đã tự động map mã nội bộ như DGNL_HSA tương đương với phương thức kết hợp của trường). 
   - TUYỆT ĐỐI KHÔNG ĐƯỢC bắt bẻ tên gọi phương thức. 
   - TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý kết luận "Hệ thống chưa tìm thấy thông tin điểm chuẩn" khi Data Strategist đã trả về một con số cụ thể.

BỐ CỤC TRẢ LỜI YÊU CẦU (Bắt buộc dùng Markdown):
Xin chào! Cảm ơn bạn đã tin tưởng hệ thống tư vấn AI...
- 🎯 **Định hướng ngành nghề:** (Tóm tắt ngắn gọn top ngành phù hợp từ CareerProfiler)
- 🧮 **Kết quả điểm xét tuyển:** (Cách quy đổi điểm và tổng điểm cuối cùng từ ScoreCalculator)
- 📊 **Đánh giá cơ hội:** (So sánh điểm chuẩn và Kết luận dựa trên DataStrategist)

DỮ LIỆU TỪ CÁC CHUYÊN GIA:
{combined_response}

Câu trả lời tư vấn:"""

        # Gọi LLaMA (Groq) thay vì Gemini để tránh bị treo do quota/rate-limits
        final_msg = get_llms()["groq_llm"].invoke(synthesis_prompt)
        
        # Xử lý trường hợp nội dung trả về
        if isinstance(final_msg.content, list):
            text_blocks = [item.get("text", "") for item in final_msg.content if isinstance(item, dict) and "text" in item]
            final_response = "\n".join(text_blocks) if text_blocks else str(final_msg.content)
        else:
            final_response = final_msg.content

        final_response = _repair_synthesis_contradictions(
            str(final_response),
            data_strategist_report,
        )
            
        logger.info(f"   ✅ Synthesis completed")
    
    # Ký tên "Synthesis" cho tin nhắn tổng hợp cuối cùng
    from langchain_core.messages import AIMessage
    return {"messages": [AIMessage(content=final_response, name="Synthesis")]}


# ============================================================================
# 5. Build StateGraph
# ============================================================================

def build_ai_workflow():
    """Build and compile the LangGraph workflow without running at import time."""
    logger.info("\n" + "=" * 70)
    logger.info("Building LangGraph State Machine...")
    logger.info("=" * 70)

    graph_builder = StateGraph(AgentState)

    logger.info("Adding nodes...")
    graph_builder.add_node("preflight", preflight_node)
    graph_builder.add_node("receptionist", receptionist_node)
    graph_builder.add_node("supervisor", supervisor_node)
    graph_builder.add_node("CareerProfiler", career_profiler_node)
    graph_builder.add_node("AcademicExpert", academic_expert_node)
    graph_builder.add_node("ScoreCalculator", score_calculator_node)
    graph_builder.add_node("DataStrategist", data_strategist_node)
    graph_builder.add_node("LookupAgent", lookup_agent_node)
    graph_builder.add_node("synthesis", synthesis_node)
    logger.info("Nodes added")

    graph_builder.add_edge(START, "preflight")

    def route_from_preflight(state: AgentState) -> str:
        next_agent = state.get("next_agent", "receptionist")
        return next_agent

    graph_builder.add_conditional_edges(
        "preflight",
        route_from_preflight,
        {
            "END": END,
            "receptionist": "receptionist",
        }
    )

    def route_from_receptionist(state: AgentState) -> str:
        next_agent = state.get("next_agent", "supervisor")
        return next_agent

    graph_builder.add_conditional_edges(
        "receptionist",
        route_from_receptionist,
        {
            "END": END,
            "supervisor": "supervisor",
        }
    )

    def route_to_agent(state: AgentState) -> str:
        next_agent = state.get("next_agent", "FINISH")
        return next_agent

    graph_builder.add_conditional_edges(
        "supervisor",
        route_to_agent,
        {
            "LookupAgent": "LookupAgent",
            "CareerProfiler": "CareerProfiler",
            "AcademicExpert": "AcademicExpert",
            "ScoreCalculator": "ScoreCalculator",
            "DataStrategist": "DataStrategist",
            "FINISH": "synthesis",
        }
    )

    graph_builder.add_edge("CareerProfiler", "supervisor")
    graph_builder.add_edge("AcademicExpert", "supervisor")
    graph_builder.add_edge("ScoreCalculator", "supervisor")
    graph_builder.add_edge("DataStrategist", "supervisor")
    graph_builder.add_edge("LookupAgent", END)
    graph_builder.add_edge("synthesis", END)

    compiled_graph = graph_builder.compile()
    logger.info("Graph compiled successfully")
    return compiled_graph


def get_ai_workflow():
    """FastAPI dependency-friendly accessor for the cached AI workflow."""
    global _ai_workflow

    if _ai_workflow is None:
        _ai_workflow = build_ai_workflow()

    return _ai_workflow

# ============================================================================
# 6. Test Execution (Multi-University Support)
# ============================================================================

# ---- Test Profiles & Queries ----
TEST_CASES = {
    "BKA": {
        "profile": {
            "mbti": "INTJ - Thích phân tích logic, hợp công nghệ",
            "ielts": 7.5,
            "transcript": {"Toán": 9.5, "Lý": 8.0, "Hóa": 8.0},
            "tsa_score": 72.0,
            "target_university": "BKA",
            "target_major": "IT1",
            "target_year": "2024",
        },
        "query": (
            "Với hồ sơ có IELTS 7.5 và điểm thi Đánh giá tư duy (TSA) là 78 điểm, "
            "em muốn xét tuyển vào ngành Khoa học máy tính (IT1) của Bách Khoa. "
            "Hệ thống hãy trích xuất quy định cộng điểm thưởng IELTS vào phương thức "
            "TSA của BKA, TỰ TÍNH TOÁN tổng điểm xét tuyển cho em và cho biết cơ hội "
            "đỗ so với điểm chuẩn TSA thực tế năm 2024."
        ),
    },
    "TMU": {
        "profile": {
            "mbti": "ESFJ - Thích giao tiếp, quan tâm người khác",
            "ielts": 6.5,
            "transcript": {"Toán": 8.5, "Văn": 7.0, "Anh": 8.0},
            "target_university": "TMU",
            "target_major": "TM04",
            "target_year": "2024",
        },
        "query": (
            "Em có IELTS 6.5 và muốn xét tuyển vào ngành Marketing (TM04) của "
            "Trường Đại học Thương mại bằng phương thức kết hợp chứng chỉ quốc tế "
            "với kết quả thi tốt nghiệp THPT (phương thức 409). Điểm thi THPT của em: "
            "Toán 8.5, Vật lý 7.0. Hãy tính điểm xét tuyển cho em theo công thức "
            "của TMU và cho biết cơ hội đỗ."
        ),
    },
    "KHA": {
        "profile": {
            "mbti": "ENTJ - Quyết đoán, thích lãnh đạo, tư duy logic",
            "ielts": 7.0,
            "transcript": {"Toán": 9.0, "Văn": 7.5, "Anh": 8.0, "Lý": 8.5},
            "tsa_score": 85.0,  # Điểm ĐGNL ĐHQGHN (HSA) - Quy đổi theo thang 150
            "target_university": "KHA",
           # "target_major": "7340101",  # Mã ngành Quản trị kinh doanh (NEU)
            "target_major_name": "Quản trị kinh doanh",
            "target_year": "2024",
        },
        "query": (
            "Em có IELTS 7.0 và điểm thi Đánh giá năng lực của ĐHQGHN (HSA) đạt 85/150 điểm. "
            "Ngoài ra điểm thi THPT môn Toán của em là 9.0. Em muốn xét tuyển vào ngành "
            "Quản trị kinh doanh của Đại học Kinh tế Quốc dân (KHA) bằng "
            "Phương thức xét tuyển kết hợp (Nhóm đối tượng 3: Chứng chỉ Tiếng Anh + Điểm ĐGNL/TSA). "
            "Hệ thống hãy trích xuất đúng công thức quy đổi điểm IELTS và quy đổi điểm HSA sang thang 30 của KHA. "
            "Sau đó tính tổng điểm xét tuyển và đánh giá cơ hội đỗ của em so với năm 2024."
        ),
    },
    "LPH": {
    "profile": {
        "mbti": "ENTP - Thích tranh luận, tư duy phản biện, giao tiếp sắc bén",
        "ielts": 6.5,  # Giữ thông tin nhưng không dùng để xét tuyển
        "transcript": {"Toán": 8.0, "Văn": 8.5, "Anh": 7.0},  # Điểm thi THPTQG
        "target_university": "LPH",
        "target_year": "2024",
    },
    "query": (
        "Em có điểm thi THPT Quốc gia 2024: Toán 8.0, Ngữ văn 8.5, Tiếng Anh 7.0. "
        "Em muốn đăng ký xét tuyển vào ngành Luật Kinh tế của trường Đại học Luật Hà Nội (LPH) "
        "theo phương thức xét học bạ kết hợp điểm thi THPTQG tổ hợp D01 (Toán, Văn, Anh). "
        "Hệ thống hãy tính điểm xét tuyển theo quy định của LPH và dự đoán cơ hội đỗ của em."
    ),
},
}


def run_test(test_key: str):
    """Run a single test case by key (BKA, TMU, etc.)."""
    test_case = TEST_CASES.get(test_key.upper())
    if not test_case:
        print(f"❌ Unknown test case: {test_key}. Available: {list(TEST_CASES.keys())}")
        return

    profile = test_case["profile"]
    query = test_case["query"]
    uni_name = get_university_name(profile["target_university"])

    print("\n" + "=" * 80)
    print(f"🚀 TEST: {uni_name} ({profile['target_university']})")
    print("=" * 80)
    print("MOCK STUDENT PROFILE:")
    print("-" * 80)
    for key, value in profile.items():
        print(f"  {key}: {value}")
    print("\nTEST QUERY:")
    print("-" * 80)
    print(f"  {query}")
    print("=" * 80 + "\n")

    initial_state = {
        "messages": [("user", query)],
        "next_agent": "receptionist",  # Start with receptionist node
        "user_profile": profile,
        "called_agents": [],
        "calculated_score": None,
        "calculated_details": {},
    }

    event_count = 0
    final_response = None

    for event in get_ai_workflow().stream(initial_state, stream_mode="values"):
        event_count += 1
        messages = event.get("messages", [])
        if messages:
            last_msg = messages[-1]
            role = getattr(last_msg, "type", "unknown")
            name = getattr(last_msg, "name", "")
            content = getattr(last_msg, "content", str(last_msg))
            if name == "Synthesis":
                final_response = content
            if role != "human":
                sender = name if name else role.upper()
                print(f"\n[Event {event_count}] 🤖 {sender}:")
                preview = str(content)[:400] + "..." if len(str(content)) > 400 else str(content)
                print(f"  {preview}")

    if final_response:
        print("\n" + "=" * 80)
        print("💬 FINAL RESPONSE:")
        print("=" * 80)
        print(final_response)
        print("=" * 80)

    print(f"\n✅ Test {test_key} completed! Events: {event_count}\n")


# Keep backward compatibility
def test_workflow():
    """Original test function — runs BKA test case."""
    run_test("BKA")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Test Multi-Agent Workflow")
    parser.add_argument("--uni", default="BKA", help="University code: BKA, TMU, etc.")
    args = parser.parse_args()

    try:
        run_test(args.uni)
    except Exception as e:
        logger.error(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
