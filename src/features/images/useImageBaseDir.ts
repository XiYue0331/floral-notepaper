import { useState, useEffect } from "react";
import { getImagesBaseDir } from "./api";

export function useImageBaseDir(): string | null {
  const [dir, setDir] = useState<string | null>(null);
  useEffect(() => {
    getImagesBaseDir()
      .then((d) => {
        setDir(d);
        // 在运行时打开 DevTools 查看此日志，确认 renderer 能读到 images 基目录
        // eslint-disable-next-line no-console
        console.log("useImageBaseDir: images base dir =", d);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("useImageBaseDir: failed to get images base dir", err);
      });
  }, []);
  return dir;
}
