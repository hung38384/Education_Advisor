import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.db import connection
import app.main as app_main


class FakeCursor:
    def __init__(self, records):
        self.records = records
        self.sort_args = None
        self.requested_length = None

    def sort(self, sort_args):
        self.sort_args = sort_args
        return self

    async def to_list(self, length=5000):
        self.requested_length = length
        return self.records


class FakeCollection:
    def __init__(self, records):
        self.records = records
        self.last_query = None
        self.cursor = FakeCursor(records)

    def find(self, query):
        self.last_query = query
        return self.cursor


class FakeDB:
    def __init__(self, records):
        self.collection = FakeCollection(records)

    def __getitem__(self, name):
        assert name == "admission_scores"
        return self.collection


def test_get_admissions_search_route_from_main_app_with_dependency_override():
    records = [
        {
            "university_code": "HUST",
            "university_name": "",
            "school_name": "Đại học Bách khoa Hà Nội",
            "major_code": "IT1",
            "major_name": "Khoa học máy tính",
            "year": 2024,
            "method_tag": "THPT",
            "method_alias": "Điểm thi THPT",
            "subject_combinations": ["A00"],
            "score": 28.5,
        }
    ]
    fake_db = FakeDB(records)

    async def override_get_db():
        return fake_db

    async def _noop_connect():
        return None

    async def _noop_close():
        return None

    app.dependency_overrides[connection.get_db] = override_get_db

    original_connect = app_main.connect_to_mongo
    original_close = app_main.close_mongo_connection
    app_main.connect_to_mongo = _noop_connect
    app_main.close_mongo_connection = _noop_close

    try:
        with TestClient(app) as client:
            response = client.get(
                "/api/v1/admissions/search?q=HUST&year=2024&methodTag=THPT&universityCode=HUST&minScore=27&maxScore=29&page=1&pageSize=15"
            )

        assert response.status_code == 200
        payload = response.json()

        assert fake_db.collection.last_query == {
            "$and": [
                {
                    "$or": [
                        {"university_code": {"$regex": "HUST", "$options": "i"}},
                        {"university_name": {"$regex": "HUST", "$options": "i"}},
                        {"school_name": {"$regex": "HUST", "$options": "i"}},
                        {"major_code": {"$regex": "HUST", "$options": "i"}},
                        {"major_name": {"$regex": "HUST", "$options": "i"}},
                    ]
                }
            ],
            "year": 2024,
            "method_tag": "THPT",
            "university_code": "HUST",
            "score": {"$gte": 27.0, "$lte": 29.0},
        }
        assert fake_db.collection.cursor.sort_args == [
            ("university_code", 1),
            ("major_code", 1),
            ("method_tag", 1),
            ("year", -1),
        ]
        assert fake_db.collection.cursor.requested_length == 5000

        assert payload["pagination"] == {
            "page": 1,
            "pageSize": 15,
            "totalItems": 1,
            "totalPages": 1,
        }
        assert payload["items"] == [
            {
                "universityCode": "HUST",
                "universityName": "Đại học Bách khoa Hà Nội",
                "majorCode": "IT1",
                "majorName": "Khoa học máy tính",
                "methods": [
                    {
                        "methodTag": "THPT",
                        "methodAlias": "Điểm thi THPT",
                        "subjectCombinations": ["A00"],
                        "yearlyScores": [{"year": 2024, "score": 28.5}],
                        "shortComment": None,
                    }
                ],
            }
        ]
    finally:
        app.dependency_overrides.clear()
        app_main.connect_to_mongo = original_connect
        app_main.close_mongo_connection = original_close
