import jwt from "jsonwebtoken"

const Secret=process.env.JWT_SECRET!;

    if(!Secret){
        throw new Error("JWT_SECRET is not defined");
    }

export function AccessToken(id:string,){
    return jwt.sign({id,type:"access"},Secret,{
        expiresIn:"10m"
    })
}

export function RefreshToken(id:string,){
    return jwt.sign({id,type:"refresh"},Secret,{
        expiresIn:"7d"
    })
}