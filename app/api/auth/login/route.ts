import { AccessToken, RefreshToken } from "@/lib/cookieGenerator";
import { prisma } from "@/lib/prisma";
import { authRateLimit } from "@/lib/rate-limiter";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const {  email, password } = await req.json();

    if ( !email || !password) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }
   const forwardedFor = req.headers.get("x-forwarded-for");

const ip =
  forwardedFor?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

  const normalizedEmail =
  email.trim().toLowerCase()

    const emailLimit =
  await authRateLimit.limit(
    `login:email:${normalizedEmail}`
  );

const ipLimit =
  await authRateLimit.limit(
    `login:ip:${ip}`
  );

    if (!emailLimit.success || !ipLimit.success) {
  return NextResponse.json(
    {
      error:
        "Too many preview requests. Please try again later.",
    }

  );
}

    const user=await prisma.user.findUnique({
        where:{
            email:normalizedEmail
        }
    })

    if(!user){
         return NextResponse.json(
        { message: "Email or password Wrong" },
        { status: 400 }
      );
    }

    if (!user.isVerified) {
  return NextResponse.json(
    { message: "Please verify your email first" },
    { status: 403 }
  );
}

    const pepper = process.env.PEPPERED_PASS;

    if (!pepper) {
      throw new Error("PEPPERED_PASS is missing");
    }

    const pepperedPassword = password + pepper;
    const realPass=user.password;
   const checkedPass=await bcrypt.compare(pepperedPassword,realPass)

   if(!checkedPass){
      return NextResponse.json(
        { message: "Email or password Wrong" },
        { status: 400 }
      );
   }

   const accessToken = AccessToken(user.id);
   const refreshToken = RefreshToken(user.id);

    await prisma.user.update({
  where: {
    email,
  },
  data: {
    refreshToken,
    isOnline: true,
  },
});

   const cookieStore = await cookies();

    cookieStore.set("accessToken", accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 60 * 10,
  });

cookieStore.set("refreshToken", refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  path:"/api/auth/refresh",
  sameSite: "strict",
  maxAge: 60 * 60 * 24 * 7,
});

    return NextResponse.json(
      {
        message: "Logged Up Successful ",
        User:user
      },
      { status: 201 }
    );

  } catch (error) {

    return NextResponse.json(
      { message: error },
      { status: 500 }
    );
  }
}