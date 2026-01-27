#!/bin/bash

# Question Extraction Testing Framework - Startup Script
# This script starts both the backend (FastAPI) and frontend (Vite) applications

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Configuration
BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_URL="http://localhost:$BACKEND_PORT"
FRONTEND_URL="http://localhost:$FRONTEND_PORT"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Question Extraction Testing Framework${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# AWS SSO Login
echo -e "${BLUE}Checking AWS SSO authentication...${NC}"
if command -v aws &> /dev/null; then
    echo -e "${YELLOW}Logging in to AWS SSO...${NC}"
    aws sso login
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ AWS SSO login successful${NC}"
    else
        echo -e "${RED}✗ AWS SSO login failed${NC}"
        echo -e "${YELLOW}Continuing anyway - you may need to authenticate manually${NC}"
    fi
else
    echo -e "${YELLOW}AWS CLI not found - skipping SSO login${NC}"
    echo -e "${YELLOW}Make sure you have valid AWS credentials configured${NC}"
fi
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if Python virtual environment exists for backend
if [ ! -d "$BACKEND_DIR/venv" ]; then
    echo -e "${YELLOW}Python virtual environment not found. Creating one...${NC}"
    cd "$BACKEND_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}Virtual environment created and dependencies installed.${NC}"
    echo ""
fi

# Check if frontend dependencies are installed
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}Frontend dependencies not found. Installing...${NC}"
    cd "$FRONTEND_DIR"
    npm install
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}Frontend dependencies installed.${NC}"
    echo ""
fi

# Start Backend
echo -e "${BLUE}Starting Backend (FastAPI)...${NC}"
cd "$BACKEND_DIR"
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > /tmp/qe-backend.log 2>&1 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend to start...${NC}"
for i in {1..30}; do
    if curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Backend failed to start. Check logs at /tmp/qe-backend.log${NC}"
        cleanup
    fi
    sleep 1
done
echo ""

# Start Frontend
echo -e "${BLUE}Starting Frontend (Vite + React)...${NC}"
cd "$FRONTEND_DIR"
npm run dev > /tmp/qe-frontend.log 2>&1 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

# Wait for frontend to be ready
echo -e "${YELLOW}Waiting for frontend to start...${NC}"
for i in {1..30}; do
    if curl -s "$FRONTEND_URL" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Frontend failed to start. Check logs at /tmp/qe-frontend.log${NC}"
        cleanup
    fi
    sleep 1
done
echo ""

# Display URLs
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ All services are running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Application URL:${NC}"
echo -e "  ${GREEN}${FRONTEND_URL}${NC}"
echo ""
echo -e "${BLUE}Backend API:${NC}"
echo -e "  ${FRONTEND_URL}/docs (Swagger UI)"
echo -e "  ${BACKEND_URL}/health (Health check)"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  Backend:  /tmp/qe-backend.log"
echo -e "  Frontend: /tmp/qe-frontend.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and wait for processes
wait
