import { prisma } from "@/lib/prisma";
import { VerifyAccessToken } from "@/lib/verify";
import { createProjectWorkspace } from "@/src/lib/defaultProject";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
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
  console.log(user.id)

  try {
    const { projectName } = await req.json();

    if (!projectName) {
      return NextResponse.json(
        { message: "Project Name not provided" },
        { status: 400 }
      );
    }

       
   
       const projects = await prisma.project.create({
      data: {
        name: projectName,
        ownerId: user.id,
        template: "nextjs",
        language: "typescript",
        isPublic: false,
      },
    });

    
 await createProjectWorkspace(
    user.id,
    projects.id,
    "nextjs"
 );




    return NextResponse.json(
      {
        message: "Project created successfully",
        projects,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}