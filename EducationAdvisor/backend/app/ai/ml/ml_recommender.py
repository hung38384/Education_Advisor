"""
ML Career Recommender - Wrapper cho mo hinh TabNet

SCHEMA 17 FEATURES (dung thu tu nhu luc train):
    [0]  score_math        - diem Toan
    [1]  score_physics      - diem Ly
    [2]  score_chemistry    - diem Hoa
    [3]  score_literature   - diem Van
    [4]  score_biology      - diem Sinh
    [5]  score_history      - diem Su
    [6]  score_geography    - diem Dia
    [7]  score_english      - diem Anh (fallback tu IELTS)
    [8]  mbti_E_I           - Huong ngoai(1) / Huong noi(0)
    [9]  mbti_S_N           - Giac quan(1) / Truc giac(0)
    [10] mbti_T_F           - Ly tri(1) / Cam xuc(0)
    [11] mbti_J_P           - Nguyen tac(1) / Linh hoat(0)
    [12] Khoi_A             - (Toan + Ly + Hoa) / 3
    [13] Khoi_A1            - (Toan + Ly + Anh) / 3
    [14] Khoi_B             - (Toan + Hoa + Sinh) / 3
    [15] Khoi_C             - (Van + Su + Dia) / 3
    [16] Khoi_D             - (Toan + Van + Anh) / 3

GHI CHU KY THUAT:
    TabNetClassifier.load_model() bi UnpicklingError tren Python 3.14 + PyTorch 2.9
    do torch.load() thay doi hanh vi mac dinh. Giai phap: tu tay giai zip,
    set model.input_dim / output_dim roi _set_network() + load_state_dict().
"""

import io
import json
import logging
import os
import joblib
import zipfile
from typing import Optional

import numpy as np
import torch
from pytorch_tabnet.tab_model import TabNetClassifier

logger = logging.getLogger(__name__)


# ============================================================================
# MAP MON HOC TIENG VIET -> KEY TRONG TRAINING DATA
# Thu tu khop voi danh sach X_train.columns (8 mon)
# ============================================================================
SUBJECT_MAP: list[tuple[str, str]] = [
    ("Toan",  "score_math"),
    ("Ly",    "score_physics"),
    ("Hoa",   "score_chemistry"),
    ("Van",   "score_literature"),
    ("Sinh",  "score_biology"),
    ("Su",    "score_history"),
    ("Dia",   "score_geography"),
    ("Anh",   "score_english"),   # fallback: quy doi tu IELTS neu thieu
]

# Ho tro ca ten day du dau (unicode) lan khong dau
SUBJECT_ALIAS: dict[str, str] = {
    # Ten co dau -> Ten khong dau trong SUBJECT_MAP
    "Toan":  "Toan",
    "Toán":  "Toan",
    "Ly":    "Ly",
    "Lý":    "Ly",
    "Hoa":   "Hoa",
    "Hóa":   "Hoa",
    "Van":   "Van",
    "Văn":   "Van",
    "Sinh":  "Sinh",
    "Su":    "Su",
    "Sử":    "Su",
    "Dia":   "Dia",
    "Địa":   "Dia",
    "Anh":   "Anh",
}


def _ielts_to_english_score(ielts: float) -> float:
    """Quy doi IELTS band score sang thang diem 10 (theo quy dinh BKA)."""
    if ielts >= 8.0:   return 10.0
    elif ielts >= 7.0: return 9.0
    elif ielts >= 6.0: return 8.0
    elif ielts >= 5.0: return 7.0
    elif ielts >= 4.0: return 5.0
    else:              return 3.0


# ============================================================================
# CLASS CAREER RECOMMENDER
# ============================================================================

