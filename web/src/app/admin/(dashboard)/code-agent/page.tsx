import { Metadata } from "next";
import CodeAgentClient from "./CodeAgentClient";

export const metadata: Metadata = { title: "Code Agent — Admin" };

export default function CodeAgentPage() {
  return <CodeAgentClient />;
}
