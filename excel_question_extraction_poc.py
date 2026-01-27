#!/usr/bin/env python3
"""
Excel Question Extraction POC

This script extracts survey questions from Excel files using:
- Excel -> MarkItDown -> Bedrock AI (Claude Sonnet 4)

Usage:
    # Run extraction
    python excel_question_extraction_poc.py sample_survey.xlsx
    
    # Custom output file
    python excel_question_extraction_poc.py sample.xlsx --output results.json
    
    # Create sample Excel file for testing
    python excel_question_extraction_poc.py --create-sample

Environment variables:
    AWS_PROFILE=your-profile (optional)
    AWS_REGION=us-west-2 (default)
    BEDROCK_MODEL_ID=<model-id-or-arn> (default: Claude Sonnet 4 inference profile ARN)

Note: Uses Claude Sonnet 4 via AWS Bedrock inference profile for best accuracy and 8K output tokens
"""

import os
import sys
import json
import asyncio
import argparse
import logging
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from io import BytesIO
from datetime import datetime

# Excel processing

# Microsoft MarkItDown
from markitdown import MarkItDown

# AWS Bedrock
import boto3
from botocore.exceptions import ClientError, BotoCoreError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PerformanceTracker:
    """Track performance metrics for different operations"""
    
    def __init__(self):
        self.timings = {}
        self.start_times = {}
    
    def start_timer(self, operation: str):
        """Start timing an operation"""
        self.start_times[operation] = time.time()
    
    def end_timer(self, operation: str) -> float:
        """End timing an operation and return duration"""
        if operation in self.start_times:
            duration = time.time() - self.start_times[operation]
            self.timings[operation] = duration
            del self.start_times[operation]
            return duration
        return 0.0
    
    def get_timing(self, operation: str) -> float:
        """Get timing for an operation"""
        return self.timings.get(operation, 0.0)
    
    def get_all_timings(self) -> Dict[str, float]:
        """Get all recorded timings"""
        return self.timings.copy()
    
    def format_duration(self, seconds: float) -> str:
        """Format duration in human readable format"""
        if seconds < 1:
            return f"{seconds*1000:.0f}ms"
        elif seconds < 60:
            return f"{seconds:.1f}s"
        else:
            minutes = int(seconds // 60)
            remaining_seconds = seconds % 60
            return f"{minutes}m {remaining_seconds:.1f}s"


class ExcelTextExtractor:
    """Convert Excel files to text using different strategies"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    
    def extract_markitdown_text(self, file_path: str, perf_tracker: PerformanceTracker = None) -> str:
        """Use Microsoft MarkItDown for Excel text extraction"""
        if perf_tracker:
            perf_tracker.start_timer("markitdown_extraction")
        
        try:
            # Initialize MarkItDown
            md = MarkItDown()
            
            # Convert Excel file to markdown
            result = md.convert(file_path)
            
            if result and hasattr(result, 'text_content'):
                markdown_text = result.text_content
                
                # Clean up NaN values - replace with dash for better readability
                markdown_text = markdown_text.replace(' NaN ', ' - ')
                markdown_text = markdown_text.replace('| NaN |', '| - |')
                markdown_text = markdown_text.replace('\nNaN\n', '\n-\n')
                markdown_text = markdown_text.replace('NaN', '-')  # Catch any remaining NaN
                
                self.logger.info(f"MarkItDown extracted {len(markdown_text)} characters (NaN values cleaned)")
                
                if perf_tracker:
                    duration = perf_tracker.end_timer("markitdown_extraction")
                    self.logger.info(f"MarkItDown extraction took: {perf_tracker.format_duration(duration)}")
                
                return markdown_text
            else:
                if perf_tracker:
                    perf_tracker.end_timer("markitdown_extraction")
                self.logger.warning("MarkItDown returned empty result")
                return ""
                
        except Exception as e:
            if perf_tracker:
                perf_tracker.end_timer("markitdown_extraction")
            self.logger.error(f"Error with MarkItDown extraction: {e}")
            return ""

class PromptTemplates:
    """Centralized and organized prompt templates for question extraction"""
    
    @staticmethod
    def get_xml_template() -> str:
        """Ultra-compact XML template - maximum token efficiency"""
        return '''<questions>
  <q type="open_ended">Full question text</q>
  <q type="single_choice">Question? (Option A|Option B|Option C)</q>
  <q type="multiple_choice">Question? (Option A|Option B|Option C)</q>
  <q type="grouped_question">Question: subpart1</q>
  <q type="grouped_question">Question: subpart2</q>
  <q type="yes_no">Question? (Yes|No)</q>
</questions>

RULES:
- Only include: question text + type attribute
- For grouped_question: "Parent question: Sub question" in text
- Embed answers in text with pipe separator in case of single_choice or multiple_choice or yes_no: (A|B|C)
- No answers property, no confidence, no context, no parent, no order
- Return ONLY the XML, nothing else'''
    
    @staticmethod
    def get_complete_prompt(extraction_method: str, content: str) -> str:
        """Ultra-compact prompt for maximum token efficiency"""
        return f"""Extract ALL questions from this survey content.

EXTRACTION RULES

ANALYZE THE STRUCTURE: Identify which columns contain main questions, subquestions (grouped follow-up items), and answer options (selectable choices).

EXTRACT EVERY QUESTION FULLY: Extract each question completely. This includes interrogative sentences (e.g., "How satisfied are you..."), imperative instructions (e.g., "List the main reasons..."), and any request for information. Each question must be handled as a separate, full question.

ANSWER OPTIONS AND CHOICE TYPES: If a question includes predefined answer options (including Yes/No), list them after the question in parentheses, separated by "|". For example:
Do you use the app? (Yes|No)
What actions are in place? (Risk assessment|Training|Ergonomics|No actions|Other)

If the question allows only one option to be selected, classify it as single_choice. If it allows multiple selections, classify it as multiple_choice.

Important: Do not confuse multiple choice options with subquestions. Options are selectable values; subquestions are separate, itemized prompts under one main theme.

GROUPED QUESTIONS: A grouped question is when a main question is followed by multiple related subquestions or aspects that should be answered individually. These often appear as matrix-style or battery-style questions. In this case, extract each combination as a separate question in the format:
Main question:Subquestion

For example, if the main question is "How satisfied are you with the following?" and the items are "Customer service", "Prices", "Product range", then output:
How satisfied are you with the following?:Customer service
How satisfied are you with the following?:Prices
How satisfied are you with the following?:Product range

CATEGORIES: For each extracted question, assign one of the following categories:

open_ended: The question has no answer options and no subquestions.

single_choice: The question has answer options, and only one option can be selected.

multiple_choice: The question has answer options, and multiple options can be selected.

grouped_question: The question has subquestions (even if answer options are also present).

yes_no: The question can only be answered with Yes or No.

Important: If a question includes both answer options and subquestions, always classify it as grouped_question. Subquestions take priority over answer format when determining the category.

CONTENT:
{content}

OUTPUT FORMAT:
{PromptTemplates.get_xml_template()}

Extract ALL questions. Return ONLY the XML."""


class BedrockQuestionExtractor:
    """Use AWS Bedrock for question extraction"""
    
    def __init__(self, region: str = "us-west-2", model_id: str = None):
        if model_id is None:
            model_id = os.getenv('BEDROCK_MODEL_ID', 'arn:aws:bedrock:us-west-2:492490406854:inference-profile/global.anthropic.claude-opus-4-5-20250514-v1:0')
        self.region = region
        self.model_id = model_id
        self.logger = logging.getLogger(__name__)
        self.prompt_templates = PromptTemplates()
        self.perf_tracker = PerformanceTracker()
        
        # AWS session and client initialization
        try:
            from botocore.config import Config
            
            # Configure with increased timeout for large files
            config = Config(
                read_timeout=600,  # 10 minutes for large file processing
                connect_timeout=60,
                retries={'max_attempts': 3, 'mode': 'adaptive'}
            )
            
            self.session = boto3.Session(region_name=region)
            self.bedrock_runtime = self.session.client('bedrock-runtime', config=config)
            self.logger.info(f"Bedrock client initialized for region: {region} with 10-minute timeout")
        except Exception as e:
            self.logger.error(f"Failed to initialize Bedrock client: {e}")
            raise
    
    async def extract_questions_from_text(self, text_content: str) -> Dict[str, Any]:
        """Extract questions from text using Bedrock with chunking for large content"""
        
        # Use the new organized prompt template
        prompt = self.prompt_templates.get_complete_prompt("text_based", text_content)

        try:
            response = await self._invoke_bedrock_model(prompt)
            return self._parse_bedrock_response(response, "text_based")
            
        except Exception as e:
            self.logger.error(f"Error extracting questions from text: {e}")
            return {
                "extraction_method": "text_based",
                "success": False,
                "error": str(e),
                "total_questions_found": 0,
                "questions": []
            }

    async def _invoke_bedrock_model(self, prompt: str) -> str:
        """Invoke Bedrock model (Claude Sonnet 4)"""
        
        self.perf_tracker.start_timer("bedrock_api_call")
        
        # Claude API payload
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 16384,  # Opus 4.5 supports up to 32K output tokens
            "temperature": 0.1,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }
        
        try:
            self.logger.info(f"Invoking Bedrock model: {self.model_id}")
            self.logger.info(f"Prompt length: {len(prompt)} characters (~{len(prompt)//4} tokens)")
            
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps(payload),
                contentType='application/json'
            )
            
            duration = self.perf_tracker.end_timer("bedrock_api_call")
            self.logger.info(f"Bedrock API call took: {self.perf_tracker.format_duration(duration)}")
            
            response_body = json.loads(response['body'].read())
            
            if 'content' in response_body and len(response_body['content']) > 0:
                response_text = response_body['content'][0]['text']
                
                self.logger.info(f"Response length: {len(response_text)} characters (~{len(response_text)//4} tokens)")
                
                return response_text
            else:
                raise Exception("No content in Bedrock response")
                
        except ClientError as e:
            self.perf_tracker.end_timer("bedrock_api_call")
            self.logger.error(f"AWS ClientError: {e}")
            raise
        except Exception as e:
            self.perf_tracker.end_timer("bedrock_api_call")
            self.logger.error(f"Bedrock invocation error: {e}")
            raise
    
    def _parse_bedrock_response(self, response_text: str, method: str) -> Dict[str, Any]:
        """Parse and process Bedrock AI response (XML first, JSON fallback)"""
        
        try:
            # Try XML parsing first (ultra-compact format)
            if '<questions>' in response_text:
                self.logger.info("Attempting XML parsing...")
                parsed_response = self._try_parse_xml(response_text, method)
                if parsed_response:
                    parsed_response['success'] = True
                    parsed_response['raw_response'] = response_text
                    return parsed_response
            
            # Fallback to JSON if XML not found
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                self.logger.info("Attempting JSON parsing...")
                json_text = response_text[json_start:json_end]
                
                parsed_response = self._try_parse_json(json_text, method)
                if parsed_response:
                    parsed_response['success'] = True
                    parsed_response['raw_response'] = response_text
                    return parsed_response
                else:
                    return {
                        "extraction_method": method,
                        "success": False,
                        "error": "Could not parse JSON from response after multiple attempts",
                        "raw_response": response_text,
                        "total_questions_found": 0,
                        "questions": []
                    }
            else:
                return {
                    "extraction_method": method,
                    "success": False,
                    "error": "Could not find JSON or XML structure in response",
                    "raw_response": response_text,
                    "total_questions_found": 0,
                    "questions": []
                }
                
        except Exception as e:
            self.logger.error(f"Unexpected error in parsing: {e}")
            return {
                "extraction_method": method,
                "success": False,
                "error": f"Unexpected parsing error: {str(e)}",
                "raw_response": response_text,
                "total_questions_found": 0,
                "questions": []
            }
    
    def _try_parse_xml(self, response_text: str, method: str) -> Optional[Dict[str, Any]]:
        """Parse ultra-compact XML format"""
        try:
            from bs4 import BeautifulSoup
            
            # Extract XML (handle incomplete responses)
            xml_start = response_text.find('<questions>')
            xml_end = response_text.rfind('</questions>')
            
            if xml_start < 0:
                return None
            
            # If incomplete, close the tag
            if xml_end < 0:
                self.logger.warning("Incomplete XML - attempting recovery")
                xml_text = response_text[xml_start:] + '</questions>'
            else:
                xml_text = response_text[xml_start:xml_end + len('</questions>')]
            
            # Parse with BeautifulSoup
            soup = BeautifulSoup(xml_text, 'xml')
            questions_tag = soup.find('questions')
            
            if not questions_tag:
                return None
            
            questions = []
            for q in questions_tag.find_all('q'):
                question_text = q.get_text(strip=True)
                question_type = q.get('type', 'open_ended')
                
                questions.append({
                    "question_text": question_text,
                    "question_type": question_type
                })
            
            self.logger.info(f"XML parsing successful: {len(questions)} questions extracted")
            return {
                "extraction_method": method,
                "total_questions_found": len(questions),
                "questions": questions
            }
            
        except Exception as e:
            self.logger.error(f"XML parsing error: {e}")
            return None
    
    def _clean_json_text(self, json_text: str) -> str:
        """Clean JSON text from control characters and invalid sequences"""
        import re
        
        # Remove only problematic control characters, but preserve valid JSON structure
        # Remove control characters except newlines, tabs, and carriage returns
        json_text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', json_text)
        
        # Don't escape newlines and other characters that are already properly escaped in JSON
        # The JSON is already properly formatted from Bedrock
        
        # Remove any non-printable characters that might cause issues
        json_text = re.sub(r'[\x80-\x9F]', '', json_text)
        
        # Clean up any double escaping issues
        json_text = json_text.replace('\\\\n', '\\n')
        json_text = json_text.replace('\\\\r', '\\r')
        json_text = json_text.replace('\\\\t', '\\t')
        
        return json_text.strip()
    
    def _try_parse_json(self, json_text: str, method: str) -> Optional[Dict[str, Any]]:
        """Try multiple approaches to parse JSON with enhanced error handling"""
        
        # Log the raw response for debugging
        self.logger.debug(f"Raw JSON response for {method} (first 200 chars): {json_text[:200]}")
        
        # Approach 1: Parse as-is
        try:
            return json.loads(json_text)
        except json.JSONDecodeError as e:
            self.logger.debug(f"Approach 1 failed for {method}: {str(e)}")
        
        # Approach 2: Clean and parse
        try:
            cleaned_json = self._clean_json_text(json_text)
            return json.loads(cleaned_json)
        except json.JSONDecodeError as e:
            self.logger.debug(f"Approach 2 failed for {method}: {str(e)}")
        
        # Approach 3: Try to fix common JSON issues
        try:
            # Fix unescaped quotes in strings
            import re
            fixed_json = re.sub(r'(?<!\\)"(?=.*")', '\\"', json_text)
            return json.loads(fixed_json)
        except json.JSONDecodeError as e:
            self.logger.debug(f"Approach 3 failed for {method}: {str(e)}")
        
        # Approach 4: Try to extract just the structure we need
        try:
            import re
            # Look for the main structure patterns
            if '"total_questions_found"' in json_text and '"questions"' in json_text:
                # Try to manually extract key information
                total_match = re.search(r'"total_questions_found":\s*(\d+)', json_text)
                if total_match:
                    total_questions = int(total_match.group(1))
                    
                    # Try to extract questions array manually
                    questions_match = re.search(r'"questions":\s*\[(.*?)\]', json_text, re.DOTALL)
                    questions = []
                    
                    if questions_match:
                        questions_text = questions_match.group(1)
                        # Try to parse individual question objects
                        question_pattern = r'\{[^{}]*"question_text"[^{}]*\}'
                        question_matches = re.findall(question_pattern, questions_text)
                        
                        for q_match in question_matches:
                            try:
                                q_obj = json.loads(q_match)
                                questions.append(q_obj)
                            except:
                                # If individual question parsing fails, create a basic structure
                                text_match = re.search(r'"question_text":\s*"([^"]*)"', q_match)
                                if text_match:
                                    questions.append({
                                        "question_text": text_match.group(1),
                                        "question_order": len(questions) + 1,
                                        "question_type": "open_ended",
                                        "answers": None,
                                        "confidence_level": "medium",
                                        "parent_question": None
                                    })
                    
                    self.logger.info(f"Partial JSON parsing successful for {method}: {total_questions} questions found, {len(questions)} parsed")
                    return {
                        "extraction_method": method,
                        "total_questions_found": len(questions),  # Use actual parsed count
                        "questions": questions,
                        "parsing_note": f"Partial parsing - recovered {len(questions)} out of {total_questions} questions"
                    }
        except Exception as e:
            self.logger.debug(f"Approach 4 failed for {method}: {str(e)}")
        
        # Approach 5: Try to find any question-like text and create minimal structure
        try:
            import re
            # Look for any question patterns in the text
            question_patterns = [
                r'["\']([^"\']*\?[^"\']*)["\']',  # Text ending with ?
                r'["\']([^"\']*(?:what|how|when|where|why|which|who)[^"\']*)["\']',  # Question words
                r'["\']([^"\']*(?:please|rate|describe|provide)[^"\']*)["\']',  # Instruction words
            ]
            
            found_questions = []
            for pattern in question_patterns:
                matches = re.findall(pattern, json_text, re.IGNORECASE)
                for match in matches:
                    if len(match.strip()) > 10:  # Only meaningful questions
                        found_questions.append({
                            "question_text": match.strip(),
                            "question_order": len(found_questions) + 1,
                            "question_type": "open_ended",
                            "answers": None,
                            "confidence_level": "low",
                            "parent_question": None
                        })
            
            if found_questions:
                self.logger.info(f"Emergency parsing for {method}: recovered {len(found_questions)} potential questions")
                return {
                    "extraction_method": method,
                    "total_questions_found": len(found_questions),
                    "questions": found_questions,
                    "parsing_note": "Emergency parsing - extracted potential questions from malformed JSON"
                }
        except Exception as e:
            self.logger.debug(f"Approach 5 failed for {method}: {str(e)}")
        
        # If all approaches fail, log the full response and return None
        self.logger.error(f"All JSON parsing approaches failed for method: {method}")
        self.logger.error(f"Full response text: {json_text}")
        return None


class POCRunner:
    """Run POC and compare results"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.text_extractor = ExcelTextExtractor()
        self.perf_tracker = PerformanceTracker()
        
        # AWS configuration
        region = os.getenv('AWS_REGION', 'us-west-2')
        model_id = os.getenv('BEDROCK_MODEL_ID', 'arn:aws:bedrock:us-west-2:492490406854:inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0')
        
        self.bedrock_extractor = BedrockQuestionExtractor(region=region, model_id=model_id)
    
    async def run_poc(self, excel_file_path: str, selected_approaches: List[int] = None) -> Dict[str, Any]:
        """Run complete POC with selected approaches"""
        
        if selected_approaches is None:
            selected_approaches = [4]  # Default to approach 4
        
        if not os.path.exists(excel_file_path):
            raise FileNotFoundError(f"Excel file not found: {excel_file_path}")
        
        self.logger.info(f"Starting POC with Excel file: {excel_file_path}")
        
        results = {
            "excel_file": excel_file_path,
            "timestamp": datetime.now().isoformat(),
            "selected_approaches": selected_approaches,
            "approaches": {}
        }
        
        # Store MarkItDown text to reuse across approaches
        markitdown_text = None
        markitdown_file = None
        
        # Run selected approaches
        for approach_num in selected_approaches:
            if approach_num == 3:
                markitdown_text, markitdown_file = await self._run_approach_3(results, excel_file_path, markitdown_text, markitdown_file)
        
        return results
    
    async def _run_approach_3(self, results: Dict[str, Any], excel_file_path: str, 
                             markitdown_text: str = None, markitdown_file: str = None) -> tuple:
        """Run Approach 3: Excel -> MarkItDown -> Bedrock"""
        self.logger.info("=== APPROACH 3: Excel -> MarkItDown -> Bedrock ===")
        self.perf_tracker.start_timer("approach_3_total")
        
        try:
            if markitdown_text is None:
                markitdown_text = self.text_extractor.extract_markitdown_text(excel_file_path, self.perf_tracker)
                self.logger.info(f"MarkItDown text extracted: {len(markitdown_text)} characters")
            else:
                self.logger.info(f"Reusing MarkItDown text: {len(markitdown_text)} characters")
            
            if markitdown_text:
                # Save MarkItDown text to separate file
                if markitdown_file is None:
                    markitdown_file = self._save_markitdown_text(markitdown_text, excel_file_path)
                
                self.perf_tracker.start_timer("approach_3_bedrock")
                markitdown_result = await self.bedrock_extractor.extract_questions_from_text(markitdown_text)
                bedrock_duration = self.perf_tracker.end_timer("approach_3_bedrock")
                total_duration = self.perf_tracker.end_timer("approach_3_total")
                
                results["approaches"]["markitdown"] = {
                    "extracted_text_length": len(markitdown_text),
                    "extracted_text_preview": markitdown_text[:500] + "..." if len(markitdown_text) > 500 else markitdown_text,
                    "markitdown_file": markitdown_file,
                    "bedrock_result": markitdown_result,
                    "performance": {
                        "markitdown_extraction_time": self.perf_tracker.get_timing("markitdown_extraction"),
                        "bedrock_time": bedrock_duration,
                        "total_time": total_duration,
                        "markitdown_extraction_formatted": self.perf_tracker.format_duration(self.perf_tracker.get_timing("markitdown_extraction")),
                        "bedrock_formatted": self.perf_tracker.format_duration(bedrock_duration),
                        "total_formatted": self.perf_tracker.format_duration(total_duration)
                    }
                }
            else:
                self.perf_tracker.end_timer("approach_3_total")
                results["approaches"]["markitdown"] = {
                    "error": "No text extracted with MarkItDown"
                }
                
        except Exception as e:
            self.perf_tracker.end_timer("approach_3_total")
            self.logger.error(f"MarkItDown approach failed: {e}")
            results["approaches"]["markitdown"] = {"error": str(e)}
        
        return markitdown_text, markitdown_file
    
    def _save_markitdown_text(self, markitdown_text: str, excel_file_path: str) -> str:
        """Save MarkItDown extracted text to separate file"""
        
        # Generate filename based on Excel file
        excel_name = Path(excel_file_path).stem
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        markitdown_file = f"{excel_name}_markitdown_{timestamp}.md"
        
        try:
            with open(markitdown_file, 'w', encoding='utf-8') as f:
                f.write(f"# MarkItDown Extraction from {excel_file_path}\n\n")
                f.write(f"**Extracted at:** {datetime.now().isoformat()}\n")
                f.write(f"**Source file:** {excel_file_path}\n")
                f.write(f"**Text length:** {len(markitdown_text)} characters\n\n")
                f.write("---\n\n")
                f.write(markitdown_text)
            
            self.logger.info(f"MarkItDown text saved to: {markitdown_file}")
            return markitdown_file
            
        except Exception as e:
            self.logger.error(f"Failed to save MarkItDown text: {e}")
            return ""
    
    def save_results(self, results: Dict[str, Any], output_file: str = None) -> str:
        """Save results to JSON file"""
        
        if output_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"excel_extraction_poc_results_{timestamp}.json"
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"Results saved to: {output_file}")
        return output_file


