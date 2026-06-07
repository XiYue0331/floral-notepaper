import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DragEvent,
  KeyboardEvent,
  ClipboardEvent,
  CSSProperties,
  FormEvent,
  RefObject,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface InlineMarkdownTextareaProps {
  editorRef: RefObject<HTMLDivElement | null>;
  value: string;
  onChange: (value: string) => void;
  onInput?: (event: FormEvent<HTMLDivElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  fontSize?: number;
  imageBaseDir?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeImageSrc(baseDir: string | undefined, src: string): string {
  if (!baseDir || !src.startsWith("images/")) return src;
  const normalizedBaseDir = baseDir.replace(/\\/g, "/").replace(/\/$/, "");
  return convertFileSrc(`${normalizedBaseDir}/${src}`);
}

export function serializeEditableContent(root: HTMLElement): string {
  const isBlock = (tagName: string) =>
    ["DIV", "P", "LI", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGCAPTION", "FIGURE", "ASIDE", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6"].includes(tagName);

  const serializeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue ?? "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node as HTMLElement;
    const tag = element.tagName;

    if (tag === "BR") {
      return "\n";
    }

    if (tag === "IMG") {
      const alt = element.getAttribute("alt") ?? "";
      const markdownSrc = element.dataset.mdSrc ?? element.getAttribute("src") ?? "";
      return `![${alt}](${markdownSrc})`;
    }

    const children = Array.from(node.childNodes).map(serializeNode).join("");
    return isBlock(tag) ? `${children}\n` : children;
  };

  return Array.from(root.childNodes)
    .map(serializeNode)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u00A0/g, " ")
    .trimEnd();
}

function markdownToEditableHtml(content: string, imageBaseDir?: string): string {
  const escaped = escapeHtml(content);
  const htmlWithImages = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const resolvedSrc = normalizeImageSrc(imageBaseDir, src.trim());
    return `<img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt)}" data-md-src="${escapeHtml(src.trim())}" contenteditable="false" class="inline-markdown-image" />`;
  });
  return htmlWithImages.replace(/\n/g, "<br>");
}

export function InlineMarkdownTextarea({
  editorRef,
  value,
  onChange,
  onInput,
  onPaste,
  onDrop,
  onDragOver,
  onKeyDown,
  placeholder,
  fontSize = 14,
  imageBaseDir,
  className,
  style,
  disabled,
}: InlineMarkdownTextareaProps) {
  const [isFocused, setIsFocused] = useState(false);
  const internalRef = useRef<HTMLDivElement | null>(null);
  const rootRef = editorRef ?? internalRef;

  useEffect(() => {
    const editor = rootRef.current;
    if (!editor || isFocused) return;
    const html = markdownToEditableHtml(value, imageBaseDir);
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
  }, [value, imageBaseDir, isFocused, rootRef]);

  const handleInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      const editor = rootRef.current;
      if (!editor) return;
      const markdown = serializeEditableContent(editor);
      onChange(markdown);
      onInput?.(event);
    },
    [onChange, onInput, rootRef],
  );

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ minHeight: 220, ...style }}
    >
      {value.trim().length === 0 && !isFocused ? (
        <div className="pointer-events-none absolute inset-0 p-2 text-ink-ghost/60 font-body">
          {placeholder}
        </div>
      ) : null}
      <div
        ref={rootRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="relative w-full h-full min-h-[220px] overflow-auto whitespace-pre-wrap break-words font-body text-ink-soft outline-none"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: 1.9,
          tabSize: "var(--tab-indent-size, 2)",
          caretColor: "var(--editor-caret)",
          backgroundColor: "transparent",
          color: "inherit",
          ...style,
        }}
        onInput={handleInput}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onKeyDown={onKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      <style>{
        ".inline-markdown-image { max-width: 100%; display: block; margin: 0.75rem auto; border-radius: 0.75rem; }"
      }</style>
    </div>
  );
}
