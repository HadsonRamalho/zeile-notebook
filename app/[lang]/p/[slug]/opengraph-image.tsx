import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function fetchPublicMeta(slug: string) {
  const base = process.env.NEXT_PUBLIC_API || "http://localhost:3099/api";
  try {
    const res = await fetch(`${base}/notebook/public/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { title: string; ownerName: string | null };
  } catch {
    return null;
  }
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await fetchPublicMeta(slug);
  const title = meta?.title || "Zeile Notebook";
  const owner = meta?.ownerName;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0c1412",
        padding: "80px",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 24,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: "#169e69",
          fontFamily: "monospace",
        }}
      >
        Zeile Notebook
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", fontSize: 68, color: "#f5f7f6" }}>
          {title.length > 60 ? `${title.slice(0, 59)}…` : title}
        </div>
        {owner && (
          <div style={{ display: "flex", fontSize: 30, color: "#8aa0a0" }}>
            por {owner}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          height: 10,
          width: "100%",
          background: "#169e69",
          borderRadius: 8,
        }}
      />
    </div>,
    { ...size },
  );
}