class CareerRecommender:
    """
    Wrapper cho mo hinh TabNet du doan Top 3 nganh nghe phu hop.

    Pipeline:
        user_profile (dict) -> 17 features numpy -> scaler -> TabNet -> top 3
    """

    def __init__(self):
        """Tai 3 file weights tu app/ai/ml/weights/ bang duong dan tuyet doi dong."""
        # Weights path
        _base_dir   = os.path.dirname(os.path.abspath(__file__))
        _weights_dir = os.path.join(_base_dir, "weights")

        scaler_path  = os.path.join(_weights_dir, "scaler.pkl")
        encoder_path = os.path.join(_weights_dir, "label_encoder.pkl")
        model_path   = os.path.join(_weights_dir, "tabnet_career_model.zip")

        logger.info(f"Loading weights from: {_weights_dir}")

        # Scaler (Load by joblib to prevent sklearn unpickling errors)
        if not os.path.exists(scaler_path):
            raise FileNotFoundError(f"scaler.pkl not found: {scaler_path}")
        self.scaler = joblib.load(scaler_path)
        logger.info(f"  [OK] scaler.pkl -> {type(self.scaler).__name__}")

        # Label Encoder
        if not os.path.exists(encoder_path):
            raise FileNotFoundError(f"label_encoder.pkl not found: {encoder_path}")
        self.encoder = joblib.load(encoder_path)
        logger.info(f"  [OK] label_encoder.pkl -> {list(self.encoder.classes_)}")

        # TabNet model (safe loader, bypass torch.load default behavior)
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"tabnet_career_model.zip not found: {model_path}")
        self.model = self._load_tabnet_safe(model_path)
        logger.info("  [OK] tabnet_career_model.zip (safe mode)")
        logger.info("CareerRecommender ready!")

    # -------------------------------------------------------------------------
    # LOAD MODEL AN TOAN: bypass UnpicklingError cua pytorch-tabnet 4.x
    # -------------------------------------------------------------------------
    @staticmethod
    def _load_tabnet_safe(model_path: str) -> TabNetClassifier:
        """
        Load TabNet tu .zip an toan tren moi phien ban Python/PyTorch.

        Van de: pytorch-tabnet goi torch.load() khong co weights_only=False,
        gay ra UnpicklingError tren Python 3.14 + PyTorch 2.9.

        Giai phap:
            1. Giai zip, doc model_params.json -> lay init_params + output_dim
            2. Doc network.pt bang torch.load(weights_only=False)
            3. Suy input_dim tu shape cua tabnet.initial_bn.weight
            4. Khoi tao model, goi _set_network(), load state_dict
        """
        with zipfile.ZipFile(model_path, 'r') as zf:
            if 'model_params.json' not in zf.namelist():
                raise ValueError("tabnet_career_model.zip missing model_params.json")
            if 'network.pt' not in zf.namelist():
                raise ValueError("tabnet_career_model.zip missing network.pt")

            # Buoc 1: Doc params kien truc model
            params      = json.loads(zf.read('model_params.json').decode('utf-8'))
            init_params = params.get('init_params', {})
            class_attrs = params.get('class_attrs', {})

            # Buoc 2: Load state_dict voi weights_only=False (tuong thich moi version)
            pt_bytes   = zf.read('network.pt')
            state_dict = torch.load(
                io.BytesIO(pt_bytes),
                map_location='cpu',
                weights_only=False
            )

        # Buoc 3: Suy input_dim tu shape cua layer BatchNorm dau tien
        input_dim = state_dict['tabnet.initial_bn.weight'].shape[0]
        logger.info(f"  Inferred input_dim={input_dim}, output_dim={init_params.get('output_dim')}")

        # Buoc 4: Khoi tao TabNetClassifier voi dung kien truc
        model = TabNetClassifier(**init_params)

        # Buoc 5: Set cac attribute can thiet truoc khi _set_network()
        model.input_dim  = input_dim
        model.output_dim = init_params.get('output_dim', 7)

        # Koi phuc preds_mapper tu class_attrs (de predict_proba hoat dong dung)
        if 'preds_mapper' in class_attrs:
            model.preds_mapper = {
                int(k): int(v) for k, v in class_attrs['preds_mapper'].items()
            }

        # Buoc 6: Build network (tao cac layer PyTorch)
        model._set_network()

        # Buoc 7: Nan weights vao network
        model.network.load_state_dict(state_dict)
        model.network.eval()

        return model

    # -------------------------------------------------------------------------
    # FEATURE ENGINEERING (giong he 1:1 voi ham feature_engineering() tren Kaggle)
    # -------------------------------------------------------------------------
    def _build_feature_array(self, user_profile: dict) -> np.ndarray:
        """
        Tao numpy array 17 features theo DUNG thu tu da train.

        Logic nay phan canh ham feature_engineering() tren Kaggle:
            1. Lay 8 diem mon tu transcript (voi alias tieng Viet)
            2. Tinh 4 MBTI binary features
            3. Tinh 5 to hop khoi

        Args:
            user_profile: dict tu LangGraph state, vi du:
                {
                    "mbti": "INTJ",
                    "ielts": 7.5,
                    "transcript": {"Toan": 9.5, "Ly": 9.0, ...}
                }
        Returns:
            numpy array shape (1, 17), dtype float32
        """
        transcript: dict = user_profile.get("transcript", {})

        # ---- Chuan hoa key cua transcript (ho tro ca co dau lan khong dau) ----
        norm_transcript: dict[str, float] = {}
        for raw_key, raw_val in transcript.items():
            normalized = SUBJECT_ALIAS.get(raw_key, raw_key)
            try:
                norm_transcript[normalized] = float(raw_val)
            except (TypeError, ValueError):
                logger.warning(f"Invalid score for '{raw_key}': '{raw_val}', using 0.0")
                norm_transcript[normalized] = 0.0

        # ---- Lay 8 diem mon theo thu tu SUBJECT_MAP ----
        scores: dict[str, float] = {}
        for viet_key, train_key in SUBJECT_MAP:
            val = norm_transcript.get(viet_key)

            # Fallback cho mon Anh: neu thieu thi quy doi tu IELTS
            if val is None and train_key == "score_english":
                ielts = user_profile.get("ielts")
                if ielts is not None:
                    try:
                        val = _ielts_to_english_score(float(ielts))
                        logger.debug(f"  English score via IELTS {ielts} -> {val}")
                    except (TypeError, ValueError):
                        val = 0.0
                else:
                    val = 0.0

            scores[train_key] = float(val) if val is not None else 0.0

        # Gan bien tat cho de doc
        math = scores["score_math"]
        phys = scores["score_physics"]
        chem = scores["score_chemistry"]
        lit  = scores["score_literature"]
        bio  = scores["score_biology"]
        hist = scores["score_history"]
        geo  = scores["score_geography"]
        eng  = scores["score_english"]

        # ---- 4 MBTI binary features (giong ham feature_engineering) ----
        raw_mbti = str(user_profile.get("mbti", "INTJ")).upper().strip()
        # Lay 4 ky tu dau - bo phan mo ta them "INTJ - Thich phan tich..."
        mbti_str = raw_mbti[:4]

        mbti_E_I = 1 if 'E' in mbti_str else 0   # Huong ngoai / Huong noi
        mbti_S_N = 1 if 'S' in mbti_str else 0   # Giac quan / Truc giac
        mbti_T_F = 1 if 'T' in mbti_str else 0   # Ly tri / Cam xuc
        mbti_J_P = 1 if 'J' in mbti_str else 0   # Nguyen tac / Linh hoat

        # ---- 5 to hop khoi (giong he voi ham feature_engineering) ----
        Khoi_A  = (math + phys + chem) / 3
        Khoi_A1 = (math + phys + eng)  / 3
        Khoi_B  = (math + chem + bio)  / 3
        Khoi_C  = (lit  + hist + geo)  / 3
        Khoi_D  = (math + lit  + eng)  / 3

        # ---- Ghep 17 features theo DUNG thu tu cot X_train ----
        feature_vector = [
            math, phys, chem, lit, bio, hist, geo, eng,  # [0-7]  8 mon
            mbti_E_I, mbti_S_N, mbti_T_F, mbti_J_P,     # [8-11] MBTI binary
            Khoi_A, Khoi_A1, Khoi_B, Khoi_C, Khoi_D,   # [12-16] To hop khoi
        ]

        logger.debug(
            f"Features: math={math} phys={phys} chem={chem} lit={lit} "
            f"bio={bio} hist={hist} geo={geo} eng={eng} | "
            f"MBTI={mbti_str} E/I={mbti_E_I} S/N={mbti_S_N} T/F={mbti_T_F} J/P={mbti_J_P} | "
            f"KhoiA={Khoi_A:.2f} A1={Khoi_A1:.2f} B={Khoi_B:.2f} C={Khoi_C:.2f} D={Khoi_D:.2f}"
        )

        return np.array(feature_vector, dtype=np.float32).reshape(1, -1)

    # -------------------------------------------------------------------------
    # PREDICT TOP 3
    # -------------------------------------------------------------------------
    def predict_top_3(self, user_profile: dict) -> list[dict]:
        """
        Du doan Top 3 nganh nghe phu hop nhat.

        Args:
            user_profile: dict ho so hoc sinh tu LangGraph state.

        Returns:
            List 3 dict: [{"rank": 1, "name": "IT", "confidence": 74.28}, ...]

        Raises:
            TypeError   : user_profile khong phai dict.
            RuntimeError: Model predict loi noi bo.
        """
        if not isinstance(user_profile, dict):
            raise TypeError(
                f"user_profile phai la dict, nhan duoc: {type(user_profile).__name__}"
            )
        logger.info("CareerRecommender: predicting...")

        try:
            # Buoc 1: Tao 17-feature array
            X_raw = self._build_feature_array(user_profile)
            logger.info(f"  [1] Feature array shape={X_raw.shape}")

            # Buoc 2: Scale chuan bang chinh StandardScaler cua model
            X_scaled = self.scaler.transform(X_raw)
            logger.info("  [2] Scaling done (Using original StandardScaler)")

            # Buoc 3: predict_proba -> shape (1, n_classes)
            proba = self.model.predict_proba(X_scaled)[0]
            logger.info(f"  [3] predict_proba done, {len(proba)} classes")

            # Buoc 4+5: Top 3 + inverse transform ten nganh
            top3_idx = np.argsort(proba)[::-1][:3]
            results  = []
            for rank, idx in enumerate(top3_idx, 1):
                name       = str(self.encoder.inverse_transform([idx])[0])
                confidence = round(float(proba[idx]) * 100, 2)
                results.append({"rank": rank, "name": name, "confidence": confidence})
                logger.info(f"     Top {rank}: {name} ({confidence}%)")

            return results

        except (FileNotFoundError, TypeError):
            raise
        except Exception as e:
            logger.error(f"predict_top_3 failed: {e}", exc_info=True)
            raise RuntimeError(f"CareerRecommender.predict_top_3 failed: {e}") from e


# ============================================================================
# SINGLETON
# ============================================================================
_recommender_instance: Optional[CareerRecommender] = None


def get_recommender() -> CareerRecommender:
    """Tra ve singleton CareerRecommender. Model chi load 1 lan duy nhat."""
    global _recommender_instance
    if _recommender_instance is None:
        logger.info("Initializing CareerRecommender singleton...")
        _recommender_instance = CareerRecommender()
    return _recommender_instance
