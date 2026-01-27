"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import upload_router, extraction_router, comparison_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    settings = get_settings()
    settings.ensure_directories()
    yield
    # Shutdown (cleanup if needed)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.api_title,
        version=settings.api_version,
        description="Testing framework for comparing question extraction approaches",
        lifespan=lifespan,
    )

    # Configure CORS for React frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",  # Vite dev server
            "http://localhost:3000",  # Alternative dev port
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(upload_router, prefix="/api")
    app.include_router(extraction_router, prefix="/api")
    app.include_router(comparison_router, prefix="/api")

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "version": settings.api_version}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
