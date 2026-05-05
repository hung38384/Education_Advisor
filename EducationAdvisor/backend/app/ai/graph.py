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

def test_graph():
    """
    Test the graph with a multi-tool query.
    
    The query requires:
    1. get_historical_scores tool: for admission scores
    2. search_admission_rules tool: for IELTS conversion rules
    """
    logger.info("\n" + "=" * 80)
    logger.info("🚀 Testing LangGraph Agent")
    logger.info("=" * 80)
    
    # Test query that requires both tools
    test_query = (
        "Năm 2024 ngành IT1 của Bách Khoa lấy bao nhiêu điểm? "
        "Và nếu mình có IELTS 6.5 thì được quy đổi ra mấy điểm tiếng Anh thay cho môn thi THPT?"
    )
    
    logger.info(f"\n❓ User Query:\n{test_query}\n")
    print(f"\n{'=' * 80}")
    print(f"USER QUERY:")
    print(f"{test_query}")
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


if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("🚀 LangGraph Multi-Agent Tool-Calling Workflow")
    logger.info("=" * 80)
    
    try:
        test_graph()
        logger.info("\n✅ All tests completed successfully!")
    except Exception as e:
        logger.error(f"\n❌ Test failed: {e}")
        sys.exit(1)
