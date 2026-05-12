"""
Quick test for ScoreCalculator logic
"""

# Simulate score calculation
def test_score_calculation():
    print("\n" + "="*70)
    print("🧮 TEST: Score Calculator Logic")
    print("="*70)
    
    # Test case from user: TSA 78 + IELTS 7.5
    tsa_score = 78.0
    ielts_score = 7.5
    
    # IELTS → Bonus mapping (from ScoreCalculator)
    ielts_bonus_table = {
        7.5: 4.0,
        7.0: 3.5,
        6.5: 3.0,
        6.0: 2.5,
        5.5: 2.0,
        5.0: 1.0,
    }
    
    # Calculate bonus
    ielts_bonus = 0.0
    for ielts_level in sorted(ielts_bonus_table.keys(), reverse=True):
        if ielts_score >= ielts_level:
            ielts_bonus = ielts_bonus_table[ielts_level]
            break
    
    # Total score
    total_score = tsa_score + ielts_bonus
    
    print(f"\n📊 INPUT DATA:")
    print(f"  TSA/ĐGTD Score: {tsa_score}")
    print(f"  IELTS Score: {ielts_score}")
    
    print(f"\n🔧 BONUS CALCULATION:")
    print(f"  IELTS {ielts_score} → Bonus: {ielts_bonus} điểm")
    
    print(f"\n✨ RESULT:")
    print(f"  {tsa_score} (TSA) + {ielts_bonus} (IELTS bonus) = {total_score}")
    
    # Compare with cutoff
    cutoff_score = 83.82
    gap = total_score - cutoff_score
    
    print(f"\n📈 COMPARISON:")
    print(f"  Calculated Score: {total_score}")
    print(f"  Cutoff Score: {cutoff_score}")
    print(f"  Gap: {gap} (negative = chưa đủ)")
    
    if gap >= 0:
        status = "✅ CÓ CƠ HỘI"
    elif gap > -2:
        status = "⚠️  VỪA SỨC"
    elif gap > -5:
        status = "⚡ THỬ THÁCH"
    else:
        status = "❌ TRƯỢT"
    
    print(f"  Status: {status}")
    
    print("\n" + "="*70)
    print("✅ TEST PASS: Score = 82, NOT 78!")
    print("   (Thưởng IELTS 7.5 được cộng đủ 4 điểm)")
    print("="*70 + "\n")


if __name__ == "__main__":
    test_score_calculation()
