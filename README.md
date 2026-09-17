# WebWeaver

**A collaborative development workspace in your browser.**

WebWeaver brings project management, a Monaco code editor, real-time collaboration, cloud file storage, and runnable Next.js previews into one application. It explores the engineering behind a browser IDE: synchronizing edits, persisting project files, managing collaborators, and running user projects in a separate execution environment.

Built with **Next.js 16 · React 19 · TypeScript · Yjs · Prisma · PostgreSQL**.

## Workspace preview

![WebWeaver editor with file explorer, Monaco, and preview panels](docs/images/editor-light-1440.png)

The screenshot shows the actual interface with sample files and a mocked preview response. It does not represent a live production sandbox.

<details>
<summary>Landing page, account screen, and mobile workspace</summary>

![WebWeaver landing page](docs/images/landing-light-1440.png)

![WebWeaver sign-in screen](docs/images/login-light.png)

<img src="docs/images/editor-dark-390.png" alt="WebWeaver mobile code editor in dark mode" width="390" />

</details>

## Features

- **Project workspaces:** create Next.js projects, browse their file trees, reopen workspaces, and delete projects.
- **Responsive coding workspace:** switch between Code, Preview, and desktop Split views; toggle the file explorer, search files, and create files or folders inline.
- **Preview controls:** switch between full-width and mobile-width previews, reload the frame, or open it in a new tab.
- **System-aware themes:** light and dark palettes with a manual toggle, native Monaco themes, visible keyboard focus, and reduced-motion support.
- **Collaborative editing:** bind Monaco text models to Yjs documents and synchronize changes over WebSockets, with awareness data for collaborator presence.
- **Cloud persistence:** save project files to Supabase Storage; local development can also create workspaces on disk.
- **Runnable previews:** send the project file tree to Vercel Sandbox, install dependencies, and start a Next.js development server to obtain a preview URL.
- **Account flows:** email/password registration, email verification codes, and access/refresh token cookies.
- **Project sharing:** owners can add existing users by email, with collaborator roles stored in PostgreSQL.
- **Request limits:** Upstash Redis sliding-window limits for authentication, project creation, saving, previews, and other protected operations.
- **Terminal prototype:** an xterm.js client and a separate WebSocket/PTY server are included for local shell interaction.

## Architecture

```mermaid
flowchart LR
    Browser[Browser: React + Monaco]
    API[Next.js route handlers]
    Yjs[Yjs WebSocket server]
    DB[(PostgreSQL / Prisma)]
    Storage[Supabase Storage]
    Redis[Upstash Redis]
    Email[Resend]
    Sandbox[Vercel Sandbox]
    Terminal[xterm.js client]
    PTY[Local WebSocket / PTY server]

    Browser --> API
    Browser <--> Yjs
    API --> DB
    API --> Storage
    API --> Redis
    API --> Email
    API --> Sandbox
    Terminal <--> PTY
```

The Next.js application handles the interface and HTTP API. The collaboration server runs separately because it needs persistent WebSocket connections. PostgreSQL stores users, project metadata, and collaborator relationships; Supabase stores saved project files. Preview execution happens in Vercel Sandbox.

Yjs synchronization and saving are separate operations: receiving a live edit does not itself mean that the file has been persisted to storage.

## Using the editor

- Open a project from **Your projects**, then choose a file in **Files**.
- Use **Code**, **Preview**, or **Split** to choose your layout. Split is available on wider screens; phone and tablet layouts show one panel at a time.
- Search the explorer by filename. The new-file and new-folder buttons open an inline form; select **Project root** to create at the top level.
- Choose **Save**, or press **Ctrl/Cmd + S**, to persist edits. Creating a file changes the current workspace until it is saved.
- Choose **Run** to build a preview. The preview toolbar offers viewport sizing, reload, and a new-tab link once a URL is available.
- The collaboration indicator reports the WebSocket connection state; it is separate from file-save status.

## Technology

| Layer | Implementation |
| --- | --- |
| Interface | Next.js App Router, React, TypeScript, Tailwind CSS 4, Base UI |
| Editor and collaboration | Monaco Editor, Yjs, y-monaco, y-websocket |
| Client state | Zustand, TanStack Query, Axios |
| Data | PostgreSQL, Prisma 7 with the PostgreSQL driver adapter |
| File storage | Supabase Storage |
| Preview runtime | Vercel Sandbox |
| Authentication | JWT cookies, bcrypt password hashing with a server-side pepper |
| Email and rate limits | Resend, Upstash Redis |
| Terminal prototype | xterm.js, node-pty, ws |

## Local setup

### 1. Install dependencies

Use Node.js 24 (matching the configured preview runtime) and npm. The `node-pty` dependency may require platform-specific native build tools.

```bash
npm ci
```

### 2. Configure services

Create a `.env` file in the repository root using the variable names below. Supply your own service credentials; `.env` files are ignored by Git.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
JWT_SECRET=replace-with-a-long-random-secret
PEPPERED_PASS=replace-with-a-separate-long-random-secret

RESEND_SECRET=replace-with-your-resend-api-key

UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-your-upstash-token

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-your-server-only-service-role-key
USE_SUPABASE_STORAGE=true
SUPABASE_BUCKET=Files
```

Create a private Supabase bucket named `Files`. The upload/read helpers currently use that fixed name, while the save route uses `SUPABASE_BUCKET`; setting it to `Files` keeps both paths consistent. Saving uses Supabase even during local development.

Configure the sender in `app/api/resend/route.ts` to use an address authorized by your Resend account. Registration currently opens the verification screen without sending a code automatically; enter the registered email and use **Resend OTP** to request the first code.

For previews, provide Vercel Sandbox credentials. The installed SDK supports `VERCEL_OIDC_TOKEN`; its local setup guidance is to link a Vercel project and pull its environment:

```bash
npx vercel link
npx vercel env pull
```

These commands require your own Vercel account and project. Keep the resulting token in the ignored environment file.

### 3. Initialize the database

Against your own development database:

```bash
npx prisma generate
npx prisma migrate deploy
```

The generated client is written to `generated/prisma`. Migration files are in `prisma/migrations`.

### 4. Configure collaboration

The editor currently points to a fixed hosted WebSocket endpoint in `app/main/Editor/Monaco.tsx`. For an entirely local setup, change the URL passed to `WebsocketProvider` to `ws://localhost:1234` and start the collaboration server:

```bash
npm run start:yjs
```

The server defaults to port `1234`; `PORT` overrides it. The editor URL must match the server you run.

### 5. Start the app

In another terminal:

```bash
npm run dev
```

Open [localhost:3000/auth](http://localhost:3000/auth), register an account, request a verification code, verify your email, and sign in. Create a project to open the editor. To try collaboration, add another registered user to the project and open it in a second browser session.

### Optional: terminal prototype

```bash
npx tsx terminal-server/server.ts
```

The terminal client connects to `ws://localhost:3001`. This server opens a shell on the machine running it, inherits its environment, and does not authenticate connections. Keep it restricted to a trusted development environment; it is not an isolated per-project cloud terminal.

## Repository map

```text
app/
  auth/                    Landing, sign-in, sign-up, verification
  main/project/            Project dashboard, management, file explorer
  main/Editor/Monaco.tsx    Editor, collaboration, saving, preview controls
  api/                     Authentication, projects, files, email endpoints
  components/terminal.tsx  Terminal client prototype
ApiCalls/                  Client-side HTTP helpers
components/ui/             Shared interface primitives
lib/                       Service clients, tokens, storage, rate limits
prisma/                    Schema and database migrations
src/lib/defaultProject.ts  Project scaffold generation
useStates/                 Workspace and file state
terminal-server/           Local PTY WebSocket server
yjs-server.mjs             Collaboration server
```

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run start:yjs` | Start the collaboration server |
| `npx tsc --noEmit` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the Next.js application with webpack |
| `npm start` | Serve a completed production build |

Application console warnings/errors are restricted to fixed literal messages by ESLint, to help prevent credentials, user data, response bodies, and raw exceptions from being logged.

## Deployment and current scope

This is a portfolio project under active development. The implementation includes the features above, but deployment still requires service configuration and further hardening:

- Run the collaboration server on a host that supports persistent WebSockets. Its current implementation does not authenticate room access or persist Yjs documents across restarts.
- Set `USE_SUPABASE_STORAGE=true` for production project creation. Configure the storage, database, email, rate-limit, and Sandbox credentials in the deployment environment.
- Replace the fixed collaboration endpoint with your deployment URL. The standalone terminal client still targets localhost.
- Google sign-in and password reset are not implemented. The invitation form offers Viewer and Editor roles; complete authorization enforcement still requires a separate review.
- The production build, TypeScript, and focused UI lint checks pass. Full-source lint still reports two existing explicit `any` types in `ApiCalls/docker/docker.ts` and `useStates/projectStates.ts`.

## Design and validation

The redesign takes inspiration from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill). The landing page uses an asymmetric composition, one green accent, and restrained motion. Product screens share semantic color tokens; Monaco uses its native light/dark themes.

- `npm run build` completed successfully, including TypeScript and all 22 generated pages.
- Browser checks covered the landing and account pages at desktop and phone widths in both color schemes (16 combinations).
- Isolated editor checks covered Monaco loading, file selection/search, panel switching, and preview sizing, with all application API and collaboration requests intercepted by fixtures.
- The local landing-page Lighthouse accessibility report scored 100/100. Its subsequent temporary-browser cleanup encountered a Windows permission error. This score is an automated check, not a complete accessibility audit.
- Real authentication, cloud saves, multi-user synchronization, and sandbox provisioning were not exercised by the fixture-based visual checks.

See [design notes](docs/design.md) for the visual decisions and generated-art provenance.

## Engineering highlights

- Bound editor models to CRDT-backed shared documents for concurrent editing.
- Separated live synchronization, durable storage, and sandbox execution into distinct services.
- Implemented project file-tree handling and cloud storage synchronization.
- Built cookie-based authentication, hashed verification codes, collaborator records, and Redis-backed request limits.

**Resume description:** Built WebWeaver, a collaborative browser-based development workspace using Next.js, TypeScript, Monaco, and Yjs; integrated PostgreSQL/Prisma, Supabase file persistence, Redis rate limiting, and Vercel Sandbox previews.
