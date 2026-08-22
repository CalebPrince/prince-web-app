"use client";

import { useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { api } from "@/lib/api";

// Floating WhatsApp contact button - ported from the `#whatsapp-float-btn`
// element public/js/content.js wires up: hidden unless a number is
// configured (content.contact_phone) and the button hasn't been turned
// off (content.whatsapp_button_enabled).
export function WhatsAppFloatButton() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    api
      .content()
      .then((content) => {
        if (content.whatsapp_button_enabled === "0") return;
        const digits = (content.contact_phone || "+233 20 804 9962").replace(/\D/g, "");
        if (digits) setHref(`https://wa.me/${digits}`);
      })
      .catch(() => {});
  }, []);

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="tilt-3d tilt-3d-tile fixed bottom-6 left-6 z-50 grid size-14 place-items-center rounded-full bg-[#25d366] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <FaWhatsapp className="size-7" />
    </a>
  );
}
