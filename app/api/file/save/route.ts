export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";

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
          }
        );

    if (error) {
      throw error;
    }

    for (
      const item of data ?? []
    ) {
      const itemPath =
        currentFolder
          ? `${currentFolder}/${item.name}`
          : item.name;

      /*
       * Supabase Storage returns metadata
       * for actual files.
       */
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
// SAVE FILES
// =========================================================

async function saveFilesToSupabase(
  ownerId: string,
  projectId: string,
  files: ProjectFile[]
) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase admin client is not configured"
    );
  }

  await ensureBucket();

  const flattened =
    flattenFiles(files);

  if (
    flattened.length === 0
  ) {
    throw new Error(
      "No files were supplied"
    );
  }

  console.log(
    "======================================"
  );

  console.log(
    "☁️ SAVING PROJECT TO SUPABASE"
  );

  console.log(
    `Owner: ${ownerId}`
  );

  console.log(
    `Project: ${projectId}`
  );

  console.log(
    `Files: ${flattened.length}`
  );

  console.log(
    "======================================"
  );

  const expectedPaths =
    new Set<string>();

  // =======================================================
  // UPLOAD FILES
  // =======================================================

  for (
    const file of flattened
  ) {
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

    console.log(
      `☁️ Uploading ${filePath} (${buffer.length} bytes)`
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
  }

  // =======================================================
  // DELETE FILES THAT NO LONGER EXIST
  // =======================================================

  const projectFolder =
    `${ownerId}/${projectId}`;

  let existingPaths: string[] = [];

  try {
    existingPaths =
      await listSupabaseFiles(
        projectFolder
      );
  } catch (error) {
    console.warn(
      "⚠️ Could not list existing files:",
      error
    );
  }

  const stalePaths =
    existingPaths.filter(
      (existingPath) =>
        !expectedPaths.has(
          existingPath
        )
    );

  if (
    stalePaths.length > 0
  ) {
    console.log(
      `🗑 Removing ${stalePaths.length} stale files`
    );

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

  console.log(
    "✅ SUPABASE SAVE COMPLETE"
  );

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
            files as ProjectFile[]
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
      }
    );
  } catch (error) {
    console.error(
      "❌ SAVE PROJECT ERROR:",
      error
    );

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