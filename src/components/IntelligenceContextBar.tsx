import React from "react";
import { CheckCircle2, CloudUpload, Target } from "lucide-react";
import { Field, Surface } from "./ui";
import type { AdCollege, AdSection, AdTerm } from "../types";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  colleges: AdCollege[];
  sections: AdSection[];
  availableSections: AdSection[];
  terms: AdTerm[];
  online: boolean;
  lockCollege?: boolean;
  lockSection?: boolean;
  onCollegeChange: (collegeId: number, firstSectionId: number) => void;
  onSectionChange: (sectionId: number) => void;
  onTermChange: (termId: number) => void;
}

export default function IntelligenceContextBar({
  collegeId,
  sectionId,
  termId,
  colleges,
  sections,
  availableSections,
  terms,
  online,
  lockCollege = false,
  lockSection = false,
  onCollegeChange,
  onSectionChange,
  onTermChange,
}: Props) {
  return (
    <Surface className="intel-context">
      <div className="intel-context-copy">
        <span><Target /></span>
        <div>
          <strong>نطاق القرار</strong>
          <small>محصور في القسم والفصل</small>
        </div>
      </div>
      <div className="intel-context-fields">
        {lockCollege && lockSection ? <div className="intel-fixed-scope"><small>نطاقك</small><strong>{colleges.find(c=>c.AdCollegeId===collegeId)?.AdCollegeName}</strong><span>{sections.find(s=>s.AdSectionId===sectionId)?.AdSectionName}</span></div> : null}
        {!lockCollege ? <Field label="الكلية"><select value={collegeId || ""} onChange={(event)=>{const id=Number(event.target.value)||0;const first=sections.find(section=>section.AdCollegeId===id);onCollegeChange(id,first?.AdSectionId||0)}}>{colleges.map(college=><option key={college.AdCollegeId} value={college.AdCollegeId}>{college.AdCollegeName}</option>)}</select></Field> : null}
        {!lockSection ? <Field label="القسم"><select value={sectionId || ""} onChange={(event)=>onSectionChange(Number(event.target.value)||0)}>{availableSections.map(section=><option key={section.AdSectionId} value={section.AdSectionId}>{section.AdSectionName}</option>)}</select></Field> : null}
        <Field label="الفصل">
          <select value={termId || ""} onChange={(event) => onTermChange(Number(event.target.value) || 0)}>
            {[...terms].sort((a, b) => b.AdTermId - a.AdTermId).map((term) => (
              <option key={term.AdTermId} value={term.AdTermId}>{term.AdTermName}</option>
            ))}
          </select>
        </Field>
      </div>
      <span className={`connection-pill ${online ? "online" : "offline"}`}>
        {online ? <><CheckCircle2 />متصل</> : <><CloudUpload />قراءة فقط</>}
      </span>
    </Surface>
  );
}
