import { mapConcurrent } from "@/lib/map-concurrent";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { VerifyAccessToken } from "@/lib/verify";
import { cookies } from "next/headers";
import { saveRateLimit } from "@/lib/rate-limiter";

// =========================================================
// TYPES
// =========================================================

type ProjectFile = {
  name: string;
  path?: string;
  type: "file" | "folder";
  content?: string;
  children?: ProjectFile[];
};

// =========================================================
// SUPABASE
// =========================================================

const SUPABASE_BUCKET =
  process.env.SUPABASE_BUCKET ?? "project-files";

// =========================================================
// PROJECT LOCK
// =========================================================

const projectLocks =
  new Map<string, Promise<void>>();

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

  projectLocks.set(
    projectId,
    lock
  );

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
  value: string
): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(
      /^(\.\.\/)+/,
      ""
    )
    .replace(/\/$/, "");
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
    const currentPath =
      parentPath
        ? `${parentPath}/${file.name}`
        : file.name;

    const normalized =
      normalizeProjectPath(
        currentPath
      );

    if (file.type === "folder") {
      if (
        Array.isArray(
          file.children
        )
      ) {
        result.push(
          ...flattenFiles(
            file.children,
            normalized
          )
        );
      }

      continue;
    }

    if (!normalized) {
      continue;
    }

    result.push({
      ...file,
      name: normalized,
      path: normalized,
    });
  }

  return result;
}

// =========================================================
// SAFE SUPABASE PATH
// =========================================================

function getSupabaseFilePath(
  ownerId: string,
  projectId: string,
  filePath: string
): string {
  const normalized =
    normalizeProjectPath(
      filePath
    );

  if (!normalized) {
    throw new Error(
      "Invalid file path"
    );
  }

  return [
    ownerId,
    projectId,
    normalized,
  ]
    .filter(Boolean)
    .join("/");
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
// ENSURE BUCKET
// =========================================================

async function ensureBucket() {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase admin client is not configured"
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin.storage
      .listBuckets();

  if (error) {
    throw new Error(
      `Unable to access Supabase Storage: ${error.message}`
    );
  }

  const exists =
    data?.some(
      (bucket) =>
        bucket.name ===
        SUPABASE_BUCKET
    );

  if (exists) {
    return;
  }

  const {
    error: createError,
  } =
    await supabaseAdmin.storage
      .createBucket(
        SUPABASE_BUCKET,
        {
          public: false,
        }
      );

  if (
    createError &&
    !createError.message
      .toLowerCase()
      .includes("already exists")
  ) {
    throw new Error(
      `Failed to create Supabase bucket: ${createError.message}`
    );
  }
}

// =========================================================
// LIST EXISTING FILES
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

  async function walk(currentFolder: string): Promise<void> {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin.storage.from(SUPABASE_BUCKET)
        .list(currentFolder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      for (const item of data ?? []) {
        const itemPath = currentFolder ? `${currentFolder}/${item.name}` : item.name;
        if (item.metadata !== null && item.metadata !== undefined) result.push(itemPath);
        else await walk(itemPath);
      }
      if (!data || data.length < 1000) break;
    }
  }

  await walk(folder);

  return result;
}

// =========================================================
// SAVE FILES
// =========================================================

