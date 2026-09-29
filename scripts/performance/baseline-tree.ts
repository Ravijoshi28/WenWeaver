// Frozen from HEAD before optimization: original Monaco tree update.
import type { FileTreeNode as FileNode } from "../../lib/file-tree";
import { normalizeFilePath as normalizePath } from "../../lib/file-tree";
function getNodePath(node: FileNode, parentPath = "") { return normalizePath(parentPath ? `${parentPath}/${node.name}` : node.name); }
export function updateFileInTree(
  files: FileNode[],
  targetPath: string,
  content: string
): {
  files: FileNode[];
  updated: boolean;
} {
  const normalizedTarget =
    normalizePath(targetPath);

  let updated = false;

  function updateRecursive(
    nodes: FileNode[],
    parentPath = ""
  ): FileNode[] {
    return nodes.map((node) => {
      const currentPath = getNodePath(
        node,
        parentPath
      );

      // FILE
      if (
        node.type === "file" &&
        normalizePath(currentPath) ===
          normalizedTarget
      ) {
        updated = true;

        return {
          ...node,
          path: currentPath,
          content,
        };
      }

      // FOLDER
      if (
        node.type === "folder" &&
        Array.isArray(node.children)
      ) {
        return {
          ...node,
          path: currentPath,
          children: updateRecursive(
            node.children,
            currentPath
          ),
        };
      }

      return {
        ...node,
        path: currentPath,
      };
    });
  }

  return {
    files: updateRecursive(files),
    updated,
  };
}

