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

async function readDirectory(
  dir: string,
  relativePath = ""
): Promise<FileNode[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  });

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const filePath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: filePath,
        type: "folder",
        children: await readDirectory(fullPath, filePath),
      });
    } else {
      const content = await fs.readFile(fullPath, "utf-8");

      nodes.push({
        name: entry.name,
        path: filePath,
        type: "file",
        content,
      });
    }
  }

  return nodes;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
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

    // Get project ID
    const { id } = await params;

    // Get owner ID
    const { ownerId } = await req.json();

    // IMPORTANT:
    // This must match the location where your project generator
    // actually creates the files.
    const projectPath = path.join(
      process.cwd(),
      "WORKSPACE",
      ownerId,
      id
    );

    console.log("Reading project files from:", projectPath);

    // Check directory exists
    try {
      await fs.access(projectPath);
    } catch {
      return NextResponse.json(
        {
          message: "Project directory not found",
          path: projectPath,
        },
        { status: 404 }
      );
    }

    // Read files
    const files = await readDirectory(projectPath);

    return NextResponse.json(
      {
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