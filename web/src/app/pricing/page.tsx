import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { IntakeCta } from "@/components/IntakeCta";
import { api } from "@/lib/api";
import { PLAN_NAMES, PRICING_SERVICES, pricingKey, pricingValue } from "@/lib/service-pricing";

// Keep admin edits visible on every request.
export const dynamic = "force-dynamic";

export default async function Pricing() {
  const content = await api.content().catch(() => null);
  const lisaFrom = [
    content?.lisa_tier_1_price_ghs?.trim() || "GHS 800",
    content?.lisa_tier_1_price_usd?.trim() || "$55",
  ].join(" / ");

  return (
    <>
      <section className="mx-auto max-w-[1400px] px-6 pt-28 pb-14 md:px-10 md:pt-36">
        <Reveal>
          <SectionLabel>Pricing</SectionLabel>
          <h1 className="page-hero-title mt-8 max-w-4xl">
            The right service.<br /><span className="text-accent">Three clear plans.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2">
            {pricingValue(content, "service_pricing_intro")}
          </p>
          <nav aria-label="Pricing services" className="mt-10 flex flex-wrap gap-3">
            {PRICING_SERVICES.map((service) => (
              <a key={service.id} href={`#${service.id}`} className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent">
                {service.title}
              </a>
            ))}
          </nav>
        </Reveal>
      </section>

      {PRICING_SERVICES.map((service, serviceIndex) => (
        <section key={service.id} id={service.id} aria-labelledby={`${service.id}-title`} className="mx-auto max-w-[1400px] scroll-mt-28 px-6 py-14 md:px-10 md:py-20">
          <Reveal>
            <SectionLabel index={String(serviceIndex + 1).padStart(2, "0")}>
              {service.monthly ? "Monthly care" : "Project pricing"}
            </SectionLabel>
            <h2 id={`${service.id}-title`} className="mt-5 text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-[-0.03em]">{service.title}</h2>
            <p className="mt-4 max-w-2xl text-text-2">{service.description}</p>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLAN_NAMES.map((name, i) => {
              const value = (field: "price" | "tagline" | "features") => pricingValue(content, pricingKey(service.id, i + 1, field));
              return (
                <Reveal key={name} delay={i * 70} className={`flex h-full flex-col rounded-[var(--radius)] border bg-bg-2/50 p-7 glass md:p-8 ${i === 1 ? "border-accent/50" : "border-hairline"}`}>
                  <h3 className="text-2xl font-bold">{name}</h3>
                  <p className="mt-5 text-2xl font-extrabold tracking-tight text-accent">{value("price")}</p>
                  <p className="mt-2 text-sm text-muted">{service.monthly ? "Monthly plan" : "One-time project · starting price"}</p>
                  <p className="mt-5 text-text-2">{value("tagline")}</p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {value("features").split("\n").map((feature) => feature.trim()).filter(Boolean).map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex gap-3 text-text-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <IntakeCta kind="booking" openVariant={i === 1 ? "primary" : "secondary"} className="mt-8 w-full">
                    {service.monthly ? "Discuss this plan" : "Get a quote"}
                  </IntakeCta>
                </Reveal>
              );
            })}
          </div>
        </section>
      ))}

      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10">
          <Reveal>
            <h2 className="text-2xl font-bold">What your price covers</h2>
            <div className="mt-6 grid gap-6 text-text-2 md:grid-cols-2">
              <p>Project prices start at the figures shown. We confirm deliverables, integrations, timelines and the final price in a written quote before work begins. Website development includes design; the standalone UX/UI plans are for design-only projects.</p>
              <p>Hosting, domains, paid software, phone minutes, WhatsApp messages, AI usage and app store fees are separate. Expected provider costs are reviewed before launch. Maintenance is billed monthly, with edits limited to the hours in your plan.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 py-20 md:px-10">
        <Reveal>
          <h2 className="text-2xl font-bold">Looking for Lisa?</h2>
          <p className="mt-4 max-w-2xl text-text-2">Lisa has her own monthly subscription plans, from {lisaFrom} a month.</p>
          <Link href="/lisa-ai-assistant" className="mt-5 inline-block text-accent underline underline-offset-4">See Lisa’s pricing</Link>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 py-20 text-center md:px-10">
        <Reveal>
          <h2 className="text-[clamp(2rem,5vw,4rem)] font-bold tracking-tight">Let’s scope your project.</h2>
          <p className="mx-auto mt-5 max-w-xl text-text-2">A short discovery call helps us choose a service and plan, then confirm exactly what you need.</p>
          <div className="mt-8"><IntakeCta kind="booking">Get a quote</IntakeCta></div>
        </Reveal>
      </section>
    </>
  );
}
