import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import AppointmentsClient, { Appointment } from "./AppointmentsClient";

export const metadata: Metadata = {
  title: "Bookings — Admin",
};

export default async function AppointmentsPage() {
  const cookieHeader = (await cookies()).toString();
  const initialAppointments = await ssrAdminList<Appointment>("/api/v1/admin/appointments?status=confirmed", cookieHeader);

  return <AppointmentsClient initialAppointments={initialAppointments} />;
}
