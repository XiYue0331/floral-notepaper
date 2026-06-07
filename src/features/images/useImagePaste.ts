import { useCallback, useRef } from "react";
import type { TFunction } from "i18next";
import { saveImage } from "./api";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

interface UseImagePasteOptions {
  noteId: string | null;
  editableRef: React.RefObject<HTMLElement | null>;
  setContent: (content: string) => void;
  markDirty: () => void;
  onEnsureNoteSaved: () => Promise<string | null>;
  insertImage?: (relativePath: string) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
  t?: TFunction;
}

async function processImageFile(file: File, noteId: string, t?: TFunction): Promise<string | null> {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(
      t?.("errors.imageTooLarge", { defaultValue: "图片文件过大（上限 20 MB）" }) ??
        "图片文件过大（上限 20 MB）",
    );
  }

  const ext = MIME_TO_EXT[file.type];
  if (!ext) return null;

  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));
  return saveImage(noteId, data, ext);
}

function insertTextAtCursor(
  textarea: HTMLTextAreaElement,
  setContent: (value: string) => void,
  text: string,
) {
  const { selectionStart, selectionEnd, value } = textarea;
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
  const insertion = (needsLeadingNewline ? "\n" : "") + text + "\n";
  const newContent = before + insertion + after;
  setContent(newContent);

  requestAnimationFrame(() => {
    const newPos = before.length + insertion.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  });
}

function getImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];

  if (dataTransfer.files?.length) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.type in MIME_TO_EXT) {
        files.push(file);
      }
    }
  }

  if (files.length > 0) {
    return files;
  }

  for (let i = 0; i < dataTransfer.items.length; i++) {
    const item = dataTransfer.items[i];
    if (item.kind === "file" && item.type in MIME_TO_EXT) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  return files;
}

export function useImagePaste({
  noteId,
  editableRef,
  setContent,
  markDirty,
  onEnsureNoteSaved,
  insertImage,
  disabled,
  onError,
  t,
}: UseImagePasteOptions) {
  const processingRef = useRef(false);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (processingRef.current || files.length === 0) return;
      processingRef.current = true;

      try {
        let resolvedId = noteId;
        if (!resolvedId) {
          resolvedId = await onEnsureNoteSaved();
          if (!resolvedId) return;
        }

        const editable = editableRef.current;
        if (!editable) return;

        const markdownLines: Array<{ markdown: string; relativePath: string }> = [];
        for (const file of files) {
          const relativePath = await processImageFile(file, resolvedId, t);
          if (relativePath) {
            markdownLines.push({ markdown: `![](${relativePath})`, relativePath });
          }
        }

        if (markdownLines.length > 0) {
          if (insertImage) {
            for (const line of markdownLines) {
              insertImage(line.relativePath);
            }
          } else if (editable instanceof HTMLTextAreaElement) {
            insertTextAtCursor(editable, setContent, markdownLines.map((line) => line.markdown).join("\n"));
          }
          markDirty();
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : (t?.("errors.imagePasteFailed", { defaultValue: "图片粘贴失败" }) ?? "图片粘贴失败");
        onError?.(message);
      } finally {
        processingRef.current = false;
      }
    },
    [noteId, editableRef, setContent, markDirty, onEnsureNoteSaved, insertImage, onError, t],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      if (disabled) return;
      const files = getImageFiles(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void processFiles(files);
    },
    [disabled, processFiles],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (disabled) return;
      const files = getImageFiles(event.dataTransfer);
      if (files.length === 0) return;
      event.preventDefault();
      void processFiles(files);
    },
    [disabled, processFiles],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (disabled) return;
      const hasImage = Array.from(event.dataTransfer.items).some(
        (item) => item.kind === "file" && item.type in MIME_TO_EXT,
      );
      if (hasImage) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    [disabled],
  );

  return { handlePaste, handleDrop, handleDragOver };
}
