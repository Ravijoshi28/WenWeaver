export const runtime = "nodejs";

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
import { supabaseAdmin } from "@/lib/supabase";

// =========================================================
// TYPES
// =========================================================

type ProjectFile = {
  name: string;
  type: "file" | "folder";
  content?: string;
  children?: ProjectFile[];
};

type SyncResult = {
  configChanged: boolean;
  dependenciesChanged: boolean;
};

// =========================================================
// SUPABASE
// =========================================================

const SUPABASE_BUCKET =
  process.env.SUPABASE_BUCKET ?? "project-files";

if (!supabaseAdmin) {
  console.warn(
    "⚠️ Supabase admin client is not configured"
  );
}

// =========================================================
// DOCKER
// =========================================================

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

// =========================================================
// CONSTANTS
// =========================================================

const CONTAINER_APP_DIR = "/app";
const NEXT_PORT = 3000;

const KEEP_ALIVE_COMMAND = [
  "sh",
  "-c",
  "while true; do sleep 3600; done",
];

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

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
]);

// =========================================================
// LOCKS
//
// IMPORTANT:
//
// The old code only locked Docker operations.
//
// Supabase sync happened BEFORE that lock.
//
// That allowed two requests for the same project
// to upload files simultaneously.
//
// We now lock the WHOLE project operation.
// =========================================================

const projectLocks =
  new Map<string, Promise<void>>();

// =========================================================
// SLEEP
// =========================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// =========================================================
// PROJECT LOCK
// =========================================================

async function withProjectLock<T>(
  projectId: string,
  callback: () => Promise<T>
): Promise<T> {
  const previous =
    projectLocks.get(projectId) ??
    Promise.resolve();

  let release!: () => void;

  const current =
    new Promise<void>((resolve) => {
      release = resolve;
    });

  const lock =
    previous.then(() => current);

  projectLocks.set(projectId, lock);

  try {
    await previous;

    return await callback();
  } finally {
    release();

    if (
      projectLocks.get(projectId) === lock
    ) {
      projectLocks.delete(projectId);
    }
  }
}

// =========================================================
// NORMALIZE PATH
// =========================================================

function normalizeProjectPath(
  relativePath: string
): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\.\/)+/, "");
}

// =========================================================
// SAFE PATH
// =========================================================

function getSafeWorkspacePath(
  workspace: string,
  relativePath: string
): string | null {
  const normalized =
    normalizeProjectPath(relativePath);

  const workspaceResolved =
    path.resolve(workspace);

  const resolved =
    path.resolve(
      workspaceResolved,
      normalized
    );

  const relative =
    path.relative(
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

// =========================================================
// FLATTEN FILE TREE
// =========================================================

function flattenFiles(
  files: ProjectFile[],
  parentPath = ""
): ProjectFile[] {
  const result: ProjectFile[] = [];

  for (const file of files) {
    const currentPath = parentPath
      ? path.posix.join(
          parentPath,
          file.name
        )
      : file.name;

    if (file.type === "folder") {
      if (
        Array.isArray(file.children)
      ) {
        result.push(
          ...flattenFiles(
            file.children,
            currentPath
          )
        );
      }

      continue;
    }

    const normalizedPath =
      normalizeProjectPath(
        currentPath
      );

    if (!normalizedPath) {
      continue;
    }

    result.push({
      ...file,
      name: normalizedPath,
    });
  }

  return result;
}

// =========================================================
// SUPABASE PATH
// =========================================================

function getSupabaseFilePath(
  ownerId: string,
  projectId: string,
  filePath: string
): string {
  const normalized =
    normalizeProjectPath(filePath);

  return [
    ownerId,
    projectId,
    normalized,
  ]
    .filter(Boolean)
    .join("/");
}

// =========================================================
// ENSURE BUCKET
// =========================================================

async function ensureSupabaseBucket(): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured"
    );
  }

  const {
    data: buckets,
    error: listError,
  } =
    await supabaseAdmin.storage.listBuckets();

  if (listError) {
    throw new Error(
      `Unable to access Supabase Storage: ${listError.message}`
    );
  }

  const exists =
    buckets?.some(
      (bucket) =>
        bucket.name === SUPABASE_BUCKET
    );

  if (exists) {
    return;
  }

  console.log(
    `☁️ Creating Supabase bucket "${SUPABASE_BUCKET}"`
  );

  const {
    error,
  } =
    await supabaseAdmin.storage.createBucket(
      SUPABASE_BUCKET,
      {
        public: false,
      }
    );

  if (error) {
    if (
      error.message
        .toLowerCase()
        .includes("already exists")
    ) {
      return;
    }

    throw new Error(
      `Failed to create Supabase bucket "${SUPABASE_BUCKET}": ${error.message}`
    );
  }

  console.log(
    `✅ Created Supabase bucket "${SUPABASE_BUCKET}"`
  );
}

