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
from pathlib import Path
from typing import Literal

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
from langchain_core.messages import HumanMessage, BaseMessage, SystemMessage, AIMessage
from pydantic import BaseModel, Field

# Import custom modules
from app.ai.graph.state import AgentState
from app.ai.tools.tools import search_admission_rules, get_historical_scores
from app.ai.prompts.system_prompts import (
    SUPERVISOR_PROMPT,
    CAREER_PROFILER_PROMPT,
    ACADEMIC_EXPERT_PROMPT,
    DATA_STRATEGIST_PROMPT,
)

# Import ML Recommender (Hybrid AI - TabNet)
from app.ai.ml.ml_recommender import get_recommender

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================================================
# 1. Setup LLMs
# ============================================================================

logger.info("Initializing LLM Models...")

strict_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.0,
)

creative_llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite-preview",
    temperature=0.2,
)

# Sử dụng Groq llama-3.3-70b cho Academic Expert (miễn phí, nhanh, thông minh)
try:
    groq_llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=os.environ.get("GROQ_API_KEY"),
        temperature=0.0,
    )
    logger.info("   ✅ Groq llama-3.3-70b-versatile initialized for Academic Expert")
except Exception as e:
    logger.warning(f"Failed to load Groq: {e}. Falling back to strict_llm")
    groq_llm = strict_llm

logger.info("✅ LLMs initialized")


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
    return create_react_agent(model=llm, tools=tools, state_modifier=system_prompt)


# Career Profiler Agent (no tools, just analysis)
logger.info("Creating Career Profiler Agent...")
career_agent = create_expert_agent(
    llm=groq_llm,
    tools=[],  # No external tools needed
    system_prompt=CAREER_PROFILER_PROMPT,
)
logger.info("✅ Career Profiler Agent (Groq llama-3.3-70b) created")


# Academic Expert Agent (uses search_admission_rules)
logger.info("Creating Academic Expert Agent...")
academic_agent = create_expert_agent(
    llm=groq_llm,
    tools=[search_admission_rules],
    system_prompt=ACADEMIC_EXPERT_PROMPT,
)
logger.info("✅ Academic Expert Agent (Groq llama-3.3-70b) created")


# Data Strategist Agent (uses get_historical_scores)
logger.info("Creating Data Strategist Agent...")
strategist_agent = create_expert_agent(
    llm=groq_llm,
    tools=[get_historical_scores],
    system_prompt=DATA_STRATEGIST_PROMPT,
)
logger.info("✅ Data Strategist Agent (Groq llama-3.3-70b) created")


# ============================================================================
# 3. Node Wrappers - Inject user_profile into system message
# ============================================================================

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
    time.sleep(1)  # Rate limiting — tránh vượt quota API

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
        llm_result = career_agent.invoke({"messages": [context_msg]})
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


def academic_expert_node(state: dict) -> dict: # Đổi AgentState thành dict nếu cần
    import logging
    logger = logging.getLogger(__name__)
    logger.info("📚 Academic Expert: Retrieving context and analyzing...")
    
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
    
    target_uni = user_profile.get("target_university", "BKA")
    target_year = user_profile.get("target_year", "2024")

    # =====================================================================
    # 2. BƯỚC PRE-FETCHING (CƯỠNG CHẾ TÌM KIẾM BẰNG PYTHON)
    # =====================================================================
    # Nắn gân từ khóa: Thấy chữ TSA/IELTS là ép phải tìm đúng cái bảng ĐGTD
    optimized_query = query
    query_upper = query.upper()
    if ("TSA" in query_upper or "ĐGTD" in query_upper) and "IELTS" in query_upper:
        optimized_query = "Điểm thưởng được cộng THÊM vào điểm xét tuyển ĐGTD VSTEP IELTS"
        logger.info(f"🔧 Đã tối ưu hóa Query tìm kiếm thành: {optimized_query}")
    
    # Tự tay gọi tool Search (ChromaDB)
    retrieved_docs = search_admission_rules.invoke({
        "query": optimized_query, 
        "university": target_uni, 
        "year": target_year
    })
    
    # IN RA MÀN HÌNH ĐỂ DEBUG (Bắt quả tang ChromaDB)
    print("\n" + "="*60)
    print("📥 [DEBUG] DỮ LIỆU TỪ CHROMADB TRẢ VỀ CHO AI:")
    print(retrieved_docs)
    print("="*60 + "\n")

    # =====================================================================
    # 3. NHỒI DỮ LIỆU VÀO PROMPT CHO LLM
    # =====================================================================
    # Tạo một context cực mạnh, khóa chặt đường lui của ảo giác
    forced_context = f"""Hồ sơ học sinh:
{user_profile_str}

Câu hỏi: {query}

[TÀI LIỆU QUY CHẾ ĐÃ ĐƯỢC HỆ THỐNG TRÍCH XUẤT]:
{retrieved_docs}

LỆNH BẮT BUỘC: Bạn CHỈ ĐƯỢC PHÉP đọc [TÀI LIỆU QUY CHẾ] ở trên để trả lời. TUYỆT ĐỐI không dùng tool tìm kiếm nữa. Hãy tìm cái bảng điểm thưởng IELTS và ráp số vào tính toán!"""

    from langchain_core.messages import HumanMessage, AIMessage
    context_msg = HumanMessage(content=forced_context)
    
    # 4. Gọi LLM
    # Lưu ý: Nếu academic_agent của bạn đang bind_tools, nó có thể hơi bối rối. 
    # Tốt nhất là nó chỉ là một LLM chain bình thường đọc prompt và trả lời.
    result = academic_agent.invoke({"messages": [context_msg]})
    
    final_msg = result["messages"][-1] if isinstance(result, dict) and "messages" in result else result
    
    # KÝ TÊN VÀ ĐÁNH DẤU BÁO CÁO RÕ RÀNG CHO SUPERVISOR
    signed_msg = AIMessage(
        content=f"[Báo cáo từ AcademicExpert]:\n{final_msg.content}", 
        name="AcademicExpert"
    )
    logger.info("   ✅ Academic Expert response added")
    
    # Track this agent as called
    called_agents = state.get("called_agents", [])
    if "AcademicExpert" not in called_agents:
        called_agents = called_agents + ["AcademicExpert"]
    
    return {"messages": [signed_msg], "called_agents": called_agents}


