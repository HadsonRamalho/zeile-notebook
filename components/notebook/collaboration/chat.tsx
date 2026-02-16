import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/hooks/use-presence";

interface BottomRightChatProps {
  messages: ChatMessage[];
  sendChatMessage: (text: string) => void;
}

export function CollabChat({
  messages,
  sendChatMessage,
}: BottomRightChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isTypingInEditor =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "DIV";

      if ((e.key === "/" || e.key === ";") && !isFocused && !isTypingInEditor) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && isFocused) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocused]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendChatMessage(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-200 flex flex-col items-end gap-3 pointer-events-none print:hidden">
      <div className="flex flex-col items-end gap-2 max-w-75">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="px-4 py-2 rounded-2xl rounded-tr-none shadow-lg text-sm text-white pointer-events-auto backdrop-blur-md bg-opacity-90"
              style={{ backgroundColor: msg.color }}
            >
              <span className="font-bold opacity-80 text-xs block mb-0.5">
                {msg.name}
              </span>
              <span className="wrap-break-word">{msg.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <form
        onSubmit={handleSubmit}
        className="pointer-events-auto relative group"
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <MessageSquare size={16} />
        </div>
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="send"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Pressione / ou ; para conversar..."
          className="h-10 w-64 rounded-full border border-border bg-card/80 backdrop-blur-md pl-4 pr-4 text-sm shadow-sm transition-all outline-none focus:ring-2 focus:ring-primary focus:w-80"
        />
      </form>
    </div>
  );
}
