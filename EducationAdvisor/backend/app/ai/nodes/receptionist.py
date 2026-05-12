"""
Node Lễ tân (Receptionist) - Trích xuất và chuẩn hóa thông tin từ câu hỏi người dùng
Sử dụng Gemini 2.5 Flash để Entity Extraction và Decision Making
"""

import re
import unicodedata
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.tools import tool


# ============================================================================
# 1. ĐỊNH NGHĨA ENUM VÀ PYDANTIC MODEL
# ============================================================================

class IntentEnum(str, Enum):
    """Enum định nghĩa ý định người dùng"""
    TRA_CUU = "TRA_CUU"  # Tra cứu thông tin
    TU_VAN = "TU_VAN"    # Tư vấn


class ExtractedEntities(BaseModel):
    """
    Model Structured Output từ Gemini
    Chứa các thực thể đã trích xuất và chuẩn hóa từ câu hỏi người dùng
    """
    
    target_university: Optional[str] = Field(
        default=None,
        description="Mã trường đại học (VD: BKA, TMU, KHA, HQT, ...)"
    )
    
    target_major_name: Optional[str] = Field(
        default=None,
        description="Tên ngành học thô từ người dùng (VD: 'quản trị kinh doanh', 'khoa học máy tính')"
    )

    target_year: Optional[str] = Field(
        default=None,
        description="Năm xét tuyển hoặc năm điểm thi/quy chế được người dùng nhắc đến (VD: '2024')"
    )
    
    extracted_scores: Dict[str, float] = Field(
        default_factory=dict,
        description="Dict chứa điểm số đã trích xuất (VD: {'ielts': 7.0, 'hsa': 85, 'toan': 9})"
    )
    
    intent: str = Field(
        default="TRA_CUU",
        description="Ý định người dùng: TRA_CUU hoặc TU_VAN"
    )
    
    is_ambiguous: bool = Field(
        default=False,
        description="True nếu dữ liệu điểm số bị mơ hồ (không rõ loại điểm nào)"
    )
    
    clarification_question: Optional[str] = Field(
        default=None,
        description="Câu hỏi để làm rõ thêm nếu is_ambiguous=True"
    )


YEAR_PATTERN = re.compile(r"\b(20\d{2}|19\d{2})\b")


def extract_target_year_from_text(text: str) -> Optional[str]:
    """Deterministic fallback for target_year extraction."""
    match = YEAR_PATTERN.search(text or "")
    return match.group(1) if match else None


def normalize_vietnamese_text(text: str) -> str:
    """Normalize Vietnamese text for resilient dictionary matching."""
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).lower().strip()


SUBJECT_SCORE_ALIASES = {
    "toan": "Toán",
    "math": "Toán",
    "van": "Văn",
    "ngu van": "Văn",
    "anh": "Anh",
    "tieng anh": "Anh",
    "english": "Anh",
    "ly": "Lý",
    "vat ly": "Lý",
    "physics": "Lý",
    "hoa": "Hóa",
    "hoa hoc": "Hóa",
    "chemistry": "Hóa",
    "sinh": "Sinh",
    "sinh hoc": "Sinh",
    "su": "Sử",
    "lich su": "Sử",
    "dia": "Địa",
    "dia ly": "Địa",
}


