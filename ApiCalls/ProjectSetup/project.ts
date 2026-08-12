import AxiosInstance from "@/lib/axiosInstance";
interface User{
  email:string,
  role:string
}
interface AddUserPayload {
  user: User;
  projectId: string;
}


export async function CreateProject(pName: string) {
  const res = await AxiosInstance.post("/project", {
    projectName: pName,
  });

  return res;
}

  export async function GetProject() {
 
    const res = await AxiosInstance.get("/project/GetProject");
    
    return res.data;
}

export async function GetProjectFolder(ownerId:string,id:string){
  console.log("working")
  const res=await AxiosInstance.post(`/project/${id}/files`,{ownerId})
  console.log(res);
  return res.data
}

export async function Adduser({user,projectId}:AddUserPayload){
  const res=await AxiosInstance.post('/project/inviteUser',{user,projectId});
  return res.data
} 

export async function DeleteProject(id:string){
  const res=await AxiosInstance.delete(`/project/${id}`);
  return res.data
}