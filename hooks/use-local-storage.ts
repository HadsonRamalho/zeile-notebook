import { catchErrorSync } from "@catcherjs/core";
import { useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    const result = catchErrorSync(() => {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    });
    if (result.isErr()) {
      console.error(result.error);
      return initialValue;
    }
    return result.data;
  });

  const setValue = (value: T) => {
    const result = catchErrorSync(() => {
      setStoredValue(value);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    });
    if (result.isErr()) console.error(result.error);
  };

  return [storedValue, setValue] as const;
}
