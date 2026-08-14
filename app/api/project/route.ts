
import { prisma } from "@/lib/prisma";
import { VerifyAccessToken } from "@/lib/verify";
import {
  createProjectWorkspace,
  generateProjectFiles,
} from "@/src/lib/defaultProject";
import { uploadProjectToSupabase } from "@/lib/uploadProject";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { createProjectRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    // -----------------------------------------
    // AUTHENTICATION
    // -----------------------------------------

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

    console.log("USER ID:", user.id);
    const rateLimit=await createProjectRateLimit.limit(
      `createProject:${user.id}`
    )

    if (!rateLimit.success) {
  return NextResponse.json(
    {
      error:
        "Too many preview requests. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit":
          String(rateLimit.limit),

        "X-RateLimit-Remaining":
          String(rateLimit.remaining),

        "X-RateLimit-Reset":
          String(rateLimit.reset),
      },
    }
  );
}

    // -----------------------------------------
    // REQUEST BODY
    // -----------------------------------------

    const body = await req.json();

    const { projectName } = body;

    if (
      !projectName ||
      typeof projectName !== "string" ||
      projectName.trim().length === 0
    ) {
      return NextResponse.json(
        {
          message: "Project Name not provided",
        },
        {
          status: 400,
        }
      );
    }

    const cleanProjectName = projectName.trim();

    // -----------------------------------------
    // STORAGE CONFIGURATION
    // -----------------------------------------

    const isProduction =
      process.env.NODE_ENV === "production";

    const useSupabase =
      process.env.USE_SUPABASE_STORAGE === "true";

    console.log(
      "NODE_ENV:",
      process.env.NODE_ENV
    );

    console.log(
      "USE_SUPABASE_STORAGE:",
      useSupabase
    );

    // -----------------------------------------
    // CREATE DATABASE PROJECT
    // -----------------------------------------

    const project = await prisma.project.create({
      data: {
        name: cleanProjectName,
        ownerId: user.id,
        template: "nextjs",
        language: "typescript",
        isPublic: false,
      },
    });

    console.log(
      "PROJECT CREATED:",
      project.id
    );

    // =================================================
    // DEVELOPMENT
    // =================================================

    if (!isProduction) {
      console.log(
        "DEVELOPMENT MODE: creating local workspace"
      );

      // -----------------------------------------
      // CREATE LOCAL WORKSPACE
      // -----------------------------------------

      const projectPath =
        await createProjectWorkspace(
          user.id,
          project.id,
          "nextjs"
        );

      console.log(
        "LOCAL WORKSPACE CREATED:",
        projectPath
      );

      // -----------------------------------------
      // UPLOAD LOCAL WORKSPACE TO SUPABASE
      // -----------------------------------------

      if (useSupabase) {
        console.log(
          "UPLOADING LOCAL WORKSPACE TO SUPABASE:"
        );

        console.log(
          "PROJECT PATH:",
          projectPath
        );

        await uploadProjectToSupabase(
          projectPath,
          user.id,
          project.id
        );

        console.log(
          "PROJECT UPLOADED TO SUPABASE"
        );
      }
    }

    // =================================================
    // PRODUCTION / RENDER
    // =================================================

    else {
      console.log(
        "PRODUCTION MODE: generating project directly"
      );

      // -----------------------------------------
      // PRODUCTION REQUIRES SUPABASE
      // -----------------------------------------

      if (!useSupabase) {
        throw new Error(
          "USE_SUPABASE_STORAGE must be true in production"
        );
      }

      // -----------------------------------------
      // GENERATE PROJECT FILES IN MEMORY
      // -----------------------------------------

      const files =
        await generateProjectFiles("nextjs");

      console.log(
        `Generated ${files.length} project files`
      );

      // -----------------------------------------
      // UPLOAD FILES DIRECTLY TO SUPABASE
      // -----------------------------------------

      await uploadProjectToSupabase(
        project.id,
        user.id,
        files
      );

      console.log(
        "PROJECT UPLOADED DIRECTLY TO SUPABASE"
      );
    }

    // -----------------------------------------
    // RESPONSE
    // -----------------------------------------

    return NextResponse.json(
      {
        message:
          "Project created successfully",

        project,

        storage: isProduction
          ? "supabase"
          : useSupabase
            ? "local + supabase"
            : "local",
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "CREATE PROJECT ERROR:",
      error
    );

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}
