"""API routes for the Question Extraction Testing Framework."""

from .upload import router as upload_router
from .extraction import router as extraction_router
from .comparison import router as comparison_router

__all__ = ["upload_router", "extraction_router", "comparison_router"]
