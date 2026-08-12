import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import Docker from "dockerode";
import tar from "tar-fs";
import { prisma } from "@/lib/prisma";
import getPort from "get-port";
import http from "http";
import crypto from "crypto";
import { PassThrough } from "stream";

export const runtime = "nodejs";

type ProjectFile = {
  name: string;
  type: "file" | "folder";
  content?: string;
  children?: ProjectFile[];
};

type SyncOptions = {
  existingContainer?: boolean;
};

type PreviewResult = {
  container: Docker.Container;
  hostPort: string;
  reused: boolean;
};

type SyncResult = {
  configChanged: boolean;
  dependenciesChanged: boolean;
};

const isWindows = process.platform === "win32";

const docker = new Docker(
  isWindows
    ? {
        socketPath: "//./pipe/docker_engine",
      }
    : {
        socketPath: "/var/run/docker.sock",
      }
);

const NEXT_CONFIG_FILES = new Set([
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
]);

const PACKAGE_FILES = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

/* =========================================================
   CONSTANTS
========================================================= */

const CONTAINER_APP_DIR = "/app";
const NEXT_PORT = 3000;

/*
 * The container itself stays alive using sleep.
 *
 * Next.js is then started separately using docker exec.
 *
 * This is intentional.
 */
const CONTAINER_KEEPALIVE_COMMAND = [
  "sh",
  "-c",
  "while true; do sleep 3600; done",
];

/* =========================================================
   HELPERS
========================================================= */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* =========================================================
   NORMALIZE PROJECT PATH
========================================================= */

function normalizeProjectPath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\.\/)+/, "");
}

/* =========================================================
   SAFE PATH
========================================================= */

function getSafeWorkspacePath(
  workspace: string,
  relativePath: string
): string | null {
  const normalized = normalizeProjectPath(relativePath);

  const workspaceResolved = path.resolve(workspace);

  const resolved = path.resolve(
    workspaceResolved,
    normalized
  );

  const relative = path.relative(
    workspaceResolved,
    resolved
  );

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  return resolved;
}

/* =========================================================
   FLATTEN FILE TREE
========================================================= */

function flattenFiles(
  files: ProjectFile[],
  parentPath = ""
): ProjectFile[] {
  const result: ProjectFile[] = [];

  for (const file of files) {
    const currentPath = parentPath
      ? path.posix.join(parentPath, file.name)
      : file.name;

    if (file.type === "folder") {
      if (Array.isArray(file.children)) {
        result.push(
          ...flattenFiles(
            file.children,
            currentPath
          )
        );
      }

      continue;
    }

    result.push({
      ...file,
      name: currentPath,
    });
  }

  return result;
}

/* =========================================================
   REMOVE STALE HOST FILES
========================================================= */

async function removeStaleFiles(
  directory: string,
  workspace: string,
  expectedFiles: Set<string>
): Promise<void> {
  let entries;

  try {
    entries = await fs.readdir(
      directory,
      {
        withFileTypes: true,
      }
    );
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(
      directory,
      entry.name
    );

    const relativePath = path.relative(
      workspace,
      absolutePath
    );

    /*
     * Docker-managed directories.
     */
    if (
      relativePath === "node_modules" ||
      relativePath.startsWith(
        `node_modules${path.sep}`
      ) ||
      relativePath === ".next" ||
      relativePath.startsWith(
        `.next${path.sep}`
      )
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      await removeStaleFiles(
        absolutePath,
        workspace,
        expectedFiles
      );

      try {
        const remaining =
          await fs.readdir(
            absolutePath
          );

        if (remaining.length === 0) {
          await fs.rm(
            absolutePath,
            {
              recursive: true,
              force: true,
            }
          );
        }
      } catch {
        // Ignore cleanup errors.
      }

      continue;
    }

    if (!expectedFiles.has(relativePath)) {
      console.log(
        `🗑 Removing stale host file: ${relativePath}`
      );

      await fs.rm(
        absolutePath,
        {
          force: true,
        }
      );
    }
  }
}

/* =========================================================
   SYNC WORKSPACE TO HOST
========================================================= */

