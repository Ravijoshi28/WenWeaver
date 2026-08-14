import { prisma } from "@/lib/prisma";
import { generalRateLimit } from "@/lib/rate-limiter";
import { VerifyAccessToken } from "@/lib/verify";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "Not authorised" },
        { status: 401 }
      );
    }

    const authenticatedUser = VerifyAccessToken(token);

    if (!authenticatedUser) {
      return NextResponse.json(
        { message: "Not authorised" },
        { status: 401 }
      );
    }

    const rateLimit=await generalRateLimit.limit(
      `inviteUser:${authenticatedUser.id}`
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


    const { user, projectId } = await req.json();

    if (!user.email?.trim() || !projectId?.trim()) {
      return NextResponse.json(
        { message: "User or project is not selected" },
        { status: 400 }
      );
    }

    // Find the user you want to add
    const invitedUser = await prisma.user.findUnique({
      where: {
        email: user.email.trim(),
      },
    });

    if (!invitedUser) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // Check that the project exists
    const project = await prisma.project.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      return NextResponse.json(
        { message: "Project not found" },
        { status: 404 }
      );
    }

    // Check that the authenticated user owns the project
    if (project.ownerId !== authenticatedUser.id) {
      return NextResponse.json(
        { message: "You do not have permission to add members" },
        { status: 403 }
      );
    }

    // Don't allow the owner to add themselves as collaborator
    if (invitedUser.id === project.ownerId) {
      return NextResponse.json(
        { message: "Project owner is already a member" },
        { status: 400 }
      );
    }

    // Check whether already a collaborator
    const alreadyMember = await prisma.collaborator.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: invitedUser.id,
        },
      },
    });

    if (alreadyMember) {
      return NextResponse.json(
        { message: "User is already a member" },
        { status: 409 }
      );
    }

    const collaborator = await prisma.collaborator.create({
      data: {
        projectId,
        userId: invitedUser.id,
        role: user.role ?? "VIEWER",
      },
    });

    return NextResponse.json(
      {
        message: "User added successfully",
        collaborator,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Add collaborator error:", error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}