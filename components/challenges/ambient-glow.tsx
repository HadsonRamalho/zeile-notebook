export function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="animate-ambient-drift absolute -top-10 left-[8%] size-80 rounded-full bg-primary/15 blur-3xl md:size-96" />
      <div
        className="animate-ambient-drift absolute -top-16 right-[8%] size-72 rounded-full bg-accent-violet/15 blur-3xl md:size-80"
        style={{ animationDelay: "2s" }}
      />
    </div>
  );
}
