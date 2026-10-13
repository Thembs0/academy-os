import {
  Bell, BarChart3, BookOpen, ClipboardCheck, ClipboardList, FileText,
  FolderKanban, GraduationCap, History, LayoutDashboard, MapPin,
  MessageSquareWarning, School, ScrollText, Settings, ShieldCheck,
  TriangleAlert, UserCircle, Users, type LucideIcon,
} from "lucide-react";
import type { Persona } from "@/features/auth/AuthProvider";

export interface NavItem { to: string; label: string; icon: LucideIcon }
const I = (to: string, label: string, icon: LucideIcon): NavItem => ({ to, label, icon });

export function navFor(persona: Persona, can: (c: string) => boolean): NavItem[] {
  const dash = I("/dashboard", "Dashboard", LayoutDashboard);
  const notif = I("/notifications", "Notifications", Bell);
  const profile = I("/profile", "Profile", UserCircle);
  const analytics = can("analytics.view") ? [I("/analytics", "Analytics", BarChart3)] : [];

  // Field activity - oversight roles only
  const fieldActivity = (can("check_ins.view.all") || can("check_ins.view.assigned"))
    ? [I("/check-ins", "Field activity", MapPin)]
    : [];

  // Registers - visible whenever the user can see or submit registers
  const registers = (can("check_ins.view.all") || can("check_ins.view.assigned") || can("check_ins.submit"))
    ? [I("/registers", "Registers", ClipboardList)]
    : [];

  switch (persona) {
    case "facilitator":
      return [
        dash,
        I("/observations", "Observations", ClipboardCheck),
        ...registers,
        I("/documents", "Documents", FileText),
        notif,
        I("/projects", "My Projects", FolderKanban),
        I("/schools", "My Schools", School),
        I("/teachers", "My Teachers", GraduationCap),
        I("/observations?status=queried", "Queries", MessageSquareWarning),
        profile,
      ];
    case "admin":
      return [
        dash,
        ...fieldActivity,
        ...registers,
        I("/documents", "Documents", FileText),
        I("/outstanding", "Outstanding Items", TriangleAlert),
        notif,
        I("/projects", "My Projects", FolderKanban),
        I("/schools", "Schools", School),
        I("/teachers", "Teachers", GraduationCap),
        I("/observations", "Submissions", ClipboardCheck),
        I("/reports", "Reports", BookOpen),
        profile,
      ];
    case "manager":
      return [
        dash,
        ...fieldActivity,
        ...registers,
        I("/observations", "Submissions", ClipboardCheck),
        I("/outstanding", "Outstanding", TriangleAlert),
        notif,
        I("/projects", "Projects", FolderKanban),
        I("/observations?status=queried", "Queries", MessageSquareWarning),
        I("/schools", "Schools", School),
        I("/teachers", "Teachers", GraduationCap),
        I("/documents", "Documents", FileText),
        I("/reports", "Reports", BookOpen),
        ...analytics,
        I("/audit", "Audit Trail", History),
        profile,
      ];
    case "hod":
      return [
        dash,
        I("/projects", "Projects", FolderKanban),
        ...fieldActivity,
        ...registers,
        I("/analytics", "Analytics", BarChart3),
        notif,
        I("/reports", "Reports", BookOpen),
        I("/observations", "Approved Records", ClipboardCheck),
        I("/outstanding", "Outstanding", TriangleAlert),
        I("/documents", "Documents", FileText),
        I("/admin/users", "Users", Users),
        I("/audit", "Audit Trail", History),
        profile,
      ];
    case "super_admin":
      return [
        dash,
        I("/projects", "Projects", FolderKanban),
        I("/admin/users", "Users", Users),
        ...fieldActivity,
        ...registers,
        notif,
        I("/admin/roles", "Roles & Permissions", ShieldCheck),
        I("/schools", "Schools", School),
        I("/teachers", "Teachers", GraduationCap),
        I("/observations", "Observations", ClipboardCheck),
        I("/admin/forms", "Forms & Requirements", ScrollText),
        I("/documents", "Documents", FileText),
        I("/outstanding", "Outstanding", TriangleAlert),
        I("/reports", "Reports", BookOpen),
        I("/analytics", "Analytics", BarChart3),
        I("/audit", "Audit Log", History),
        I("/admin/settings", "Settings", Settings),
        profile,
      ];
    default:
      // viewer / data_admin / me
      return [
        dash,
        ...fieldActivity,
        ...registers,
        I("/projects", "Projects", FolderKanban),
        I("/observations", "Observations", ClipboardCheck),
        I("/documents", "Documents", FileText),
        I("/reports", "Reports", BookOpen),
        ...analytics,
        notif,
        profile,
      ];
  }
}