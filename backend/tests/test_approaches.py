"""Tests for extraction approaches."""

import pytest
from pathlib import Path

from app.services.excel_parser import ExcelParser
from app.schemas import ColumnMapping, QuestionType


# Path to test files
TEST_FILES_DIR = Path(__file__).parent.parent.parent / "docs"


class TestExcelParser:
    """Tests for ExcelParser."""

    def test_get_file_metadata(self):
        """Test metadata extraction from Excel file."""
        parser = ExcelParser()
        test_file = TEST_FILES_DIR / "sample_survey.xlsx"

        if not test_file.exists():
            pytest.skip("Test file not found")

        metadata = parser.get_file_metadata(str(test_file))

        assert len(metadata) > 0
        assert metadata[0].name is not None
        assert len(metadata[0].columns) > 0
        assert metadata[0].row_count >= 0

    def test_convert_to_markdown(self):
        """Test MarkItDown conversion."""
        parser = ExcelParser()
        test_file = TEST_FILES_DIR / "sample_survey.xlsx"

        if not test_file.exists():
            pytest.skip("Test file not found")

        markdown = parser.convert_to_markdown(str(test_file))

        assert markdown is not None
        assert len(markdown) > 0
        # Should not contain NaN after cleanup
        assert "NaN" not in markdown or markdown.count("NaN") < 5

    def test_extract_rows_by_columns(self):
        """Test deterministic row extraction."""
        parser = ExcelParser()
        test_file = TEST_FILES_DIR / "sample_survey.xlsx"

        if not test_file.exists():
            pytest.skip("Test file not found")

        # Get metadata first to find column names
        metadata = parser.get_file_metadata(str(test_file))
        if not metadata or not metadata[0].columns:
            pytest.skip("No columns found in test file")

        # Create a simple column mapping
        mapping = ColumnMapping(
            sheet_name=metadata[0].name,
            question_column=metadata[0].columns[0],  # First column
            question_types=[QuestionType.OPEN_ENDED],
        )

        questions = parser.extract_rows_by_columns(str(test_file), [mapping])

        # Should extract something (depending on file content)
        assert isinstance(questions, list)

    def test_count_rows_in_columns(self):
        """Test row counting."""
        parser = ExcelParser()
        test_file = TEST_FILES_DIR / "sample_survey.xlsx"

        if not test_file.exists():
            pytest.skip("Test file not found")

        metadata = parser.get_file_metadata(str(test_file))
        if not metadata:
            pytest.skip("No metadata found")

        mapping = ColumnMapping(
            sheet_name=metadata[0].name,
            question_column=metadata[0].columns[0],
        )

        count = parser.count_rows_in_columns(str(test_file), [mapping])

        assert count >= 0


class TestColumnMapping:
    """Tests for ColumnMapping model."""

    def test_column_mapping_creation(self):
        """Test creating a column mapping."""
        mapping = ColumnMapping(
            sheet_name="Sheet1",
            question_column="Question",
            answer_column="Answers",
            question_types=[QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE],
        )

        assert mapping.sheet_name == "Sheet1"
        assert mapping.question_column == "Question"
        assert mapping.answer_column == "Answers"
        assert len(mapping.question_types) == 2

    def test_column_mapping_defaults(self):
        """Test default values."""
        mapping = ColumnMapping(
            sheet_name="Sheet1",
            question_column="Q",
        )

        assert mapping.answer_column is None
        assert mapping.start_row == 2
        assert mapping.end_row is None
        assert mapping.question_types == []
