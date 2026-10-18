import React from "react";
import { Building2 } from "lucide-react";

/**
 * شارةُ السياق: من دخل بحساب قسمه لا يُسأل عن كليته ولا قسمه في الشاشات، لكنّه لا يُترك بلا قرينةٍ تقول له أيَّ قسمٍ يعمل
 * عليه. شارةٌ هادئةٌ واحدة في رأس كل شاشة — اسمُ القسم ثم مكانُه (كليته، أو عددُ مواقعه) — لا تُنقر ولا تُسأل.
 */
export default function ScopeContextChip({ department, place }: { department: string; place: string }) {
  if (!department) return null;
  return (
    <div className="scope-context no-print" role="note" aria-label={`نطاق عملك: ${department}${place ? "، " + place : ""}`}>
      <span className="scope-context-icon" aria-hidden="true"><Building2 /></span>
      <strong>{department}</strong>
      {place ? <><i aria-hidden="true" /><span>{place}</span></> : null}
    </div>
  );
}
