"""Application configuration using pydantic-settings."""

import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API settings
    api_title: str = "Question Extraction Testing Framework"
    api_version: str = "0.1.0"
    debug: bool = False

    # AWS settings
    aws_region: str = "us-west-2"
    aws_profile: str | None = None
    
    # Available models for extraction - using US regional inference profiles
    # Source: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
    bedrock_opus_model_id: str = (
        "arn:aws:bedrock:us-west-2::inference-profile/"
        "us.anthropic.claude-opus-4-5-20251101-v1:0"
    )
    bedrock_sonnet_model_id: str = (
        "arn:aws:bedrock:us-west-2::inference-profile/"
        "us.anthropic.claude-sonnet-4-20250514-v1:0"
    )
    
    # Default model for extraction (Approaches 1 & 2) - defaults to Opus 4.5
    bedrock_model_id: str = (
        "arn:aws:bedrock:us-west-2::inference-profile/"
        "us.anthropic.claude-opus-4-5-20251101-v1:0"
    )
    
    # Smaller/faster model for LLM-as-judge (Approach 3)
    bedrock_judge_model_id: str = (
        "arn:aws:bedrock:us-west-2::inference-profile/"
        "global.anthropic.claude-3-haiku-20240307-v1:0"
    )

    # File paths
    base_dir: Path = Path(__file__).parent.parent.parent
    output_dir: Path = base_dir / "output"
    runs_dir: Path = output_dir / "runs"
    comparisons_dir: Path = output_dir / "comparisons"
    benchmarks_dir: Path = output_dir / "benchmarks"
    ground_truth_dir: Path = output_dir / "ground_truth"
    upload_dir: Path = base_dir / "uploads"

    # LLM settings
    max_tokens: int = 24576  # Opus 4.5 supports up to 32K, using 24K for safety
    temperature: float = 0.1
    judge_max_tokens: int = 1024
    judge_temperature: float = 0.0

    # Confidence threshold for Approach 3
    confidence_threshold: float = 0.7

    class Config:
        env_prefix = "QE_"
        env_file = ".env"
        extra = "ignore"

    def ensure_directories(self) -> None:
        """Create output directories if they don't exist."""
        for directory in [
            self.output_dir,
            self.runs_dir,
            self.comparisons_dir,
            self.benchmarks_dir,
            self.ground_truth_dir,
            self.upload_dir,
        ]:
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    settings = Settings()
    settings.ensure_directories()
    return settings
