import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Down for Maintenance, Prince Caleb",
  robots: { index: false },
};

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
