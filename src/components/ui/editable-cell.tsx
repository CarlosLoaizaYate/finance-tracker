"use client";

import { useState, useRef } from "react";
import { fmt, parse } from "@/lib/formatters";

interface EditableCellProps {
  value: number;
  onChange: (v: number) => void;
  edited: boolean;
}

export default function EditableCell({ value, onChange, edited }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setText(value > 0 ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const done = () => {
    onChange(parse(text));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
          if (e.key === "Escape") setEditing(false);
        }}
        style={{
          width: 110,
          padding: "3px 6px",
          borderRadius: 6,
          border: "2px solid #6366f1",
          fontSize: 12,
          textAlign: "right",
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onClick={start}
      title="Click to edit"
      style={{
        cursor: "text",
        padding: "3px 8px",
        borderRadius: 6,
        background: edited ? "#ede9fe" : "#f9fafb",
        color: edited ? "#4f46e5" : "#9ca3af",
        fontWeight: edited ? 700 : 400,
        fontSize: 12,
        display: "inline-block",
        minWidth: 90,
        textAlign: "right",
        border: "1px dashed",
        borderColor: edited ? "#a5b4fc" : "#e5e7eb",
      }}
    >
      {value > 0 ? fmt(value) : "—"}
    </span>
  );
}
