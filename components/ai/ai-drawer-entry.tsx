"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import HavenAiDrawer from "./haven-ai-drawer";
import PlacementPreviewDrawer, { AI_PLACEMENT_PREVIEW_KEY } from "./placement-preview-drawer";

/** The approved launcher remains a sample; ordinary signed-in modules use live assistance. */
export default function AiDrawerEntry({ role, module, open, onOpenChange }: { role: Role; module: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [preview, setPreview] = useState<boolean | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPreview(window.sessionStorage.getItem(AI_PLACEMENT_PREVIEW_KEY) === "1"));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (role === "manager" && module === "HAVEN AI" && open) onOpenChange(false);
  }, [role, module, open, onOpenChange]);
  if (role === "manager" && module === "HAVEN AI") return null;
  if (preview === null) return null;
  return preview
    ? <PlacementPreviewDrawer role={role} module={module} open={open} onOpenChange={onOpenChange} onExit={() => setPreview(false)} />
    : <HavenAiDrawer role={role} module={module} open={open} onOpenChange={onOpenChange} />;
}
