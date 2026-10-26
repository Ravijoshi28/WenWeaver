import { Sandbox } from "@vercel/sandbox";
import { NextRequest, NextResponse } from "next/server";
import {previewRateLimit} from "@/lib/rate-limiter/index";
import { VerifyAccessToken } from "@/lib/verify";
import { cookies } from "next/headers";

export const runtime = "nodejs";
// Dependency installation and Next.js startup can exceed Vercel's short
// default function duration. The platform still applies the deployment's cap.
export const maxDuration = 300;

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

function sandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  // Vercel deployments receive an OIDC token automatically. The explicit
  // credentials make the route work on other production hosts as well.
  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }

  return {};
}

function hasSandboxCredentials() {
  return Boolean(
    process.env.VERCEL_URL ||
      process.env.VERCEL_OIDC_TOKEN ||
      (process.env.VERCEL_TOKEN &&
        process.env.VERCEL_TEAM_ID &&
        process.env.VERCEL_PROJECT_ID)
  );
}

function safeFailureReason(value: unknown, fallback: string) {
  const detail =
    value instanceof Error ? value.message : typeof value === "string" ? value : "";

  if (!detail) return fallback;

  return detail
    .replace(/((?:token|authorization|password)\s*[=:]\s*)\S+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

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
  const started = performance.now();
  let stage = started;
  const timings: Record<string, number> = {};
  const finishStage = (name: string) => {
    const now = performance.now();
    timings[name] = Number((now - stage).toFixed(2));
    stage = now;
  };

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

        let user: { id: string; type: "access" };

        try {
          user = VerifyAccessToken(token);
        } catch {
          return NextResponse.json(
            {
              message: "Your session has expired. Please sign in again.",
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
    },
    { status: 429 }
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

    // Do not let the SDK fall back to its interactive device-login flow in a
    // server request. It cannot be completed there and produces the opaque
    // "Failed to parse token response" error.
    if (!hasSandboxCredentials()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Vercel Sandbox is not configured. Set VERCEL_OIDC_TOKEN, or VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.",
        },
        { status: 503 }
      );
    }

    // ==================================================
    // CREATE SANDBOX
    // ==================================================

    finishStage("validation");
    sandbox =
      await Sandbox.create({
        runtime: "node24",

        ...sandboxCredentials(),

        timeout:
          1000 * 60 * 10,

        ports: [3000],

        persistent: false,
      });

    // ==================================================
    // WRITE FILES
    // ==================================================

    finishStage("provision");
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

    finishStage("writeFiles");
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
          reason: safeFailureReason(packageStderr, "package.json could not be read."),
        },
        { status: 500 }
      );
    }

    // ==================================================
    // INSTALL DEPENDENCIES
    // ==================================================

    finishStage("packageCheck");
    const install =
      await sandbox.runCommand({
        cmd: "npm",

        args: [
          "install",
          // Existing user projects may have an older Next.js package manifest
          // with a newer React range. npm otherwise stops on that peer warning
          // before the preview server can be started.
          "--legacy-peer-deps",
          "--no-audit",
          "--no-fund",
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
            "Dependency installation failed",

          reason: safeFailureReason(
            installStderr || installStdout,
            "npm install exited with a non-zero status."
          ),

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

    finishStage("install");

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
        "--fail",
        "--silent",
        "--output",
        "/dev/null",
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

finishStage("startup");
timings.total = Number((performance.now() - started).toFixed(2));
return NextResponse.json({
  timingsMs: timings,
  success: true,

  projectId,

  previewUrl,
}, { headers: { "Server-Timing": Object.entries(timings).map(([name, duration]) => `${name};dur=${duration}`).join(", ") } });

  } catch (error) {
    // ==================================================
    // GLOBAL ERROR
    // ==================================================

    console.error("Preview generation failed.", error);

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

    const message =
      error instanceof Error &&
      error.message.includes("Vercel authorization server")
        ? "Vercel Sandbox authentication failed. Refresh VERCEL_OIDC_TOKEN or configure VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID."
        : "Preview failed. Please try again.";

    const reason = safeFailureReason(
      error,
      "The preview service did not return an error detail."
    );

    return NextResponse.json(
      {
        success: false,

        message,
        reason,
      },
      { status: 500 }
    );
  }
}
