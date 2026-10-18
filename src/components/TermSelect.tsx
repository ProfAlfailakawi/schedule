import React, { useEffect, useRef } from "react";

/** A term with no alternative is a value to read, not a question to answer. */
export default function TermSelect({ value, onValueChange, children, ...props }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { onValueChange: (id: number) => void }) {
  const choices = React.Children.toArray(children).filter((child: any) => React.isValidElement(child) && child.type === "option" && Number(child.props.value) > 0) as React.ReactElement<any>[];
  const sole = choices.length === 1 ? choices[0] : null;
  const soleId = sole ? Number(sole.props.value) : 0;
  const callback = useRef(onValueChange);
  callback.current = onValueChange;
  useEffect(() => {
    if (soleId && Number(value) !== soleId && !props.disabled) callback.current(soleId);
  }, [soleId, value, props.disabled]);
  if (choices.length <= 1) return <output className={`term-static-value ${props.className || ""}`} aria-label={props["aria-label"]} title={sole ? String(sole.props.children || "") : undefined} data-guide-target={(props as any)["data-guide-target"]}>{sole?.props.children || "الفصول غير متاحة حاليًا"}</output>;
  return <select {...props} value={value || ""} onChange={event => onValueChange(Number(event.target.value) || 0)}>{children}</select>;
}