def extract_scores_from_text(text: str) -> Dict[str, float]:
    """Deterministic fallback for common Vietnamese score phrases."""
    normalized = normalize_vietnamese_text(text)
    extracted: Dict[str, float] = {}

    for pattern in (r"\bielts\s*(\d+(?:\.\d+)?)\b", r"\b(\d+(?:\.\d+)?)\s*ielts\b"):
        match = re.search(pattern, normalized)
        if match:
            try:
                value = float(match.group(1))
                if 0 <= value <= 9:
                    extracted["ielts"] = value
            except ValueError:
                pass

    assessment_aliases = {
        "tsa": "tsa",
        "dgtd": "tsa",
        "danh gia tu duy": "tsa",
        "hsa": "hsa",
        "dgnl": "dgnl",
        "danh gia nang luc": "dgnl",
        "vsat": "vsat",
        "v sat": "vsat",
    }
    assessment_pattern = "|".join(sorted((re.escape(k) for k in assessment_aliases), key=len, reverse=True))
    assessment_patterns = [
        rf"\b({assessment_pattern})\s*(?:la|duoc|dat|:)?\s*(\d+(?:\.\d+)?)\b",
        rf"\b(\d+(?:\.\d+)?)\s*(?:diem)?\s*({assessment_pattern})\b",
    ]
    for pattern in assessment_patterns:
        for match in re.finditer(pattern, normalized):
            if match.group(1).replace(".", "", 1).isdigit():
                value_text, label_text = match.group(1), match.group(2)
            else:
                label_text, value_text = match.group(1), match.group(2)
            try:
                value = float(value_text)
            except ValueError:
                continue
            if 0 <= value <= 1200:
                extracted[assessment_aliases[label_text]] = value

    subject_pattern = "|".join(sorted((re.escape(k) for k in SUBJECT_SCORE_ALIASES), key=len, reverse=True))
    patterns = [
        rf"\b({subject_pattern})\s*(?:la|duoc|dat|:)?\s*(\d+(?:\.\d+)?)\b",
        rf"\b(\d+(?:\.\d+)?)\s*(?:diem)?\s*({subject_pattern})\b",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, normalized):
            if match.group(1).replace(".", "", 1).isdigit():
                value_text, subject_text = match.group(1), match.group(2)
            else:
                subject_text, value_text = match.group(1), match.group(2)
            try:
                value = float(value_text)
            except ValueError:
                continue
            if 0 <= value <= 10:
                extracted[SUBJECT_SCORE_ALIASES[subject_text]] = value

    return extracted


# ============================================================================
# 2. SYSTEM PROMPT CHO GEMINI
# ============================================================================

