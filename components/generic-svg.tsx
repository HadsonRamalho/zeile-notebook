import type React from "react";

interface DynamicSvgProps extends React.SVGProps<SVGSVGElement> {
  content: string;
  viewBox?: string;
  size?: number | string;
  color?: string;
}

const GenericSvg = ({
  content,
  viewBox = "0 0 32 32",
  size = 24,
  color = "currentColor",
  style,
  ...props
}: DynamicSvgProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={color}
      dangerouslySetInnerHTML={{ __html: content }}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      {...props}
    />
  );
};

export default GenericSvg;
