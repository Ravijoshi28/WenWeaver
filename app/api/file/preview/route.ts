import { Sandbox } from "@vercel/sandbox";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type FileNode = {
  name: string;
  path?: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

type FlatFile = {
  path: string;
  content: string;
};

// ======================================================
// FLATTEN FILE TREE
// ======================================================

function flattenFiles(
  files: FileNode[],
  parent = ""
): FlatFile[] {
  const result: FlatFile[] = [];

  for (const file of files) {
    if (!file?.name) continue;

    const currentPath = parent
      ? `${parent}/${file.name}`
      : file.name;

    if (file.type === "folder") {
      if (
        Array.isArray(file.children) &&
        file.children.length > 0
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

    result.push({
      path: currentPath
        .replace(/\\/g, "/")
        .replace(/^\/+/, ""),
      content: file.content ?? "",
    });
  }

  return result;
}

// ======================================================
// POST /api/preview
// ======================================================

export async function POST(
  req: NextRequest
) {
  let sandbox: Sandbox | undefined;

  try {
    // --------------------------------------------------
    // READ REQUEST
    // --------------------------------------------------

    const body = await req.json();

    const projectId =
      body?.projectId as string | undefined;

    const files =
      body?.files as FileNode[] | undefined;

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          message: "projectId is required",
        },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "files are required",
        },
        { status: 400 }
      );
    }

    console.log(
      `🚀 Creating preview: ${projectId}`
    );

    // --------------------------------------------------
    // FLATTEN FILES
    // --------------------------------------------------

    const flattened =
      flattenFiles(files);

    if (flattened.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No valid files received",
        },
        { status: 400 }
      );
    }

    console.log(
      `📁 Files to upload: ${flattened.length}`
    );

    // --------------------------------------------------
    // CREATE VERCEL SANDBOX
    // --------------------------------------------------

    sandbox =
      await Sandbox.create({
        runtime: "node24",

        timeout:
          1000 * 60 * 10,

        ports: [3000],

        persistent: false,
      });

    console.log(
      "📦 Sandbox created"
    );

    // --------------------------------------------------
    // WRITE PROJECT FILES
    // --------------------------------------------------

    await sandbox.writeFiles(
      flattened.map(
        (file) => ({
          path: file.path,

          content:
            Buffer.from(
              file.content,
              "utf8"
            ),
        })
      )
    );

    console.log(
      `📤 Uploaded ${flattened.length} files`
    );

    // --------------------------------------------------
    // INSTALL DEPENDENCIES
    // --------------------------------------------------

    console.log(
      "📦 Running npm install..."
    );

    const install =
      await sandbox.runCommand({
        cmd: "npm",

        args: [
          "install",
        ],

        cwd:
          "/vercel/sandbox",
      });

    if (
      install.exitCode !== 0
    ) {
      const stderr =
        await install.stderr();

      const stdout =
        await install.stdout();

      console.error(
        "npm install failed:",
        stderr
      );

      await sandbox.stop();

      sandbox = undefined;

      return NextResponse.json(
        {
          success: false,

          message:
            "npm install failed",

          stdout,

          stderr,
        },
        { status: 500 }
      );
    }

    console.log(
      "✅ npm install completed"
    );

    // --------------------------------------------------
    // START APPLICATION
    // --------------------------------------------------

    console.log(
      "▶️ Starting Next.js..."
    );

    const start =
      await sandbox.runCommand({
        cmd: "npm",

        args: [
          "run",
          "dev",
          "--",
          "-H",
          "0.0.0.0",
          "-p",
          "3000",
        ],

        cwd:
          "/vercel/sandbox",

        detached: true,
      });

    console.log(
      "▶️ Next.js process started"
    );

    // --------------------------------------------------
    // CHECK START COMMAND
    // --------------------------------------------------

    if (
      start.exitCode !== undefined &&
      start.exitCode !== 0
    ) {
      const stderr =
        await start.stderr();

      console.error(
        "Next.js failed:",
        stderr
      );

      await sandbox.stop();

      sandbox = undefined;

      return NextResponse.json(
        {
          success: false,

          message:
            "Failed to start Next.js",

          stderr,
        },
        { status: 500 }
      );
    }

    // --------------------------------------------------
    // GET PUBLIC PREVIEW URL
    // --------------------------------------------------

    const previewUrl =
      sandbox.domain(3000);

    console.log(
      "================================"
    );

    console.log(
      "🟢 PREVIEW READY"
    );

    console.log(
      `🌐 ${previewUrl}`
    );

    console.log(
      "================================"
    );

    // --------------------------------------------------
    // RETURN
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      projectId,

      previewUrl,
    });

  } catch (error) {
    console.error(
      "❌ Preview error:",
      error
    );

    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {}
    }

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Preview failed",
      },
      { status: 500 }
    );
  }
}