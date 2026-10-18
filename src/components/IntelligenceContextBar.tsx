import React from "react";
import { CloudUpload, Target } from "lucide-react";
import { Field, Surface } from "./ui";
import { FixedScopeValue } from "./ScopeAskBar";
import { useScopedTerms } from "./useScopedTerms";
import type { AdCollege, AdSection, AdTerm } from "../types";
import { sortTermsNewest } from "../utils/termSequence";
import { sortByName } from "../utils/sorting";

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
  hideSection?: boolean;
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
  hideSection = false,
  onCollegeChange,
  onSectionChange,
  onTermChange,
}: Props) {
  const scopedTerms = useScopedTerms<AdTerm>(terms, collegeId, sectionId, termId, onTermChange);
  return (
    <Surface className="intel-context visual-minimal">
      <div className="intel-context-copy">
        <span><Target /></span>
        <div>
          <strong>نطاق القرار</strong>
        </div>
      </div>
      <div className="intel-context-fields">
        {lockCollege ? <Field label="الكلية"><FixedScopeValue>{colleges.find(college => Number(college.AdCollegeId) === Number(collegeId))?.AdCollegeName || ""}</FixedScopeValue></Field> : <Field label="الكلية"><select value={collegeId || ""} onChange={(event)=>{const id=Number(event.target.value)||0;const first=sections.find(section=>Number(section.AdCollegeId)===id);onCollegeChange(id,first?.AdSectionId||0)}}><option value="">اختر الكلية</option>{colleges.map(college=><option key={college.AdCollegeId} value={college.AdCollegeId}>{college.AdCollegeName}</option>)}</select></Field>}
        {!hideSection && !lockSection ? <Field label="القسم"><select value={sectionId || ""} disabled={!collegeId} onChange={(event)=>onSectionChange(Number(event.target.value)||0)}><option value="">كل الأقسام</option>{sortByName(availableSections,(section:AdSection)=>section.AdSectionName).map(section=><option key={section.AdSectionId} value={section.AdSectionId}>{section.AdSectionName}</option>)}</select></Field> : (!hideSection && lockSection ? <Field label="القسم"><FixedScopeValue>{sections.find(section => Number(section.AdSectionId) === Number(sectionId))?.AdSectionName || ""}</FixedScopeValue></Field> : null)}
        <Field label="الفصل">
          <select value={termId || ""} onChange={(event) => onTermChange(Number(event.target.value) || 0)}>
            <option value="">اختر الفصل</option>
            {sortTermsNewest(scopedTerms).map((term) => (
              <option key={term.AdTermId} value={term.AdTermId}>{term.AdTermName}</option>
            ))}
          </select>
        </Field>
      </div>
      {!online ? (
        <span className="connection-pill offline"><CloudUpload />قراءة فقط</span>
      ) : null}
    </Surface>
  );
}
