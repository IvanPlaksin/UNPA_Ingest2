# UN ProjectAdvisor: Hybrid Development Guide

## 🚀 Quick Start

### 1. Infrastructure (Docker)
Start databases and ETL worker:
`docker compose up -d`

### 2. API (Local)
`cd api && npm run dev`
(Ensure api/.env uses 'localhost' for DB connections)

### 3. Frontend (Local)
`cd mcp && npm run dev`
