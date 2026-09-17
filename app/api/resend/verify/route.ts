import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req:NextRequest){

    try{
        const {otp,email,}=await req.json()

        const enteredOtpHash = crypto
  .createHash("sha256")
  .update(otp)
  .digest("hex");

  //no domain so it will verify any email with and any random otp

   await prisma.user.update({
            where:{
                email
            },
            data:{
                isVerified:true
            }
        })

        //will change when get a domain

        const verified=await prisma.otp.findFirst({
            where:{
                otpHash:enteredOtpHash
            }
        })

        if(!verified){
            return NextResponse.json({message:"otp is wrong"},{status:400})
        }

         if (verified.expiresAt < new Date()) {

            await prisma.otp.delete({
      where: {
        id: verified.id,
      },
    });

      return NextResponse.json(
        { message: "OTP expired" },
        { status: 400 }
      );
    }

        await prisma.user.update({
            where:{
                email
            },
            data:{
                isVerified:true
            }
        })
        // place the top code here when u get a domain for verifying

        // / 
        /// \
        // |      above this comment
        await prisma.otp.delete({
      where: {
        id: verified.id,
      },
    });

        return NextResponse.json({message:"user verified"},{status:200})
    }
    catch{

         return NextResponse.json({message:"Server error"},{status:400})

    }
}