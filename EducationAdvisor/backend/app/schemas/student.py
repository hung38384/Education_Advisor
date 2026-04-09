"""
Student Profile Pydantic Models

Comprehensive schema definitions for student profile data including academic
records, test scores, certifications, and preferences. All models use Pydantic V2
with proper validation constraints.
"""

from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr


class SemesterGrades(BaseModel):
    """
    Represents grades for a single semester across all subjects.
    
    All grades are optional (allowing students to only input available subjects)
    and must be between 0 and 10 on a standard 10-point scale.
    """
    
    math: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Mathematics grade (0-10)"
    )
    physics: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Physics grade (0-10)"
    )
    chemistry: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Chemistry grade (0-10)"
    )
    biology: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Biology grade (0-10)"
    )
    literature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Literature grade (0-10)"
    )
    history: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="History grade (0-10)"
    )
    geography: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Geography grade (0-10)"
    )
    english: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="English grade (0-10)"
    )
    civic_education: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Civic Education grade (0-10)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "math": 8.5,
                "physics": 7.8,
                "chemistry": 8.2,
                "biology": 7.5,
                "literature": 8.0,
                "history": 7.9,
                "geography": None,
                "english": 8.3,
                "civic_education": 7.6
            }
        }


class AcademicRecord(BaseModel):
    """
    Represents a student's complete academic record across 6 semesters
    (grades 10, 11, and 12; first and second semesters).
    
    All semester fields are optional, allowing students to input anywhere from
    1 to 6 semesters based on their current academic progression.
    """
    
    grade_10_hk1: Optional[SemesterGrades] = Field(
        default=None,
        description="Grade 10 - Semester 1 (First Semester)"
    )
    grade_10_hk2: Optional[SemesterGrades] = Field(
        default=None,
        description="Grade 10 - Semester 2 (Second Semester)"
    )
    grade_11_hk1: Optional[SemesterGrades] = Field(
        default=None,
        description="Grade 11 - Semester 1 (First Semester)"
    )
    grade_11_hk2: Optional[SemesterGrades] = Field(
        default=None,
        description="Grade 11 - Semester 2 (Second Semester)"
    )
    grade_12_hk1: Optional[SemesterGrades] = Field(
        default=None,
        description="Grade 12 - Semester 1 (First Semester)"
    )
    grade_12_hk2: Optional[SemesterGrades] = Field(
        default=None,
        description="Grade 12 - Semester 2 (Second Semester)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "grade_10_hk1": {
                    "math": 8.5,
                    "physics": 7.8,
                },
                "grade_10_hk2": {
                    "math": 8.7,
                    "physics": 8.0,
                },
            }
        }


class NationalExamScores(BaseModel):
    """
    Represents scores from national/standardized high school exams.
    
    Captures subject-wise performance on national examinations with an option
    to mark whether these are mock exam scores or official exam scores.
    """
    
    math: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Mathematics exam score (0-10)"
    )
    physics: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Physics exam score (0-10)"
    )
    chemistry: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Chemistry exam score (0-10)"
    )
    biology: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Biology exam score (0-10)"
    )
    literature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Literature exam score (0-10)"
    )
    history: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="History exam score (0-10)"
    )
    geography: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Geography exam score (0-10)"
    )
    english: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="English exam score (0-10)"
    )
    civic_education: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=10.0,
        description="Civic Education exam score (0-10)"
    )
    is_mock_exam: bool = Field(
        default=True,
        description="Whether these are mock exam scores (True) or official scores (False)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "math": 8.5,
                "physics": 8.2,
                "chemistry": 8.0,
                "is_mock_exam": False
            }
        }


