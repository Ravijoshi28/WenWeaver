import AxiosInstance from "@/lib/axiosInstance";

// =====================================================
// FILE TYPE
// =====================================================

export type FileNode = {
  name: string;
  path?: string;
  type: "file" | "folder";
  content?: string;
  children?: FileNode[];
};

// =====================================================
// SAVE RESPONSE
// =====================================================

export type SaveFileResponse = {
  success?: boolean;
  message?: string;
};

// =====================================================
// PREVIEW RESPONSE
// =====================================================

export type PreviewResponse = {
  success: boolean;
  projectId: string;
  previewUrl: string;
  message?: string;
};

// =====================================================
// SAVE FILES TO SUPABASE
// =====================================================

export async function SaveFile(
  ownerId: string,
  id: string,
  files: FileNode[]
): Promise<SaveFileResponse> {
  if (!ownerId) {
    throw new Error(
      "ownerId is required."
    );
  }

  if (!id) {
    throw new Error(
      "projectId is required."
    );
  }

  if (
    !Array.isArray(files) ||
    files.length === 0
  ) {
    throw new Error(
      "Project files are required."
    );
  }

  const res =
    await AxiosInstance.post<SaveFileResponse>(
      "/file/save",
      {
        ownerId,
        id,
        files,
      }
    );

  return res.data;
}

// =====================================================
// START VERCEL SANDBOX PREVIEW
// =====================================================

export async function runPreview(
  projectId: string,
  files: FileNode[]
): Promise<PreviewResponse> {
  if (!projectId) {
    throw new Error(
      "projectId is required."
    );
  }

  if (
    !Array.isArray(files) ||
    files.length === 0
  ) {
    throw new Error(
      "Project files are required."
    );
  }

  console.log(
    `🚀 Starting preview for ${projectId}`
  );

  // ---------------------------------------------------
  // Send files to Next.js API
  // ---------------------------------------------------

  const res = await fetch(
    "/api/preview",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        projectId,
        files,
      }),
    }
  );

  // ---------------------------------------------------
  // Read response
  // ---------------------------------------------------

  let data:
    | PreviewResponse
    | undefined;

  try {
    data =
      (await res.json()) as PreviewResponse;
  } catch {
    throw new Error(
      "Invalid response from preview API."
    );
  }

  // ---------------------------------------------------
  // Handle HTTP error
  // ---------------------------------------------------

  if (!res.ok) {
    throw new Error(
      data?.message ||
        "Failed to start preview."
    );
  }

  // ---------------------------------------------------
  // Validate response
  // ---------------------------------------------------

  if (
    !data.success ||
    !data.previewUrl
  ) {
    throw new Error(
      data.message ||
        "Preview failed."
    );
  }

  console.log(
    `🟢 Preview ready: ${data.previewUrl}`
  );

  return data;
}