EXTRACTOR_PROMPT = """
Bạn là một Lễ tân thông minh (Receptionist Agent) trong hệ thống Tư vấn Tuyển sinh Đại học.
Nhiệm vụ của bạn là trích xuất và chuẩn hóa thông tin từ câu hỏi của người dùng.

**HƯỚNG DẪN CHI TIẾT:**

1. **Chuẩn hóa Mã Trường Đại học:**
   Nếu người dùng nhắc đến tên trường, hãy chuyển đổi sang mã chuẩn như danh sách dưới đây. Cần cực kỳ chú ý các từ khóa viết tắt, tiếng lóng hoặc tên tiếng Anh:
   
   [Khối Kỹ thuật - Công nghệ]
   - "bách khoa hà nội", "bách khoa hn", "hust", "bka" -> "BKA"
   - "bách khoa hcm", "bách khoa tphcm", "hcmut", "qsb" -> "QSB"
   - "công nghệ đại học quốc gia", "công nghệ đhqg", "uet" -> "QHI"
   - "bưu chính viễn thông", "ptit" -> "BVH"
   - "sư phạm kỹ thuật", "sư phạm kỹ thuật tphcm", "hcmute" -> "SPK"

   [Khối Kinh tế - Thương mại]
   - "kinh tế quốc dân", "neu" -> "KHA"
   - "ngoại thương", "ftu" -> "NTH"
   - "thương mại", "tmu" -> "TMU"
   - "kinh tế hcm", "kinh tế tphcm", "ueh" -> "KSA"

   [Khối Xã hội - Ngoại giao - Luật - Sư phạm]
   - "khoa học xã hội và nhân văn", "nhân văn hà nội", "ussh" -> "QHX"
   - "ngoại ngữ đại học quốc gia", "ngoại ngữ đhqg", "ulis" -> "QHF"
   - "luật hà nội", "đại học luật", "hlu" -> "LPH"
   - "ngoại giao", "học viện ngoại giao", "dav" -> "HQT"
   - "sư phạm hà nội", "hnue" -> "SPH"

   [Khối Y - Dược]
   - "y hà nội", "đại học y hà nội", "hmu" -> "YHB"
   - "dược hà nội", "đại học dược", "hup" -> "DKH"
   - "y dược tphcm", "y dược hồ chí minh", "ump" -> "YDS"

   [Khối Đa ngành & Địa phương]
   - "cần thơ", "đại học cần thơ", "ctu" -> "TCT"
   - "duy tân", "đại học duy tân", "dtu" -> "DDT"
   - "tôn đức thắng", "đại học tôn đức thắng", "tdtu" -> "DTT"
   
   NẾU người dùng không nhắc đến trường cụ thể nào, bắt buộc để trống (null). TUYỆT ĐỐI không tự suy diễn tên trường.
   
2. **Trích xuất Tên Ngành Học:**
   Ghi lại tên ngành THÔ (chưa chuẩn hóa) mà người dùng nêu.
   VD: "quản trị kinh doanh", "khoa học máy tính", "kiến trúc"
   Không cần chuẩn hóa hay tìm mã ngành (Node này sẽ làm sau).

3. **Trích xuất Điểm Số:**
   Tìm tất cả các con số và phân loại chúng:
   - IELTS: điểm từ 0-9 (nếu có chữ "IELTS" gần đó)
   - HSA: điểm từ 0-100 (nếu có chữ "HSA" hoặc "học sinh")
   - Điểm Toán: từ 0-10 (nếu có chữ "toán" hoặc "math")
   - Điểm Văn: từ 0-10 (nếu có chữ "văn" hoặc "tiếng việt")
   
   Lưu vào dict: {"ielts": 7.5, "hsa": 85, "toan": 9, ...}

4. **Xác định Ý Định (Intent):**
   - TRA_CUU: "điểm này vào được trường nào?", "có vào BKA được không?"
   - TU_VAN: "tôi nên chọn ngành nào?", "lộ trình tuyển sinh như thế nào?"
   Mặc định là TRA_CUU nếu không chắc.

5. **Phát Hiện Tính Mơ Hồ (is_ambiguous):**
   - CHỈ đánh dấu is_ambiguous=True KHI VÀ CHỈ KHI điểm số không rõ nguồn gốc (VD: "24 điểm" nhưng không rõ là thi THPT, ĐGNL hay Học bạ).
   - TUYỆT ĐỐI KHÔNG đánh dấu is_ambiguous=True khi người dùng dùng các từ lệnh như "hãy tính điểm", "hãy tư vấn", "trích xuất công thức". 
   - Nếu người dùng yêu cầu tính toán, bạn cứ lẳng lặng trích xuất dữ liệu, đặt intent="TU_VAN", đặt is_ambiguous=False. Việc tính toán sẽ có các bộ phận khác ở tuyến sau lo, bạn không cần phải xin lỗi hay giải thích!

6. **LƯU Ý QUAN TRỌNG VỀ THỜI GIAN (TARGET_YEAR):**
    - Bạn CẦN ĐỌC KỸ câu hỏi của người dùng. Nếu họ nhắc đến một năm cụ thể (Ví dụ: "Điểm thi THPT Quốc gia 2024", "Năm 2024", "2023"), bạn PHẢI trích xuất và cập nhật trường `target_year` thành năm đó.

7. **Ưu tiên:**
   - Nếu người dùng rõ ràng: is_ambiguous = False, clarification_question = None
   - Nếu bất kỳ phần nào mơ hồ: is_ambiguous = True, tạo câu hỏi làm rõ

**VÍ DỤ:**

Input: "Mình có điểm IELTS 7.5 và muốn xem vào được Bách khoa không?"
Output:
{
  "target_university": "BKA",
  "target_major_name": null,
  "extracted_scores": {"ielts": 7.5},
  "intent": "TRA_CUU",
  "is_ambiguous": false,
  "clarification_question": null
}

Input: "Mình có 24 điểm, muốn vào ngành Quản trị kinh doanh"
Output:
{
  "target_university": null,
  "target_major_name": "quản trị kinh doanh",
  "extracted_scores": {},
  "intent": "TRA_CUU",
  "is_ambiguous": true,
  "clarification_question": "24 điểm này là từ kỳ thi THPT, ĐGNL, hay Học bạ? Và bạn muốn xin vào trường nào?"
}

**LƯU Ý QUAN TRỌNG:**
- Luôn trả về JSON theo schema ExtractedEntities
- Không bao giờ để trống intent (mặc định TRA_CUU)
- Nếu không tìm thấy thông tin nào, vẫn trả về object với giá trị mặc định
"""


