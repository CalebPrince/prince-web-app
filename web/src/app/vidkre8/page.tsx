import type { Metadata } from "next";
import VidKre8Studio from "./VidKre8Studio";
import "./studio.css";

const description = "Wedding films, video ads, product explainers, motion graphics and creator content. VidKre8 turns your brief into a story built for the screen.";
const shareImage = "/vidkre8/vidkre8-share.jpg";

export const metadata: Metadata = {
  title: { absolute: "VidKre8 — Video & Motion Studio" },
  description,
  alternates: { canonical: "/vidkre8" },
  icons: { icon: "/vidkre8/icon.svg", shortcut: "/vidkre8/icon.svg" },
  openGraph: {
    title: "VidKre8 — Make them stop. Give them a story.",
    description,
    url: "/vidkre8",
    siteName: "VidKre8 Studio",
    type: "website",
    images: [{ url: shareImage, width: 1200, height: 630, alt: "VidKre8 video and motion studio selected work" }],
  },
  twitter: { card: "summary_large_image", title: "VidKre8 — Video & Motion Studio", description, images: [shareImage] },
};

export default function VidKre8Page() {
  return <VidKre8Studio />;
}
