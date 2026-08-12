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
    console.log(res);
    return res.data;

}

export async  function SignUpCall(data:Logindata){

    const res=await AxiosInstance.post('/auth/signup',data)
   
    console.log(res);
    return res;

}

export async function VerifyCall(verify:verification){

    const res=await AxiosInstance.post('/resend/verify',verify)
   
    console.log(res);
    return res.data;

}

export async function sendOTP(email:string){
    console.log(email)
    const res=await AxiosInstance.post('/resend',{email})
   
    console.log(res);
    return res.data;

}