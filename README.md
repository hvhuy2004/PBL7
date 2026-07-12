# AgileAI - Project Progress Management with AI Assistant

AgileAI is a web application for managing project progress, Kanban tasks, members, deadlines, activity logs, reports, and AI-assisted planning.

## Main Features

- Project, member, role, and workspace management
- Kanban boards, task details, checklist, progress, tags, comments, and attachments
- Activity logs, notifications, realtime project messages, and dashboard reports
- AI assistant for draft task generation, project summary, assignment suggestions, and duplicate-task checking
- Docker-based deployment with React, FastAPI, Nginx, and MySQL

## Tech Stack

- Frontend: React, Vite, Axios, WebSocket
- Backend: FastAPI, SQLAlchemy, JWT/RBAC
- Database: MySQL
- AI integrations: GitHub Models, Google Gemini, OpenAI/OpenRouter compatible APIs
- Deployment: Docker Compose, Nginx, Uvicorn

## Project Structure

```text
.
├── BE/                 # FastAPI backend
├── FE/                 # React frontend
├── docker-compose.yml  # Production-style Docker deployment
├── .env.example        # Root Docker environment example
└── DEPLOY_DOCKER_GUIDE.md
```

## Quick Start With Docker

1. Copy environment examples:

```bash
cp .env.example .env
cp BE/.env.example BE/.env
cp FE/.env.example FE/.env
```

2. Update passwords, `SECRET_KEY`, Google OAuth client ID, and optional AI API keys.

3. Start the system:

```bash
docker compose up --build
```

4. Open the frontend:

```text
http://localhost
```

## Local Development

Backend:

```bash
cd BE
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd FE
npm install
npm run dev
```

## Environment Notes

- Real `.env` files are intentionally ignored by Git.
- Use `.env.example`, `BE/.env.example`, and `FE/.env.example` as templates.
- AI features are optional and depend on configured provider keys.

## Author

Huynh Vu Huy - University of Science and Technology, The University of Danang.
