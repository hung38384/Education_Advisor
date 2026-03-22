"""
LangGraph Multi-Agent Tool-Calling Workflow

This module builds a graph-based agent that:
1. Accepts user queries
2. Calls appropriate tools (search_admission_rules, get_historical_scores)
3. Processes tool outputs
4. Returns responses to the user

Uses LangGraph for orchestration and ChatGoogleGenerativeAI as the LLM backbone.
"""

import os
import sys
import logging
from pathlib import Path
from typing import cast

# Load environment variables
from dotenv import load_dotenv
from google.api_core.exceptions import ResourceExhausted

load_dotenv()

# Setup Python path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# LangGraph imports
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

# LangChain imports
from langchain_google_genai import ChatGoogleGenerativeAI

# Import tools
from app.ai.tools.tools import search_admission_rules, get_historical_scores

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================================================
# 1. Setup & Initialization
# ============================================================================

# Define list of tools
tools = [search_admission_rules, get_historical_scores]
logger.info(f"✅ Tools loaded: {[tool.name for tool in tools]}")

# Initialize LLM with temperature=0 for deterministic tool calling
logger.info("Initializing ChatGoogleGenerativeAI with gemini-1.5-flash...")
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,  # Deterministic for tool calling
)

# Bind tools to LLM
llm_with_tools = llm.bind_tools(tools)
logger.info("✅ Tools bound to LLM")


# ============================================================================
# 2. Define Graph Nodes
# ============================================================================

def chatbot(state: MessagesState) -> dict:
    """
    Chatbot node that processes messages and calls the LLM.
    
    The LLM will decide whether to call tools based on the user query.
    If tool calls are needed, they will be included in the response.
    
    Args:
        state: MessagesState containing the conversation history
        
    Returns:
        Dictionary with updated messages including LLM response
    """
    logger.info(f"🤖 Chatbot processing {len(state['messages'])} message(s)")
    
    # Call LLM with tools
    response = llm_with_tools.invoke(state["messages"])
    
    logger.info(f"   LLM response type: {type(response).__name__}")
    if hasattr(response, "tool_calls") and response.tool_calls:
        logger.info(f"   Tool calls: {[call.get('name') for call in response.tool_calls]}")
    
    # Return updated state with LLM response
    return {"messages": [response]}


# Create ToolNode to execute tool calls
tool_node = ToolNode(tools=tools)
logger.info("✅ ToolNode created")


# ============================================================================
# 3. Build the LangGraph
# ============================================================================

# Initialize StateGraph with MessagesState
graph_builder = StateGraph(MessagesState)

# Add nodes
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_node("tools", tool_node)
logger.info("✅ Nodes added to graph")

# Add edges
# Start -> Chatbot
graph_builder.add_edge(START, "chatbot")
logger.info("   Added edge: START -> chatbot")

# Chatbot -> Tools (conditional: if tool calls exist)
graph_builder.add_conditional_edges("chatbot", tools_condition)
logger.info("   Added conditional edge: chatbot -> tools")

# Tools -> Chatbot (loop back after tool execution)
graph_builder.add_edge("tools", "chatbot")
logger.info("   Added edge: tools -> chatbot")

# Compile the graph
graph = graph_builder.compile()
logger.info("✅ Graph compiled successfully")


# ============================================================================
# 4. Test Execution
# ============================================================================

BKA_TEST_QUERY = (
    "Năm 2024 ngành IT1 của Bách Khoa lấy bao nhiêu điểm? "
    "Và nếu mình có IELTS 6.5 thì được quy đổi ra mấy điểm tiếng Anh thay cho môn thi THPT?"
)

TMU_TEST_QUERY = (
    "Năm 2025 ngành TM34 của Đại học Thương mại lấy bao nhiêu điểm? "
    "Và nếu mình có IELTS Academic 7.0 thì được quy đổi ra mấy điểm tiếng Anh thay cho môn thi THPT?"
)

CTU_TEST_QUERY = (
    "Năm 2025 ngành 7340121 của Đại học Cần Thơ lấy bao nhiêu điểm? "
    "Và nếu mình có học bạ hoặc V-SAT thì được xét tuyển như thế nào?"
)

TEST_SCENARIOS = [
    ("BKA", BKA_TEST_QUERY),
    ("TMU", TMU_TEST_QUERY),
    ("CTU", CTU_TEST_QUERY),
]


def _is_quota_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        isinstance(exc, ResourceExhausted)
        or "quota exceeded" in text
        or "resourceexhausted" in text
        or "429" in text
    )


def _get_selected_scenarios() -> list[tuple[str, str]]:
    """
    Select scenarios from env var GRAPH_TEST_SCENARIOS (comma-separated).
    Example: GRAPH_TEST_SCENARIOS=BKA,TMU
    """
    selected_raw = os.getenv("GRAPH_TEST_SCENARIOS", "BKA")
    selected_codes = {
        code.strip().upper()
        for code in selected_raw.split(",")
        if code and code.strip()
    }

    if not selected_codes:
        return [("BKA", BKA_TEST_QUERY)]

    selected = [
        (label, query)
        for label, query in TEST_SCENARIOS
        if label in selected_codes
    ]
    if selected:
        return selected

    logger.warning(
        "No valid scenario in GRAPH_TEST_SCENARIOS=%s. Falling back to BKA.",
        selected_raw,
    )
    return [("BKA", BKA_TEST_QUERY)]