def data_strategist_node(state: AgentState) -> dict:
    logger.info("📊 Data Strategist: Analyzing admission chances...")
    time.sleep(1)  # Rate limiting
    
    # Extract ONLY the original query (not full history)
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
    
    user_profile_str = str(state.get("user_profile", {}))
    
    # Lấy báo cáo của Academic Expert
    academic_report = ""
    for msg in reversed(state.get("messages", [])):
        msg_name = getattr(msg, "name", "")
        msg_content = getattr(msg, "content", str(msg))
        if msg_name == "AcademicExpert" or "[Báo cáo từ AcademicExpert]" in msg_content:
            academic_report = msg_content
            break
            
    # Truyền context tối giản bao gồm Profile, Câu hỏi và Báo cáo Academic
    full_content = f"Hồ sơ học sinh:\n{user_profile_str}\n\nCâu hỏi: {query}\n\n[BÁO CÁO TỪ ACADEMIC EXPERT - LẤY NGAY 1 SỐ TỔNG ĐIỂM XÉT TUYỂN Ở ĐÂY VÀ KHÔNG ĐƯỢC TỰ TÍNH]:\n{academic_report}"
    
    context_msg = HumanMessage(content=full_content)
    result = strategist_agent.invoke({"messages": [context_msg]})
    
    final_msg = result["messages"][-1]
    # KÝ TÊN VÀ ĐÁNH DẤU BÁO CÁO RÕ RÀNG CHO SUPERVISOR
    signed_msg = AIMessage(
        content=f"[Báo cáo từ DataStrategist]:\n{final_msg.content}", 
        name="DataStrategist"
    )
    logger.info(f"   ✅ Data Strategist response added")
    
    # Track this agent as called
    called_agents = state.get("called_agents", [])
    if "DataStrategist" not in called_agents:
        called_agents = called_agents + ["DataStrategist"]
    
    return {"messages": [signed_msg], "called_agents": called_agents}


# ============================================================================
# 4. Supervisor Node with Structured Output
# ============================================================================

class RouteResponse(BaseModel):
    """Supervisor's routing decision."""
    next_agent: Literal["CareerProfiler", "AcademicExpert", "DataStrategist", "FINISH"] = Field(
        description="Which agent to route to next or FINISH if complete"
    )


def supervisor_node(state: AgentState) -> dict:
    """
    Supervisor node - Sequential routing to experts.
    Routes: CareerProfiler → AcademicExpert → DataStrategist → FINISH
    """
    logger.info("🧑‍💼 Supervisor analyzing request...")
    time.sleep(1)  # Rate limiting: 1 second delay
    
    # Get agents that have already been called
    called_agents = state.get("called_agents", [])
    
    # Sequential routing: define the order
    agent_sequence = ["CareerProfiler", "AcademicExpert", "DataStrategist"]
    
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