// =========================================================
// LIST SUPABASE FILES
// =========================================================

async function listSupabaseFiles(
  folder: string
): Promise<string[]> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured"
    );
  }

  const result: string[] = [];

  async function walk(
    currentFolder: string
  ): Promise<void> {
    const {
      data,
      error,
    } =
      await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .list(
          currentFolder,
          {
            limit: 1000,
            offset: 0,
            sortBy: {
              column: "name",
              order: "asc",
            },
          }
        );

    if (error) {
      throw error;
    }

    for (const item of data ?? []) {
      const itemPath =
        currentFolder
          ? `${currentFolder}/${item.name}`
          : item.name;

      const isFile =
        item.metadata !== null &&
        item.metadata !== undefined;

      if (isFile) {
        result.push(itemPath);
      } else {
        await walk(itemPath);
      }
    }
  }

  await walk(folder);

  return result;
}

// =========================================================
// VERIFY SUPABASE FILE
//
// IMPORTANT FIX:
//
// Do NOT use:
//
// storage.download(path)
//
// immediately after upsert for verification.
//
// Supabase Storage/CDN may temporarily return
// an older representation.
//
// Instead:
// 1. Create a fresh signed URL.
// 2. Add cache-busting query parameter.
// 3. Fetch with no-store.
// 4. Retry with exponential backoff.
// =========================================================

