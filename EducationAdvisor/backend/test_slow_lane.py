"""
Test Slow Lane: Personalized Counseling với full workflow
"""
from app.ai.graph.workflow import app_graph

def test_slow_lane():
    # Câu hỏi tư vấn cá nhân hóa (Personalized Counseling)
    query = (
        "Tôi có IELTS 7.5 và điểm thi Đánh giá tư duy (TSA) là 78 điểm. "
        "Em muốn xét tuyển vào ngành Khoa học máy tính (IT1) của Bách Khoa. "
        "Hệ thống hãy tính toán tổng điểm xét tuyển cho em và cho biết cơ hội đỗ."
    )
    profile = {
        "mbti": "INTJ",
        "ielts": 7.5,
        "transcript": {"Toán": 9.5, "Lý": 8.0, "Hóa": 8.0},
        "tsa_score": 78,
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
    print("\n=== TEST: Slow Lane (Personalized Counseling) ===")
    event_count = 0
    for event in app_graph.stream(initial_state, stream_mode="values"):
        event_count += 1
        messages = event.get("messages", [])
        if messages:
            last_msg = messages[-1]
            name = getattr(last_msg, "name", "")
            content = getattr(last_msg, "content", str(last_msg))
            print(f"\n[Event {event_count}] {name}:")
            preview = str(content)[:400] + "..." if len(str(content)) > 400 else str(content)
            print(f"  {preview}")

if __name__ == "__main__":
    test_slow_lane()