# ============================================================================
# 3. HELPER FUNCTION - TÌM MÃ NGÀNH
# ============================================================================

def find_major_code_by_name(uni_code: str, major_name: str) -> Optional[str]:
    """
    Tìm mã ngành chuẩn từ tên ngành thô
    
    Args:
        uni_code: Mã trường đại học (VD: "BKA", "KHA")
        major_name: Tên ngành thô từ người dùng (VD: "quản trị kinh doanh")
    
    Returns:
        Mã ngành chuẩn (VD: "7340101") hoặc None nếu không tìm thấy
    
    Note:
        Hiện tại sử dụng mock dict. Sẽ nối với MongoDB sau.
    """
    
    # Mock database: {uni_code: {major_name_normalized: major_code}}
# Mock database: {uni_code: {major_name_normalized: major_code}}
    # LƯU Ý: Tên ngành phải viết THƯỜNG (lowercase) 100% để thuật toán so khớp chạy đúng.
    MAJOR_DATABASE = {
        # 1. ĐẠI HỌC BÁCH KHOA HÀ NỘI (BKA)
        "BKA": {
            "khoa học máy tính": "IT1",
            "kỹ thuật máy tính": "IT2",
            "kỹ thuật điều khiển và tự động hóa": "EE2",
            "kỹ thuật điện tử viễn thông": "ET1",
            "kỹ thuật cơ điện tử": "ME1",
            "kỹ thuật ô tô": "TE1",
            "kỹ thuật hóa học": "CH1",
            "logistics và quản lý chuỗi cung ứng": "EM5",
            "quản trị kinh doanh": "EM1",
            "kỹ thuật phần mềm": "IT-E6", # Tiên tiến
            "an toàn không gian số": "IT-E15",
            "phân tích dữ liệu": "IT-E10",
        },
        
        # 2. ĐẠI HỌC KINH TẾ QUỐC DÂN (KHA)
        "KHA": {
            "quản trị kinh doanh": "7340101",
            "kinh tế quốc tế": "7310106",
            "kế toán": "7340301",
            "kiểm toán": "7340302",
            "tài chính ngân hàng": "7340201",
            "marketing": "7340115",
            "logistics và quản lý chuỗi cung ứng": "7510605",
            "kinh tế học": "73101011",
            "thương mại điện tử": "7340122",
            "khoa học máy tính": "7480101",
            "quản trị nhân lực": "7340404",
        },
        
        # 3. ĐẠI HỌC THƯƠNG MẠI (TMU)
        "TMU": {
            "quản trị kinh doanh": "TM01",
            "marketing": "TM04",
            "kế toán": "TM06",
            "kiểm toán": "TM07",
            "logistics và quản lý chuỗi cung ứng": "TM13",
            "thương mại điện tử": "TM10",
            "kinh tế quốc tế": "TM14",
            "tài chính ngân hàng": "TM05",
            "ngôn ngữ anh": "TM15",
        },

        # 4. ĐẠI HỌC LUẬT HÀ NỘI (LPH)
        "LPH": {
            "luật": "7380101",
            "luật kinh tế": "7380107",
            "luật thương mại quốc tế": "7380108",
            "ngôn ngữ anh": "7220201",
        },

        # 5. ĐẠI HỌC NGOẠI THƯƠNG (NTH)
        "NTH": {
            "kinh tế": "7310101",
            "kinh tế quốc tế": "7310106",
            "quản trị kinh doanh": "7340101",
            "tài chính ngân hàng": "7340201",
            "kế toán": "7340301",
            "ngôn ngữ anh": "7220201",
            "ngôn ngữ nhật": "7220209",
            "ngôn ngữ trung": "7220204",
            "logistics và quản lý chuỗi cung ứng": "7510605",
        },

        # 6. ĐH CÔNG NGHỆ - ĐHQGHN (QHI)
        "QHI": {
            "công nghệ thông tin": "CN1",
            "kỹ thuật máy tính": "CN2",
            "mạng máy tính và truyền thông dữ liệu": "CN3",
            "khoa học máy tính": "CN8",
            "trí tuệ nhân tạo": "CN16",
            "kỹ thuật cơ điện tử": "CN4",
            "kỹ thuật điều khiển và tự động hóa": "CN5",
            "kỹ thuật hàng không vũ trụ": "CN11",
        },

        # 7. ĐH KINH TẾ - ĐHQGHN (QHX)
        "QHX": {
            "quản trị kinh doanh": "7340101",
            "tài chính ngân hàng": "7340201",
            "kế toán": "7340301",
            "kinh tế quốc tế": "7310106",
            "kinh tế": "7310101",
        },

        # 8. ĐH NGOẠI NGỮ - ĐHQGHN (QHF)
        "QHF": {
            "ngôn ngữ anh": "7220201",
            "ngôn ngữ nga": "7220202",
            "ngôn ngữ pháp": "7220203",
            "ngôn ngữ trung quốc": "7220204",
            "ngôn ngữ đức": "7220205",
            "ngôn ngữ nhật": "7220209",
            "ngôn ngữ hàn quốc": "7220210",
            "sư phạm tiếng anh": "7140231",
        },

        # 9. ĐẠI HỌC SƯ PHẠM HÀ NỘI (SPH)
        "SPH": {
            "sư phạm toán học": "7140209",
            "sư phạm tin học": "7140210",
            "sư phạm vật lý": "7140211",
            "sư phạm hóa học": "7140212",
            "sư phạm ngữ văn": "7140217",
            "sư phạm tiếng anh": "7140231",
            "sư phạm lịch sử": "7140218",
            "giáo dục tiểu học": "7140202",
            "giáo dục mầm non": "7140201",
        },

        # 10. ĐẠI HỌC Y DƯỢC TP.HCM (YDS)
        "YDS": {
            "y khoa": "7720101",
            "y học dự phòng": "7720110",
            "y học cổ truyền": "7720115",
            "răng hàm mặt": "7720501",
            "dược học": "7720201",
            "điều dưỡng": "7720301",
            "kỹ thuật xét nghiệm y học": "7720601",
            "kỹ thuật phục hồi chức năng": "7720603",
        },

        # 11. ĐẠI HỌC DƯỢC HÀ NỘI (DKH)
        "DKH": {
            "dược học": "7720201",
            "hóa dược": "7720203",
            "công nghệ sinh học": "7420201",
        },

        # 12. HỌC VIỆN NGOẠI GIAO (HQT)
        "HQT": {
            "quan hệ quốc tế": "7310206",
            "kinh tế quốc tế": "7310106",
            "truyền thông quốc tế": "7320107",
            "luật quốc tế": "7380108",
            "ngôn ngữ anh": "7220201",
            "kinh doanh quốc tế": "7340120",
        },

        # 13. HỌC VIỆN TÀI CHÍNH (TCT / HTC) 
        # (Giả định mã bạn dùng là TCT dựa trên log, nếu HTC thì đổi lại)
        "TCT": {
            "tài chính ngân hàng": "7340201",
            "kế toán": "7340301",
            "quản trị kinh doanh": "7340101",
            "hệ thống thông tin quản lý": "7480205",
            "ngôn ngữ anh": "7220201",
            "kinh tế": "7310101",
        },
        
        # 14. ĐẠI HỌC Y DƯỢC THÁI BÌNH (YHB)
        "YHB": {
            "y khoa": "7720101",
            "nhi khoa": "7720105",
            "y học cổ truyền": "7720115",
            "y học dự phòng": "7720110",
            "dược học": "7720201",
            "điều dưỡng": "7720301",
        },
    }    
    # Chuẩn hóa tên ngành để so sánh
    major_normalized = major_name.lower().strip()
    major_search_key = normalize_vietnamese_text(major_name)
    
    # Kiểm tra trong mock database
    if uni_code in MAJOR_DATABASE:
        for key, code in MAJOR_DATABASE[uni_code].items():
            if key.lower() == major_normalized:
                return code
            normalized_key = normalize_vietnamese_text(key)
            if normalized_key == major_search_key:
                return code
            if normalized_key in major_search_key or major_search_key in normalized_key:
                return code
    
    # Nếu không tìm thấy chính xác, trả về None
    return None


