import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (v: number) => void;
};

/** Number input that keeps the typed text (e.g. "0", "0.", "0.900") while editing. */
export const DecimalInput: React.FC<Props> = ({ value, onValueChange, ...rest }) => {
  const [text, setText] = useState<string>(value ? String(value) : "");
  useEffect(() => {
    const n = Number(value ?? 0);
    if ((parseFloat(text) || 0) !== n) setText(n ? String(n) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        if ((raw.match(/\./g) || []).length > 1) return;
        setText(raw);
        onValueChange(parseFloat(raw) || 0);
      }}
    />
  );
};
