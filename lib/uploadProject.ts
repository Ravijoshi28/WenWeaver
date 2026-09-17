
import fs from "fs/promises";
import path from "path";
import {
  supabaseAdmin,
  SUPABASE_BUCKET,
} from "@/lib/supabase";

// =================================================
// TYPES
// =================================================

export interface ProjectFile {
  path: string;
  content: string | Buffer;
}

// =================================================
// IGNORED DIRECTORIES
// =================================================

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
]);

// =================================================
// UPLOAD A LOCAL DIRECTORY
// =================================================

async function uploadDirectory(
  directory: string,
  ownerId: string,
  projectId: string,
  relativePath = ""
): Promise<void> {
  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    // -----------------------------------------
    // Ignore unwanted directories
    // -----------------------------------------

    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const fullPath = path.join(
      directory,
      entry.name
    );

    const filePath = path
      .join(relativePath, entry.name)
      .replaceAll("\\", "/");

    // -----------------------------------------
    // Directory
    // -----------------------------------------

    if (entry.isDirectory()) {
      await uploadDirectory(
        fullPath,
        ownerId,
        projectId,
        filePath
      );

      continue;
    }

    // -----------------------------------------
    // File
    // -----------------------------------------

    const fileBuffer = await fs.readFile(
      fullPath
    );

    const storagePath =
      `${ownerId}/${projectId}/${filePath}`;

    const { error } =
      await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .upload(
          storagePath,
          fileBuffer,
          {
            upsert: true,
          }
        );

    if (error) {
      throw new Error(
        `Failed to upload ${storagePath}: ${error.message}`
      );
    }

  }
}

// =================================================
// UPLOAD GENERATED FILES
// =================================================

async function uploadFiles(
  files: ProjectFile[],
  ownerId: string,
  projectId: string
): Promise<void> {
  for (const file of files) {
    // -----------------------------------------
    // Normalize path
    // -----------------------------------------

    const filePath = file.path
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");

    // -----------------------------------------
    // Ignore unwanted files/directories
    // -----------------------------------------

    const parts = filePath.split("/");

    if (
      parts.some((part) =>
        IGNORED_DIRECTORIES.has(part)
      )
    ) {
      continue;
    }

    // -----------------------------------------
    // Supabase path
    // -----------------------------------------

    const storagePath =
      `${ownerId}/${projectId}/${filePath}`;

    // -----------------------------------------
    // Convert content to Buffer
    // -----------------------------------------

    const fileBuffer =
      typeof file.content === "string"
        ? Buffer.from(file.content, "utf-8")
        : file.content;

    // -----------------------------------------
    // Upload
    // -----------------------------------------

    const { error } =
      await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .upload(
          storagePath,
          fileBuffer,
          {
            upsert: true,
          }
        );

    if (error) {
      throw new Error(
        `Failed to upload ${storagePath}: ${error.message}`
      );
    }

  }
}

// =================================================
// MAIN FUNCTION
// =================================================

export async function uploadProjectToSupabase(
  projectPathOrProjectId: string,
  ownerIdOrUserId: string,
  projectIdOrFiles:
    | string
    | ProjectFile[]
): Promise<void> {

  // =================================================
  // DEVELOPMENT
  //
  // uploadProjectToSupabase(
  //   projectPath,
  //   ownerId,
  //   projectId
  // )
  // =================================================

  if (typeof projectIdOrFiles === "string") {
    const projectPath =
      projectPathOrProjectId;

    const ownerId =
      ownerIdOrUserId;

    const projectId =
      projectIdOrFiles;

    await uploadDirectory(
      projectPath,
      ownerId,
      projectId
    );

    return;
  }

  // =================================================
  // PRODUCTION
  //
  // uploadProjectToSupabase(
  //   projectId,
  //   ownerId,
  //   files
  // )
  // =================================================

  const projectId =
    projectPathOrProjectId;

  const ownerId =
    ownerIdOrUserId;

  const files =
    projectIdOrFiles;

  await uploadFiles(
    files,
    ownerId,
    projectId
  );
}
