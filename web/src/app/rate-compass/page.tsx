import type { Metadata } from "next";
import { RateCompass } from "./RateCompass";

export const metadata: Metadata = {
  title: "Project Rate Compass",
  description:
    "Turn your time, scope, and project risk into a clear fee range you can explain to a client.",
};

export default function RateCompassPage() {
  return <RateCompass />;
}
