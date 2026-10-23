<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Verified facts about Elon POS for every Lisa surface that answers the public: live chat, WhatsApp, the live
 * avatar and inbound phone calls.
 *
 * Elon POS is not one of Caleb's builds. It is ElonPOS's own software, which Caleb sells and installs as an
 * authorised agent; the homepage's second hero slide and the contact form's "Elon POS" choice send those
 * enquiries to him. Without this block Lisa only knew Elon POS as one of the VidKre8 ads, guessed it was a custom
 * build, and told a visitor it was not free (23 Oct 2026).
 *
 * Every figure and promise here comes from ElonPOS's own flyers and the system's recorded results (Caleb, 23 Oct
 * 2026). No installation price is known, so Lisa must never quote one. ElonPOS describes the product as an
 * integrated sales platform, not just a point of sale till.
 */
class ElonPosFacts
{
    public static function promptBlock(): string
    {
        return "\n\nELON POS (verified facts; these override any guess or general knowledge about POS software):\n"
            . "Elon POS is ElonPOS's own business software, an integrated sales platform for businesses in Ghana. "
            . "Prince Caleb did not build it and it is not a custom project for a client: he sells it and installs "
            . "it as an authorised ElonPOS agent, and enquiries about it come to him. "
            . "It runs a whole business from one place, on the phones and computers the business already has: "
            . "sales at the counter, by phone or in the field, so staff can sell from their own phones; inventory, "
            . "warehouse and purchasing; the business's own online shop; deliveries; customers and credit; staff "
            . "and HR; accounts; live reports for any branch; approvals; and AI agents. The owner sees sales, "
            . "stock, staff and payments live from anywhere, gets an instant alert when a customer pays, and it "
            . "works offline. It suits supermarkets, restaurants and bars, pharmacies, wholesalers, hotels, "
            . "boutiques and shops of every kind. "
            . "Real results recorded on the system so far: over 10 million cedis in sales, over 100,000 "
            . "transactions and over 100,000 products. "
            . "PRICE, say this plainly when asked: on the launch offer the software itself is FREE (GHS 0 for the "
            . "software), with no monthly subscription and unlimited staff. The business pays only a one-time "
            . "installation fee, which covers setting it up in their business, loading their goods and training "
            . "their people. Never say Elon POS is not free, and never quote or estimate the installation amount: "
            . "Caleb gives that after hearing about the business (its type, branches, number of products and "
            . "staff). A free demonstration in their own business is available before they pay anything. "
            . "When someone is interested, follow the contact-first rule: get their name, phone number and email, "
            . "then their business type and location, and call log_inquiry with \"Elon POS\" at the start of the "
            . "summary, or offer to book a call. Do not share ElonPOS's own phone number or website; enquiries go "
            . "through Caleb. Do not present Elon POS as one of Caleb's portfolio case studies.";
    }

    /** True when an offline visitor message is about Elon POS, so the keyword fallback answers it directly. */
    public static function isAbout(string $message): bool
    {
        return (bool) preg_match('/\belon\s*-?\s*pos\b|\belonpos\b|\bpos\b|\bpoint\s+of\s+sale\b/i', $message);
    }

    /** The offline reply, for when no AI provider is reachable. */
    public static function fallbackReply(): string
    {
        return "Elon POS runs your sales, stock, staff and payments from your phone. On the launch offer the software "
            . "is free: you only pay a one-time installation fee, with no monthly subscription. Leave your name and "
            . "phone number, or message us on WhatsApp, and Caleb will arrange a free demonstration in your business.";
    }
}