# ============================================================================
# 4. RECEPTIONIST NODE
# ============================================================================

def receptionist_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Node Lễ tân - Trích xuất thông tin từ câu hỏi người dùng
    
    Args:
        state: Dictionary chứa:
            - messages: List[BaseMessage] - Danh sách tin nhắn
            - user_profile: Dict - Thông tin hồ sơ người dùng (có sẵn hoặc rỗng)
    
    Returns:
        state: Dictionary với các trường được cập nhật:
            - messages: Tin nhắn cập nhật (nếu có clarification)
            - user_profile: Hồ sơ cập nhật với thông tin trường/ngành/điểm
            - next_agent: "END" (cần hỏi lại) hoặc "supervisor" (đủ thông tin)
    """
    
    # Lấy tin nhắn cuối cùng từ người dùng
    messages = state.get("messages", [])
    if not messages:
        return state
    
    # Tìm HumanMessage cuối cùng
    user_message = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            user_message = msg.content
            break
        if isinstance(msg, tuple) and len(msg) >= 2 and msg[0] == "user":
            user_message = msg[1]
            break
    
    if not user_message:
        return state
    
    # ========================================================================
    # Khởi tạo Gemini với Structured Output
    # ========================================================================
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"🎯 Receptionist Node: Xử lý câu hỏi từ người dùng...")
    logger.info(f"   📝 User message: {user_message[:100] + '...' if len(user_message) > 100 else user_message}")
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
        max_retries=2,
    )
    
    # Gắn schema Structured Output
    structured_llm = llm.with_structured_output(ExtractedEntities)
    
    # ========================================================================
    # Gọi Gemini để trích xuất thực thể
    # ========================================================================
    
    try:
        extracted: ExtractedEntities = structured_llm.invoke(
            [
                {"role": "system", "content": EXTRACTOR_PROMPT},
                {"role": "user", "content": user_message},
            ]
        )
        logger.info(f"   ✅ Gemini extraction successful")
        logger.info(f"      - University: {extracted.target_university}")
        logger.info(f"      - Major Name: {extracted.target_major_name}")
        logger.info(f"      - Target Year: {extracted.target_year}")
        logger.info(f"      - Scores: {extracted.extracted_scores}")
        logger.info(f"      - Ambiguous: {extracted.is_ambiguous}")
    except Exception as e:
        logger.error(f"   ❌ Gemini error: {str(e)}")
        # Fallback: trả về state không thay đổi
        state["next_agent"] = "END"
        return state
    
    # ========================================================================
    # LUỒNG 1: Dữ liệu mơ hồ - Yêu cầu làm rõ
    # ========================================================================
    
    if extracted.is_ambiguous:
        logger.warning(f"   ⚠️  Ambiguous data detected - requesting clarification")
        # Thêm clarification_question vào messages
        clarification_msg = AIMessage(
            content=extracted.clarification_question or "Vui lòng cung cấp thêm thông tin để tôi có thể tư vấn chính xác hơn."
        )
        state["messages"].append(clarification_msg)
        state["next_agent"] = "END"
        logger.info(f"   ✅ Receptionist: Dừng tại END, chờ làm rõ từ người dùng")
        
        return state
    
    # ========================================================================
    # LUỒNG 2: Dữ liệu đủ - Cập nhật Profile và tiếp tục
    # ========================================================================
    
    # Khởi tạo user_profile nếu chưa có
    if "user_profile" not in state:
        state["user_profile"] = {}
    
    user_profile = state["user_profile"]
    
    # Cập nhật mã trường nếu có
    if extracted.target_university:
        user_profile["target_university"] = extracted.target_university

    target_year = extracted.target_year or extract_target_year_from_text(user_message)
    if target_year:
        user_profile["target_year"] = target_year
    
    # Cập nhật điểm số nếu có
    deterministic_scores = extract_scores_from_text(user_message)
    merged_scores = dict(extracted.extracted_scores or {})
    merged_scores.update(deterministic_scores)

    if merged_scores:
        if "scores" not in user_profile:
            user_profile["scores"] = {}
        user_profile["scores"].update(merged_scores)

        transcript = dict(user_profile.get("transcript") or {})
        for score_key, score_value in merged_scores.items():
            normalized_score_key = normalize_vietnamese_text(score_key)
            if normalized_score_key == "ielts":
                user_profile["ielts"] = score_value
            elif normalized_score_key in {"tsa", "dgtd", "hsa", "dgnl", "vsat", "v sat"}:
                user_profile["tsa_score"] = score_value
            elif normalized_score_key in {"toan", "math"}:
                transcript["Toán"] = score_value
            elif normalized_score_key in {"van", "ngu van", "nguvan"}:
                transcript["Văn"] = score_value
            elif normalized_score_key in {"anh", "tieng anh", "english"}:
                transcript["Anh"] = score_value
            elif normalized_score_key in {"ly", "vat ly", "physics"}:
                transcript["Lý"] = score_value
            elif normalized_score_key in {"hoa", "hoa hoc", "chemistry"}:
                transcript["Hóa"] = score_value
            elif normalized_score_key in {"sinh", "sinh hoc"}:
                transcript["Sinh"] = score_value
            elif normalized_score_key in {"su", "lich su"}:
                transcript["Sử"] = score_value
            elif normalized_score_key in {"dia", "dia ly"}:
                transcript["Địa"] = score_value
            elif score_key in SUBJECT_SCORE_ALIASES.values():
                transcript[score_key] = score_value

        if transcript:
            user_profile["transcript"] = transcript
    
    # Cập nhật ý định
    user_profile["intent"] = extracted.intent
    
    # Tìm mã ngành nếu có tên ngành và trường
    lookup_university = extracted.target_university or user_profile.get("target_university")
    if extracted.target_major_name and lookup_university:
        logger.info(f"   🔍 Tìm mã ngành: {extracted.target_major_name} tại {lookup_university}")
        major_code = find_major_code_by_name(
            lookup_university,
            extracted.target_major_name
        )
        if major_code:
            user_profile["target_major_code"] = major_code
            user_profile["target_major"] = major_code  # Cũng lưu vào target_major để get_historical_scores dùng
            user_profile["target_major_name"] = extracted.target_major_name
            logger.info(f"      ✅ Tìm được mã ngành: {major_code}")
        else:
            logger.warning(f"      ⚠️  Không tìm được mã ngành cho: {extracted.target_major_name}")
    
    # Cập nhật state
    state["user_profile"] = user_profile
    state["next_agent"] = "supervisor"
    logger.info(f"   ✅ Receptionist: Dữ liệu rõ ràng, chuyển đến supervisor")
    logger.info(f"      Updated profile: {user_profile}")
    
    return state


# ============================================================================
# 5. DEBUG / EXAMPLE USAGE (nếu chạy file này trực tiếp)
# ============================================================================

if __name__ == "__main__":
    # Ví dụ sử dụng (để kiểm tra)
    
    # Test case 1: Thông tin rõ ràng
    test_state_1 = {
        "messages": [
            HumanMessage(content="Mình có IELTS 7.5 và muốn xem vào được Bách khoa ngành Khoa học máy tính không?")
        ],
        "user_profile": {}
    }
    
    # Test case 2: Dữ liệu mơ hồ
    test_state_2 = {
        "messages": [
            HumanMessage(content="Mình có 24 điểm, muốn vào ngành Quản trị kinh doanh ở Kinh tế Quốc dân")
        ],
        "user_profile": {}
    }
    
    print("=" * 70)
    print("Test Case 1: Thông tin rõ ràng")
    print("=" * 70)
    print(f"Input: {test_state_1['messages'][0].content}")
    # result_1 = receptionist_node(test_state_1)
    # print(f"Output: {result_1}")
    
    print("\n" + "=" * 70)
    print("Test Case 2: Dữ liệu mơ hồ")
    print("=" * 70)
    print(f"Input: {test_state_2['messages'][0].content}")
    # result_2 = receptionist_node(test_state_2)
    # print(f"Output: {result_2}")
