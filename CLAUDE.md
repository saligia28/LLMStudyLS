# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Study LS is a desktop learning application for teaching LLM (Large Language Model) concepts. It's an Electron-based app with a React frontend, Express backend server, and integrated terminal for hands-on practice.

## Development Commands

All commands should be run from the `app/` directory:

```bash
cd app

# Install dependencies (including native modules rebuild)
npm install

# Start full development environment (backend server + Electron + Vite)
npm run start:dev

# Individual processes:
npm run dev            # Vite dev server only (port 5173)
npm run server:dev     # Express backend only (port 3001)
npm run electron:dev   # Vite + Electron together

# Production build
npm run build          # Vite build
npm run electron:build # Full Electron app build
```

## Architecture

### Three-Layer Structure

1. **Electron Main Process** (`app/electron/`)

   - `main.js` - Window management, IPC setup for terminal communication
   - `pty-service.js` - PTY terminal service using node-pty
   - `preload.js` - Context bridge for renderer process

2. **Express Backend Server** (`app/server/`)

   - `index.js` - Server entry (port 3001), mounts API routes
   - `routes/content.js` - Serves learning content structure and step details
   - `routes/llm.js` - Proxies LLM API calls (DeepSeek via OpenAI-compatible SDK)
   - `services/content-scanner.js` - Scans and caches content from `content/` directory

3. **React Frontend** (`app/src/`)
   - Built with Vite, uses Ant Design + Tailwind CSS (prefixed with `tw-`)
   - `App.jsx` - Main layout with sidebar, content area, and terminal
   - `components/Sidebar/` - Week/step navigation
   - `components/Terminal/` - xterm.js terminal integration
   - `pages/StepDetail.jsx` - Renders markdown content with react-markdown
   - `services/api.js` - HTTP client for backend communication

### Content System

Learning content lives in `content/` directory with this structure:

```
content/
├── content.config.json    # Root config with enabled weeks
├── week1/
│   ├── week.json          # Week metadata and step definitions
│   ├── docs/              # Markdown tutorial files (step1.md, etc.)
│   └── code/              # Practice code files organized by step
```

The `ContentScanner` service auto-detects weeks and steps if config files are missing.

## Environment Variables

Create `.env` in `app/` directory:

```
SERVER_PORT=3001
WINDOW_SERVER_PORT=5173
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASEURL=https://api.deepseek.com
```

## Key Technical Details

- ES Modules throughout (`"type": "module"` in package.json)
- Path alias `@` maps to `app/src/`
- Tailwind classes use `tw-` prefix to avoid conflicts with Ant Design
- Terminal IPC channels: `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:destroy`
- Content API endpoints: `GET /api/content/structure`, `GET /api/content/week/:weekId/step/:stepId`
- LLM API endpoints: `POST /api/llm/chat`, `POST /api/llm/chat/stream`