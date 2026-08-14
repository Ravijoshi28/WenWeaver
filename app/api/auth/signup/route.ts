import { prisma } from "@/lib/prisma";
import { authRateLimit } from "@/lib/rate-limiter";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

const SALT_ROUNDS = 10;

export async function POST(req: NextRequest) {

    const forwardedFor = req.headers.get("x-forwarded-for");

    const ip =
      forwardedFor?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

      const rateLimit=await authRateLimit.limit(
        `signup:ip:${ip}`
      )

      if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          "Too many signIn requests. Please try again later.",
      }
    );
  }

  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }

    const pepper = process.env.PEPPERED_PASS;

    if (!pepper) {
      throw new Error("PEPPERED_PASS is missing");
    }

    const pepperedPassword = password + pepper;

    const hashedPassword = await bcrypt.hash(
      pepperedPassword,
      SALT_ROUNDS
    );

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        createdAt:new Date()
      },
    });

    return NextResponse.json(
      {
        message: "Signed Up Successful Check your mail to verify",
      },
      { status: 201 }
    );

  } catch (error) {
    console.log(error)
    return NextResponse.json(   
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}