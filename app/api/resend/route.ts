import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/Resend";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req:NextRequest) {

  try {
    const otp = crypto.randomInt(100000, 999999).toString();
    const {email}=await req.json()

  const otpHash = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  await resend.emails.send({
    from: "joshiravi96123@gmail.com",
    to: email,
    subject: "Verify your account",
    html: `
      <h2>Your verification code:</h2>
      <h1>${otp}</h1>
      <p>This code expires in 5 minutes.</p>
    `,
  });

  await prisma.otp.create({
    data: {
      otpHash,
      email,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

    return NextResponse.json({message:"OPT sent to your mail",
        redirect:"/verify-email"
    })
  } catch  {

    return NextResponse.json({message:"OPT not sent"})

  }
}