class StandardizedTests(BaseModel):
    """
    Represents scores from international/national standardized tests.
    
    Includes Vietnamese standardized tests (HSA, TSA, APT) that are commonly
    used for university admissions in Vietnam.
    """
    
    hsa_score: Optional[int] = Field(
        default=None,
        ge=0,
        le=150,
        description="HSA (High School Achievement) score (0-150)"
    )
    tsa_score: Optional[int] = Field(
        default=None,
        ge=0,
        le=100,
        description="TSA (Thinking Skills Assessment) score (0-100)"
    )
    apt_score: Optional[int] = Field(
        default=None,
        ge=0,
        le=1200,
        description="APT (Advanced Placement Test) score (0-1200)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "hsa_score": 140,
                "tsa_score": 95,
                "apt_score": 1150
            }
        }


class Certificates(BaseModel):
    """
    Represents international proficiency certificates and test scores.
    
    Includes language proficiency tests (IELTS, TOEIC, VSTEP) and academic
    aptitude tests (SAT) that are recognized for university admissions.
    """
    
    ielts: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=9.0,
        description="IELTS band score (0-9.0)"
    )
    toeic: Optional[int] = Field(
        default=None,
        ge=0,
        le=990,
        description="TOEIC score (0-990)"
    )
    vstep: Optional[str] = Field(
        default=None,
        max_length=50,
        description="VSTEP certificate level (e.g., A1, A2, B1, B2, C1, C2)"
    )
    sat: Optional[int] = Field(
        default=None,
        ge=400,
        le=1600,
        description="SAT score (400-1600)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "ielts": 7.5,
                "toeic": 950,
                "vstep": "B2",
                "sat": 1450
            }
        }


class UserPreferences(BaseModel):
    """
    Represents student's educational preferences and constraints.
    
    Captures target majors, preferred regions for study, and budget constraints
    to help with university and program recommendations.
    """
    
    target_majors: Optional[List[str]] = Field(
        default=None,
        description="List of target major fields (e.g., ['Computer Science', 'Engineering'])"
    )
    target_regions: Optional[List[str]] = Field(
        default=None,
        description="List of preferred regions for universities (e.g., ['Hanoi', 'Ho Chi Minh City'])"
    )
    budget_limit_per_year: Optional[int] = Field(
        default=None,
        ge=0,
        description="Annual education budget limit in VND (Vietnamese Dong)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "target_majors": ["Computer Science", "Data Science"],
                "target_regions": ["Hanoi", "Da Nang"],
                "budget_limit_per_year": 500000000
            }
        }


class StudentProfile(BaseModel):
    """
    Main comprehensive student profile model aggregating all student information.
    
    Serves as the primary data structure for student records in the system,
    combining personal identifiers with academic records, test scores, certificates,
    and educational preferences.
    """
    
    full_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Student's full name (required)"
    )
    email: EmailStr = Field(
        ...,
        description="Student's email address (required, must be valid)"
    )
    priority_zone: Optional[str] = Field(
        default=None,
        max_length=100,
        description="University admission priority zone (e.g., 'Urban', 'Rural', 'Remote')"
    )
    priority_category: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Special admission category (e.g., 'Ethnic Minority', 'Disabled', 'Athlete')"
    )
    academic_record: Optional[AcademicRecord] = Field(
        default=None,
        description="Student's semester-wise academic records"
    )
    national_exam_scores: Optional[NationalExamScores] = Field(
        default=None,
        description="National high school entrance/achievement exam scores"
    )
    standardized_tests: Optional[StandardizedTests] = Field(
        default=None,
        description="International/national standardized test scores"
    )
    certificates: Optional[Certificates] = Field(
        default=None,
        description="International proficiency certificates"
    )
    preferences: Optional[UserPreferences] = Field(
        default=None,
        description="Student's educational preferences and constraints"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "full_name": "Nguyễn Văn A",
                "email": "nguyenvana@example.com",
                "priority_zone": "Urban",
                "priority_category": "Merit",
                "academic_record": {
                    "grade_10_hk1": {
                        "math": 8.5,
                        "physics": 7.8,
                    }
                },
                "national_exam_scores": {
                    "math": 8.5,
                    "is_mock_exam": False
                },
                "preferences": {
                    "target_majors": ["Computer Science"],
                    "budget_limit_per_year": 500000000
                }
            }
        }