async function verifySupabaseFile(
  storagePath: string,
  expectedContent: string,
  attempts = 8
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured"
    );
  }

  const expectedBuffer =
    Buffer.from(
      expectedContent,
      "utf8"
    );

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    console.log(
      `🔍 VERIFYING ${storagePath} (${attempt}/${attempts})`
    );

    try {
      // -----------------------------------------
      // CREATE A FRESH SIGNED URL
      // -----------------------------------------

      const {
        data: signedData,
        error: signedError,
      } =
        await supabaseAdmin.storage
          .from(SUPABASE_BUCKET)
          .createSignedUrl(
            storagePath,
            60
          );

      if (signedError) {
        console.warn(
          `⚠️ Could not create signed URL (${attempt}/${attempts}):`,
          signedError.message
        );
      } else if (
        signedData?.signedUrl
      ) {
        // -----------------------------------------
        // CACHE BUSTER
        // -----------------------------------------

        const cacheBuster =
          `verify=${Date.now()}-${crypto.randomUUID()}`;

        const separator =
          signedData.signedUrl.includes("?")
            ? "&"
            : "?";

        const freshUrl =
          `${signedData.signedUrl}${separator}${cacheBuster}`;

        // -----------------------------------------
        // FRESH HTTP REQUEST
        // -----------------------------------------

        const response =
          await fetch(
            freshUrl,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                "Cache-Control":
                  "no-cache, no-store, max-age=0",
                Pragma: "no-cache",
              },
            }
          );

        if (!response.ok) {
          console.warn(
            `⚠️ Verification HTTP ${response.status} (${attempt}/${attempts})`
          );
        } else {
          const actualBuffer =
            Buffer.from(
              await response.arrayBuffer()
            );

          if (
            actualBuffer.equals(
              expectedBuffer
            )
          ) {
            console.log(
              `✅ VERIFIED: ${storagePath}`
            );

            return;
          }

          console.warn(
            `⚠️ Content mismatch (${attempt}/${attempts})`,
            {
              expectedLength:
                expectedBuffer.length,
              actualLength:
                actualBuffer.length,
            }
          );
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ Verification error (${attempt}/${attempts}):`,
        error instanceof Error
          ? error.message
          : error
      );
    }

    // -----------------------------------------
    // EXPONENTIAL BACKOFF
    //
    // 500
    // 1000
    // 2000
    // 3000
    // ...
    // -----------------------------------------

    if (attempt < attempts) {
      const delay =
        Math.min(
          500 * 2 ** (attempt - 1),
          4000
        );

      console.log(
        `⏳ Waiting ${delay}ms before verification retry...`
      );

      await sleep(delay);
    }
  }

  throw new Error(
    `Supabase verification failed after ${attempts} attempts: ${storagePath}`
  );
}

// =========================================================
// SYNC FILES TO SUPABASE
// =========================================================

async function syncFilesToSupabase(
  ownerId: string,
  projectId: string,
  files: ProjectFile[]
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase is not configured"
    );
  }

  await ensureSupabaseBucket();

  const flattened =
    flattenFiles(files);

  console.log(
    "======================================"
  );
  console.log(
    "☁️ SUPABASE SYNC"
  );
  console.log(
    `Owner: ${ownerId}`
  );
  console.log(
    `Project: ${projectId}`
  );
  console.log(
    `Files received: ${flattened.length}`
  );
  console.log(
    "======================================"
  );

  const expectedPaths =
    new Set<string>();

  // -----------------------------------------
  // UPLOAD EVERY FILE
  // -----------------------------------------

  for (const file of flattened) {
    const filePath =
      normalizeProjectPath(
        file.name
      );

    if (!filePath) {
      continue;
    }

    const storagePath =
      getSupabaseFilePath(
        ownerId,
        projectId,
        filePath
      );

    expectedPaths.add(
      storagePath
    );

    const content =
      file.content ?? "";

    const buffer =
      Buffer.from(
        content,
        "utf8"
      );

    console.log("");
    console.log(
      "☁️ SYNCING:"
    );
    console.log(
      "Storage path:",
      storagePath
    );
    console.log(
      "Content length:",
      buffer.length
    );

    // -----------------------------------------
    // UPLOAD
    // -----------------------------------------

    const {
      error: uploadError,
    } =
      await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .upload(
          storagePath,
          buffer,
          {
            contentType:
              getContentType(
                filePath
              ),

            upsert: true,

            // Do not let the CDN cache this object.
            cacheControl: "0",

            // Explicitly indicate binary-safe upload.
            duplex: "half",
          } as any
        );

    if (uploadError) {
      throw new Error(
        `Failed to upload ${storagePath}: ${uploadError.message}`
      );
    }

    console.log(
      `✅ Supabase object uploaded: ${storagePath}`
    );

    // -----------------------------------------
    // VERIFY
    // -----------------------------------------

    await verifySupabaseFile(
      storagePath,
      content
    );
  }

  // -----------------------------------------
  // FIND EXISTING FILES
  // -----------------------------------------

  const projectFolder =
    `${ownerId}/${projectId}`;

  let existingPaths: string[] = [];

  try {
    existingPaths =
      await listSupabaseFiles(
        projectFolder
      );
  } catch (error) {
    console.error(
      "⚠️ Could not list existing Supabase files:",
      error
    );
  }

  // -----------------------------------------
  // DELETE STALE FILES
  // -----------------------------------------

  const stalePaths =
    existingPaths.filter(
      (storagePath) =>
        !expectedPaths.has(
          storagePath
        )
    );

  if (
    stalePaths.length > 0
  ) {
    console.log(
      `🗑 Removing ${stalePaths.length} stale Supabase files`
    );

    const {
      error: removeError,
    } =
      await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .remove(
          stalePaths
        );

    if (removeError) {
      throw new Error(
        `Failed to remove stale Supabase files: ${removeError.message}`
      );
    }

    for (
      const stale of stalePaths
    ) {
      console.log(
        `🗑 Removed stale Supabase file: ${stale}`
      );
    }
  }

  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    "✅ SUPABASE SYNC COMPLETE"
  );
  console.log(
    "======================================"
  );
}

// =========================================================
// CONTENT TYPE
// =========================================================

function getContentType(
  filePath: string
): string {
  const extension =
    path
      .extname(filePath)
      .toLowerCase();

  switch (extension) {
    case ".js":
    case ".jsx":
      return "text/javascript";

    case ".ts":
    case ".tsx":
      return "text/typescript";

    case ".json":
      return "application/json";

    case ".css":
      return "text/css";

    case ".scss":
    case ".sass":
      return "text/css";

    case ".html":
    case ".htm":
      return "text/html";

    case ".svg":
      return "image/svg+xml";

    case ".png":
      return "image/png";

    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".gif":
      return "image/gif";

    case ".webp":
      return "image/webp";

    case ".ico":
      return "image/x-icon";

    case ".avif":
      return "image/avif";

    case ".md":
      return "text/markdown";

    case ".txt":
      return "text/plain";

    case ".xml":
      return "application/xml";

    case ".csv":
      return "text/csv";

    case ".yaml":
    case ".yml":
      return "application/yaml";

    case ".env":
      return "text/plain";

    default:
      return "application/octet-stream";
  }
}

// =========================================================
// REMOVE STALE HOST FILES
// =========================================================

async function removeStaleFiles(
  directory: string,
  workspace: string,
  expectedFiles: Set<string>
): Promise<void> {
  let entries;

  try {
    entries =
      await fs.readdir(
        directory,
        {
          withFileTypes: true,
        }
      );
  } catch {
    return;
  }

  for (
    const entry of entries
  ) {
    const absolutePath =
      path.join(
        directory,
        entry.name
      );

    const relativePath =
      path.relative(
        workspace,
        absolutePath
      );

    const normalized =
      relativePath.replace(
        /\\/g,
        "/"
      );

    const firstSegment =
      normalized.split("/")[0];

    if (
      IGNORED_DIRECTORIES.has(
        firstSegment
      ) ||
      normalized.startsWith(
        "node_modules/"
      ) ||
      normalized.startsWith(
        ".next/"
      )
    ) {
      continue;
    }

    if (
      entry.isDirectory()
    ) {
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

        if (
          remaining.length === 0
        ) {
          await fs.rm(
            absolutePath,
            {
              recursive: true,
              force: true,
            }
          );
        }
      } catch {}

      continue;
    }

    if (
      !expectedFiles.has(
        normalized
      )
    ) {
      console.log(
        `🗑 Removing stale host file: ${normalized}`
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

// =========================================================
// SYNC HOST WORKSPACE
// =========================================================

async function syncWorkspace(
  workspace: string,
  files: ProjectFile[]
): Promise<void> {
  const flattened =
    flattenFiles(files);

  const expectedFiles =
    new Set<string>();

  console.log(
    `📂 Syncing ${flattened.length} files to host`
  );

  for (
    const file of flattened
  ) {
    const safePath =
      getSafeWorkspacePath(
        workspace,
        file.name
      );

    if (!safePath) {
      throw new Error(
        `Unsafe file path: ${file.name}`
      );
    }

    const relativePath =
      path
        .relative(
          workspace,
          safePath
        )
        .replace(
          /\\/g,
          "/"
        );

    expectedFiles.add(
      relativePath
    );

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

  await removeStaleFiles(
    workspace,
    workspace,
    expectedFiles
  );

  console.log(
    "✅ Host workspace synchronized"
  );
}

// =========================================================
// BUILD IMAGE
// =========================================================

async function buildProjectImage(
  imageTag: string,
  projectDir: string
): Promise<void> {
  console.log(
    `🐳 Building image: ${imageTag}`
  );

  const tarStream =
    tar.pack(projectDir);

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

        (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          const buildError =
            result?.find(
              (item: any) =>
                item.error
            );

          if (buildError) {
            reject(
              new Error(
                buildError.error
              )
            );

            return;
          }

          resolve();
        },

        (event) => {
          if (event.stream) {
            console.log(
              `[Docker] ${event.stream.trim()}`
            );
          }

          if (event.error) {
            console.error(
              `[Docker Error] ${event.error}`
            );
          }
        }
      );
    }
  );

  console.log(
    `✅ Image built: ${imageTag}`
  );
}

// =========================================================
// GET EXISTING CONTAINER
// =========================================================

async function getExistingContainer(
  containerName: string
) {
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

// =========================================================
// REMOVE CONTAINER
// =========================================================

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

    if (
      info.State?.Running
    ) {
      try {
        await container.stop({
          t: 3,
        });
      } catch {}
    }

    await container.remove({
      force: true,
    });

    console.log(
      `🗑 Removed container: ${containerName}`
    );
  } catch {}
}

// =========================================================
// EXEC
// =========================================================

async function execCommand(
  container: Docker.Container,
  command: string[],
  detached = false
): Promise<{
  exitCode: number;
  output: string;
}> {
  const exec =
    await container.exec({
      Cmd: command,
      AttachStdout: !detached,
      AttachStderr: !detached,
    });

  const stream =
    await exec.start({
      hijack: !detached,
      stdin: false,
      Detach: detached,
    } as any);

  if (detached) {
    return {
      exitCode: 0,
      output: "",
    };
  }

  let output = "";

  const stdout =
    new PassThrough();

  const stderr =
    new PassThrough();

  stdout.on(
    "data",
    (chunk) => {
      output +=
        chunk.toString();
    }
  );

  stderr.on(
    "data",
    (chunk) => {
      output +=
        chunk.toString();
    }
  );

  docker.modem.demuxStream(
    stream,
    stdout,
    stderr
  );

  await new Promise<void>(
    (resolve, reject) => {
      stream.on(
        "end",
        resolve
      );

      stream.on(
        "close",
        resolve
      );

      stream.on(
        "error",
        reject
      );
    }
  );

  const inspect =
    await exec.inspect();

  return {
    exitCode:
      inspect.ExitCode ?? 1,
    output,
  };
}

// =========================================================
// ENSURE CONTAINER RUNNING
// =========================================================

async function ensureContainerRunning(
  container: Docker.Container
): Promise<void> {
  const info =
    await container.inspect();

  if (
    info.State?.Running
  ) {
    return;
  }

  console.log(
    "▶️ Starting container..."
  );

  await container.start();

  await sleep(500);

  const updated =
    await container.inspect();

  if (
    !updated.State?.Running
  ) {
    throw new Error(
      "Container failed to start"
    );
  }

  console.log(
    "✅ Container running"
  );
}

// =========================================================
// GET CONTAINER FILE
// =========================================================

async function getContainerFile(
  container: Docker.Container,
  filePath: string
): Promise<string | null> {
  try {
    const result =
      await execCommand(
        container,
        [
          "cat",
          filePath,
        ]
      );

    if (
      result.exitCode !== 0
    ) {
      return null;
    }

    return result.output;
  } catch {
    return null;
  }
}

// =========================================================
// NODE MODULES
// =========================================================

async function hasNodeModules(
  container: Docker.Container
): Promise<boolean> {
  try {
    const result =
      await execCommand(
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

    return (
      result.exitCode === 0
    );
  } catch {
    return false;
  }
}

// =========================================================
// PACKAGE MANAGER
// =========================================================

function getPackageManager(
  files: ProjectFile[]
):
  | "npm"
  | "yarn"
  | "pnpm" {
  const names =
    new Set(
      flattenFiles(files).map(
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
    names.has(
      "yarn.lock"
    )
  ) {
    return "yarn";
  }

  return "npm";
}

// =========================================================
// INSTALL DEPENDENCIES
// =========================================================

async function installDependencies(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<void> {
  const manager =
    getPackageManager(files);

  let command: string[];

  if (
    manager === "pnpm"
  ) {
    command = [
      "sh",
      "-c",
      "corepack enable && pnpm install",
    ];
  } else if (
    manager === "yarn"
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
    `📦 Installing dependencies using ${manager}`
  );

  const result =
    await execCommand(
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

// =========================================================
// FIND CHANGES
// =========================================================

async function findChanges(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<{
  filesToCopy: ProjectFile[];
  configChanged: boolean;
  dependenciesChanged: boolean;
}> {
  const flattened =
    flattenFiles(files);

  const filesToCopy:
    ProjectFile[] = [];

  let configChanged =
    false;

  let dependenciesChanged =
    false;

  for (
    const file of flattened
  ) {
    const name =
      normalizeProjectPath(
        file.name
      );

    const isConfig =
      NEXT_CONFIG_FILES.has(
        name
      );

    const isPackage =
      PACKAGE_FILES.has(
        name
      );

    if (
      !isConfig &&
      !isPackage
    ) {
      filesToCopy.push(
        file
      );

      continue;
    }

    const existing =
      await getContainerFile(
        container,
        `${CONTAINER_APP_DIR}/${name}`
      );

    const incoming =
      file.content ?? "";

    if (
      existing === incoming
    ) {
      continue;
    }

    filesToCopy.push(
      file
    );

    if (isConfig) {
      configChanged = true;
    }

    if (isPackage) {
      dependenciesChanged = true;
    }
  }

  return {
    filesToCopy,
    configChanged,
    dependenciesChanged,
  };
}

// =========================================================
// COPY FILES INTO CONTAINER
// =========================================================

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
      "⏭️ No files to copy"
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
    for (
      const file of flattened
    ) {
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
      `✅ Copied ${flattened.length} files into container`
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

// =========================================================
// SYNC CONTAINER
// =========================================================

async function syncFilesToContainer(
  container: Docker.Container,
  files: ProjectFile[],
  existing: boolean
): Promise<SyncResult> {
  await ensureContainerRunning(
    container
  );

  let filesToCopy =
    flattenFiles(files);

  let configChanged =
    false;

  let dependenciesChanged =
    false;

  if (existing) {
    const result =
      await findChanges(
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

  const modulesExist =
    await hasNodeModules(
      container
    );

  if (!modulesExist) {
    await installDependencies(
      container,
      files
    );
  } else if (
    dependenciesChanged
  ) {
    await installDependencies(
      container,
      files
    );
  }

  return {
    configChanged,
    dependenciesChanged,
  };
}

// =========================================================
// CHECK NEXT
// =========================================================

async function isNextRunning(
  container: Docker.Container
): Promise<boolean> {
  try {
    const result =
      await execCommand(
        container,
        [
          "sh",
          "-c",
          `
            if command -v wget >/dev/null 2>&1; then
              wget -q --spider http://127.0.0.1:3000 && exit 0
            fi

            if command -v curl >/dev/null 2>&1; then
              curl -fsS http://127.0.0.1:3000 >/dev/null && exit 0
            fi

            if command -v busybox >/dev/null 2>&1; then
              busybox wget -q -O /dev/null http://127.0.0.1:3000 && exit 0
            fi

            exit 1
          `,
        ]
      );

    return (
      result.exitCode === 0
    );
  } catch {
    return false;
  }
}

// =========================================================
// START NEXT
// =========================================================

async function startNextServer(
  container: Docker.Container
): Promise<void> {
  await ensureContainerRunning(
    container
  );

  if (
    await isNextRunning(
      container
    )
  ) {
    console.log(
      "✅ Next.js already running"
    );

    return;
  }

  console.log(
    "🚀 Starting Next.js..."
  );

  await execCommand(
    container,
    [
      "sh",
      "-c",
      "rm -f /tmp/next.log",
    ]
  );

  await execCommand(
    container,
    [
      "sh",
      "-c",
      `
        cd /app &&
        nohup npm run dev -- -H 0.0.0.0 -p 3000 \
        >/tmp/next.log 2>&1 &
      `,
    ],
    true
  );

  await sleep(2000);

  if (
    !(await isNextRunning(
      container
    ))
  ) {
    const logs =
      await execCommand(
        container,
        [
          "sh",
          "-c",
          "cat /tmp/next.log 2>/dev/null || true",
        ]
      );

    throw new Error(
      `Next.js failed to start:\n${logs.output}`
    );
  }

  const internalReady =
    await waitForContainerServer(
      container,
      3000
    );

  if (!internalReady) {
    const logs =
      await execCommand(
        container,
        [
          "sh",
          "-c",
          "cat /tmp/next.log 2>/dev/null || true",
        ]
      );

    throw new Error(
      `Next.js process is running but port 3000 is not responding.\n\nNext logs:\n${logs.output}`
    );
  }

  console.log(
    "✅ Next.js started and responding"
  );
}

// =========================================================
// WAIT INSIDE CONTAINER
// =========================================================

async function waitForContainerServer(
  container: Docker.Container,
  port: number,
  retries = 60
): Promise<boolean> {
  for (
    let i = 0;
    i < retries;
    i++
  ) {
    const result =
      await execCommand(
        container,
        [
          "sh",
          "-c",
          `
            if command -v wget >/dev/null 2>&1; then
              wget -q -O /dev/null http://127.0.0.1:${port}
            elif command -v curl >/dev/null 2>&1; then
              curl -fsS http://127.0.0.1:${port} >/dev/null
            else
              node -e "
                const http = require('http');
                const req = http.get(
                  'http://127.0.0.1:${port}',
                  res => {
                    res.resume();
                    process.exit(0);
                  }
                );
                req.on('error', () => process.exit(1));
                req.setTimeout(1500, () => {
                  req.destroy();
                  process.exit(1);
                });
              "
            fi
          `,
        ]
      );

    if (
      result.exitCode === 0
    ) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

// =========================================================
// STOP NEXT
// =========================================================

async function stopNextServer(
  container: Docker.Container
): Promise<void> {
  try {
    await execCommand(
      container,
      [
        "sh",
        "-c",
        `
          pkill -f "next dev" 2>/dev/null || true
          pkill -f "next-server" 2>/dev/null || true
          pkill -f "next start" 2>/dev/null || true
        `,
      ]
    );
  } catch {}

  await sleep(500);
}

// =========================================================
// RESTART NEXT
// =========================================================

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

// =========================================================
// CREATE CONTAINER
// =========================================================

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

  const nodeModulesVolume =
    `preview-nodemodules-${projectId}`;

  const nextCacheVolume =
    `preview-nextcache-${projectId}`;

  const container =
    await docker.createContainer({
      Image: imageTag,

      name: containerName,

      WorkingDir:
        CONTAINER_APP_DIR,

      Cmd:
        KEEP_ALIVE_COMMAND,

      Env: [
        "HOST=0.0.0.0",
        `PORT=${NEXT_PORT}`,

        "WATCHPACK_POLLING=true",
        "CHOKIDAR_USEPOLLING=true",
        "WATCHPACK_POLLING_INTERVAL=1000",

        "NEXT_TELEMETRY_DISABLED=1",
      ],

      HostConfig: {
        Binds: [
          `${nodeModulesVolume}:/app/node_modules`,
          `${nextCacheVolume}:/app/.next`,
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
    `✅ Created container ${container.id}`
  );

  return {
    container,
    hostPort,
  };
}

// =========================================================
// WAIT HOST SERVER
// =========================================================

async function waitForServer(
  hostPort: string,
  retries = 60
): Promise<boolean> {
  for (
    let i = 0;
    i < retries;
    i++
  ) {
    const ready =
      await new Promise<boolean>(
        (resolve) => {
          const request =
            http.get(
              `http://127.0.0.1:${hostPort}`,
              (response) => {
                response.resume();

                resolve(
                  (response.statusCode ??
                    0) >= 200 &&
                    (response.statusCode ??
                      0) < 600
                );
              }
            );

          request.on(
            "error",
            () =>
              resolve(false)
          );

          request.setTimeout(
            1500,
            () => {
              request.destroy();
              resolve(false);
            }
          );
        }
      );

    if (ready) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

