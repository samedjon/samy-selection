"use client";

import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import type { Folder as FolderType, Photo } from "@/types/selection";

type TreeNode = FolderType & {
  children: TreeNode[];
  photoCount: number;
  selectedCount: number;
};

function buildTree(folders: FolderType[], photos: Photo[], selectedIds: string[]): TreeNode[] {
  const folderMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const folder of folders) {
    const photoCount = photos.filter((p) => p.folderId === folder.id).length;
    const selectedCount = photos.filter((p) => p.folderId === folder.id && selectedIds.includes(p.id)).length;
    folderMap.set(folder.id, { ...folder, children: [], photoCount, selectedCount });
  }

  for (const node of folderMap.values()) {
    if (node.parentId && folderMap.has(node.parentId)) {
      folderMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  roots.sort((a, b) => a.displayOrder - b.displayOrder);
  return roots;
}

export default function FolderTree({ folders, photos, activeFolderId, selectedIds, onSelect }: {
  folders: FolderType[];
  photos: Photo[];
  activeFolderId: string;
  selectedIds: string[];
  onSelect: (folderId: string) => void;
}) {
  const tree = buildTree(folders, photos, selectedIds);

  return (
    <nav className="grid gap-0.5">
      <button
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
          !activeFolderId ? "bg-ink text-white" : "hover:bg-ink/5 text-ink"
        )}
        onClick={() => onSelect("")}
      >
        <Folder size={16} />
        <span className="min-w-0 flex-1 truncate font-bold">Toutes les photos</span>
        <span className="shrink-0 text-xs font-bold text-ink/50">{photos.length}</span>
      </button>
      {tree.map((node) => (
        <TreeNodeItem key={node.id} node={node} activeFolderId={activeFolderId} onSelect={onSelect} depth={0} />
      ))}
    </nav>
  );
}

function TreeNodeItem({ node, activeFolderId, onSelect, depth }: {
  node: TreeNode;
  activeFolderId: string;
  onSelect: (folderId: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
          activeFolderId === node.id ? "bg-ink text-white" : "hover:bg-ink/5"
        )}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span className="grid h-5 w-5 shrink-0 place-items-center" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {activeFolderId === node.id ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span className="min-w-0 flex-1 truncate font-bold">{node.name}</span>
        <span className={clsx("shrink-0 text-xs font-bold", activeFolderId === node.id ? "text-white/65" : "text-ink/50")}>
          {node.selectedCount > 0 ? `${node.selectedCount}/${node.photoCount}` : node.photoCount}
        </span>
      </button>
      {hasChildren && expanded && (
        <div className="ml-3 border-l border-ink/10 pl-2">
          {node.children.map((child) => (
            <TreeNodeItem key={child.id} node={child} activeFolderId={activeFolderId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
