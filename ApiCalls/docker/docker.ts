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
    throw new Error("ownerId is required.");
  }

  if (!id) {
    throw new Error("projectId is required.");
  }

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Project files are required.");
  }

  const res = await AxiosInstance.post<SaveFileResponse>(
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
    throw new Error("projectId is required.");
  }

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Project files are required.");
  }

  console.log(
    `🚀 Starting preview for ${projectId}`
  );

  try {
    // ---------------------------------------------------
    // Send files to Next.js API
    // ---------------------------------------------------

    const res =
      await AxiosInstance.post<PreviewResponse>(
        "/file/preview",
        {
          projectId,
          files,
        }
      );

    // ---------------------------------------------------
    // Axios already parsed JSON
    // ---------------------------------------------------

    const data = res.data;

    // ---------------------------------------------------
    // Validate response
    // ---------------------------------------------------

    if (!data?.success) {
      throw new Error(
        data?.message ||
          "Preview failed."
      );
    }

    if (!data.previewUrl) {
      throw new Error(
        "Preview API did not return a preview URL."
      );
    }

    console.log(
      `🟢 Preview ready: ${data.previewUrl}`
    );

    return data;
  } catch (error: any) {
    console.error(
      "❌ Preview request failed:",
      error
    );

    // Axios error response
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to start preview.";

    throw new Error(message);
  }
}