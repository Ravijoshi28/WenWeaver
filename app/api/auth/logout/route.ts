import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();

  cookieStore.delete({ name: "accessToken", path: "/" });
  cookieStore.delete({ name: "refreshToken", path: "/api/auth/refresh" });

  
  return NextResponse.json({
    message: "Logged out successfully",
  });
}
