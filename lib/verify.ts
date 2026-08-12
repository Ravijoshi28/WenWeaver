import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET!;

export function VerifyAccessToken(token: string) {
  const payload = jwt.verify(token, secret) as {
    id: string;
    type: "access";
  };

  if (payload.type !== "access") {
    throw new Error("Invalid access token");
  }

  return payload;
}


export function VerifyRefreshToken(token: string) {
  const payload = jwt.verify(token, secret) as {
    id: string;
    type: "refresh";
  };

  if (payload.type !== "refresh") {
    throw new Error("Invalid refresh token");
  }

  return payload;
}