async function saveFilesToSupabase(
  ownerId: string,
  projectId: string,
  files: ProjectFile[],
  mode: "full" | "patch" = "full",
  deletedPaths: string[] = [],
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase admin client is not configured"
    );
  }

  await ensureBucket();

  // Resolve duplicate paths before concurrent uploads, preserving last-write order.
  const flattened = [...new Map(flattenFiles(files).map(file => [file.path, file])).values()];

  if (
    flattened.length === 0 && mode === "full"
  ) {
    throw new Error(
      "No files were supplied"
    );
  }

  const expectedPaths =
    new Set<string>();

  // =======================================================
  // UPLOAD FILES
  // =======================================================

  await mapConcurrent(flattened, 4, async (file) => {
    const filePath =
      normalizeProjectPath(
        file.name
      );

    if (!filePath) return;

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

    const {
      error,
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

            cacheControl: "0",

            upsert: true,
          }
        );

    if (error) {
      throw new Error(
        `Failed to save ${filePath}: ${error.message}`
      );
    }
  });

  // =======================================================
  // DELETE FILES THAT NO LONGER EXIST
  // =======================================================

  const projectFolder =
    `${ownerId}/${projectId}`;

  let existingPaths: string[] = [];

  if (mode === "full") {
    existingPaths =
      await listSupabaseFiles(
        projectFolder
      );
  }

  const stalePaths = mode === "patch"
    ? deletedPaths.map(filePath => getSupabaseFilePath(ownerId, projectId, filePath)).filter(filePath => !expectedPaths.has(filePath))
    : existingPaths.filter(
      (existingPath) =>
        !expectedPaths.has(
          existingPath
        )
    );

  if (
    stalePaths.length > 0
  ) {

    const {
      error,
    } =
      await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .remove(
          stalePaths
        );

    if (error) {
      throw new Error(
        `Failed to remove stale files: ${error.message}`
      );
    }
  }

  return {
    filesSaved:
      flattened.length,

    filesDeleted:
      stalePaths.length,
  };
}

// =========================================================
// POST
// =========================================================

export async function POST(
  req: NextRequest
) {
  const started = performance.now();
  try {

     const cookieStore = await cookies();

        const token = cookieStore.get("accessToken")?.value;

        if (!token) {
          return NextResponse.json(
            {
              message: "Not authorised",
            },
            {
              status: 401,
            }
          );
        }

        const user = VerifyAccessToken(token);

        if (!user) {
          return NextResponse.json(
            {
              message: "Not authorised",
            },
            {
              status: 401,
            }
          );
        }

        const rateLimit=await saveRateLimit.limit(
          `save:user:${user.id}`
        );

        if (!rateLimit.success) {
  return NextResponse.json(
    {
      error:
        "Too many preview requests. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit":
          String(rateLimit.limit),

        "X-RateLimit-Remaining":
          String(rateLimit.remaining),

        "X-RateLimit-Reset":
          String(rateLimit.reset),
      },
    });
        }

    const body =
      await req.json();

    const {
      ownerId,
      id: projectId,
      files,
      mode = "full",
      deletedPaths = [],
    } = body;

    if (
      !ownerId ||
      !projectId ||
      !Array.isArray(files) ||
      !["full", "patch"].includes(mode) ||
      !Array.isArray(deletedPaths) ||
      deletedPaths.some((value: unknown) => typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || value.split("/").some(part => !part || part === "." || part === ".."))
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid payload parameters",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // VERIFY PROJECT
    // =====================================================

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          ownerId,
        },
        select: {
          id: true,
          ownerId: true,
        },
      });

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Project not found",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // SAVE
    // =====================================================

    const result =
      await withProjectLock(
        projectId,
        async () => {
          return await saveFilesToSupabase(
            ownerId,
            projectId,
            files as ProjectFile[],
            mode,
            deletedPaths,
          );
        }
      );

    return NextResponse.json(
      {
        success: true,

        message:
          "Project saved successfully",

        projectId,

        ownerId,

        supabaseSynced: true,

        durationMs: Number((performance.now() - started).toFixed(2)),
        mode,
        filesSaved:
          result.filesSaved,

        filesDeleted:
          result.filesDeleted,

        savedAt:
          new Date().toISOString(),

        requestId:
          crypto.randomUUID(),
      },
      {
        status: 200,
        headers: { "Server-Timing": `save;dur=${(performance.now() - started).toFixed(2)}` },
      }
    );
  } catch (error) {
    console.error("Operation failed in app/api/file/save/route.ts.");

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Internal server error",

        supabaseSynced: false,
      },
      {
        status: 500,
      }
    );
  }
}
