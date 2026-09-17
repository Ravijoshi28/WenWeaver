import AxiosInstance from "@/lib/axiosInstance"

interface Logindata{
    email:string,
    password:string
}

interface verification{
    otp:string,
    email:string
}

export async  function LoginCall(formData:Logindata){

    const res=await AxiosInstance.post('/auth/login',formData)

    return res.data;

}

export async  function SignUpCall(data:Logindata){

    const res=await AxiosInstance.post('/auth/signup',data)

    return res;

}

export async function VerifyCall(verify:verification){

    const res=await AxiosInstance.post('/resend/verify',verify)

    return res.data;

}

export async function sendOTP(email:string){

    const res=await AxiosInstance.post('/resend',{email})

    return res.data;

}