// =========================================================
// CREATE PREVIEW
// =========================================================

async function createPreview(
  imageTag: string,
  containerName: string,
  projectId: string,
  files: ProjectFile[]
) {
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
    await ensureContainerRunning(
      container
    );

    await syncFilesToContainer(
      container,
      files,
      false
    );

    await startNextServer(
      container
    );

    const ready =
      await waitForServer(
        hostPort
      );

    if (!ready) {
      throw new Error(
        "Next.js did not become ready"
      );
    }

    return {
      container,
      hostPort,
      reused: false,
    };
  } catch (error) {
    await removeContainer(
      containerName
    );

    throw error;
  }
}

// =========================================================
// UPDATE PREVIEW
// =========================================================

async function updatePreview(
  container: Docker.Container,
  files: ProjectFile[]
): Promise<SyncResult> {
  await ensureContainerRunning(
    container
  );

  const result =
    await syncFilesToContainer(
      container,
      files,
      true
    );

  if (
    result.dependenciesChanged
  ) {
    console.log(
      "📦 Dependencies changed -> restarting Next"
    );

    await restartNextServer(
      container
    );
  } else if (
    result.configChanged
  ) {
    console.log(
      "⚙️ next.config changed -> restarting Next"
    );

    await restartNextServer(
      container
    );
  } else if (
    !(await isNextRunning(
      container
    ))
  ) {
    console.log(
      "⚠️ Next.js is not running -> starting"
    );

    await startNextServer(
      container
    );
  }

  return result;
}

