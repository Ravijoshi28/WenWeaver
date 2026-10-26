import { NextRequest, NextResponse } from "next/server";
import { VerifyRefreshToken } from "@/lib/verify";
import { prisma } from "@/lib/prisma";
import { AccessToken } from "@/lib/cookieGenerator";

function unauthorisedResponse() {
  const response = NextResponse.json(
    { message: "Your session has expired. Please sign in again." },
    { status: 401 }
  );

  response.cookies.set("accessToken", "", { path: "/", maxAge: 0 });
  response.cookies.set("refreshToken", "", {
    path: "/api/auth/refresh",
    maxAge: 0,
  });

  return response;
}

export async function POST(req: NextRequest) {
  try {
    const refreshToken =
      req.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return unauthorisedResponse();
    }

    const payload = VerifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return unauthorisedResponse();
    }

    const newAccessToken = AccessToken(user.id);

    const response = NextResponse.json({ message: "Access token refreshed" });

    response.cookies.set(
      "accessToken",
      newAccessToken,
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10,
        path: "/",
      }
    );

    return response;

  } catch {
    return unauthorisedResponse();
  }
}
