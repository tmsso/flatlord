import type { ReactNode } from "react";

// design/01: inline pill (30px, muted bg, 1px border) — filename + size +
// optional remove button. A generic file-type glyph (no per-extension
// icon set exists in this codebase) keeps this component dependency-free.
export function AttachmentChip({
  fileName,
  sizeLabel,
  href,
  onRemove,
  removeLabel,
  removeDisabled,
}: {
  fileName: string;
  sizeLabel: string;
  href?: string | null;
  onRemove?: () => void;
  removeLabel?: string;
  removeDisabled?: boolean;
}) {
  const content: ReactNode = (
    <>
      <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" aria-hidden="true">
        <path
          d="M3 1.5h4L9.5 4v6.5h-6.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="max-w-[14rem] truncate">{fileName}</span>
      <span className="text-muted-foreground">{sizeLabel}</span>
    </>
  );

  return (
    <span className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 text-xs">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
          {content}
        </a>
      ) : (
        content
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          aria-label={removeLabel}
          className="ml-0.5 leading-none text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          ×
        </button>
      )}
    </span>
  );
}
