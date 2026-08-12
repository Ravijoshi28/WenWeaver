import { prisma } from "@/lib/prisma";
import { VerifyAccessToken } from "@/lib/verify";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
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
    const projects = await prisma.project.findMany({
  where: {
    OR: [
      // Projects owned by the user
      {
        ownerId: user.id,
      },

      // Projects where the user is a collaborator
      {
        collaborators: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  },
});

    


    if (projects.length === 0) {
      return NextResponse.json(
        {
          message: "No project found",
          projects: [],
        },
        {
          status: 200,
        }
      );
    }


    return NextResponse.json(
      {
        message: "Project fetched",
        projects,
      },
      {
        status: 200,
      }
    );


  } catch (error) {
    console.log(error);

    return NextResponse.json(
      {
        message: "Something went wrong",
        projects: [],
      },
      {
        status: 500,
      }
    );
  }
}