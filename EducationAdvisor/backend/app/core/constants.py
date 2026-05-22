"""
Application Constants and Configuration

This module contains static data and constants used throughout the application,
including target universities for web crawling, geographic regions, and other
application-wide configuration values.
"""

# List of target universities for admission score crawling from Tuyensinh247 JSON API
# Each entry contains: code (university identifier), school_id (API ID), and name (Vietnamese name)
TARGET_UNIVERSITIES = [
    {
        "code": "BKA",
        "school_id": 302,
        "name": "Đại học Bách khoa Hà Nội",
    },
    {
        "code": "QHI",
        "school_id": 311,
        "name": "Đại học Công nghệ – ĐHQGHN",
    },
    {
        "code": "QSB",
        "school_id": 300,
        "name": "Đại học Bách khoa – ĐHQG TP.HCM",
    },
    {
        "code": "BVH",
        "school_id": 227,
        "name": "Học viện Công nghệ Bưu chính Viễn thông",
    },
    {
        "code": "SPK",
        "school_id": 415,
        "name": "Đại học Sư phạm Kỹ thuật TP.HCM",
    },
    {
        "code": "KHA",
        "school_id": 357,
        "name": "Đại học Kinh tế Quốc dân",
    },
    {
        "code": "NTH",
        "school_id": 382,
        "name": "Đại học Ngoại thương",
    },
    {
        "code": "KSA",
        "school_id": 358,
        "name": "Đại học Kinh tế TP.HCM",
    },
    {
        "code": "TMU",
        "school_id": 426,
        "name": "Đại học Thương mại",
    },
    {
        "code": "LPH",
        "school_id": 368,
        "name": "Đại học Luật Hà Nội",
    },
    {
        "code": "YHB",
        "school_id": 448,
        "name": "Đại học Y Hà Nội",
    },
    {
        "code": "DKH",
        "school_id": 328,
        "name": "Đại học Dược Hà Nội",
    },
    {
        "code": "YDS",
        "school_id": 447,
        "name": "Đại học Y Dược TP.HCM",
    },
    {
        "code": "QHX",
        "school_id": 348,
        "name": "ĐH Khoa học Xã hội và Nhân văn – ĐHQGHN",
    },
    {
        "code": "QHF",
        "school_id": 380,
        "name": "ĐH Ngoại ngữ – ĐHQGHN",
    },
    {
        "code": "SPH",
        "school_id": 411,
        "name": "Đại học Sư phạm Hà Nội",
    },
    {
        "code": "HQT",
        "school_id": 246,
        "name": "Học viện Ngoại giao",
    },
    {
        "code": "TCT",
        "school_id": 318,
        "name": "Đại học Cần Thơ",
    },
    {
        "code": "DDT",
        "school_id": 320,
        "name": "Đại học Duy Tân",
    },
    {
        "code": "DTT",
        "school_id": 304,
        "name": "Đại học Tôn Đức Thắng",
    }
]

# Target years for admission score crawling
TARGET_YEARS = [2023, 2024, 2025]

# Method IDs to brute-force check (covers all admission methods on Tuyensinh247)
METHOD_IDS = list(range(1, 15))

# Vietnamese region classification for admission analysis
VIETNAM_REGIONS = {
    "North": ["Hà Nội", "Hải Phòng", "Quảng Ninh", "Lạng Sơn", "Tuyên Quang"],
    "North East": ["Cao Bằng", "Bắc Kạn", "Thái Nguyên", "Yên Bái", "Sơn La"],
    "Red River Delta": ["Hải Dương", "Hưng Yên", "Hà Nam", "Nam Định", "Ninh Bình"],
    "North Central": ["Thanh Hóa", "Nghệ An", "Hà Tĩnh"],
    "South Central": ["Quảng Bình", "Quảng Trị", "Thừa Thiên Huế", "Đà Nẵng"],
    "Central Highlands": ["Kon Tum", "Gia Lai", "Đắk Lắk", "Đắk Nông"],
    "South Central Coastal": ["Khánh Hòa", "Ninh Thuận", "Bình Thuận"],
    "South East": ["Lâm Đồng", "TP.HCM", "Bình Dương", "Đồng Nai", "Bà Rịa - Vũng Tàu"],
    "Mekong Delta": ["Long An", "Tiền Giang", "Bến Tre", "Trà Vinh", "Vĩnh Long", "Cần Thơ", "An Giang", "Kiên Giang", "Cà Mau"]
}