async def main():
    """Main function"""
    
    parser = argparse.ArgumentParser(description='Excel Question Extraction POC')
    parser.add_argument('excel_file', help='Path to Excel file to analyze')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    
    args = parser.parse_args()
    
    if not args.excel_file:
        parser.print_help()
        sys.exit(1)
    
    # Always use approach 3 (MarkItDown + InvokeModel)
    selected_approaches = [3]
    
    try:
        # Run POC
        poc_runner = POCRunner()
        results = await poc_runner.run_poc(args.excel_file, selected_approaches)
        
        # Save results
        output_file = poc_runner.save_results(results, args.output)
        
        # Print summary
        print("\n" + "="*60)
        print("POC RESULTS SUMMARY")
        print("="*60)
        
        performance_data = []
        
        for approach_name, approach_data in results["approaches"].items():
            print(f"\n{approach_name.upper()}:")
            if "error" in approach_data:
                print(f"  ❌ Error: {approach_data['error']}")
            elif "bedrock_result" in approach_data:
                bedrock_result = approach_data["bedrock_result"]
                success = bedrock_result.get("success", False)
                questions_count = bedrock_result.get("total_questions_found", 0)
                
                if success:
                    print(f"  ✅ Success: {questions_count} questions found")
                    
                    # Print first few questions
                    questions = bedrock_result.get("questions", [])
                    for i, q in enumerate(questions[:3]):
                        print(f"    {i+1}. {q.get('question_text', 'N/A')[:60]}...")
                    
                    if len(questions) > 3:
                        print(f"    ... and {len(questions) - 3} more questions")
                        
                    # Print performance metrics
                    if "performance" in approach_data:
                        perf = approach_data["performance"]
                        print(f"  ⏱️  Total Time: {perf.get('total_formatted', 'N/A')}")
                        
                        # Store for comparison
                        performance_data.append({
                            "approach": approach_name,
                            "total_time": perf.get("total_time", 0),
                            "questions_found": questions_count,
                            "success": True
                        })
                    
                else:
                    print(f"  ❌ Failed: {bedrock_result.get('error', 'Unknown error')}")
                    
                    if "performance" in approach_data:
                        perf = approach_data["performance"]
                        performance_data.append({
                            "approach": approach_name,
                            "total_time": perf.get("total_time", 0),
                            "questions_found": 0,
                            "success": False
                        })
                    
        
        # Performance comparison
        if len(performance_data) > 1:
            print(f"\n⚡ PERFORMANCE COMPARISON:")
            performance_data.sort(key=lambda x: x["total_time"])
            
            fastest = performance_data[0]
            print(f"  🏆 Fastest: {fastest['approach']} ({poc_runner.perf_tracker.format_duration(fastest['total_time'])})")
            
            for i, perf in enumerate(performance_data[1:], 1):
                speedup = perf["total_time"] / fastest["total_time"] if fastest["total_time"] > 0 else 1
                print(f"  #{i+1}: {perf['approach']} ({poc_runner.perf_tracker.format_duration(perf['total_time'])}) - {speedup:.1f}x slower")
        
        print(f"\n📄 Full results saved to: {output_file}")
             
    except Exception as e:
        logger.error(f"POC failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
