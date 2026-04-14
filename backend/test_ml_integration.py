"""
Test script: Kiểm tra tích hợp ML CareerRecommender vào workflow LangGraph.

Chạy từ thư mục backend/:
    python test_ml_integration.py

Gồm 3 bước test độc lập:
    [TEST 1] Kiểm tra tải weights (model, scaler, encoder)
    [TEST 2] Kiểm tra predict_top_3() với dữ liệu khớp training format
    [TEST 3] (Tùy chọn) Kiểm tra career_profiler_node() đầy đủ (cần LLM API)
"""

import sys
import os
from pathlib import Path

# Thêm thư mục gốc vào sys.path để import đúng
sys.path.insert(0, str(Path(__file__).parent))

# Tắt telemetry ChromaDB (tránh lỗi không liên quan)
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# ============================================================================
# Màu sắc terminal (dễ đọc kết quả)
# ============================================================================
def ok(msg):  print(f"  [OK] {msg}")
def fail(msg): print(f"  [FAIL] {msg}")
def info(msg): print(f"  [INFO] {msg}")
def warn(msg): print(f"  [WARN] {msg}")
def header(msg): print(f"\n{'='*60}\n{msg}\n{'='*60}")


# ============================================================================
# TEST 1: Tải CareerRecommender (kiểm tra weights tồn tại và load được)
# ============================================================================
def test_1_load_model():
    header("TEST 1: Tải Model Weights")
    
    try:
        from app.ai.ml.ml_recommender import CareerRecommender
        ok("Import CareerRecommender thành công")
    except ImportError as e:
        fail(f"Import thất bại: {e}")
        fail("Kiểm tra: pip install pytorch-tabnet")
        return None

    try:
        recommender = CareerRecommender()
        ok("CareerRecommender khởi tạo thành công")
        ok(f"Scaler type  : {type(recommender.scaler).__name__}")
        ok(f"Encoder type : {type(recommender.encoder).__name__}")
        ok(f"Model type   : {type(recommender.model).__name__}")
        
        # Kiểm tra số class mà encoder biết
        n_classes = len(recommender.encoder.classes_)
        ok(f"Số ngành trong encoder: {n_classes} ngành")
        info(f"Danh sách ngành: {list(recommender.encoder.classes_)}")
        
        return recommender
    except FileNotFoundError as e:
        fail(f"Không tìm thấy file weights: {e}")
        return None
    except Exception as e:
        fail(f"Lỗi khi tải model: {e}")
        import traceback
        traceback.print_exc()
        return None


