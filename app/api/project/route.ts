
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

    // =================================================
    // DEVELOPMENT
    // =================================================

    if (!isProduction) {

      // -----------------------------------------
      // CREATE LOCAL WORKSPACE
      // -----------------------------------------

      const projectPath =
        await createProjectWorkspace(
          user.id,
          project.id,
          "nextjs"
        );

      // -----------------------------------------
      // UPLOAD LOCAL WORKSPACE TO SUPABASE
      // -----------------------------------------

      if (useSupabase) {

        await uploadProjectToSupabase(
          projectPath,
          user.id,
          project.id
        );

      }
    }

    // =================================================
    // PRODUCTION / RENDER
    // =================================================

    else {

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

      // -----------------------------------------
      // UPLOAD FILES DIRECTLY TO SUPABASE
      // -----------------------------------------

      await uploadProjectToSupabase(
        project.id,
        user.id,
        files
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
    console.error("Operation failed in app/api/project/route.ts.");

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
