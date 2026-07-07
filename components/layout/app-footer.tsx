import Link from "next/link";

const links = [
  { href: "/docs", label: "O que é o Zeile?" },
  { href: "/docs/privacy", label: "Política de Privacidade" },
  { href: "/docs/terms", label: "Termos de Uso" },
];

export function AppFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-4 py-6 text-sm text-muted-foreground">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">
          {link.label}
        </Link>
      ))}
      <span>© {new Date().getFullYear()} Zeile Notebook</span>
    </footer>
  );
}
