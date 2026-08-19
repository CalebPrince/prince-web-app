"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FaqItem({ question, answer, isOpen, onToggle }: FaqItemProps) {
  return (
    <div className="border-b border-hairline py-4">
      <button
        type="button"
        className="flex w-full items-center justify-between py-4 text-left font-semibold text-lg hover:text-accent focus:outline-none transition-colors"
        onClick={onToggle}
      >
        <span>{question}</span>
        {isOpen ? (
          <Minus className="ml-4 h-5 w-5 shrink-0 text-accent" />
        ) : (
          <Plus className="ml-4 h-5 w-5 shrink-0 text-text-2" />
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div 
          className="pb-6 text-text-2 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: answer }}
        />
      </div>
    </div>
  );
}

interface FaqAccordionProps {
  faqs: { question: string; answer: string }[];
}

export function FaqAccordion({ faqs }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number>(0);

  if (!faqs || faqs.length === 0) return null;

  return (
    <div className="mx-auto w-full">
      {faqs.map((faq, index) => (
        <FaqItem
          key={index}
          question={faq.question}
          answer={faq.answer}
          isOpen={openIndex === index}
          onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
        />
      ))}
    </div>
  );
}
