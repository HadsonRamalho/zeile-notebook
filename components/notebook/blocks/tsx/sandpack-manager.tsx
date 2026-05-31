import { useSandpack } from "@codesandbox/sandpack-react";
import { useEffect } from "react";

export function SandpackManager({
  code,
  onChange,
}: {
  code: string;
  onChange: (val: string) => void;
}) {
  const { sandpack } = useSandpack();
  const { files, activeFile } = sandpack;

  useEffect(() => {
    const currentCode = files[activeFile].code;
    if (currentCode !== code) {
      onChange(currentCode);
    }
  }, [files, activeFile, onChange, code]);

  return null;
}
