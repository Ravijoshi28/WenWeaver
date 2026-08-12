import fs from "fs/promises";
import path from "path";
import { supabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
]);

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
    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    const filePath = path
      .join(relativePath, entry.name)
      .replaceAll("\\", "/");

    if (entry.isDirectory()) {
      await uploadDirectory(
        fullPath,
        ownerId,
        projectId,
        filePath
      );

      continue;
    }

    const fileBuffer = await fs.readFile(fullPath);

    const storagePath =
      `${ownerId}/${projectId}/${filePath}`;

    const { error } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, fileBuffer, {
        upsert: true,
      });

    if (error) {
      throw new Error(
        `Failed to upload ${storagePath}: ${error.message}`
      );
    }

    console.log(
      "Uploaded to Supabase:",
      storagePath
    );
  }
}

export async function uploadProjectToSupabase(
  projectPath: string,
  ownerId: string,
  projectId: string
) {
  await uploadDirectory(
    projectPath,
    ownerId,
    projectId
  );
}