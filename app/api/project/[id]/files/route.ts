import { VerifyAccessToken } from "@/lib/verify";
import { supabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
]);

/* =========================================================
   LOCAL FILESYSTEM
   ========================================================= */

async function readLocalDirectory(
  dir: string,
  relativePath = ""
): Promise<FileNode[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  });

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    const filePath = path
      .join(relativePath, entry.name)
      .replaceAll("\\", "/");

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: filePath,
        type: "folder",
        children: await readLocalDirectory(
          fullPath,
          filePath
        ),
      });

      continue;
    }

    try {
      const content = await fs.readFile(
        fullPath,
        "utf8"
      );

      nodes.push({
        name: entry.name,
        path: filePath,
        type: "file",
        content,
      });
    } catch (error) {
      console.error(
        `Could not read local file: ${fullPath}`,
        error
      );
    }
  }

  return nodes;
}

/* =========================================================
   SUPABASE STORAGE
   ========================================================= */

type StorageFile = {
  name: string;
  id: string | null;
  metadata?: Record<string, unknown> | null;
};

async function readSupabaseDirectory(
  storagePath: string,
  relativePath = ""
): Promise<FileNode[]> {
  const { data, error } =
    await supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .list(storagePath, {
        limit: 1000,
        sortBy: {
          column: "name",
          order: "asc",
        },
      });

  if (error) {
    throw new Error(
      `Supabase list failed for ${storagePath}: ${error.message}`
    );
  }

  const nodes: FileNode[] = [];

  for (const item of (data ?? []) as StorageFile[]) {
    const itemPath = storagePath
      ? `${storagePath}/${item.name}`
      : item.name;

    const filePath = path
      .join(relativePath, item.name)
      .replaceAll("\\", "/");

    /*
     * Supabase Storage returns folders with id === null.
     */
    const isFolder = item.id === null;

    if (isFolder) {
      nodes.push({
        name: item.name,
        path: filePath,
        type: "folder",
        children: await readSupabaseDirectory(
          itemPath,
          filePath
        ),
      });

      continue;
    }

    try {
      const { data: fileData, error: downloadError } =
        await supabaseAdmin.storage
          .from(SUPABASE_BUCKET)
          .download(itemPath);

      if (downloadError) {
        console.error(
          `Could not download ${itemPath}:`,
          downloadError
        );

        continue;
      }

      if (!fileData) {
        continue;
      }

      const content = await fileData.text();

      nodes.push({
        name: item.name,
        path: filePath,
        type: "file",
        content,
      });
    } catch (error) {
      console.error(
        `Could not read Supabase file ${itemPath}:`,
        error
      );
    }
  }

  return nodes;
}

/* =========================================================
   API
   ========================================================= */

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    /* -----------------------------------------
       AUTHENTICATION
       ----------------------------------------- */

    const cookieStore = await cookies();

    const token =
      cookieStore.get("accessToken")?.value;

    if (!token) {
      return NextResponse.json(
        {
          message: "Not authorised",
        },
        { status: 401 }
      );
    }

    const user = VerifyAccessToken(token);

    if (!user) {
      return NextResponse.json(
        {
          message: "Not authorised",
        },
        { status: 401 }
      );
    }

    /* -----------------------------------------
       PROJECT ID
       ----------------------------------------- */

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          message: "Project ID is required",
        },
        { status: 400 }
      );
    }

    /* -----------------------------------------
       OWNER ID
       ----------------------------------------- */

    const body = await req.json();

    const { ownerId } = body;

    if (!ownerId) {
      return NextResponse.json(
        {
          message: "ownerId is required",
        },
        { status: 400 }
      );
    }

    /* -----------------------------------------
       DECIDE STORAGE
       -----------------------------------------

       Development:
         USE_SUPABASE_STORAGE=false

       Production:
         USE_SUPABASE_STORAGE=true
    */

    const useSupabase =
      process.env.USE_SUPABASE_STORAGE === "true";

    console.log("=================================");
    console.log("FILES API");
    console.log("Environment:", process.env.NODE_ENV);
    console.log("Use Supabase:", useSupabase);
    console.log("Owner ID:", ownerId);
    console.log("Project ID:", id);
    console.log("=================================");

    /* =====================================================
       SUPABASE STORAGE
       ===================================================== */

    if (useSupabase) {
      const storagePath = `${ownerId}/${id}`;

      console.log(
        "Reading from Supabase:",
        storagePath
      );

      const files =
        await readSupabaseDirectory(storagePath);

      console.log(
        `Successfully read ${files.length} root entries from Supabase`
      );

      return NextResponse.json(
        {
          success: true,
          projectId: id,
          ownerId,
          storage: "supabase",
          path: storagePath,
          files,
        },
        { status: 200 }
      );
    }

    /* =====================================================
       LOCAL FILESYSTEM
       ===================================================== */

    const projectPath = path.resolve(
      process.cwd(),
      "WORKSPACE",
      ownerId,
      id
    );

    console.log(
      "Reading local project:",
      projectPath
    );

    let stat;

    try {
      stat = await fs.stat(projectPath);
    } catch (error) {
      console.error(
        "Local project directory does not exist:",
        projectPath,
        error
      );

      return NextResponse.json(
        {
          message:
            "Project directory not found",
          path: projectPath,
          storage: "local",
        },
        { status: 404 }
      );
    }

    if (!stat.isDirectory()) {
      return NextResponse.json(
        {
          message:
            "Project path is not a directory",
          path: projectPath,
          storage: "local",
        },
        { status: 400 }
      );
    }

    const files =
      await readLocalDirectory(projectPath);

    console.log(
      `Successfully read ${files.length} root entries from local filesystem`
    );

    return NextResponse.json(
      {
        success: true,
        projectId: id,
        ownerId,
        storage: "local",
        path: projectPath,
        files,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "FILES API ERROR:",
      error
    );

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Server error",
      },
      { status: 500 }
    );
  }
}