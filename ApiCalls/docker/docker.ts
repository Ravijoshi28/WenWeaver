import type { SavePlan } from "@/lib/save-plan";
import { measureOperation } from "@/lib/client-performance";
import { isAxiosError } from "axios";
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
  files: FileNode[],
  plan?: SavePlan,
): Promise<SaveFileResponse> {
  if (!ownerId) {
    throw new Error("ownerId is required.");
  }

  if (!id) {
    throw new Error("projectId is required.");
  }

  if (!Array.isArray(files)) {
    throw new Error("Project files are required.");
  }

  const res = await measureOperation("webweaver:save-request", () => AxiosInstance.post<SaveFileResponse>(
    "/file/save",
    {
      ownerId,
      id,
      files: plan?.files ?? files,
      mode: plan?.mode ?? "full",
      deletedPaths: plan?.deletedPaths ?? [],
    }
  ));

  if (!res.data.success) throw new Error(res.data.message || "Save failed.");
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

  try {
    // ---------------------------------------------------
    // Send files to Next.js API
    // ---------------------------------------------------

    const res =
      await measureOperation("webweaver:preview-request", () => AxiosInstance.post<PreviewResponse>(
        "/file/preview",
        {
          projectId,
          files,
        }
      ));

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

    return data;
  } catch (error: unknown) {
    console.error("Operation failed in ApiCalls/docker/docker.ts.");

    // Axios error response
    const message = isAxiosError<{ message?: string }>(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error ? error.message : "Failed to start preview.";

    throw new Error(message);
  }
}
