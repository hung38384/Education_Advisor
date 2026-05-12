"""
Test Fast Lane: LookupAgent trả lời câu hỏi tra cứu đơn thuần
"""
from app.ai.graph.workflow import app_graph

def test_lookup_agent():
    # Câu hỏi tra cứu đơn thuần
    query = "Điểm chuẩn IT1 đại học bách khoa hà nội năm 2024 là bao nhiêu?"
    profile = {
        "target_university": "BKA",
        "target_major": "IT1",
        "target_year": "2024",
    }
    initial_state = {
        "messages": [("user", query)],
        "next_agent": "supervisor",
        "user_profile": profile,
        "called_agents": [],
        "calculated_score": None,
        "calculated_details": {},
    }
    print("\n=== TEST: Fast Lane (LookupAgent) ===")
    event_count = 0
    for event in app_graph.stream(initial_state, stream_mode="values"):
        event_count += 1
        messages = event.get("messages", [])
        if messages:
            last_msg = messages[-1]
            name = getattr(last_msg, "name", "")
            content = getattr(last_msg, "content", str(last_msg))
            print(f"[Event {event_count}] {name}: {content[:300]}{'...' if len(content)>300 else ''}")
            if name == "LookupAgent":
                print("\n✅ Fast Lane: LookupAgent đã trả lời và kết thúc luồng!\n")
                break

if __name__ == "__main__":
    test_lookup_agent()
