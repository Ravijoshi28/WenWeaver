import type { FileTreeNode } from "./file-tree";

export type SavedFile = { name: string; path: string; type: "file"; content: string };
export type SavePlan = { mode: "full" | "patch"; files: SavedFile[]; deletedPaths: string[] };

export function snapshotFiles(nodes: FileTreeNode[], parent = "", result = new Map<string, string>()) {
  for (const node of nodes) {
    const path = parent ? `${parent}/${node.name}` : node.name;
    if (node.type === "folder") snapshotFiles(node.children ?? [], path, result);
    else result.set(path, node.content ?? "");
  }
  return result;
}

export function planSave(current: Map<string, string>, acknowledged?: Map<string, string>): SavePlan {
  return {
    mode: acknowledged ? "patch" : "full",
    files: [...current].filter(([path, content]) => !acknowledged || acknowledged.get(path) !== content)
      .map(([path, content]) => ({ name: path, path, type: "file", content })),
    deletedPaths: acknowledged ? [...acknowledged.keys()].filter(path => !current.has(path)) : [],
  };
}

// One session per mounted editor, not a global cross-account cache. A failed
// request invalidates the baseline (a server may have partially written files).
// Queued saves keep their own snapshots and repair with a full save after failure.
export class SaveSession {
  private acknowledged?: Map<string, string>;
  private queue: Promise<unknown> = Promise.resolve();

  save<T>(snapshot: Map<string, string>, send: (plan: SavePlan) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      try {
        const result = await send(planSave(snapshot, this.acknowledged));
        this.acknowledged = snapshot;
        return result;
      } catch (error) {
        this.acknowledged = undefined;
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