async function syncWorkspace(
  workspace: string,
  files: ProjectFile[]
): Promise<void> {
  const flattened = flattenFiles(files);

  console.log("======================================");
  console.log(
    `📂 Syncing ${flattened.length} files to host`
  );
  console.log(`📁 Workspace: ${workspace}`);

  const expectedFiles = new Set<string>();

  for (const file of flattened) {
    const filePath =
      getSafeWorkspacePath(
        workspace,
        file.name
      );

    if (!filePath) {
      throw new Error(
        `Unsafe file path: ${file.name}`
      );
    }

    const relativePath =
      path.relative(
        workspace,
        filePath
      );

    expectedFiles.add(
      relativePath
    );

    await fs.mkdir(
      path.dirname(filePath),
      {
        recursive: true,
      }
    );

    await fs.writeFile(
      filePath,
      file.content ?? "",
      "utf8"
    );

    console.log(
      `✅ Host sync: ${file.name}`
    );
  }

  await removeStaleFiles(
    workspace,
    workspace,
    expectedFiles
  );

  console.log(
    "✅ Host workspace synchronized"
  );
}

/* =========================================================
   BUILD IMAGE
========================================================= */

async function buildProjectImage(
  imageTag: string,
  projectDir: string
): Promise<void> {
  console.log(
    `🐳 Building Docker image '${imageTag}'...`
  );

  const tarStream = tar.pack(
    projectDir
  );

  const stream =
    await docker.buildImage(
      tarStream,
      {
        t: imageTag,
        dockerfile: "Dockerfile",
      }
    );

  await new Promise<void>(
    (resolve, reject) => {
      docker.modem.followProgress(
        stream,

        (err, res) => {
          if (err) {
            reject(err);
            return;
          }

          const buildError =
            res?.find(
              (step: any) =>
                step.error
            );

          if (buildError) {
            reject(
              new Error(
                `Docker Build Failed: ${buildError.error}`
              )
            );

            return;
          }

          resolve();
        },

        (event) => {
          if (event.stream) {
            console.log(
              `[Docker Build] ${event.stream.trim()}`
            );
          }

          if (event.error) {
            console.error(
              `[Docker Build Error] ${event.error}`
            );
          }
        }
      );
    }
  );

  console.log(
    `✅ Successfully built image '${imageTag}'`
  );
}

/* =========================================================
   GET EXISTING CONTAINER
========================================================= */

async function getExistingContainer(
  containerName: string
): Promise<{
  container: Docker.Container;
  info: Docker.ContainerInspectInfo;
} | null> {
  const container =
    docker.getContainer(
      containerName
    );

  try {
    const info =
      await container.inspect();

    return {
      container,
      info,
    };
  } catch {
    return null;
  }
}

/* =========================================================
   REMOVE CONTAINER
========================================================= */

async function removeContainer(
  containerName: string
): Promise<void> {
  const container =
    docker.getContainer(
      containerName
    );

  try {
    const info =
      await container.inspect();

    console.log(
      `🗑 Removing old container: ${containerName}`
    );

    if (info.State?.Running) {
      try {
        await container.stop({
          t: 3,
        });
      } catch (error) {
        console.warn(
          "Container stop failed:",
          error
        );
      }
    }

    await container.remove({
      force: true,
    });

    console.log(
      "✅ Old container removed"
    );
  } catch {
    // Container doesn't exist.
  }
}

/* =========================================================
   CONTAINER LOCKS
========================================================= */

const containerLocks =
  new Map<string, Promise<void>>();

async function withContainerLock<T>(
  projectId: string,
  callback: () => Promise<T>
): Promise<T> {
  const previous =
    containerLocks.get(
      projectId
    ) ?? Promise.resolve();

  let release!: () => void;

  const current =
    new Promise<void>(
      (resolve) => {
        release = resolve;
      }
    );

  const lockPromise =
    previous.then(
      () => current
    );

  containerLocks.set(
    projectId,
    lockPromise
  );

  try {
    await previous;

    return await callback();
  } finally {
    release();

    if (
      containerLocks.get(
        projectId
      ) === lockPromise
    ) {
      containerLocks.delete(
        projectId
      );
    }
  }
}

/* =========================================================
   GET CONTAINER HOST PORT
========================================================= */

function getContainerHostPort(
  info: Docker.ContainerInspectInfo
): string | null {
  const bindings =
    info.NetworkSettings?.Ports?.[
      "3000/tcp"
    ];

  if (
    !bindings ||
    bindings.length === 0
  ) {
    return null;
  }

  return (
    bindings[0]?.HostPort ??
    null
  );
}

/* =========================================================
   DEMUX EXEC OUTPUT
========================================================= */

