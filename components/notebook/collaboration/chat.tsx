import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
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
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isTypingInEditor =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "DIV";

      if ((e.key === "/" || e.key === ";") && !isOpen && !isTypingInEditor) {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Foca o campo assim que ele expande
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendChatMessage(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className="fixed bottom-36 right-6 z-200 flex flex-col items-end gap-3 pointer-events-none print:hidden">
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

      <div className="flex items-center justify-end gap-2 pointer-events-auto">
        <AnimatePresence>
          {isOpen && (
            <motion.form
              onSubmit={handleSubmit}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="overflow-hidden"
            >
              <input
                ref={inputRef}
                type="text"
                enterKeyHint="send"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Digite uma mensagem..."
                className="h-10 w-64 rounded-full border border-border bg-card/80 backdrop-blur-md pl-4 pr-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </motion.form>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? "Fechar chat" : "Abrir chat"}
          className="relative flex items-center justify-center p-0.5 rounded-full border border-border bg-card/80 backdrop-blur-md shadow-md transition-all hover:scale-105 hover:bg-card/90 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {isOpen ? <X size={16} /> : <MessageSquare size={16} />}
          </span>
        </button>
      </div>
    </div>
  );
}
