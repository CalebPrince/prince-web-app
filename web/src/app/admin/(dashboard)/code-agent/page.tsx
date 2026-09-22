import { Metadata } from "next";
import CodeAgentClient from "./CodeAgentClient";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Code Agent — Admin" };

export default function CodeAgentPage() {
  return <Suspense><CodeAgentClient /></Suspense>;
}