// =========================================================
// MAIN POST
// =========================================================

export async function POST(
  req: NextRequest
) {
  try {
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

    // -----------------------------------------
    // VERIFY PROJECT
    // -----------------------------------------

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          ownerId,
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

    const projectFiles =
      files as ProjectFile[];

    // -----------------------------------------
    // IMPORTANT:
    //
    // EVERYTHING for this project is now
    // inside ONE lock.
    //
    // This prevents:
    //
    // Request A -> upload new content
    // Request B -> upload old content
    // Request A -> verify old content
    //
    // -----------------------------------------

    const result =
      await withProjectLock(
        projectId,
        async () => {
          const flattenedIncoming =
            flattenFiles(
              projectFiles
            );

          console.log(
            "======================================"
          );
          console.log(
            "📦 INCOMING FILES"
          );
          console.log(
            `Project: ${projectId}`
          );
          console.log(
            `Files: ${flattenedIncoming.length}`
          );
          console.log(
            "======================================"
          );

          for (
            const file of flattenedIncoming
          ) {
            console.log(
              `📄 ${file.name} (${file.content?.length ?? 0} bytes)`
            );
          }

          // -------------------------------------
          // WORKSPACE
          // -------------------------------------

          const workspace =
            path.resolve(
              process.cwd(),
              "WORKSPACE",
              ownerId,
              projectId
            );

          await fs.mkdir(
            workspace,
            {
              recursive: true,
            }
          );

          // -------------------------------------
          // SUPABASE
          // -------------------------------------

          await syncFilesToSupabase(
            ownerId,
            projectId,
            projectFiles
          );

          // -------------------------------------
          // HOST
          // -------------------------------------

          await syncWorkspace(
            workspace,
            projectFiles
          );

          // -------------------------------------
          // IMAGE
          // -------------------------------------

          const imageTag =
            `preview-image-${projectId}:latest`;

          const images =
            await docker.listImages();

          const imageExists =
            images.some(
              (image) =>
                image.RepoTags?.includes(
                  imageTag
                )
            );

          if (!imageExists) {
            await buildProjectImage(
              imageTag,
              workspace
            );
          }

          // -------------------------------------
          // CONTAINER
          // -------------------------------------

          const containerName =
            `preview-container-${projectId}`;

          const existing =
            await getExistingContainer(
              containerName
            );

          // =====================================
          // CREATE
          // =====================================

          if (!existing) {
            console.log(
              "🆕 Creating new preview"
            );

            return await createPreview(
              imageTag,
              containerName,
              projectId,
              projectFiles
            );
          }

          // =====================================
          // UPDATE
          // =====================================

          console.log(
            "♻️ Updating existing preview"
          );

          const {
            container,
            info,
          } = existing;

          await ensureContainerRunning(
            container
          );

          const hostPort =
            getContainerHostPort(
              info
            );

          if (!hostPort) {
            throw new Error(
              "Existing container has no host port mapping"
            );
          }

          await updatePreview(
            container,
            projectFiles
          );

          const ready =
            await waitForServer(
              hostPort
            );

          if (!ready) {
            throw new Error(
              "Updated preview is not responding"
            );
          }

          return {
            container,
            hostPort,
            reused: true,
          };
        }
      );

    // -----------------------------------------
    // RESPONSE
    // -----------------------------------------

    const previewUrl =
      `http://localhost:${result.hostPort}`;

    console.log(
      "======================================"
    );

    console.log(
      result.reused
        ? "♻️ PREVIEW UPDATED"
        : "🆕 PREVIEW CREATED"
    );

    console.log(
      "☁️ SUPABASE UPDATED"
    );

    console.log(
      `🌐 ${previewUrl}`
    );

    console.log(
      "======================================"
    );

    return NextResponse.json(
      {
        previewUrl,

        hotReload: true,

        reused:
          result.reused,

        containerName:
          `preview-container-${projectId}`,

        projectId,

        supabaseSynced:
          true,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "❌ PREVIEW ERROR:",
      error
    );

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Internal server error",

        supabaseSynced:
          false,
      },
      {
        status: 500,
      }
    );
  }
}

// =========================================================
// CONTAINER HOST PORT
// =========================================================

function getContainerHostPort(
  info: Docker.ContainerInspectInfo
): string | null {
  const bindings =
    info.NetworkSettings
      ?.Ports?.[
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