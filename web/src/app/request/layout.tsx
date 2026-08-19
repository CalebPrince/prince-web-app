import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Request a Project",
  description: "Describe one workflow and get a tailored AI agent or automation proposal.",
  openGraph: {
    title: "Prince Caleb - Request a Project",
    description: "Describe one workflow and get a tailored AI agent or automation proposal.",
    url: "https://princecaleb.dev/request",
    images: [{ url: "https://princecaleb.dev/uploads/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prince Caleb - Request a Project",
    description: "Describe one workflow and get a tailored AI agent or automation proposal.",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
};

export default function RequestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
