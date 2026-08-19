import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - AI Voice Agents for Clinics in Ghana",
  description:
    "AI voice agents for clinics and healthcare practices in Ghana: answer routine calls, capture patient details, book appointments, send reminders, and hand clinical questions to staff.",
};

export default function ClinicVoiceAgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
