"""API routes for the Question Extraction Testing Framework."""

from .upload import router as upload_router
from .extraction import router as extraction_router
from .comparison import router as comparison_router
from .ground_truth import router as ground_truth_router

__all__ = [
    "upload_router",
    "extraction_router",
    "comparison_router",
    "ground_truth_router",
]
