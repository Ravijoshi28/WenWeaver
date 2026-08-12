import AxiosInstance from "@/lib/axiosInstance";

export type FileNode = {
  name: string;
  path?: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

export type DockerRunResponse = {
  previewUrl: string;
  message?: string;
};

export async function runDockerContainer(
  ownerId: string,
  id: string,
  files: FileNode[]
): Promise<DockerRunResponse> {
  const res = await AxiosInstance.post<DockerRunResponse>("/docker/run", {
    ownerId,
    id,
    files,
  });

  return res.data;
}