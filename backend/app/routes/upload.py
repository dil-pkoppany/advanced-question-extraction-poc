"""File upload endpoint for Excel files."""

import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import get_settings
from ..schemas import FileMetadata, SheetMetadata, UploadResponse
from ..services.excel_parser import ExcelParser

router = APIRouter(prefix="/upload", tags=["upload"])


def _get_original_filename(file_id: str) -> str | None:
    """Get the original filename for a file ID from the metadata file."""
    settings = get_settings()
    meta_file = settings.upload_dir / f"{file_id}.meta.json"
    if meta_file.exists():
        try:
            data = json.loads(meta_file.read_text())
            return data.get("original_filename")
        except Exception:
            pass
    return None


@router.post("/", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    """
    Upload an Excel file and return metadata about its structure.

    This endpoint:
    1. Validates the file is an Excel file (.xlsx, .xls)
    2. Saves it to the uploads directory
    3. Parses sheet names, columns, and row counts
    4. Returns metadata for the wizard configuration step
    """
    settings = get_settings()

    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    allowed_extensions = {".xlsx", ".xls", ".xlsm"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}",
        )

    # Generate unique file ID
    file_id = f"file_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

    # Save file
    file_path = settings.upload_dir / f"{file_id}{file_ext}"
    meta_path = settings.upload_dir / f"{file_id}.meta.json"
    try:
        content = await file.read()
        file_path.write_bytes(content)
        # Save original filename in metadata file
        meta_path.write_text(json.dumps({
            "original_filename": file.filename,
            "upload_timestamp": datetime.now().isoformat(),
        }))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Parse Excel metadata
    try:
        parser = ExcelParser()
        sheets_metadata = parser.get_file_metadata(str(file_path))
    except Exception as e:
        # Clean up on failure
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {e}")

    # Build response
    metadata = FileMetadata(
        file_id=file_id,
        file_name=file.filename,
        file_size=len(content),
        sheets=sheets_metadata,
        upload_timestamp=datetime.utcnow(),
    )

    return UploadResponse(
        file_id=file_id,
        file_name=file.filename,
        metadata=metadata,
    )


@router.get("/{file_id}", response_model=FileMetadata)
async def get_file_metadata(file_id: str) -> FileMetadata:
    """Get metadata for a previously uploaded file."""
    settings = get_settings()

    # Find the file (exclude .meta.json files)
    matching_files = [
        f for f in settings.upload_dir.glob(f"{file_id}.*")
        if f.suffix.lower() in {'.xlsx', '.xls', '.xlsm', '.xltx', '.xltm'}
    ]
    if not matching_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = matching_files[0]

    # Parse metadata
    try:
        parser = ExcelParser()
        sheets_metadata = parser.get_file_metadata(str(file_path))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {e}")

    # Get original filename from metadata file
    original_filename = _get_original_filename(file_id) or file_path.name

    return FileMetadata(
        file_id=file_id,
        file_name=original_filename,
        file_size=file_path.stat().st_size,
        sheets=sheets_metadata,
    )
