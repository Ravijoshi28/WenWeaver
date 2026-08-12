import { seedTemplates } from "@/templates/nextjs/next.template";
import fs from "fs/promises";
import path from "path";

const WORKSPACE_DIR = path.resolve(process.cwd(), "workspace");

export async function createProjectWorkspace(
  userId: string,
  projectId: string,
  template: string
): Promise<string> {

  const projectPath = path.resolve(
    WORKSPACE_DIR,
    userId,
    projectId
  );

  await fs.mkdir(projectPath, {
    recursive: true,
  });

  try {

    if (template === "nextjs") {
      await seedTemplates(projectPath);
    }

    return projectPath;

  } catch (error) {

    await fs.rm(projectPath, {
      recursive: true,
      force: true,
    });

    throw new Error(
      `Failed to initialize workspace: ${(error as Error).message}`
    );
  }
}