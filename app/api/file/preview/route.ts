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
      console.warn("⚠️ Skipping file without name:", file);
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
// DELAY
// ======================================================

function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
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

    console.log("");
    console.log("========================================");
    console.log("🚀 PREVIEW REQUEST STARTED");
    console.log("========================================");

    // ==================================================
    // READ REQUEST
    // ==================================================

    console.log("📥 Reading request body...");

    const body = await req.json();

    const projectId =
      body?.projectId as string | undefined;

    const files =
      body?.files as FileNode[] | undefined;

    console.log("🆔 Project ID:", projectId);

    console.log(
      "📁 Received file nodes:",
      Array.isArray(files)
        ? files.length
        : "INVALID"
    );

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

    console.log("");
    console.log("📂 Flattening project files...");

    const flattened =
      flattenFiles(files);

    console.log(
      `📁 Flattened files: ${flattened.length}`
    );

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
    // DEBUG FILE LIST
    // ==================================================

    console.log(
      "📋 Files that will be uploaded:"
    );

    for (const file of flattened) {
      console.log(
        `   ${file.path} (${file.content.length} chars)`
      );
    }

    // ==================================================
    // CREATE SANDBOX
    // ==================================================

    console.log("");
    console.log(
      "📦 Creating Vercel Sandbox..."
    );

    sandbox =
      await Sandbox.create({
        runtime: "node24",

        timeout:
          1000 * 60 * 10,

        ports: [3000],

        persistent: false,
      });

    console.log(
      "✅ Sandbox created"
    );

    console.log(
      "🆔 Sandbox ID:",
      sandbox.name
    );

    // ==================================================
    // DEBUG NODE
    // ==================================================

    console.log("");
    console.log(
      "🔍 Checking Sandbox Node version..."
    );

    const nodeVersion =
      await sandbox.runCommand({
        cmd: "node",
        args: ["-v"],
        cwd: "/vercel/sandbox",
      });

    console.log(
      "Node exit code:",
      nodeVersion.exitCode
    );

    console.log(
      "Node stdout:",
      await nodeVersion.stdout()
    );

    console.log(
      "Node stderr:",
      await nodeVersion.stderr()
    );

    // ==================================================
    // DEBUG NPM
    // ==================================================

    console.log("");
    console.log(
      "🔍 Checking npm version..."
    );

    const npmVersion =
      await sandbox.runCommand({
        cmd: "npm",
        args: ["-v"],
        cwd: "/vercel/sandbox",
      });

    console.log(
      "npm exit code:",
      npmVersion.exitCode
    );

    console.log(
      "npm stdout:",
      await npmVersion.stdout()
    );

    console.log(
      "npm stderr:",
      await npmVersion.stderr()
    );

    // ==================================================
    // WRITE FILES
    // ==================================================

    console.log("");
    console.log(
      "📤 Uploading project files..."
    );

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
      `✅ Uploaded ${flattened.length} files`
    );

    // ==================================================
    // CHECK PACKAGE.JSON
    // ==================================================

    console.log("");
    console.log(
      "🔍 Checking package.json..."
    );

    const packageCheck =
      await sandbox.runCommand({
        cmd: "cat",

        args: [
          "package.json",
        ],

        cwd:
          "/vercel/sandbox",
      });

    const packageStdout =
      await packageCheck.stdout();

    const packageStderr =
      await packageCheck.stderr();

    console.log(
      "package.json exit code:",
      packageCheck.exitCode
    );

    console.log(
      "package.json stdout:",
      packageStdout
    );

    if (packageStderr) {
      console.error(
        "package.json stderr:",
        packageStderr
      );
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

    console.log("");
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

    const installStdout =
      await install.stdout();

    const installStderr =
      await install.stderr();

    console.log(
      "----------------------------------------"
    );

    console.log(
      "📦 npm install exit code:",
      install.exitCode
    );

    console.log(
      "📦 npm install STDOUT:"
    );

    console.log(
      installStdout
    );

    console.log(
      "📦 npm install STDERR:"
    );

    console.log(
      installStderr
    );

    console.log(
      "----------------------------------------"
    );

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

    console.log(
      "✅ npm install completed"
    );

    // ==================================================
    // CHECK NEXT COMMAND
    // ==================================================

    console.log("");
    console.log(
      "🔍 Checking Next.js installation..."
    );

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

    console.log(
      "Next version exit code:",
      nextVersion.exitCode
    );

    console.log(
      "Next version stdout:",
      nextStdout
    );

    console.log(
      "Next version stderr:",
      nextStderr
    );

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

console.log("");
console.log("▶️ Starting Next.js...");

console.log("📍 cwd:", "/vercel/sandbox");
console.log("🌐 Host:", "0.0.0.0");
console.log("🔌 Port:", "3000");

const start = await sandbox.runCommand({
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

console.log("▶️ Next.js command started");

console.log(
  "▶️ Initial exit code:",
  start.exitCode
);

// ======================================================
// WAIT FOR SERVER
// ======================================================

console.log(
  "⏳ Waiting for Next.js to start listening..."
);

let serverReady = false;

for (let attempt = 1; attempt <= 15; attempt++) {
  console.log(
    `🔎 Checking port 3000 (${attempt}/15)...`
  );

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

    const stdout =
      await check.stdout();

    const stderr =
      await check.stderr();

    console.log(
      `Port check exit code: ${check.exitCode}`
    );

    console.log(
      "Port check stdout:",
      stdout
    );

    if (stderr) {
      console.log(
        "Port check stderr:",
        stderr
      );
    }

    if (check.exitCode === 0) {
      serverReady = true;

      console.log(
        "✅ Next.js is listening on port 3000"
      );

      break;
    }
  } catch (error) {
    console.log(
      "⚠️ Port check failed:",
      error
    );
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

  // Run a diagnostic command rather than
  // reading stdout/stderr from the detached process.

  console.log(
    "🔍 Running Next.js diagnostic..."
  );

  const diagnostic =
    await sandbox.runCommand({
      cmd: "ps",

      args: ["aux"],

      cwd: "/vercel/sandbox",
    });

  const psOutput =
    await diagnostic.stdout();

  const psError =
    await diagnostic.stderr();

  console.log(
    "PROCESS LIST:"
  );

  console.log(
    psOutput
  );

  if (psError) {
    console.log(
      "PROCESS LIST ERROR:",
      psError
    );
  }

  await sandbox.stop();

  sandbox = undefined;

  return NextResponse.json(
    {
      success: false,

      message:
        "Next.js failed to start on port 3000",

      processList:
        psOutput,
    },
    { status: 500 }
  );
}

// ======================================================
// CREATE PREVIEW URL
// ======================================================

console.log(
  "🌐 Creating Sandbox preview URL..."
);

const previewUrl =
  sandbox.domain(3000);

console.log(
  "========================================"
);

console.log(
  "🟢 PREVIEW READY"
);

console.log(
  "🆔 Sandbox:",
  sandbox.name
);

console.log(
  "🌐 URL:",
  previewUrl
);

console.log(
  "========================================"
);

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

    console.error("");
    console.error(
      "========================================"
    );

    console.error(
      "❌ PREVIEW ROUTE FAILED"
    );

    console.error(
      "========================================"
    );

    console.error(
      "Error:",
      error
    );

    if (
      error instanceof Error
    ) {
      console.error(
        "Error name:",
        error.name
      );

      console.error(
        "Error message:",
        error.message
      );

      console.error(
        "Error stack:",
        error.stack
      );
    }

    // ==================================================
    // CLEANUP
    // ==================================================

    if (sandbox) {
      console.log(
        "🧹 Stopping Sandbox..."
      );

      try {
        await sandbox.stop();

        console.log(
          "✅ Sandbox stopped"
        );
      } catch (stopError) {
        console.error(
          "❌ Failed to stop Sandbox:",
          stopError
        );
      }
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