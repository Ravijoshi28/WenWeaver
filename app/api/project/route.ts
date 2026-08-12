import { prisma } from "@/lib/prisma";
import { VerifyAccessToken } from "@/lib/verify";
import { createProjectWorkspace } from "@/src/lib/defaultProject";
import { uploadProjectToSupabase } from "@/lib/uploadProject";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    // -----------------------------------------
    // AUTHENTICATION
    // -----------------------------------------

    const cookieStore = await cookies();

    const token =
      cookieStore.get("accessToken")?.value;

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

    // -----------------------------------------
    // REQUEST BODY
    // -----------------------------------------

    const { projectName } = await req.json();

    if (!projectName) {
      return NextResponse.json(
        {
          message: "Project Name not provided",
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------------------
    // CREATE DATABASE PROJECT
    // -----------------------------------------

    const project = await prisma.project.create({
      data: {
        name: projectName,
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

    // -----------------------------------------
    // CREATE LOCAL WORKSPACE
    // -----------------------------------------

    await createProjectWorkspace(
      user.id,
      project.id,
      "nextjs"
    );

    console.log(
      "LOCAL WORKSPACE CREATED:",
      user.id,
      project.id
    );

    // -----------------------------------------
    // UPLOAD TO SUPABASE IN PRODUCTION
    // -----------------------------------------

    const useSupabase =
      process.env.USE_SUPABASE_STORAGE === "true";

    if (useSupabase) {
      const projectPath = path.resolve(
        process.cwd(),
        "WORKSPACE",
        user.id,
        project.id
      );

      console.log(
        "Uploading project to Supabase:",
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

    // -----------------------------------------
    // RESPONSE
    // -----------------------------------------

    return NextResponse.json(
      {
        message: "Project created successfully",
        projects: project,
        storage: useSupabase
          ? "supabase"
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