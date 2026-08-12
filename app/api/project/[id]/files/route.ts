import { VerifyAccessToken } from "@/lib/verify";
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

async function readDirectory(
  dir: string,
  relativePath = ""
): Promise<FileNode[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  });

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    // Skip generated/dependency directories
    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const filePath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: filePath,
        type: "folder",
        children: await readDirectory(fullPath, filePath),
      });

      continue;
    }

    try {
      const content = await fs.readFile(fullPath, "utf8");

      nodes.push({
        name: entry.name,
        path: filePath,
        type: "file",
        content,
      });
    } catch (error) {
      console.error(
        `Could not read file: ${fullPath}`,
        error
      );

      // Skip files that cannot be read as UTF-8
    }
  }

  return nodes;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // -----------------------------------------
    // AUTHENTICATION
    // -----------------------------------------

    const cookieStore = await cookies();

    const token = cookieStore.get("accessToken")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "Not authorised" },
        { status: 401 }
      );
    }

    const user = VerifyAccessToken(token);

    if (!user) {
      return NextResponse.json(
        { message: "Not authorised" },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // PROJECT ID
    // -----------------------------------------

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { message: "Project ID is required" },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // OWNER ID
    // -----------------------------------------

    const body = await req.json();

    const { ownerId } = body;

    if (!ownerId) {
      return NextResponse.json(
        { message: "ownerId is required" },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // PROJECT PATH
    // -----------------------------------------

    const projectPath = path.resolve(
      process.cwd(),
      "WORKSPACE",
      ownerId,
      id
    );

    console.log("=================================");
    console.log("CWD:", process.cwd());
    console.log("OWNER ID:", ownerId);
    console.log("PROJECT ID:", id);
    console.log("PROJECT PATH:", projectPath);
    console.log("=================================");

    // -----------------------------------------
    // CHECK DIRECTORY
    // -----------------------------------------

    let stat;

    try {
      stat = await fs.stat(projectPath);
    } catch (error) {
      console.error(
        "Project directory does not exist:",
        projectPath,
        error
      );

      return NextResponse.json(
        {
          message: "Project directory not found",
          path: projectPath,
        },
        { status: 404 }
      );
    }

    if (!stat.isDirectory()) {
      return NextResponse.json(
        {
          message: "Project path is not a directory",
          path: projectPath,
        },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // READ PROJECT
    // -----------------------------------------

    const files = await readDirectory(projectPath);

    console.log(
      `Successfully read ${files.length} root entries`
    );

    return NextResponse.json(
      {
        success: true,
        projectId: id,
        ownerId,
        path: projectPath,
        files,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("FILES API ERROR:", error);

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