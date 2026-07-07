import { AppNotFound } from "@/components/motion/not-found";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <AppNotFound variant="not-found" />
    </div>
  );
}
