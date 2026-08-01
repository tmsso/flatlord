"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/status-badge";
import { Check, CircleDashed } from "lucide-react";

export interface PropertyTreeNode {
  id: string;
  parentId: string | null;
  type: "house" | "flat" | "room";
  name: string;
  hrsz: string | null;
  active: boolean;
}

export function PropertyTree({ nodes }: { nodes: PropertyTreeNode[] }) {
  const t = useTranslations("properties");
  const byParent = new Map<string | null, PropertyTreeNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const roots = byParent.get(null) ?? [];

  function renderNode(node: PropertyTreeNode, depth: number): React.ReactNode {
    const children = byParent.get(node.id) ?? [];
    return (
      <div key={node.id} className="flex flex-col gap-1">
        <Link
          href={`/properties/${node.id}`}
          style={{ marginLeft: depth * 20 }}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-2.5 hover:bg-muted"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{node.name}</span>
            <span className="text-xs text-muted-foreground">
              {t(`type${node.type.charAt(0).toUpperCase()}${node.type.slice(1)}`)}
              {node.hrsz ? ` · hrsz ${node.hrsz}` : ""}
              {children.length > 0 ? ` · ${t("roomCount", { count: children.length })}` : ""}
            </span>
          </div>
          {node.active ? (
            <StatusPill tone="success" icon={Check}>
              {t("active")}
            </StatusPill>
          ) : (
            <StatusPill tone="muted" icon={CircleDashed}>
              {t("inactive")}
            </StatusPill>
          )}
        </Link>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  if (roots.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return <div className="flex max-w-xl flex-col gap-2">{roots.map((r) => renderNode(r, 0))}</div>;
}
