"use client";

interface BadgeProps {
  val: number;
}

export default function Badge({ val }: BadgeProps) {
  return (
    <span
      style={{
        background: val > 0 ? "#d1fae5" : val < 0 ? "#fee2e2" : "#f3f4f6",
        color: val > 0 ? "#065f46" : val < 0 ? "#991b1b" : "#6b7280",
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {val > 0 ? "+" : ""}
      {val.toFixed(2)}%
    </span>
  );
}
