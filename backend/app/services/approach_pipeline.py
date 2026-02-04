"""Approach 4: Multi-Step Pipeline Extraction.

This approach uses a multi-step pipeline:
1. Structure Analysis: Identify question/answer columns
2. Coverage Validation: Judge validates structure completeness
3. Question Extraction: Extract questions with types, answers, dependencies
4. Normalization: Convert to Python objects

All intermediate results are saved for POC debugging.
"""

import json
import logging
import time
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from bs4 import BeautifulSoup

from ..config import get_settings
from ..schemas import (
    ExtractedQuestion,
    ExtractionResult,
    ExtractionMetrics,
    QuestionType,
    QuestionDependency,
)
from .excel_parser import ExcelParser

logger = logging.getLogger(__name__)


class PipelineExtractionService:
    """Multi-step pipeline extraction with intermediate result saving."""

    def __init__(self, model_id: str | None = None):
        self.settings = get_settings()
        self.parser = ExcelParser()
        self.model_id = model_id or self.settings.bedrock_model_id
        # Use Sonnet 4.5 for judge step (Step 2: Coverage Validation)
        self.judge_model_id = self.settings.bedrock_sonnet_model_id

        # Initialize Bedrock clients
        config = Config(
            read_timeout=600,
            connect_timeout=60,
            retries={"max_attempts": 3, "mode": "adaptive"},
        )
        self.bedrock = boto3.client(
            "bedrock-runtime",
            region_name=self.settings.aws_region,
            config=config,
        )

        # Track metrics
        self.total_llm_calls = 0
        self.structure_analysis_time_ms = 0
        self.coverage_validation_time_ms = 0
        self.extraction_time_ms = 0
        self.normalization_time_ms = 0

    async def extract(self, file_path: str, run_id: str | None = None) -> ExtractionResult:
        """
        Extract questions using multi-step pipeline.

        Args:
            file_path: Path to the Excel file
            run_id: Optional run ID for saving intermediate results

        Returns:
            ExtractionResult with questions and metrics
        """
        start_time = time.time()
        run_id = run_id or f"pipeline_{int(time.time())}"
        intermediate_dir = None

        try:
            # Create intermediate results directory
            intermediate_dir = None
            if run_id:
                run_dir = self.settings.runs_dir / run_id
                run_dir.mkdir(parents=True, exist_ok=True)
                intermediate_dir = run_dir / "intermediate_results"
                intermediate_dir.mkdir(parents=True, exist_ok=True)

            # Step 1: Structure Analysis
            logger.info("Step 1: Analyzing structure...")
            step1_start = time.time()
            structure = await self._analyze_structure(file_path, intermediate_dir)
            self.structure_analysis_time_ms = int((time.time() - step1_start) * 1000)
            
            if intermediate_dir:
                self._save_intermediate_result(
                    intermediate_dir, 1, structure, run_id, "structure_analysis.json"
                )

            if not structure or not structure.get("sheets"):
                return ExtractionResult(
                    approach=4,
                    success=False,
                    error="Failed to analyze structure",
                )

            # Step 2: Coverage Validation
            logger.info("Step 2: Validating coverage...")
            step2_start = time.time()
            coverage = await self._validate_coverage(structure, file_path, intermediate_dir)
            self.coverage_validation_time_ms = int((time.time() - step2_start) * 1000)
            
            if intermediate_dir:
                self._save_intermediate_result(
                    intermediate_dir, 2, coverage, run_id, "coverage_validation.json"
                )

            # Step 3: Question Extraction
            logger.info("Step 3: Extracting questions...")
            step3_start = time.time()
            xml_output = await self._extract_questions(structure, file_path, intermediate_dir, run_id)
            self.extraction_time_ms = int((time.time() - step3_start) * 1000)

            if not xml_output:
                return ExtractionResult(
                    approach=4,
                    success=False,
                    error="Failed to extract questions",
                )

            # Step 4: Normalization
            logger.info("Step 4: Normalizing to objects...")
            step4_start = time.time()
            questions = self._normalize_to_objects(xml_output)
            self.normalization_time_ms = int((time.time() - step4_start) * 1000)
            
            if intermediate_dir:
                self._save_intermediate_result(
                    intermediate_dir, 4, [q.model_dump() for q in questions], run_id, "normalized_questions.json"
                )

            # Calculate metrics
            total_time_ms = int((time.time() - start_time) * 1000)
            show_deps_count = sum(
                1 for q in questions
                if q.dependencies and any(d.dependency_action == "show" for d in q.dependencies)
            )
            skip_deps_count = sum(
                1 for q in questions
                if q.dependencies and any(d.dependency_action == "skip" for d in q.dependencies)
            )

            return ExtractionResult(
                approach=4,
                success=True,
                questions=questions,
                metrics=ExtractionMetrics(
                    extraction_count=len(questions),
                    total_time_ms=total_time_ms,
                    structure_analysis_time_ms=self.structure_analysis_time_ms,
                    coverage_validation_time_ms=self.coverage_validation_time_ms,
                    extraction_time_ms=self.extraction_time_ms,
                    normalization_time_ms=self.normalization_time_ms,
                    total_llm_calls=self.total_llm_calls,
                    structure_confidence=structure.get("confidence"),
                    coverage_confidence=coverage.get("confidence"),
                    show_dependencies_count=show_deps_count,
                    skip_dependencies_count=skip_deps_count,
                ),
            )

        except Exception as e:
            logger.error(f"Pipeline extraction failed: {e}", exc_info=True)
            return ExtractionResult(
                approach=4,
                success=False,
                error=str(e),
                metrics=ExtractionMetrics(
                    extraction_count=0,
                    total_time_ms=int((time.time() - start_time) * 1000),
                ),
            )

    async def _analyze_structure(self, file_path: str, intermediate_dir: Path | None = None) -> dict[str, Any]:
        """Step 1: Analyze Excel structure to identify question/answer columns."""
        # Get metadata
        metadata = self.parser.get_file_metadata(file_path)
        
        # Build concise prompt with sample data
        prompt_parts = [
            "Analyze this Excel file structure and identify:",
            "1. Which columns contain questions",
            "2. Which columns contain answer options",
            "3. Header row location",
            "4. Data start row",
            "",
            "Sheets:",
        ]
        
        for sheet in metadata:
            prompt_parts.append(f"\nSheet: {sheet.name}")
            prompt_parts.append(f"Columns: {', '.join(sheet.columns[:10])}")  # Limit to first 10 columns
            prompt_parts.append(f"Row count: {sheet.row_count}")
            if sheet.sample_data:
                prompt_parts.append("Sample rows (first 3):")
                for idx, row in enumerate(sheet.sample_data[:3]):
                    prompt_parts.append(f"  Row {idx + 2}: {json.dumps(row, default=str)}")
        
        prompt_parts.extend([
            "",
            "Respond in XML format:",
            "<structure_analysis>",
            '  <sheet sheet_name="Sheet1" header_row="1" data_start_row="2" confidence="0.95">',
            '    <columns question_column="Column_5" answer_column="Column_6" type_column="" instruction_column=""/>',
            '    <structure_notes>Questions in column 5, answers in column 6</structure_notes>',
            "  </sheet>",
            "</structure_analysis>",
            "",
            "Return ONLY the XML."
        ])
        
        prompt = "\n".join(prompt_parts)
        
        # Save prompt
        if intermediate_dir:
            prompt_file = intermediate_dir / "step1_structure_analysis_prompt.txt"
            prompt_file.write_text(prompt)
        
        response = await self._invoke_llm(prompt, self.model_id, "xml")
        self.total_llm_calls += 1
        
        # Save response
        if intermediate_dir:
            response_file = intermediate_dir / "step1_structure_analysis_response.xml"
            response_file.write_text(response)
        
        if not response or not response.strip():
            logger.error("Empty response from structure analysis")
            return {"sheets": [], "confidence": 0.0}
        
        try:
            return self._parse_structure_xml(response)
        except Exception as e:
            logger.error(f"Failed to parse structure analysis: {e}")
            logger.debug(f"Response was: {response[:500]}")  # Log first 500 chars for debugging
            return {"sheets": [], "confidence": 0.0}

    async def _validate_coverage(self, structure: dict, file_path: str, intermediate_dir: Path | None = None) -> dict[str, Any]:
        """Step 2: Validate structure analysis completeness."""
        metadata = self.parser.get_file_metadata(file_path)
        
        prompt = f"""Validate this structure analysis. Check:
1. Are all question columns identified?
2. Are answer options properly located?
3. Are there missing elements?

Structure Analysis:
{json.dumps(structure, indent=2)}

Available Sheets:
{json.dumps([{"name": s.name, "columns": s.columns, "row_count": s.row_count} for s in metadata], indent=2)}

Respond in XML format:
<coverage_validation is_complete="true" confidence="0.92">
  <missing_elements/>
  <suggestions>
    <suggestion>Column_7 may contain conditional logic indicators</suggestion>
  </suggestions>
</coverage_validation>

Return ONLY the XML."""
        
        # Save prompt
        if intermediate_dir:
            prompt_file = intermediate_dir / "step2_coverage_validation_prompt.txt"
            prompt_file.write_text(prompt)
        
        response = await self._invoke_llm(prompt, self.judge_model_id, "xml")
        self.total_llm_calls += 1
        
        # Save response
        if intermediate_dir:
            response_file = intermediate_dir / "step2_coverage_validation_response.xml"
            response_file.write_text(response)
        
        if not response or not response.strip():
            logger.warning("Empty response from coverage validation")
            return {"is_complete": True, "missing_elements": [], "suggestions": [], "confidence": 0.5}
        
        try:
            return self._parse_coverage_xml(response)
        except Exception as e:
            logger.error(f"Failed to parse coverage validation: {e}")
            logger.debug(f"Response was: {response[:500]}")
            return {"is_complete": True, "missing_elements": [], "suggestions": [], "confidence": 0.5}

    async def _extract_questions(
        self, structure: dict, file_path: str, intermediate_dir: Path | None, run_id: str
    ) -> str:
        """Step 3: Extract questions with types, answers, dependencies."""
        import re
        
        # Extract data with context (question cell + adjacent cells)
        batches = self._extract_with_context(structure, file_path)
        
        all_xml_parts = []
        batch_num = 0
        
        for batch in batches:
            batch_num += 1
            
            # Get the actual sheet name from the batch (all items in batch are from same sheet)
            actual_sheet_name = batch[0].get("sheet", "Sheet1") if batch else "Sheet1"
            
            prompt = self._build_extraction_prompt(batch)
            
            # Save prompt
            if intermediate_dir:
                prompt_file = intermediate_dir / f"step3_extraction_batch_{batch_num}_prompt.txt"
                prompt_file.write_text(prompt)
            
            response = await self._invoke_llm(prompt, self.model_id, "xml")
            self.total_llm_calls += 1
            
            # Save raw response before any modification
            if intermediate_dir:
                raw_response_file = intermediate_dir / f"step3_extraction_batch_{batch_num}_response_raw.xml"
                raw_response_file.write_text(response)
            
            # Replace any sheet name in the XML with the actual sheet name
            # The LLM might output sheet="Sheet1" but we know the real sheet name
            response = re.sub(
                r'sheet="[^"]*"',
                f'sheet="{actual_sheet_name}"',
                response
            )
            
            # Save batch XML (with corrected sheet name)
            if intermediate_dir:
                xml_file = intermediate_dir / f"step3_question_extraction_batch_{batch_num}.xml"
                xml_file.write_text(response)
            
            all_xml_parts.append(response)
        
        # Combine all batches
        combined_xml = "<questions>\n" + "\n".join(
            part.replace("<questions>", "").replace("</questions>", "").strip()
            for part in all_xml_parts
        ) + "\n</questions>"
        
        if intermediate_dir:
            combined_file = intermediate_dir / "step3_question_extraction_combined.xml"
            combined_file.write_text(combined_xml)
        
        return combined_xml

    def _extract_with_context(self, structure: dict, file_path: str) -> list[list[dict]]:
        """Extract question cells with adjacent cell context.
        
        Uses sheet-based batching: one batch per sheet.
        This keeps all questions from a sheet together, ensuring:
        - Follow-up questions stay with their parent questions
        - Multi-row answer options are not split across batches
        - Dependencies can use simple row numbers (within same sheet)
        """
        import openpyxl
        
        batches = []
        
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        
        try:
            for sheet_info in structure.get("sheets", []):
                sheet_name = sheet_info["sheet_name"]
                if sheet_name not in wb.sheetnames:
                    continue
                
                ws = wb[sheet_name]
                columns = sheet_info.get("columns", {})
                question_col = columns.get("question_column")
                answer_col = columns.get("answer_column")
                data_start = sheet_info.get("data_start_row", 2)
                
                if not question_col:
                    continue
                
                # Find column indices
                header_row = list(ws[1])
                q_col_idx = None
                a_col_idx = None
                
                for idx, cell in enumerate(header_row):
                    col_name = str(cell.value) if cell.value else f"Unnamed: {idx}"
                    if col_name == question_col:
                        q_col_idx = idx
                    if answer_col and col_name == answer_col:
                        a_col_idx = idx
                
                if q_col_idx is None:
                    continue
                
                # One batch per sheet - keeps all questions from this sheet together
                sheet_batch = []
                
                # Extract rows with context, detecting multiple-choice question patterns
                row_idx = data_start
                while row_idx <= ws.max_row:
                    row = list(ws[row_idx])
                    
                    # Get question cell
                    q_cell = row[q_col_idx] if q_col_idx < len(row) else None
                    question_text = str(q_cell.value).strip() if q_cell and q_cell.value else ""
                    
                    # Check if this row has a question or if it's a continuation (empty question cell but has answer)
                    if not question_text or question_text == "-":
                        # Check if answer column has a value - might be continuation of previous question
                        if a_col_idx is not None and a_col_idx < len(row):
                            answer_cell = row[a_col_idx]
                            if answer_cell and answer_cell.value:
                                # This might be a continuation row - check previous row
                                if sheet_batch and sheet_batch[-1].get("row") == row_idx - 1:
                                    # Add this as an additional answer option to previous question
                                    answer_text = str(answer_cell.value).strip()
                                    if "answer_options" not in sheet_batch[-1]:
                                        sheet_batch[-1]["answer_options"] = []
                                    if answer_text:
                                        sheet_batch[-1]["answer_options"].append(answer_text)
                                    row_idx += 1
                                    continue
                        row_idx += 1
                        continue
                    
                    # Build context for this question row
                    context = {
                        "row": row_idx,
                        "sheet": sheet_name,
                        "question_cell": question_text,
                        "answer_options": [],  # For multiple choice questions
                    }
                    
                    # Answer cell (first option)
                    if a_col_idx is not None and a_col_idx < len(row):
                        answer_cell = row[a_col_idx]
                        if answer_cell and answer_cell.value:
                            answer_text = str(answer_cell.value).strip()
                            context["answer_cell"] = answer_text
                            context["answer_options"].append(answer_text)
                    
                    # Check for multiple-choice pattern: look ahead for continuation rows
                    # A continuation row has: empty question column but answer column has value
                    # Allow skipping over empty gap rows (up to MAX_GAP_ROWS consecutive empty rows)
                    MAX_GAP_ROWS = 5  # Allow up to 5 consecutive empty rows between answer options
                    lookahead_idx = row_idx + 1
                    consecutive_empty_rows = 0
                    
                    while lookahead_idx <= ws.max_row and lookahead_idx <= row_idx + 30:  # Max 30 rows lookahead
                        lookahead_row = list(ws[lookahead_idx])
                        
                        # Check question column
                        lookahead_q_cell = lookahead_row[q_col_idx] if q_col_idx < len(lookahead_row) else None
                        lookahead_q_text = str(lookahead_q_cell.value).strip() if lookahead_q_cell and lookahead_q_cell.value else ""
                        
                        # Check answer column
                        lookahead_answer_text = ""
                        if a_col_idx is not None and a_col_idx < len(lookahead_row):
                            lookahead_a_cell = lookahead_row[a_col_idx]
                            if lookahead_a_cell and lookahead_a_cell.value:
                                lookahead_answer_text = str(lookahead_a_cell.value).strip()
                        
                        # Case 1: Question column has content = new question, stop
                        if lookahead_q_text and lookahead_q_text != "-":
                            break
                        
                        # Case 2: Empty question but has answer = continuation row
                        if lookahead_answer_text:
                            context["answer_options"].append(lookahead_answer_text)
                            consecutive_empty_rows = 0  # Reset gap counter
                            lookahead_idx += 1
                        else:
                            # Case 3: Both empty = gap row, skip but count
                            consecutive_empty_rows += 1
                            if consecutive_empty_rows > MAX_GAP_ROWS:
                                # Too many consecutive empty rows, stop looking
                                break
                            lookahead_idx += 1
                    
                    sheet_batch.append(context)
                    row_idx += 1
                
                # Add the sheet batch if it has any questions
                if sheet_batch:
                    batches.append(sheet_batch)
        
        finally:
            wb.close()
        
        return batches if batches else [[]]

    def _build_extraction_prompt(self, batch: list[dict]) -> str:
        """Build concise extraction prompt for a batch."""
        prompt_parts = [
            "Extract questions from these rows. For each:",
            "1. Separate question text from instructions/comments",
            "2. Identify type (open_ended, single_choice, multiple_choice, numeric, integer, decimal, etc.)",
            "3. Extract ALL answer options if present (especially for single_choice, multiple_choice, yes_no questions)",
            "4. Parse dependencies:",
            "   - Show: 'appears only if...' → action='show'",
            "   - Skip: 'skip if...', 'hidden when...' → action='skip'",
            "5. Detect FOLLOW-UP questions - these indicate conditional dependencies:",
            "   - Text patterns: 'If you can not...', 'If no...', 'If not...', 'Please explain...', 'Please detail...'",
            "   - When detected, create a dependency to the PREVIOUS question row number",
            "   - Action is 'show' (follow-up appears when main question answered negatively)",
            "   - Example: Row 5 'Can you meet this requirement?' → Row 6 'If you can not, please detail here'",
            "     Row 6 should have: <depends_on question_row=\"5\" answer_value=\"No\" action=\"show\"/>",
            "",
            "IMPORTANT: If a question has multiple answer options listed in 'answer_options',",
            "it is likely a single_choice, multiple_choice or yes_no question. Extract ALL options.",
            "",
            "Question type guidelines:",
            "- yes_no: EXACTLY 2 options that are simple 'Yes'/'No' or 'True'/'False' binary choices",
            "  Example: 'Do you have operations?' → Yes | No",
            "  If 'Yes' has instructions like 'Yes (please provide detail)', keep as yes_no but put instruction in help_text",
            "  Example: 'Yes (please provide detail)' | 'No' → type='yes_no', help_text='If Yes, please provide detail'",
            "  If there are MORE than 2 distinct options, use single_choice instead",
            "  Example: 'Has your company been audited?' → 'Yes, virtual audit' | 'Yes, on-site audit' | 'No audit yet' = single_choice",
            "- single_choice: Multiple options (including expanded Yes/No variants) but only one can be selected",
            "  If a yes/no question has expanded options like 'Yes, option A' | 'Yes, option B' | 'No', use single_choice",
            "- multiple_choice: Multiple options and multiple can be selected (checkboxes)",
            "- open_ended: No predefined answer options, free text input",
            "",
            "Rows:",
        ]
        
        for idx, row_data in enumerate(batch):
            prompt_parts.append(f"\nRow {row_data['row']}:")
            prompt_parts.append(f"  [question] {row_data['question_cell']}")
            if row_data.get('answer_cell'):
                prompt_parts.append(f"  [answer] {row_data['answer_cell']}")
            # Show all answer options for multiple-choice questions
            if row_data.get('answer_options') and len(row_data['answer_options']) > 1:
                prompt_parts.append(f"  [all_answer_options] {' | '.join(row_data['answer_options'])}")
                prompt_parts.append(f"  [NOTE] This question has {len(row_data['answer_options'])} answer options - it is likely multiple_choice")
        
        prompt_parts.extend([
            "",
            "Output XML format:",
            '<questions>',
            '  <q type="single_choice" row="2" sheet="Sheet1">',
            '    <text>What is your industry?</text>',
            '    <help_text>Please select one</help_text>',
            '    <answers><option>Manufacturing</option><option>Services</option></answers>',
            '    <dependencies><depends_on question_row="5" answer_value="Yes" action="show"/></dependencies>',
            '  </q>',
            '  <q type="yes_no" row="5" sheet="Sheet1">',
            '    <text>Do you have international operations?</text>',
            '    <help_text></help_text>',
            '    <answers><option>Yes</option><option>No</option></answers>',
            '    <dependencies></dependencies>',
            '  </q>',
            '  <q type="yes_no" row="8" sheet="Sheet1">',
            '    <text>Do you have sustainability certifications?</text>',
            '    <help_text></help_text>',
            '    <answers><option>Yes</option><option>No</option></answers>',
            '    <conditional_inputs><input answer="Yes">please provide detail about which certifications</input></conditional_inputs>',
            '    <dependencies></dependencies>',
            '  </q>',
            '  <q type="single_choice" row="21" sheet="Sheet1">',
            '    <text>Has your company been audited by an independent external auditor?</text>',
            '    <help_text>If yes, upload the audit report</help_text>',
            '    <answers>',
            '      <option>Yes, virtual audit</option>',
            '      <option>Yes, on-site audit</option>',
            '      <option>No audit yet/I don\'t know</option>',
            '    </answers>',
            '    <dependencies></dependencies>',
            '  </q>',
            '  <q type="multiple_choice" row="15" sheet="Sheet1">',
            '    <text>Does your company have any of the following certifications?</text>',
            '    <help_text></help_text>',
            '    <answers>',
            '      <option>Environmental certifications, such as ISO 50001, ISO 14001, EMAS</option>',
            '      <option>Labor and human rights certifications, such as Fair Wage Network</option>',
            '      <option>Business ethics certification(s), such as ISO 27001</option>',
            '    </answers>',
            '    <dependencies></dependencies>',
            '  </q>',
            '  <!-- Follow-up question example: main question and dependent follow-up -->',
            '  <q type="yes_no" row="30" sheet="Sheet1">',
            '    <text>Can you confirm you meet this requirement?</text>',
            '    <help_text></help_text>',
            '    <answers><option>Yes</option><option>No</option></answers>',
            '    <dependencies></dependencies>',
            '  </q>',
            '  <q type="open_ended" row="31" sheet="Sheet1">',
            '    <text>If you can not reach this requirement, please detail here.</text>',
            '    <help_text></help_text>',
            '    <answers></answers>',
            '    <dependencies>',
            '      <depends_on question_row="30" answer_value="No" action="show"/>',
            '    </dependencies>',
            '  </q>',
            '</questions>',
            "",
            "Return ONLY the XML."
        ])
        
        return "\n".join(prompt_parts)

    def _normalize_to_objects(self, xml: str) -> list[ExtractedQuestion]:
        """Step 4: Convert XML to ExtractedQuestion objects.
        
        This method generates unique GUIDs for each question and resolves
        dependency references from sheet:row format to GUIDs.
        """
        import uuid
        
        questions = []
        # Map sheet:row -> question_id (GUID) for dependency resolution
        location_to_guid: dict[str, str] = {}
        # Store raw dependency data for second pass
        raw_dependencies: dict[int, list[dict]] = {}
        
        try:
            soup = BeautifulSoup(xml, "xml")
            questions_tag = soup.find("questions")
            
            if not questions_tag:
                return questions
            
            # First pass: create questions with GUIDs and build location map
            for idx, q_tag in enumerate(questions_tag.find_all("q")):
                question_text = q_tag.find("text")
                if not question_text:
                    continue
                
                q_text = question_text.get_text(strip=True)
                q_type_str = q_tag.get("type", "open_ended")
                
                # Map type
                type_mapping = {
                    "open_ended": QuestionType.OPEN_ENDED,
                    "single_choice": QuestionType.SINGLE_CHOICE,
                    "multiple_choice": QuestionType.MULTIPLE_CHOICE,
                    "grouped_question": QuestionType.GROUPED_QUESTION,
                    "yes_no": QuestionType.YES_NO,
                    "numeric": QuestionType.NUMERIC,
                    "integer": QuestionType.INTEGER,
                    "decimal": QuestionType.DECIMAL,
                }
                question_type = type_mapping.get(q_type_str, QuestionType.OPEN_ENDED)
                
                # Help text
                help_text_tag = q_tag.find("help_text")
                help_text = help_text_tag.get_text(strip=True) if help_text_tag else None
                if help_text == "":
                    help_text = None
                
                # Answers
                answers = None
                answers_tag = q_tag.find("answers")
                if answers_tag:
                    options = answers_tag.find_all("option")
                    if options:
                        answers = [opt.get_text(strip=True) for opt in options]
                
                # Conditional inputs (for answers that require additional detail)
                conditional_inputs = None
                cond_inputs_tag = q_tag.find("conditional_inputs")
                if cond_inputs_tag:
                    input_tags = cond_inputs_tag.find_all("input")
                    if input_tags:
                        conditional_inputs = {}
                        for input_tag in input_tags:
                            answer_value = input_tag.get("answer", "").strip()
                            input_prompt = input_tag.get_text(strip=True)
                            if answer_value and input_prompt:
                                conditional_inputs[answer_value] = input_prompt
                        if not conditional_inputs:
                            conditional_inputs = None
                
                # Generate GUID for this question
                question_id = str(uuid.uuid4())
                
                # Store location -> GUID mapping
                question_sheet = q_tag.get("sheet", "")
                row_index = int(q_tag.get("row")) if q_tag.get("row") else None
                if question_sheet and row_index is not None:
                    location_key = f"{question_sheet}:{row_index}"
                    location_to_guid[location_key] = question_id
                
                # Store raw dependencies for second pass
                deps_tag = q_tag.find("dependencies")
                if deps_tag:
                    raw_deps = []
                    for dep_tag in deps_tag.find_all("depends_on"):
                        raw_dep_id = dep_tag.get("question_row") or dep_tag.get("question_id") or ""
                        raw_deps.append({
                            "raw_id": raw_dep_id,
                            "sheet": question_sheet,
                            "answer_value": dep_tag.get("answer_value"),
                            "condition_type": dep_tag.get("condition_type", "equals"),
                            "action": dep_tag.get("action", "show"),
                            "original_text": dep_tag.get("original_text"),
                        })
                    if raw_deps:
                        raw_dependencies[len(questions)] = raw_deps
                
                questions.append(
                    ExtractedQuestion(
                        question_id=question_id,
                        question_text=q_text,
                        question_type=question_type,
                        answers=answers,
                        help_text=help_text,
                        conditional_inputs=conditional_inputs,
                        dependencies=None,  # Will be set in second pass
                        row_index=row_index,
                        sheet_name=question_sheet if question_sheet else None,
                    )
                )
            
            # Second pass: resolve dependencies using GUIDs
            for q_idx, raw_deps in raw_dependencies.items():
                dependencies = []
                for raw_dep in raw_deps:
                    # Build location key to lookup the GUID
                    raw_id = raw_dep["raw_id"]
                    sheet = raw_dep["sheet"]
                    
                    # Create composite key for lookup
                    if sheet and raw_id:
                        location_key = f"{sheet}:{raw_id}"
                    else:
                        location_key = raw_id
                    
                    # Resolve to GUID if found, otherwise keep the raw reference
                    resolved_id = location_to_guid.get(location_key, location_key)
                    
                    dep = QuestionDependency(
                        depends_on_question_id=resolved_id,
                        depends_on_answer_value=raw_dep["answer_value"],
                        condition_type=raw_dep["condition_type"],
                        dependency_action=raw_dep["action"],
                        original_text=raw_dep["original_text"],
                    )
                    dependencies.append(dep)
                
                if dependencies:
                    questions[q_idx].dependencies = dependencies
        
        except Exception as e:
            logger.error(f"XML normalization error: {e}", exc_info=True)
        
        return questions

    async def _invoke_llm(self, prompt: str, model_id: str, response_format: str) -> str:
        """Invoke Bedrock LLM."""
        # Determine max_tokens based on model
        # Opus 4.5 supports 32K, Sonnet 4.5 supports 16K
        if "opus" in model_id.lower():
            max_tokens = 32768  # Opus 4.5 maximum
        elif "sonnet" in model_id.lower():
            max_tokens = 16384  # Sonnet 4.5 maximum
        else:
            # Fallback to settings
            max_tokens = self.settings.max_tokens if response_format == "xml" else self.settings.judge_max_tokens
        
        # Use lower temperature for JSON responses (judge steps)
        temperature = self.settings.temperature if response_format == "xml" else self.settings.judge_temperature
        
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        
        response = self.bedrock.invoke_model(
            modelId=model_id,
            body=json.dumps(payload),
            contentType="application/json",
        )
        
        response_body = json.loads(response["body"].read())
        
        if "content" in response_body and len(response_body["content"]) > 0:
            return response_body["content"][0]["text"]
        
        raise Exception("No content in Bedrock response")

    def _parse_structure_xml(self, xml: str) -> dict[str, Any]:
        """Parse structure analysis XML response."""
        try:
            # Find XML content
            xml_start = xml.find("<structure_analysis>")
            xml_end = xml.rfind("</structure_analysis>")
            
            if xml_start < 0:
                return {"sheets": [], "confidence": 0.0}
            
            if xml_end < 0:
                xml_text = xml[xml_start:] + "</structure_analysis>"
            else:
                xml_text = xml[xml_start : xml_end + len("</structure_analysis>")]
            
            soup = BeautifulSoup(xml_text, "xml")
            structure_tag = soup.find("structure_analysis")
            
            if not structure_tag:
                return {"sheets": [], "confidence": 0.0}
            
            sheets = []
            for sheet_tag in structure_tag.find_all("sheet"):
                columns_tag = sheet_tag.find("columns")
                columns = {}
                if columns_tag:
                    columns = {
                        "question_column": columns_tag.get("question_column", ""),
                        "answer_column": columns_tag.get("answer_column") or None,
                        "type_column": columns_tag.get("type_column") or None,
                        "instruction_column": columns_tag.get("instruction_column") or None,
                    }
                
                structure_notes_tag = sheet_tag.find("structure_notes")
                structure_notes = structure_notes_tag.get_text(strip=True) if structure_notes_tag else ""
                
                sheets.append({
                    "sheet_name": sheet_tag.get("sheet_name", ""),
                    "header_row": int(sheet_tag.get("header_row", 1)),
                    "data_start_row": int(sheet_tag.get("data_start_row", 2)),
                    "columns": columns,
                    "structure_notes": structure_notes,
                })
            
            confidence = float(structure_tag.get("confidence", 0.0)) if structure_tag.get("confidence") else 0.0
            
            return {
                "sheets": sheets,
                "confidence": confidence,
            }
        except Exception as e:
            logger.error(f"XML parsing error in structure analysis: {e}")
            return {"sheets": [], "confidence": 0.0}

    def _parse_coverage_xml(self, xml: str) -> dict[str, Any]:
        """Parse coverage validation XML response."""
        try:
            # Find XML content
            xml_start = xml.find("<coverage_validation>")
            xml_end = xml.rfind("</coverage_validation>")
            
            if xml_start < 0:
                return {"is_complete": True, "missing_elements": [], "suggestions": [], "confidence": 0.5}
            
            if xml_end < 0:
                xml_text = xml[xml_start:] + "</coverage_validation>"
            else:
                xml_text = xml[xml_start : xml_end + len("</coverage_validation>")]
            
            soup = BeautifulSoup(xml_text, "xml")
            coverage_tag = soup.find("coverage_validation")
            
            if not coverage_tag:
                return {"is_complete": True, "missing_elements": [], "suggestions": [], "confidence": 0.5}
            
            is_complete = coverage_tag.get("is_complete", "true").lower() == "true"
            confidence = float(coverage_tag.get("confidence", 0.5)) if coverage_tag.get("confidence") else 0.5
            
            missing_elements = []
            missing_tag = coverage_tag.find("missing_elements")
            if missing_tag:
                for elem in missing_tag.find_all("element"):
                    missing_elements.append(elem.get_text(strip=True))
            
            suggestions = []
            suggestions_tag = coverage_tag.find("suggestions")
            if suggestions_tag:
                for suggestion in suggestions_tag.find_all("suggestion"):
                    suggestions.append(suggestion.get_text(strip=True))
            
            return {
                "is_complete": is_complete,
                "missing_elements": missing_elements,
                "suggestions": suggestions,
                "confidence": confidence,
            }
        except Exception as e:
            logger.error(f"XML parsing error in coverage validation: {e}")
            return {"is_complete": True, "missing_elements": [], "suggestions": [], "confidence": 0.5}

    def _save_intermediate_result(
        self, intermediate_dir: Path, step: int, data: dict | list | str, run_id: str, filename: str
    ) -> None:
        """Save intermediate result to file."""
        try:
            result_file = intermediate_dir / filename
            if isinstance(data, str):
                result_file.write_text(data)
            else:
                result_file.write_text(json.dumps(data, indent=2, default=str))
            logger.info(f"Saved intermediate result: {filename}")
        except Exception as e:
            logger.error(f"Failed to save intermediate result {filename}: {e}")
