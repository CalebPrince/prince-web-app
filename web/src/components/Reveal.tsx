"use client";

import { type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "span" | "li";
  id?: string;
}

export function Reveal({ children, className, delay = 0, as = "div", id }: RevealProps) {
  // Map standard HTML tags to motion tags
  const MotionTag = as === "section" ? motion.section 
                  : as === "span" ? motion.span 
                  : as === "li" ? motion.li 
                  : motion.div;

  return (
    <MotionTag
      id={id}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ 
        duration: 0.8,
        delay: delay / 1000, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={cn("will-change-transform", className)}
    >
      {children}
    </MotionTag>
  );
}