def _run_test_query(label: str, test_query: str) -> None:
    """
    Run one test scenario with the original BKA execution flow.
    """
    logger.info("\n" + "=" * 80)
    logger.info(f"🚀 Testing LangGraph Agent - {label}")
    logger.info("=" * 80)

    logger.info(f"\n❓ User Query:\n{test_query}\n")
    print(f"\n{'=' * 80}")
    print("USER QUERY:")
    print(test_query)
    print(f"{'=' * 80}\n")
    
    try:
        # Prepare input messages
        input_messages = [("user", test_query)]
        
        # Stream the graph execution
        logger.info("Starting graph execution...")
        events = graph.stream(
            {"messages": input_messages},
            stream_mode="values"
        )
        
        # Process and display events
        logger.info("\n📊 Graph Execution Events:")
        print(f"\n{'-' * 80}")
        print("AGENT EXECUTION TRACE:")
        print(f"{'-' * 80}")
        
        event_count = 0
        for event in events:
            event_count += 1
            messages = event.get("messages", [])
            
            if messages:
                last_message = messages[-1]
                
                # Display message metadata
                if hasattr(last_message, "content"):
                    content = last_message.content
                    msg_type = type(last_message).__name__
                    
                    logger.info(f"\n   [{event_count}] {msg_type}:")
                    
                    # Handle tool calls
                    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
                        print(f"\n🔧 TOOL CALLS:")
                        for i, tool_call in enumerate(last_message.tool_calls, 1):
                            tool_name = tool_call.get("name", "unknown")
                            tool_args = tool_call.get("args", {})
                            print(f"   [{i}] {tool_name}")
                            for key, value in tool_args.items():
                                print(f"       └─ {key}: {value}")
                            logger.info(f"      Tool: {tool_name}, Args: {tool_args}")
                    
                    # Handle tool results
                    elif hasattr(last_message, "tool_call_id"):
                        print(f"\n✅ TOOL RESULT:")
                        print(f"   Tool Call ID: {last_message.tool_call_id}")
                        # Truncate long content for display
                        content_display = content[:500] + "..." if len(content) > 500 else content
                        print(f"   Content:\n{content_display}")
                        logger.info(f"      Tool Result: {content[:200]}")
                    
                    # Handle chat responses
                    elif hasattr(last_message, "response_metadata"):
                        print(f"\n💬 AGENT RESPONSE:")
                        print(f"{content}")
                        logger.info(f"      Response: {content[:200]}")
                    else:
                        print(f"\n📝 MESSAGE:")
                        print(f"{content}")
                        logger.info(f"      Content: {content[:200]}")
        
        print(f"\n{'-' * 80}")
        print(f"Graph executed successfully with {event_count} event(s)")
        print(f"{'-' * 80}\n")
        logger.info(f"✅ Graph execution completed with {event_count} events")
        
    except Exception as e:
        logger.error(f"❌ Error during graph execution: {e}")
        import traceback
        logger.error(traceback.format_exc())
        print(f"\n❌ ERROR: {e}\n")
        raise


def test_graph() -> None:
    """
    Test the graph with the original BKA query.
    """
    _run_test_query("BKA", BKA_TEST_QUERY)


def test_graph_extended() -> None:
    """
    Test the graph with BKA, TMU, and CTU using the same flow as the original BKA demo.
    """
    failed_scenarios = []

    for label, test_query in _get_selected_scenarios():
        try:
            _run_test_query(label, test_query)
        except Exception as e:
            failed_scenarios.append((label, str(e)))
            logger.error(f"❌ Scenario {label} failed: {e}")
            if _is_quota_error(e):
                logger.error(
                    "Quota Gemini da vuot gioi han. Dung cac scenario con lai de tranh goi API them."
                )
                break

    if failed_scenarios:
        failed_labels = ", ".join(label for label, _ in failed_scenarios)
        raise RuntimeError(f"Some scenarios failed: {failed_labels}")


if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("🚀 LangGraph Multi-Agent Tool-Calling Workflow")
    logger.info("=" * 80)

    try:
        run_extended = os.getenv("GRAPH_RUN_EXTENDED", "0").strip() == "1"
        if run_extended:
            logger.info("Running selected scenarios in extended mode...")
            test_graph_extended()
        else:
            logger.info(
                "Running single BKA scenario by default to avoid hitting free-tier quota quickly. "
                "Set GRAPH_RUN_EXTENDED=1 to run extended scenarios."
            )
            test_graph()
        logger.info("\n✅ All tests completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Test failed: {e}")
        sys.exit(1)
