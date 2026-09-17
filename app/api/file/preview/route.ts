import { Sandbox } from "@vercel/sandbox";
import { NextRequest, NextResponse } from "next/server";
import {previewRateLimit} from "@/lib/rate-limiter/index";
import { VerifyAccessToken } from "@/lib/verify";
import { cookies } from "next/headers";

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
    if (!file?.name) {
      console.warn("Operation failed in app/api/file/preview/route.ts.");
      continue;
    }

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
// POST /api/file/preview
// ======================================================

export async function POST(
  req: NextRequest
) {
  let sandbox: Sandbox | undefined;

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

   const rateLimit = await previewRateLimit.limit(
  `preview:user:${user.id}`
);
      if(!rateLimit.success){
  return NextResponse.json(
    {
      error:
        "Too many preview requests. Please try again later.",
    }

  );
}

    // ==================================================
    // READ REQUEST
    // ==================================================

    const body = await req.json();

    const projectId =
      body?.projectId as string | undefined;

    const files =
      body?.files as FileNode[] | undefined;

    // ==================================================
    // VALIDATION
    // ==================================================

    if (!projectId) {
      console.error(
        "❌ projectId is missing"
      );

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
      console.error(
        "❌ No project files received"
      );

      return NextResponse.json(
        {
          success: false,
          message: "files are required",
        },
        { status: 400 }
      );
    }

    // ==================================================
    // FLATTEN FILES
    // ==================================================

    const flattened =
      flattenFiles(files);

    if (flattened.length === 0) {
      console.error(
        "❌ Flattening produced zero files"
      );

      return NextResponse.json(
        {
          success: false,
          message: "No valid files received",
        },
        { status: 400 }
      );
    }

    // ==================================================
    // CREATE SANDBOX
    // ==================================================

    sandbox =
      await Sandbox.create({
        runtime: "node24",

        timeout:
          1000 * 60 * 10,

        ports: [3000],

        persistent: false,
      });

    // ==================================================
    // WRITE FILES
    // ==================================================

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

    // ==================================================
    // CHECK PACKAGE.JSON
    // ==================================================

    const packageCheck =
      await sandbox.runCommand({
        cmd: "cat",

        args: [
          "package.json",
        ],

        cwd:
          "/vercel/sandbox",
      });


    const packageStderr =
      await packageCheck.stderr();

    if (packageStderr) {
      console.error("Operation failed in app/api/file/preview/route.ts.");
    }

    if (
      packageCheck.exitCode !== 0
    ) {
      console.error(
        "❌ package.json could not be read"
      );

      await sandbox.stop();

      sandbox = undefined;

      return NextResponse.json(
        {
          success: false,
          message:
            "package.json is missing or invalid",
          stderr:
            packageStderr,
        },
        { status: 500 }
      );
    }

    // ==================================================
    // INSTALL DEPENDENCIES
    // ==================================================

    const install =
      await sandbox.runCommand({
        cmd: "npm",

        args: [
          "install",
        ],

        cwd:
          "/vercel/sandbox",
      });

    const installStdout =
      await install.stdout();

    const installStderr =
      await install.stderr();

    if (
      install.exitCode !== 0
    ) {
      console.error(
        "❌ npm install FAILED"
      );

      await sandbox.stop();

      sandbox = undefined;

      return NextResponse.json(
        {
          success: false,

          message:
            "npm install failed",

          exitCode:
            install.exitCode,

          stdout:
            installStdout,

          stderr:
            installStderr,
        },
        { status: 500 }
      );
    }

    // ==================================================
    // CHECK NEXT COMMAND
    // ==================================================

    const nextVersion =
      await sandbox.runCommand({
        cmd: "npx",

        args: [
          "next",
          "--version",
        ],

        cwd:
          "/vercel/sandbox",
      });

    const nextStdout =
      await nextVersion.stdout();

    const nextStderr =
      await nextVersion.stderr();

    if (
      nextVersion.exitCode !== 0
    ) {
      console.error(
        "❌ Next.js is not executable"
      );

      await sandbox.stop();

      sandbox = undefined;

      return NextResponse.json(
        {
          success: false,

          message:
            "Next.js installation is invalid",

          stdout:
            nextStdout,

          stderr:
            nextStderr,
        },
        { status: 500 }
      );
    }

    // ======================================================
// START NEXT.JS
// ======================================================

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

  cwd: "/vercel/sandbox",

  detached: true,
});

// ======================================================
// WAIT FOR SERVER
// ======================================================

let serverReady = false;

for (let attempt = 1; attempt <= 15; attempt++) {

  try {
    const check = await sandbox.runCommand({
      cmd: "curl",

      args: [
        "-I",
        "--max-time",
        "2",
        "http://127.0.0.1:3000",
      ],

      cwd: "/vercel/sandbox",
    });

    if (check.exitCode === 0) {
      serverReady = true;

      break;
    }
  } catch {
    // Retry while the development server is starting.
  }

  await new Promise((resolve) =>
    setTimeout(resolve, 1000)
  );
}

// ======================================================
// SERVER DID NOT START
// ======================================================

if (!serverReady) {
  console.error(
    "❌ Next.js did not start listening on port 3000"
  );

  await sandbox.stop();

  sandbox = undefined;

  return NextResponse.json(
    {
      success: false,

      message:
        "Next.js failed to start on port 3000",
    },
    { status: 500 }
  );
}

// ======================================================
// CREATE PREVIEW URL
// ======================================================

const previewUrl =
  sandbox.domain(3000);

// ======================================================
// RETURN
// ======================================================

return NextResponse.json({
  success: true,

  projectId,

  previewUrl,
});

  } catch (error) {
    // ==================================================
    // GLOBAL ERROR
    // ==================================================

    console.error("Preview generation failed.");

    // ==================================================
    // CLEANUP
    // ==================================================

    if (sandbox) {

      try {
        await sandbox.stop();

      } catch  {
        console.error("Operation failed in app/api/file/preview/route.ts.");
      }
    }

    return NextResponse.json(
      {
        success: false,

        message: "Preview failed. Please try again.",
      },
      { status: 500 }
    );
  }
}