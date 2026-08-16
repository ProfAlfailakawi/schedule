import {
  Activity,
  Building2,
  KeyRound,
  Landmark,
  ScrollText,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";

/**
 * Shared verification map used by the admin backup preview.
 * Keeping its imports local makes this file type-check independently instead
 * of relying on icon imports from AdminUsers.tsx.
 */
export const collectionMeta: Record<string, { label: string; icon: any }> = {
  users: { label: "المستخدمين", icon: UsersRound },
  colleges: { label: "الكليات", icon: Landmark },
  terms: { label: "الفصول", icon: Activity },
  sections: { label: "الشعب", icon: Building2 },
  instructors: { label: "المحاضرين", icon: UserCog },
  courses: { label: "المقررات", icon: ScrollText },
  schedules: { label: "الجداول", icon: ScrollText },
  formNames: { label: "نماذج الصلاحيات", icon: ShieldCheck },
  formSecurity: { label: "الأمن", icon: KeyRound },
  collegeUserAssign: { label: "ربط الكليات", icon: UserCog },
};

export default collectionMeta;
