import { abcTagClasses } from "@/utils/abc";
import type { AbcTag } from "@/services/performance.service";

interface AbcBadgeProps {
    tag: AbcTag;
    size?: "sm" | "md";
}

export function AbcBadge({ tag, size = "sm" }: AbcBadgeProps) {
    const base = size === "sm"
        ? "inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold border"
        : "inline-flex items-center justify-center w-7 h-7 rounded text-sm font-bold border";
    return (
        <span className={`${base} ${abcTagClasses(tag)}`} title={`Curva ${tag}`}>
            {tag}
        </span>
    );
}