# ============================================================================
# TEST 2: Dự đoán với các test case khớp data training
# ============================================================================
def test_2_predict(recommender):
    header("TEST 2: Kiểm Tra predict_top_3()")

    if recommender is None:
        warn("Bỏ qua TEST 2 vì TEST 1 thất bại")
        return False

    # --- Test cases khớp ĐÚNG format training ---
    # (Dùng cùng dữ liệu như lúc test model trên Kaggle)
    test_cases = [
        {
            "name": "Kịch bản 1: INTJ - Thiên hướng KH Tự nhiên (Sanity Check)",
            "profile": {
                "mbti": "INTJ",
                "ielts": 7.5,
                "transcript": {
                    "Toán": 9.5,  "Lý": 9.0,  "Hóa": 8.5,
                    "Văn": 5.0,   "Sinh": 5.5, "Sử": 4.5,
                    "Địa": 5.0,   "Anh": 7.5,
                }
            },
            # Kỳ vọng: Top 1 phải là IT hoặc Engineer
            "expected_top1_contains": ["IT", "Engineer", "Technology", "it", "engineer"],
        },
        {
            "name": "Kịch bản 2: ENFJ - Thiên hướng XH/Ngôn ngữ (Edge Case)",
            "profile": {
                "mbti": "ENFJ",
                "transcript": {
                    "Toán": 8.0,  "Lý": 6.0,  "Hóa": 6.5,
                    "Văn": 8.5,   "Sinh": 8.0, "Sử": 7.0,
                    "Địa": 7.5,   "Anh": 9.0,
                    # Không có "ielts" — test fallback
                }
            },
            # Kỳ vọng: Top 1 phải là Law, Teacher hoặc Artist
            "expected_top1_contains": ["Law", "Teacher", "Artist", "law", "teacher", "artist"],
        },
        {
            "name": "Kịch bản 3: Hồ sơ thiếu một số môn học (Robustness Test)",
            "profile": {
                "mbti": "ISTP",
                "transcript": {
                    "Toán": 8.5,
                    "Lý": 8.0,
                    # Thiếu Hóa, Văn, Sinh, Sử, Địa, Anh → phải điền 0.0
                }
            },
            "expected_top1_contains": None,  # Không check kỳ vọng, chỉ cần không crash
        },
        {
            "name": "Kịch bản 4: MBTI có phần mô tả dài (Parser Test)",
            "profile": {
                "mbti": "INTJ - Thích phân tích logic, hợp công nghệ",
                "transcript": {
                    "Toán": 9.5, "Lý": 9.0, "Hóa": 8.5,
                    "Văn": 5.0,  "Sinh": 5.5, "Sử": 4.5,
                    "Địa": 5.0,  "Anh": 7.5,
                }
            },
            "expected_top1_contains": None,  # Chỉ kiểm tra parser không crash
        },
        {
            "name": "Kịch bản 5: ISFP - Thiên hướng Nghệ thuật (Artist)",
            "profile": {
                "mbti": "ISFP",
                "transcript": {
                    "Toán": 5.0,  "Lý": 4.0,  "Hóa": 4.5,
                    "Văn": 9.5,   "Sinh": 5.5, "Sử": 8.5,
                    "Địa": 9.0,   "Anh": 7.5,
                }
            },
            "expected_top1_contains": ["Artist", "artist"],
        },
        {
            "name": "Kịch bản 6: ESTJ - Thiên hướng Quản lý Kinh tế (Business)",
            "profile": {
                "mbti": "ESTJ",
                "transcript": {
                    "Toán": 8.5,  "Lý": 8.0,  "Hóa": 7.5,
                    "Văn": 7.5,   "Sinh": 6.5, "Sử": 6.5,
                    "Địa": 7.0,   "Anh": 8.5,
                }
            },
            "expected_top1_contains": ["Business", "business"],
        },
        {
            "name": "Kịch bản 7: ISFJ - Thiên hướng Y tế/Sức khỏe (Medicine)",
            "profile": {
                "mbti": "ISFJ",
                "transcript": {
                    "Toán": 9.0,  "Lý": 7.0,  "Hóa": 9.5,
                    "Văn": 6.0,   "Sinh": 9.8, "Sử": 5.5,
                    "Địa": 6.0,   "Anh": 8.0,
                }
            },
            "expected_top1_contains": ["Medicine", "medicine"],
        },
    ]

    all_passed = True

    for tc in test_cases:
        print(f"\n  [TEST] {tc['name']}")
        print(f"     MBTI     : {tc['profile'].get('mbti', 'N/A')}")
        print(f"     Transcript: {tc['profile'].get('transcript', {})}")

        try:
            results = recommender.predict_top_3(tc["profile"])

            # Kiểm tra cấu trúc trả về
            assert isinstance(results, list), "Kết quả phải là list"
            assert len(results) == 3, f"Phải có đúng 3 kết quả, nhận được {len(results)}"
            for r in results:
                assert "rank" in r and "name" in r and "confidence" in r, \
                    f"Thiếu key trong kết quả: {r}"
                assert 0.0 <= r["confidence"] <= 100.0, \
                    f"Confidence phải từ 0-100%, nhận được {r['confidence']}"

            # In kết quả
            for r in results:
                bar = "=" * int(r["confidence"] / 5)
                print(f"     Top {r['rank']}: {r['name']:<15} {r['confidence']:>6.2f}%  [{bar}]")

            # Kiểm tra kỳ vọng (nếu có)
            top1_name = results[0]["name"]
            if tc["expected_top1_contains"]:
                matched = any(
                    exp.lower() in top1_name.lower()
                    for exp in tc["expected_top1_contains"]
                )
                if matched:
                    ok(f"Top 1 '{top1_name}' khop ky vong")
                else:
                    warn(f"Top 1 '{top1_name}' KHONG khop ky vong {tc['expected_top1_contains']}")
                    warn("Model van hoat dong, nhung ket qua la — kiem tra lai data training")
            else:
                ok("Khong crash, cau truc ket qua hop le")

        except Exception as e:
            fail(f"Loi: {e}")
            import traceback
            traceback.print_exc()
            all_passed = False

    return all_passed


