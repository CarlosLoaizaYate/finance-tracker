"use client";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export default function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 16px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        background: active ? "#6366f1" : "#f3f4f6",
        color: active ? "#fff" : "#374151",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}
