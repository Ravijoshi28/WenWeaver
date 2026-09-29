export type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  content?: string;
  children?: FileTreeNode[];
};

export function normalizeFilePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

// Copy only the ancestors of the changed file. Unrelated branches retain identity.
// Identical Monaco/Yjs notifications return the original tree and skip persistence.
export function updateFileTree(
  nodes: FileTreeNode[], targetPath: string, content: string,
): { files: FileTreeNode[]; updated: boolean } {
  const parts = normalizeFilePath(targetPath).split("/");
  function visit(branch: FileTreeNode[], depth: number): { files: FileTreeNode[]; updated: boolean } {
    const index = branch.findIndex(node => node.name === parts[depth]);
    if (index < 0) return { files: branch, updated: false };
    const node = branch[index];
    let replacement: FileTreeNode;
    if (depth === parts.length - 1) {
      if (node.type !== "file") return { files: branch, updated: false };
      if (node.content === content) return { files: branch, updated: true };
      replacement = { ...node, path: parts.join("/"), content };
    } else {
      if (node.type !== "folder" || !node.children) return { files: branch, updated: false };
      const child = visit(node.children, depth + 1);
      if (!child.updated || child.files === node.children) return { files: branch, updated: child.updated };
      replacement = { ...node, children: child.files };
    }
    const files = branch.slice();
    files[index] = replacement;
    return { files, updated: true };
  }
  return visit(nodes, 0);
}