async function runExecCollectOutput(
  container: Docker.Container,
  command: string[],
  options: {
    detached?: boolean;
  } = {}
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
}> {
  const exec =
    await container.exec({
      Cmd: command,
      AttachStdout:
        !options.detached,
      AttachStderr:
        !options.detached,
    });

  const rawStream =
    await exec.start({
      hijack: !options.detached,
      stdin: false,
      Detach:
        options.detached,
    } as any);

  if (options.detached) {
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      output: "",
    };
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  const stdoutStream =
    new PassThrough();

  const stderrStream =
    new PassThrough();

  stdoutStream.on(
    "data",
    (chunk: Buffer) => {
      stdoutChunks.push(
        Buffer.from(chunk)
      );
    }
  );

  stderrStream.on(
    "data",
    (chunk: Buffer) => {
      stderrChunks.push(
        Buffer.from(chunk)
      );
    }
  );

  docker.modem.demuxStream(
    rawStream,
    stdoutStream,
    stderrStream
  );

  await new Promise<void>(
    (resolve, reject) => {
      rawStream.on(
        "end",
        () => resolve()
      );

      rawStream.on(
        "close",
        () => resolve()
      );

      rawStream.on(
        "error",
        reject
      );
    }
  );

  const inspect =
    await exec.inspect();

  const stdout =
    Buffer.concat(
      stdoutChunks
    ).toString("utf8");

  const stderr =
    Buffer.concat(
      stderrChunks
    ).toString("utf8");

  return {
    exitCode:
      inspect.ExitCode ?? 1,
    stdout,
    stderr,
    output:
      stdout + stderr,
  };
}

/* =========================================================
   EXEC INSIDE RUNNING CONTAINER
========================================================= */

async function execInContainer(
  container: Docker.Container,
  command: string[]
): Promise<{
  exitCode: number;
  output: string;
}> {
  const info =
    await container.inspect();

  if (!info.State?.Running) {
    throw new Error(
      `Cannot exec in stopped container ${container.id}`
    );
  }

  console.log(
    `🐳 EXEC: ${command.join(" ")}`
  );

  const result =
    await runExecCollectOutput(
      container,
      command
    );

  if (result.output.trim()) {
    console.log(
      `[Container] ${result.output.trim()}`
    );
  }

  return {
    exitCode:
      result.exitCode,
    output:
      result.output,
  };
}

/* =========================================================
   GET CONTAINER FILE
========================================================= */

async function getContainerFile(
  container: Docker.Container,
  filePath: string
): Promise<string | null> {
  try {
    const result =
      await execInContainer(
        container,
        [
          "cat",
          filePath,
        ]
      );

    if (result.exitCode !== 0) {
      return null;
    }

    return result.output;
  } catch {
    return null;
  }
}

/* =========================================================
   CHECK NODE MODULES
========================================================= */

