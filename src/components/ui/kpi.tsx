"use client";

interface KpiTag {
  bg: string;
  fg: string;
  text: string;
}

interface KpiProps {
  title: string;
  value: string;
  sub?: string;
  color: string;
  tag?: KpiTag;
}

export default function Kpi({ title, value, sub, color, tag }: KpiProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "16px 20px",
        boxShadow: "0 1px 6px #0001",
        borderLeft: `4px solid ${color}`,
        minWidth: 140,
        flex: 1,
        position: "relative",
      }}
    >
      {tag && (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: tag.bg,
            color: tag.fg,
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 6,
            padding: "2px 7px",
          }}
        >
          {tag.text}
        </span>
      )}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
