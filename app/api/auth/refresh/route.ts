import { NextRequest, NextResponse } from "next/server";
import { VerifyRefreshToken } from "@/lib/verify";
import { prisma } from "@/lib/prisma";
import { AccessToken } from "@/lib/cookieGenerator";

export async function POST(req: NextRequest) {
  try {
    const refreshToken =
      req.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.redirect(
        new URL("/login", req.url)
      );
    }

    const payload = VerifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return NextResponse.redirect(
        new URL("/login", req.url)
      );
    }

    const newAccessToken = AccessToken(user.id);

    const response = NextResponse.redirect(
      new URL("/main", req.url)
    );

    response.cookies.set(
      "accessToken",
      newAccessToken,
      {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        maxAge: 60 * 10,
      }
    );

    return response;

  } catch {

    return NextResponse.redirect(
      new URL("/login", req.url)
    );
  }
}