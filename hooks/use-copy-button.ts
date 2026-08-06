"use client";

import { useCallback, useState } from "react";

export function useCopyButton(
  onCopy: () => void | Promise<void>,
): [checked: boolean, onClick: () => void] {
  const [checked, setChecked] = useState(false);

  const onClick = useCallback(() => {
    void Promise.resolve(onCopy()).then(() => {
      setChecked(true);
      setTimeout(() => setChecked(false), 2000);
    });
  }, [onCopy]);

  return [checked, onClick];
}
