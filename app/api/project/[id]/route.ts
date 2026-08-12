import { prisma } from "@/lib/prisma";
import { VerifyAccessToken } from "@/lib/verify";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: {
        id: id,
      },
    });

    if (!project || project.ownerId !== user.id) {
      return NextResponse.json(
        { message: "Not authorised to delete this project" },
        { status: 403 }
      );
    }

    await prisma.project.delete({
      where: {
        id: id,
      },
    });

    const pathToProject = path.join(
      process.cwd(),
      "WORKSPACE",
      user.id,
      id
    );

    await fs.rm(pathToProject, {
      recursive: true,
      force: true,
    });

    return NextResponse.json(
      { message: "Project deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
  }
}