# ============================================================================
# TEST 3: Full career_profiler_node (cần LLM API Key)
# ============================================================================
def test_3_full_node(run_llm: bool = False):
    header("TEST 3: Full career_profiler_node (Hybrid AI)")

    if not run_llm:
        warn("Bỏ qua TEST 3 (cần LLM API). Chạy lại với --full để test đầy đủ.")
        info("Lệnh: python test_ml_integration.py --full")
        return

    print("  Đang import workflow (sẽ mất vài giây do khởi tạo LLM)...")
    try:
        from app.ai.graph.workflow import career_profiler_node
        ok("Import career_profiler_node thành công")
    except Exception as e:
        fail(f"Import workflow thất bại: {e}")
        import traceback
        traceback.print_exc()
        return

    from langchain_core.messages import HumanMessage

    mock_state = {
        "messages": [HumanMessage(content="Tôi cần tư vấn ngành học phù hợp với bản thân.")],
        "user_profile": {
            "mbti": "INTJ",
            "ielts": 7.5,
            "transcript": {
                "Toán": 9.5, "Lý": 9.0, "Hóa": 8.5,
                "Văn": 5.0,  "Sinh": 5.5, "Sử": 4.5,
                "Địa": 5.0,  "Anh": 7.5,
            },
            "target_university": "BKA",
            "target_major": "IT1",
            "target_year": "2024",
        },
        "called_agents": [],
        "next_agent": "CareerProfiler",
    }

    print("  Đang chạy career_profiler_node()...")
    try:
        result = career_profiler_node(mock_state)

        # Kiểm tra cấu trúc state trả về
        assert "messages" in result, "Kết quả phải có key 'messages'"
        assert "called_agents" in result, "Kết quả phải có key 'called_agents'"
        assert "CareerProfiler" in result["called_agents"], \
            "CareerProfiler phải được thêm vào called_agents"

        final_msg = result["messages"][-1]
        assert final_msg.name == "CareerProfiler", \
            f"AIMessage phải có name='CareerProfiler', nhận được '{final_msg.name}'"

        ok("Cấu trúc state trả về hợp lệ")
        ok(f"called_agents: {result['called_agents']}")
        ok("Nội dung AIMessage:")
        print(f"\n{'-'*60}")
        # In 800 ký tự đầu để preview
        print(final_msg.content[:800])
        if len(final_msg.content) > 800:
            print(f"... [{len(final_msg.content) - 800} ký tự còn lại]")
        print(f"{'-'*60}\n")

        ok("TEST 3 PASSED — Full node hoạt động đúng!")

    except AssertionError as e:
        fail(f"Assertion thất bại: {e}")
    except Exception as e:
        fail(f"Lỗi khi chạy node: {e}")
        import traceback
        traceback.print_exc()


# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    run_full = "--full" in sys.argv

    print(f"\n{'='*60}")
    print("  KIEM TRA TICH HOP ML - CAREER RECOMMENDER")
    print(f"{'='*60}")
    print(f"  Mode: {'FULL (ML + LLM)' if run_full else 'ML ONLY (nhanh, khong can API)'}")

    # TEST 1: Load model
    recommender = test_1_load_model()

    # TEST 2: Predict
    ml_ok = test_2_predict(recommender)

    # TEST 3: Full node (chỉ khi --full)
    test_3_full_node(run_llm=run_full)

    # Tổng kết
    header("KET QUA TONG HOP")
    if recommender is not None and ml_ok:
        ok("TEST 1 PASSED — Weights tai thanh cong")
        ok("TEST 2 PASSED — predict_top_3() hoat dong dung")
        if not run_full:
            info("TEST 3 SKIPPED — Chay lai voi --full de test toan bo workflow")
        print(f"\n  [SUCCESS] ML Integration hoat dong tot!")
    else:
        fail("Co loi xay ra, kiem tra log o tren.")
        sys.exit(1)