def synthesis_node(state: AgentState) -> dict:
    """
    Final synthesis node that compiles all expert responses into a coherent answer.
    """
    logger.info("✨ Synthesizing final response...")
    time.sleep(1)  # Rate limiting
    
    expert_responses = []
    # FIX BUG: msg bây giờ là Object (AIMessage), không phải Tuple.
    # Ta sẽ tìm những tin nhắn có "chữ ký" của 3 chuyên gia.
    for msg in state.get("messages", []):
        if hasattr(msg, "name") and msg.name in ["CareerProfiler", "AcademicExpert", "DataStrategist"]:
            expert_responses.append(msg.content)
            
    if not expert_responses:
        final_response = "Xin lỗi, không thu thập được đủ báo cáo từ các chuyên gia để trả lời."
    else:
        # Combine expert responses
        combined_response = "\n\n".join(expert_responses)
        
        # Use LLM to synthesize
        synthesis_prompt = f"""Dựa vào các phần phân tích dưới đây từ các chuyên gia, hãy tổng hợp thành một câu trả lời toàn diện, thân thiện và dễ hiểu cho học sinh (Dùng định dạng Markdown cho đẹp).
        
        LƯU Ý CỰC KỲ QUAN TRỌNG CHỐNG ẢO GIÁC:
        1. BẠN LÀ NGƯỜI TỔNG HỢP, TUYỆT ĐỐI KHÔNG ĐƯỢC BỊA ĐẶT THÊM SỐ LIỆU HAY ĐIỂM CHUẨN NÀO MÀ DATA STRATEGIST CHƯA NHẮC TỚI.
        2. Nếu DataStrategist báo lỗi hoặc không đưa ra được điểm chuẩn thực tế, bạn BẮT BUỘC phải nói là "Hệ thống dữ liệu hiện không truy xuất được điểm chuẩn của phương thức này", tuyệt đối không tự "nhớ lại" và bịa ra con số như 83.97 hay bất kỳ số nào khác.

PHẦN PHÂN TÍCH CỦA CÁC CHUYÊN GIA:
{combined_response}

Câu trả lời tổng hợp:"""
        
        final_msg = creative_llm.invoke(synthesis_prompt)
        
        # Xử lý trường hợp Gemini trả về list các dictionary thay vì string
        if isinstance(final_msg.content, list):
            text_blocks = [item.get("text", "") for item in final_msg.content if isinstance(item, dict) and "text" in item]
            final_response = "\n".join(text_blocks) if text_blocks else str(final_msg.content)
        else:
            final_response = final_msg.content
            
        logger.info(f"   ✅ Synthesis completed")
    
    # Ký tên "Synthesis" cho tin nhắn tổng hợp cuối cùng
    from langchain_core.messages import AIMessage
    return {"messages": [AIMessage(content=final_response, name="Synthesis")]}


# ============================================================================
# 5. Build StateGraph
# ============================================================================

logger.info("\n" + "=" * 70)
logger.info("Building LangGraph State Machine...")
logger.info("=" * 70)

# Initialize StateGraph
graph_builder = StateGraph(AgentState)

# Add nodes
logger.info("Adding nodes...")
graph_builder.add_node("supervisor", supervisor_node)
graph_builder.add_node("CareerProfiler", career_profiler_node)
graph_builder.add_node("AcademicExpert", academic_expert_node)
graph_builder.add_node("DataStrategist", data_strategist_node)
graph_builder.add_node("synthesis", synthesis_node)
logger.info("   ✅ Nodes added")

# Add edges
logger.info("Adding edges...")

# Start → Supervisor
graph_builder.add_edge(START, "supervisor")
logger.info("   ✅ START → supervisor")

# Supervisor → Expert agents (conditional)
def route_to_agent(state: AgentState) -> str:
    """Route based on next_agent from supervisor."""
    next_agent = state.get("next_agent", "FINISH")
    # Return the string directly - conditional_edges will map it
    return next_agent


graph_builder.add_conditional_edges(
    "supervisor",
    route_to_agent,
    {
        "CareerProfiler": "CareerProfiler",
        "AcademicExpert": "AcademicExpert",
        "DataStrategist": "DataStrategist",
        "FINISH": "synthesis",  # Route to synthesis node instead of END
    }
)
logger.info("   ✅ supervisor → [agents, synthesis]")

# Experts → back to Supervisor
graph_builder.add_edge("CareerProfiler", "supervisor")
graph_builder.add_edge("AcademicExpert", "supervisor")
graph_builder.add_edge("DataStrategist", "supervisor")
logger.info("   ✅ [agents] → supervisor (loop)")

# Synthesis → END
graph_builder.add_edge("synthesis", END)
logger.info("   ✅ synthesis → END")