async function hasNodeModules(
  container: Docker.Container
): Promise<boolean> {
  try {
    const result =
      await execInContainer(
        container,
        [
          "sh",
          "-c",
          `
            test -f /app/node_modules/.bin/next ||
            test -f /app/node_modules/next/package.json
          `,
        ]
      );

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/* =========================================================
   PACKAGE MANAGER
========================================================= */

function getPackageManager(
  files: ProjectFile[]
): "npm" | "yarn" | "pnpm" {
  const flattened =
    flattenFiles(files);

  const names =
    new Set(
      flattened.map(
        (file) =>
          normalizeProjectPath(
            file.name
          )
      )
    );

  if (
    names.has(
      "pnpm-lock.yaml"
    )
  ) {
    return "pnpm";
  }

  if (
    names.has("yarn.lock")
  ) {
    return "yarn";
  }

  return "npm";
}

/* =========================================================
   INSTALL DEPENDENCIES
========================================================= */

async function installDependencies(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<void> {
  const packageManager =
    getPackageManager(files);

  console.log(
    `📦 Package manager: ${packageManager}`
  );

  let command: string[];

  if (
    packageManager ===
    "pnpm"
  ) {
    command = [
      "sh",
      "-c",
      "corepack enable && pnpm install",
    ];
  } else if (
    packageManager ===
    "yarn"
  ) {
    command = [
      "sh",
      "-c",
      "corepack enable && yarn install",
    ];
  } else {
    command = [
      "npm",
      "install",
    ];
  }

  console.log(
    "📦 Installing dependencies INSIDE container..."
  );

  const result =
    await execInContainer(
      container,
      command
    );

  if (
    result.exitCode !== 0
  ) {
    throw new Error(
      `Dependency installation failed:\n${result.output}`
    );
  }

  console.log(
    "✅ Dependencies installed"
  );
}

/* =========================================================
   FIND CHANGED SPECIAL FILES
========================================================= */

async function findChangedSpecialFiles(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<{
  filesToCopy: ProjectFile[];
  configChanged: boolean;
  dependenciesChanged: boolean;
}> {
  const flattened =
    flattenFiles(files);

  const filesToCopy: ProjectFile[] =
    [];

  let configChanged =
    false;

  let dependenciesChanged =
    false;

  for (const file of flattened) {
    const normalizedName =
      normalizeProjectPath(
        file.name
      );

    const isNextConfig =
      NEXT_CONFIG_FILES.has(
        normalizedName
      );

    const isPackageFile =
      PACKAGE_FILES.has(
        normalizedName
      );

    /*
     * Normal source files are
     * always copied.
     */
    if (
      !isNextConfig &&
      !isPackageFile
    ) {
      filesToCopy.push(
        file
      );

      continue;
    }

    const containerPath =
      `${CONTAINER_APP_DIR}/${normalizedName}`;

    const existing =
      await getContainerFile(
        container,
        containerPath
      );

    const incoming =
      file.content ?? "";

    if (
      existing === incoming
    ) {
      console.log(
        `⏭️ Unchanged: ${normalizedName}`
      );

      continue;
    }

    console.log(
      `🔄 Changed: ${normalizedName}`
    );

    filesToCopy.push(
      file
    );

    if (isNextConfig) {
      configChanged =
        true;
    }

    if (isPackageFile) {
      dependenciesChanged =
        true;
    }
  }

  return {
    filesToCopy,
    configChanged,
    dependenciesChanged,
  };
}

/* =========================================================
   COPY FILES INTO CONTAINER
========================================================= */

async function copyFilesToContainer(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<void> {
  const flattened =
    flattenFiles(files);

  if (
    flattened.length === 0
  ) {
    console.log(
      "⏭️ No files need to be copied."
    );

    return;
  }

  const tempDir =
    path.join(
      process.cwd(),
      "WORKSPACE",
      ".docker-sync",
      crypto.randomUUID()
    );

  await fs.mkdir(
    tempDir,
    {
      recursive: true,
    }
  );

  try {
    console.log(
      "======================================"
    );

    console.log(
      "🐳 COPYING FILES INTO CONTAINER"
    );

    console.log(
      `📦 Container: ${container.id}`
    );

    console.log(
      `📄 Files: ${flattened.length}`
    );

    console.log(
      "======================================"
    );

    for (const file of flattened) {
      const safePath =
        getSafeWorkspacePath(
          tempDir,
          file.name
        );

      if (!safePath) {
        throw new Error(
          `Unsafe file path: ${file.name}`
        );
      }

      await fs.mkdir(
        path.dirname(
          safePath
        ),
        {
          recursive: true,
        }
      );

      await fs.writeFile(
        safePath,
        file.content ?? "",
        "utf8"
      );
    }

    const archive =
      tar.pack(tempDir);

    await container.putArchive(
      archive,
      {
        path:
          CONTAINER_APP_DIR,
      }
    );

    console.log(
      "✅ Files copied directly into /app"
    );
  } finally {
    await fs.rm(
      tempDir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/* =========================================================
   SYNC FILES TO CONTAINER
========================================================= */

async function syncFilesToContainer(
  container: Docker.Container,
  files: ProjectFile[],
  options: SyncOptions = {}
): Promise<SyncResult> {
  const containerInfo =
    await container.inspect();

  if (!containerInfo.State?.Running) {
    throw new Error(
      `Container ${container.id} must be running before syncing files.`
    );
  }

  let filesToCopy =
    flattenFiles(files);

  let configChanged =
    false;

  let dependenciesChanged =
    false;

  if (
    options.existingContainer
  ) {
    const result =
      await findChangedSpecialFiles(
        container,
        files
      );

    filesToCopy =
      result.filesToCopy;

    configChanged =
      result.configChanged;

    dependenciesChanged =
      result.dependenciesChanged;
  } else {
    configChanged =
      filesToCopy.some(
        (file) =>
          NEXT_CONFIG_FILES.has(
            normalizeProjectPath(
              file.name
            )
          )
      );

    dependenciesChanged =
      filesToCopy.some(
        (file) =>
          PACKAGE_FILES.has(
            normalizeProjectPath(
              file.name
            )
          )
      );
  }

  await copyFilesToContainer(
    container,
    filesToCopy
  );

  const nodeModulesExists =
    await hasNodeModules(
      container
    );

  if (
    !nodeModulesExists
  ) {
    console.log(
      "⚠️ node_modules is empty."
    );

    await installDependencies(
      container,
      files
    );
  } else if (
    dependenciesChanged
  ) {
    console.log(
      "📦 Package files changed."
    );

    await installDependencies(
      container,
      files
    );
  } else {
    console.log(
      "✅ Existing node_modules is valid."
    );
  }

  return {
    configChanged,
    dependenciesChanged,
  };
}

/* =========================================================
   CREATE CONTAINER
========================================================= */

async function createPreviewContainer(
  imageTag: string,
  containerName: string,
  projectId: string
): Promise<{
  container: Docker.Container;
  hostPort: string;
}> {
  const hostPort =
    String(
      await getPort()
    );

  const nodeModulesVol =
    `preview-nodemodules-${projectId}`;

  const nextCacheVol =
    `preview-nextcache-${projectId}`;

  console.log(
    `🚀 Creating container '${containerName}'`
  );

  console.log(
    `🌐 Host port: ${hostPort}`
  );

  console.log(
    `📦 node_modules volume: ${nodeModulesVol}`
  );

  console.log(
    `📦 .next volume: ${nextCacheVol}`
  );

  const container =
    await docker.createContainer({
      Image: imageTag,

      name: containerName,

      WorkingDir:
        CONTAINER_APP_DIR,

      /*
       * IMPORTANT:
       *
       * Do NOT rely on the Dockerfile CMD.
       *
       * We keep the container alive,
       * then explicitly launch Next.js
       * after files/dependencies exist.
       */
      Cmd:
        CONTAINER_KEEPALIVE_COMMAND,

      Env: [
        "HOST=0.0.0.0",
        `PORT=${NEXT_PORT}`,

        "WATCHPACK_POLLING=true",
        "CHOKIDAR_USEPOLLING=true",
        "WATCHPACK_POLLING_INTERVAL=1000",

        "NEXT_TELEMETRY_DISABLED=1",
      ],

      Volumes: {
        "/app/node_modules": {},
        "/app/.next": {},
      },

      HostConfig: {
        Binds: [
          `${nodeModulesVol}:/app/node_modules`,
          `${nextCacheVol}:/app/.next`,
        ],

        PortBindings: {
          "3000/tcp": [
            {
              HostPort:
                hostPort,
            },
          ],
        },

        RestartPolicy: {
          Name: "no",
        },
      },
    });

  console.log(
    `✅ Container created: ${container.id}`
  );

  return {
    container,
    hostPort,
  };
}

/* =========================================================
   START CONTAINER
========================================================= */

async function ensureContainerRunning(
  container: Docker.Container
): Promise<void> {
  const info =
    await container.inspect();

  if (info.State?.Running) {
    return;
  }

  console.log(
    `▶️ Starting container ${container.id}...`
  );

  await container.start();

  await sleep(500);

  const refreshed =
    await container.inspect();

  if (
    !refreshed.State?.Running
  ) {
    throw new Error(
      `Container ${container.id} failed to stay running.`
    );
  }

  console.log(
    "✅ Container is running"
  );
}

/* =========================================================
   CHECK NEXT PROCESS
========================================================= */

async function isNextRunning(
  container: Docker.Container
): Promise<boolean> {
  try {
    const result =
      await execInContainer(
        container,
        [
          "sh",
          "-c",
          `
            ps aux 2>/dev/null |
            grep -E "[n]ext|[n]ode.*next" |
            grep -v grep
          `,
        ]
      );

    return (
      result.exitCode === 0 &&
      result.output.trim().length > 0
    );
  } catch {
    return false;
  }
}

/* =========================================================
   START NEXT.JS
========================================================= */

async function startNextServer(
  container: Docker.Container
): Promise<void> {
  const alreadyRunning =
    await isNextRunning(
      container
    );

  if (alreadyRunning) {
    console.log(
      "✅ Next.js is already running"
    );

    return;
  }

  console.log(
    "🚀 Starting Next.js inside container..."
  );

  const command = [
    "sh",
    "-c",
    `
      cd /app &&
      npm run dev -- -H 0.0.0.0 -p ${NEXT_PORT}
    `,
  ];

  await runExecCollectOutput(
    container,
    command,
    {
      detached: true,
    }
  );

  console.log(
    "✅ Next.js process started"
  );
}

/* =========================================================
   STOP NEXT.JS
========================================================= */

async function stopNextServer(
  container: Docker.Container
): Promise<void> {
  try {
    console.log(
      "🛑 Stopping Next.js..."
    );

    await execInContainer(
      container,
      [
        "sh",
        "-c",
        `
          pkill -f "next dev" 2>/dev/null || true
          pkill -f "node.*next" 2>/dev/null || true
        `,
      ]
    );
  } catch (error) {
    console.warn(
      "Could not stop Next.js:",
      error
    );
  }

  await sleep(500);
}

/* =========================================================
   RESTART NEXT.JS
========================================================= */

async function restartNextServer(
  container: Docker.Container
): Promise<void> {
  await stopNextServer(
    container
  );

  await startNextServer(
    container
  );
}

/* =========================================================
   WAIT FOR NEXT.JS
========================================================= */

async function waitForServer(
  hostPort: string,
  maxRetries = 60
): Promise<boolean> {
  console.log(
    `⏳ Waiting for http://127.0.0.1:${hostPort}...`
  );

  for (
    let i = 0;
    i < maxRetries;
    i++
  ) {
    const ready =
      await new Promise<boolean>(
        (resolve) => {
          const req =
            http.get(
              `http://127.0.0.1:${hostPort}`,
              (res) => {
                const statusCode =
                  res.statusCode ?? 0;

                res.resume();

                /*
                 * Any HTTP response means
                 * the server is alive.
                 *
                 * This includes 404/500.
                 */
                resolve(
                  statusCode >= 200 &&
                  statusCode < 600
                );
              }
            );

          req.on(
            "error",
            () => {
              resolve(false);
            }
          );

          req.setTimeout(
            1500,
            () => {
              req.destroy();
              resolve(false);
            }
          );
        }
      );

    if (ready) {
      console.log(
        `✅ Next.js responding on port ${hostPort}`
      );

      return true;
    }

    if (
      i % 5 === 0
    ) {
      console.log(
        `⏳ Still waiting... ${i + 1}/${maxRetries}`
      );
    }

    await sleep(500);
  }

  return false;
}

/* =========================================================
   DOCKER LOGS
========================================================= */

async function printContainerLogs(
  containerName: string
): Promise<void> {
  try {
    const container =
      docker.getContainer(
        containerName
      );

    const logs =
      await container.logs({
        stdout: true,
        stderr: true,
        tail: 200,
      });

    console.error(
      "========== DOCKER LOGS =========="
    );

    console.error(
      logs.toString()
    );

    console.error(
      "================================="
    );
  } catch (error) {
    console.error(
      "Could not read Docker logs:",
      error
    );
  }
}

/* =========================================================
   UPDATE EXISTING CONTAINER
========================================================= */

async function updateExistingContainer(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<SyncResult> {
  console.log(
    "======================================"
  );

  console.log(
    "♻️ UPDATING EXISTING CONTAINER"
  );

  console.log(
    `🐳 Container: ${container.id}`
  );

  console.log(
    "======================================"
  );

  await ensureContainerRunning(
    container
  );

  const result =
    await syncFilesToContainer(
      container,
      files,
      {
        existingContainer:
          true,
      }
    );

  if (
    result.configChanged
  ) {
    console.log(
      "⚙️ next.config changed."
    );
  }

  if (
    result.dependenciesChanged
  ) {
    console.log(
      "📦 Dependencies changed."
    );
  }

  console.log(
    "✅ Existing container updated"
  );

  return result;
}

/* =========================================================
   CREATE + START PREVIEW
========================================================= */

async function createAndStartPreviewContainer(
  imageTag: string,
  containerName: string,
  projectId: string,
  files: ProjectFile[]
): Promise<{
  container: Docker.Container;
  hostPort: string;
}> {
  const {
    container,
    hostPort,
  } =
    await createPreviewContainer(
      imageTag,
      containerName,
      projectId
    );

  try {
    /*
     * IMPORTANT:
     *
     * createContainer() gives us a STOPPED
     * container.
     *
     * Therefore START IT FIRST.
     */
    await ensureContainerRunning(
      container
    );

    /*
     * Now docker exec() is legal.
     */
    await syncFilesToContainer(
      container,
      files,
      {
        existingContainer:
          false,
      }
    );

    /*
     * Now dependencies and source
     * files are available.
     */
    await startNextServer(
      container
    );

    console.log(
      `⏳ Waiting for Next.js on port ${hostPort}...`
    );

    const serverReady =
      await waitForServer(
        hostPort
      );

    if (!serverReady) {
      await printContainerLogs(
        containerName
      );

      throw new Error(
        "Container is running, but Next.js did not become ready."
      );
    }

    console.log(
      "✅ New preview is ready"
    );

    return {
      container,
      hostPort,
    };
  } catch (error) {
    await printContainerLogs(
      containerName
    );

    await removeContainer(
      containerName
    );

    throw error;
  }
}

/* =========================================================
   RUNTIME INSPECTION
========================================================= */

async function inspectContainerRuntime(
  container: Docker.Container
): Promise<void> {
  console.log(
    "======================================"
  );

  console.log(
    "🔎 CONTAINER RUNTIME CHECK"
  );

  console.log(
    "======================================"
  );

  const result =
    await execInContainer(
      container,
      [
        "sh",
        "-c",
        `
          echo "=== PWD ==="
          pwd

          echo "=== FILES ==="
          ls -la /app

          echo "=== NODE ==="
          node -v

          echo "=== NPM ==="
          npm -v

          echo "=== NEXT ==="
          if [ -f /app/node_modules/.bin/next ]; then
            /app/node_modules/.bin/next --version
          else
            echo "NEXT NOT FOUND"
          fi

          echo "=== PROCESSES ==="
          ps aux || true

          echo "=== PORT 3000 ==="
          if command -v ss >/dev/null 2>&1; then
            ss -lntp || true
          elif command -v netstat >/dev/null 2>&1; then
            netstat -lntp || true
          else
            echo "ss/netstat not available"
          fi

          echo "=== LOCAL HTTP ==="
          if command -v wget >/dev/null 2>&1; then
            wget -S -O - --timeout=5 http://127.0.0.1:3000/ || true
          elif command -v curl >/dev/null 2>&1; then
            curl -I --max-time 5 http://127.0.0.1:3000/ || true
          else
            echo "wget/curl not available"
          fi
        `,
      ]
    );

  console.log(
    result.output
  );

  console.log(
    `🔎 Runtime check exit code: ${result.exitCode}`
  );

  console.log(
    "======================================"
  );
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  req: NextRequest
) {
  try {
    /* =====================================================
       1. READ REQUEST
    ===================================================== */

    const body =
      await req.json();

    const {
      ownerId,
      id: projectId,
      files,
    } = body;

    if (
      !ownerId ||
      !projectId ||
      !Array.isArray(files)
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid payload parameters",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       2. VERIFY PROJECT
    ===================================================== */

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
        },
      });

    if (!project) {
      return NextResponse.json(
        {
          message:
            "Project not found",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       3. WORKSPACE
    ===================================================== */

    const userWorkDir =
      path.resolve(
        process.cwd(),
        "WORKSPACE",
        ownerId,
        projectId
      );

    await fs.mkdir(
      userWorkDir,
      {
        recursive: true,
      }
    );

    console.log(
      "======================================"
    );

    console.log(
      "📦 PROJECT:",
      projectId
    );

    console.log(
      "📁 WORKSPACE:",
      userWorkDir
    );

    console.log(
      "📄 ROOT FILE COUNT:",
      files.length
    );

    /* =====================================================
       4. SYNC TO HOST
    ===================================================== */

    await syncWorkspace(
      userWorkDir,
      files as ProjectFile[]
    );

    /* =====================================================
       5. IMAGE
    ===================================================== */

    const fullImageTag =
      `preview-image-${projectId}:latest`;

    const images =
      await docker.listImages();

    const imageExists =
      images.some(
        (image) =>
          image.RepoTags?.includes(
            fullImageTag
          )
      );

    if (!imageExists) {
      console.log(
        "🐳 Docker image does not exist. Building..."
      );

      await buildProjectImage(
        fullImageTag,
        userWorkDir
      );
    } else {
      console.log(
        "♻️ Docker runtime image already exists."
      );
    }

    /* =====================================================
       6. CONTAINER
    ===================================================== */

    const containerName =
      `preview-container-${projectId}`;

    const result =
      await withContainerLock(
        projectId,
        async () => {
          console.log(
            "======================================"
          );

          console.log(
            "🐳 CHECKING PREVIEW CONTAINER"
          );

          console.log(
            `📦 Project: ${projectId}`
          );

          console.log(
            `🐳 Container: ${containerName}`
          );

          console.log(
            "======================================"
          );

          const existing =
            await getExistingContainer(
              containerName
            );

          /* =================================================
             NO EXISTING CONTAINER
          ================================================= */

          if (!existing) {
            console.log(
              "🆕 No existing container found."
            );

            const {
              container,
              hostPort,
            } =
              await createAndStartPreviewContainer(
                fullImageTag,
                containerName,
                projectId,
                files as ProjectFile[]
              );

            await inspectContainerRuntime(
              container
            );

            return {
              container,
              hostPort,
              reused: false,
            };
          }

          /* =================================================
             EXISTING CONTAINER
          ================================================= */

          const {
            container,
            info,
          } = existing;

          console.log(
            "♻️ Existing container found"
          );

          console.log(
            `🐳 Container ID: ${container.id}`
          );

          console.log(
            `▶️ Running: ${info.State?.Running}`
          );

          let hostPort =
            getContainerHostPort(
              info
            );

          if (!hostPort) {
            throw new Error(
              "Existing container has no host port mapping."
            );
          }

          /* =================================================
             STOPPED CONTAINER
          ================================================= */

          if (!info.State?.Running) {
            console.log(
              "⚠️ Container exists but is stopped."
            );

            /*
             * Start BEFORE any docker exec().
             */
            await ensureContainerRunning(
              container
            );

            /*
             * Sync after container is running.
             */
            const updateResult =
              await syncFilesToContainer(
                container,
                files as ProjectFile[],
                {
                  existingContainer:
                    true,
                }
              );

            /*
             * The old container may have
             * no Next process at all.
             */
            if (
              updateResult.dependenciesChanged
            ) {
              console.log(
                "📦 Dependencies changed."
              );
            }

            await startNextServer(
              container
            );

            const serverReady =
              await waitForServer(
                hostPort
              );

            if (!serverReady) {
              await printContainerLogs(
                containerName
              );

              throw new Error(
                "Existing container started, but Next.js did not become ready."
              );
            }

            return {
              container,
              hostPort,
              reused: true,
            };
          }

          /* =================================================
             RUNNING CONTAINER
          ================================================= */

          console.log(
            "✅ Container already running"
          );

          const updateResult =
            await updateExistingContainer(
              container,
              files as ProjectFile[]
            );

          /*
           * If package dependencies changed,
           * restart Next.js so it reloads the
           * dependency graph.
           */
          if (
            updateResult.dependenciesChanged
          ) {
            console.log(
              "📦 Dependencies changed. Restarting Next.js..."
            );

            await restartNextServer(
              container
            );
          } else if (
            !(
              await isNextRunning(
                container
              )
            )
          ) {
            /*
             * This fixes the exact state you
             * currently have:
             *
             * container = running
             * PID 1 = sleep infinity
             * Next.js = NOT running
             */
            console.log(
              "⚠️ Container is running but Next.js is not running."
            );

            await startNextServer(
              container
            );
          }

          const serverReady =
            await waitForServer(
              hostPort
            );

          if (!serverReady) {
            await printContainerLogs(
              containerName
            );

            throw new Error(
              "Container is running, but Next.js did not become ready."
            );
          }

          console.log(
            `🌐 Reusing port: ${hostPort}`
          );

          return {
            container,
            hostPort,
            reused: true,
          };
        }
      );

    /* =====================================================
       7. PREVIEW URL
    ===================================================== */

    const {
      container,
      hostPort,
      reused,
    } = result;

    const previewUrl =
      `http://localhost:${hostPort}`;

    console.log(
      "======================================"
    );

    console.log(
      reused
        ? "♻️ EXISTING PREVIEW REUSED"
        : "🆕 NEW PREVIEW CREATED"
    );

    console.log(
      `🌐 ${previewUrl}`
    );

    console.log(
      `🐳 Container: ${containerName}`
    );

    console.log(
      `🐳 Container ID: ${container.id}`
    );

    console.log(
      "======================================"
    );

    return NextResponse.json({
      previewUrl,
      hotReload: true,
      reused,
    });
  } catch (error: any) {
    console.error(
      "======================================"
    );

    console.error(
      "❌ Docker Run API Error"
    );

    console.error(
      error
    );

    console.error(
      "======================================"
    );

    return NextResponse.json(
      {
        message:
          error?.message ||
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}