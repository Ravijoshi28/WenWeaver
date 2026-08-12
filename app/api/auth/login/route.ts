import { AccessToken, RefreshToken } from "@/lib/cookieGenerator";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const {  email, password } = await req.json();
    console.log(email,password)
    if ( !email || !password) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }

    const user=await prisma.user.findUnique({
        where:{
            email:email
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
    console.log("working")
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
       console.log("working2")

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
      console.log("working3")

    cookieStore.set("accessToken", accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 60 * 10,
  });

cookieStore.set("refreshToken", refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 60 * 60 * 24 * 7,
});

    console.log("working4")


    return NextResponse.json(
      {
        message: "Logged Up Successful ",
        User:user
      },
      { status: 201 }
    );

  } catch (error) {
    console.log(error)
    return NextResponse.json(
      { message: error },
      { status: 500 }
    );
  }
}