# Compile graph
app_graph = graph_builder.compile()
logger.info("\n✅ Graph compiled successfully!")


# ============================================================================
# 6. Test Execution
# ============================================================================

def test_workflow():
    """
    Test the multi-agent supervisor workflow with mock student data.
    
    Student profile:
    - MBTI: INTJ (logical, tech-inclined)
    - IELTS: 6.5
    - Transcript: Strong in Math, Physics, Chemistry
    - Target: BKA (Bach Khoa) IT1 major 2024
    """
    logger.info("\n" + "=" * 70)
    logger.info("🚀 Testing Multi-Agent Supervisor Workflow")
    logger.info("=" * 70)
    
    # MOCK PROFILE 1: Khối A1 + IELTS cao
    mock_profile = {
    "mbti": "INTJ - Thích phân tích logic, hợp công nghệ",
    "ielts": 7.5,
    "transcript": {
        "Toán": 9.5,
        "Lý": 8.0,
        "Hóa": 8.0,
    },
    "tsa_score": 72.0, # Thêm điểm Đánh giá tư duy (Thang 100)
    "target_university": "BKA",
    "target_major": "IT1",
    "target_year": "2024",
    }
    
    # TEST QUERY 1: Ép tính toán và so sánh
    test_query = (
    "Với hồ sơ có IELTS 5.5 và điểm thi Đánh giá tư duy (TSA) là 78 điểm, em muốn xét tuyển "
    "vào ngành Khoa học máy tính (IT1) của Bách Khoa. Hệ thống hãy trích xuất quy định "
    "cộng điểm thưởng IELTS vào phương thức TSA của BKA, TỰ TÍNH TOÁN tổng điểm xét tuyển "
    "cho em và cho biết cơ hội đỗ so với điểm chuẩn TSA thực tế năm 2024."
)
    
    logger.info(f"\n📋 Mock Student Profile:\n{mock_profile}")
    logger.info(f"\n❓ Test Query:\n{test_query}\n")
    
    print("\n" + "=" * 80)
    print("MOCK STUDENT PROFILE:")
    print("-" * 80)
    for key, value in mock_profile.items():
        print(f"  {key}: {value}")
    print("\n" + "=" * 80)
    print("TEST QUERY:")
    print("-" * 80)
    print(f"  {test_query}")
    print("=" * 80 + "\n")
    
    try:
        # Initialize state
        initial_state = {
            "messages": [("user", test_query)],
            "next_agent": "supervisor",
            "user_profile": mock_profile,
            "called_agents": [],  # Track which agents have been called
        }
        
        # Stream graph execution
        logger.info("Starting graph execution (streaming)...\n")
        print("WORKFLOW EXECUTION TRACE:")
        print("-" * 80)
        
        event_count = 0
        final_response = None
        
        for event in app_graph.stream(initial_state, stream_mode="values"):
                    event_count += 1
                    messages = event.get("messages", [])
                    
                    if messages:
                        last_msg = messages[-1]
                        
                        # FIX BUG: Lấy thông tin từ Object BaseMessage
                        role = getattr(last_msg, "type", "unknown")
                        name = getattr(last_msg, "name", "")
                        content = getattr(last_msg, "content", str(last_msg))
                        
                        # Bắt lấy tin nhắn cuối cùng từ Synthesis Node
                        if name == "Synthesis":
                            final_response = content
                        
                        # In log ra Terminal cho đẹp
                        if role != "human":  # Bỏ qua tin nhắn gốc của user
                            sender_name = name if name else role.upper()
                            print(f"\n[Event {event_count}] 🤖 {sender_name}:")
                            
                            if len(str(content)) > 400:
                                print(f"  {str(content)[:400]}...\n  [...Content truncated for display...]")
                            else:
                                print(f"  {content}")
        
        # Print final response prominently
        if final_response:
            print("\n" + "=" * 80)
            print("💬 FINAL RESPONSE:")
            print("=" * 80)
            print(final_response)
            print("=" * 80)
        
        print(f"\n{'-' * 80}")
        print(f"✅ Workflow completed successfully!")
        print(f"   Total events: {event_count}")
        print("=" * 80 + "\n")
        
        logger.info(f"✅ Graph execution completed with {event_count} events")
        
    except Exception as e:
        logger.error(f"❌ Error during workflow execution: {e}")
        import traceback
        logger.error(traceback.format_exc())
        print(f"\n❌ ERROR: {e}\n")
        raise


if __name__ == "__main__":
    try:
        test_workflow()
        logger.info("\n✅ All tests completed successfully!")
        print("\n✅ All tests completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Test failed: {e}")
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
