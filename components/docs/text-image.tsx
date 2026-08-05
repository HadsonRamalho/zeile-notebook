import type { ReactNode } from "react";

type TextImageProps = {
  image: string;
  children: ReactNode;
};

export default function TextImage({ image, children }: TextImageProps) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <img
        src={image}
        style={{
          display: "block",
          marginBottom: "0px",
          width: "100%",
          height: "auto",
        }}
        alt="Imagem"
      />
      <div style={{ marginTop: "0px" }}>{children}</div>
    </div>
  );
}
