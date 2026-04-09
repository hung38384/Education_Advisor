"""
FastAPI HTTP Test Script

Tests the FastAPI application endpoints without needing to keep the server running.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from app.main import app

def test_api():
    """Test FastAPI endpoints"""
    client = TestClient(app)
    
    print("\n" + "=" * 60)
    print("🧪 Testing FastAPI Endpoints")
    print("=" * 60)
    
    try:
        # Test root endpoint
        print("\n[1/3] Testing GET /")
        response = client.get("/")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        assert response.status_code == 200, "Root endpoint failed"
        print("✅ Root endpoint working")
        
        # Test health endpoint
        print("\n[2/3] Testing GET /health")
        response = client.get("/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        assert response.status_code == 200, "Health endpoint failed"
        print("✅ Health endpoint working")
        
        # Test docs endpoint
        print("\n[3/3] Testing GET /api/docs")
        response = client.get("/api/docs")
        print(f"Status: {response.status_code}")
        assert response.status_code == 200, "Docs endpoint failed"
        print("✅ API documentation accessible")
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\n🌐 API is ready to use!")
        print("   - Docs: http://localhost:8000/api/docs")
        print("   - OpenAPI JSON: http://localhost:8000/api/openapi.json")
        print("\n")
        
        return True
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_api()
    sys.exit(0 if success else 1)
