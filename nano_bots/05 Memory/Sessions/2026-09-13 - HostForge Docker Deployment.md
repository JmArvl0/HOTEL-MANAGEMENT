# HostForge Docker Deployment

Date: 2026-09-13

## Outcome

- Added a root `Dockerfile` for HostForge's Dockerfile build mode.
- Kept the existing npm and standard Next.js architecture: `npm ci` → `npm run build` → `npm run start`.
- Pinned the container to `node:22-alpine`, matching `.nvmrc`.
- Exposed port 3000 and bound Next.js to `0.0.0.0`.
- Added a root `.dockerignore` that excludes dependencies, build output, Git metadata, local environment files, logs, caches, and local visual/debug artifacts.
- Kept the reliability-first single-stage image because the Admin System Health route reads the local `supabase/migrations` directory at runtime.
- HostForge must supply production environment variables through its platform configuration; no secret value is stored in the image or Git.

## Verification

- `npm ci`: passed after stopping the local HAVEN dev server that held the Next.js SWC binary open.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 errors and 71 existing warnings.
- `npm test`: 91 files and 1,027 tests passed.
- `npm run build`: passed with Next.js 16.3.2.
- Supabase migration history: 66 local and 66 remote migrations matched; no database write was performed.
- Docker CLI: available (29.7.2), but the Docker Desktop Linux engine was not running, so a local image build could not be executed.

## HostForge configuration

- Build system: Dockerfile
- Runtime: Node
- Framework: Next.js
- Runtime version: 22
- Dockerfile path: `Dockerfile`
- Root directory: `/`
- Build context: repository root
- Install command: blank
- Build trigger: push
- Auto deploy: enabled
- Build cache: enabled

The release commit is the commit containing this note and is recorded in the Git history/final deployment handoff.
