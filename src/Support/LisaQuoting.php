<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Scope-based price decisions for Lisa, anchored on the owner's own published
 * price list (Admin -> Pricing tiers). Jev never produces a number, and no AI provider makes any decision here (the providers only
 * write Lisa's words, after Jev has decided). Code pulls
 * the candidate prices out of the pricing text, Jev SELECTS which one applies
 * to what the customer wants and reads how the scope compares to it, and code
 * decides what to do:
 *
 *   list         the scope matches the listed build: use the exact listed price
 *   reduced      the customer needs less: reduce it, within the cap the owner set
 *                (quote_max_reduction_percent, default 0 so nothing is reduced
 *                until the owner allows it)
 *   adjusted_up  the customer needs more: list price plus the owner's add-on
 *                prices for each extra feature (quote_addon_*_ghs)
 *   estimate     no listed price fits, or an add-on has no price: Jev picks one of
 *                a few price bands that code builds from the owner's own listed
 *                prices (never a number Jev or an AI provider invents), always
 *                flagged and sent to the owner now
 *   ask_more     not enough detail: Lisa asks, and may say the listed "from" price
 *   owner_review unusual, negotiating, nothing to anchor on, or above the owner's
 *                review threshold: no number, the owner is alerted now
 *
 * Alerts to the owner's WhatsApp: immediately for owner_review, estimate, a
 * customer who wants to proceed, or negotiation; otherwise one summary after the
 * conversation has been quiet for lisa_quote_summary_after_hours (default 2).
 *
 * Setting `lisa_quote_mode`: 'shadow' (default) records each decision and tells
 * the owner what Lisa WOULD have quoted, without changing what Lisa says;
 * 'live' lets Lisa share the figure; 'off' disables. Runs only while
 * lisa_jev_mode is not off, since the scope reading belongs to the same layer.
 */
final class LisaQuoting
{
    public const TYPES = [
        'business_website' => 'business website',
        'ecommerce_store' => 'online store',
        'web_app' => 'custom web app',
        'mobile_app' => 'mobile app',
        'ai_agent_or_automation' => 'AI agent or automation',
        'other' => 'something else',
    ];

    /** Feature => [label, add-on setting (GHS, optional)]. */
    public const FEATURES = [
        'booking' => ['label' => 'online booking', 'setting' => 'quote_addon_booking_ghs'],
        'payments' => ['label' => 'online payments', 'setting' => 'quote_addon_payments_ghs'],
        'accounts' => ['label' => 'user accounts and logins', 'setting' => 'quote_addon_accounts_ghs'],
        'cms' => ['label' => 'a content management system', 'setting' => 'quote_addon_cms_ghs'],
        'multilanguage' => ['label' => 'more than one language', 'setting' => 'quote_addon_multilanguage_ghs'],
        'integrations' => ['label' => 'third-party integrations', 'setting' => 'quote_addon_integrations_ghs'],
        'custom_design' => ['label' => 'fully custom design', 'setting' => 'quote_addon_custom_design_ghs'],
    ];

    private const FEATURE_AT = 0.60;
    private const ENOUGH_DETAIL_AT = 0.60;
    private const UNUSUAL_AT = 0.65;
    private const NEGOTIATING_AT = 0.70;
    private const PROCEED_AT = 0.75;
    /** An estimate must stay inside [0.5 x cheapest, 4 x dearest] listed price and be a sensible range. */
    private const ESTIMATE_FLOOR = 0.5;
    private const ESTIMATE_CEILING = 4.0;
    private const ESTIMATE_MAX_SPREAD = 2.5;

    /** Estimate bands: [min multiplier, max multiplier, what Jev is told it means] applied to the nearest listed price. */
    private const BANDS = [
        'about_half' => [0.5, 0.8, 'Clearly smaller and simpler than the nearest listed build, roughly half of it.'],
        'similar' => [0.8, 1.25, 'About the same size as the nearest listed build.'],
        'moderately_more' => [1.25, 2.0, 'Moderately bigger than the nearest listed build, up to about double.'],
        'much_more' => [2.0, 3.0, 'Much bigger, two to three times the nearest listed build.'],
        'far_more' => [3.0, 4.0, 'Far bigger, three to four times the nearest listed build.'],
    ];

    public static function mode(): string
    {
        $mode = strtolower(trim((string) Settings::get('lisa_quote_mode')));
        return in_array($mode, ['off', 'live'], true) ? $mode : 'shadow';
    }

    /** A GHS amount from Settings, or null when the owner has not entered one. */
    private static function money(string $key): ?float
    {
        $raw = preg_replace('/[^0-9.]/', '', (string) Settings::get($key)) ?? '';
        return $raw !== '' && is_numeric($raw) ? (float) $raw : null;
    }

    /**
     * The owner's published prices, pulled out of the pricing tiers as
     * candidates. Only GHS amounts count: project prices are quoted in cedis.
     *
     * @return array<int,array{key:string,tier:string,label:string,amount:float,text:string}>
     */
    public static function priceList(): array
    {
        $out = [];
        $seen = [];
        for ($i = 1; $i <= 4; $i++) {
            $tier = trim((string) Settings::get("pricing_tier_{$i}_name"));
            if ($tier === '') {
                continue;
            }
            foreach (['price', 'tagline'] as $field) {
                $text = trim((string) Settings::get("pricing_tier_{$i}_{$field}"));
                if ($text === '' || !preg_match_all('/([^.\n]{0,70}?)\b(?:GHS|GH₵|₵)\s?(\d[\d,]*(?:\.\d+)?)/iu', $text, $m, PREG_SET_ORDER)) {
                    continue;
                }
                foreach ($m as $hit) {
                    $amount = (float) str_replace(',', '', $hit[2]);
                    if ($amount <= 0 || isset($seen[(string) $amount])) {
                        continue;
                    }
                    $seen[(string) $amount] = true;
                    $label = trim(preg_replace('/\s+/', ' ', $hit[1]) ?? '');
                    $out[] = [
                        'key' => 'p' . (count($out) + 1),
                        'tier' => $tier,
                        'label' => $label,
                        'amount' => $amount,
                        'text' => trim($label . ' GHS ' . number_format($amount)),
                    ];
                }
            }
        }
        return $out;
    }

    /**
     * Jev's reading of the project scope against the owner's price list.
     *
     * @param array<int,array<string,mixed>> $prices from priceList()
     * @return array<string,mixed>|null
     */
    public static function assessScope(string $message, array $transcript, array $prices): ?array
    {
        $turns = [];
        foreach (array_slice($transcript, -14) as $t) {
            $text = trim((string) ($t['text'] ?? ''));
            if ($text !== '') {
                $turns[] = ['speaker' => ($t['role'] ?? '') === 'user' ? 'customer' : 'Lisa (our assistant)', 'text' => mb_substr($text, 0, 600)];
            }
        }
        $yesNo = static fn (string $q, string $yes, string $no) => [
            'type' => 'noul', 'instructions' => $q, 'criteria' => ['true' => $yes, 'false' => $no],
        ];

        $listCriteria = [];
        foreach ($prices as $p) {
            $listCriteria[$p['key']] = "{$p['tier']}: {$p['text']}";
        }
        $nearestCriteria = $listCriteria;
        $listCriteria['none'] = 'None of the listed prices applies to what this customer wants.';

        $questions = [
            'project_type' => [
                'type' => 'choice',
                'instructions' => 'What kind of project is the customer describing or asking to have priced?',
                'criteria' => [
                    'business_website' => 'A website for a business, organisation or person: pages, information, contact forms.',
                    'ecommerce_store' => 'An online store selling products, with a catalogue and checkout.',
                    'web_app' => 'A custom web application or portal, dashboard, or internal tool.',
                    'mobile_app' => 'A mobile app for phones.',
                    'ai_agent_or_automation' => 'An AI agent, chatbot, voice or WhatsApp assistant, or a business workflow automation.',
                    'other' => 'None of these, unclear, or not a project at all.',
                ],
            ],
            'list_price' => [
                'type' => 'choice',
                'instructions' => "The studio publishes these starting prices. Which one is the right starting price for the kind of project this customer wants? Choose 'none' if no listed price is for this kind of project.",
                'criteria' => $listCriteria,
            ],
            'nearest_price' => [
                'type' => 'choice',
                'instructions' => 'If there is no exactly matching listed price, which listed starting price is the closest reference point for what this customer wants?',
                'criteria' => $nearestCriteria,
            ],
            'estimate_band' => [
                'type' => 'choice',
                'instructions' => 'Compared with the standard build behind the closest listed price, how big is what this customer wants?',
                'criteria' => array_map(static fn ($b) => $b[2], self::BANDS),
            ],
            'scope_size' => [
                'type' => 'score',
                'instructions' => 'Compared with a basic, standard build of the kind of project the listed starting price covers, how big is what this customer actually wants?',
                'criteria' => [
                    'Much smaller than the standard build: a fraction of it.',
                    'Somewhat smaller: fewer pages or features than the standard build.',
                    'About the standard build the listed price covers.',
                    'Somewhat larger: several extra features beyond the standard build.',
                    'Much larger: many extra features, several user types, or serious custom work.',
                ],
            ],
            'enough_detail' => $yesNo(
                'Has the customer given enough detail about what they need to price the project sensibly?',
                'Yes: the kind of project and its main features or purpose are clear.',
                'No: it is vague, or the main features are unknown.'
            ),
            'unusual' => $yesNo(
                'Is this project unusually large, complex, regulated, or unlike a typical small business build?',
                'Yes: enterprise scale, many user types, heavy compliance, marketplace or platform ambitions, or a very custom system.',
                'No: a typical small-business scope.'
            ),
            'negotiating' => $yesNo(
                'Is the customer asking for a discount, haggling on price, or comparing against a lower quote?',
                'Yes.',
                'No.'
            ),
            'wants_to_proceed' => $yesNo(
                'Is the customer saying they want to go ahead, start, pay a deposit, or sign?',
                'Yes: a clear go-ahead or a request for how to start and pay.',
                'No: still exploring or asking questions.'
            ),
        ];
        foreach (self::FEATURES as $key => $f) {
            $questions['feature_' . $key] = $yesNo(
                "Does the customer's project need {$f['label']}?",
                'Yes: they asked for it or it clearly follows from what they described.',
                'No, or not mentioned.'
            );
        }

        $answers = TypeSafeClient::ask([
            'business' => 'A one-person web, mobile and AI automation studio (Prince Caleb) run through an assistant called Lisa.',
            'conversation' => $turns,
            'newest_customer_message' => mb_substr($message, 0, 1000),
        ], $questions, 6, 'LisaQuoting');
        if ($answers === null) {
            return null;
        }

        $type = TypeSafeClient::choice($answers, 'project_type');
        $list = TypeSafeClient::choice($answers, 'list_price');
        $size = TypeSafeClient::score($answers, 'scope_size');
        $nearest = TypeSafeClient::choice($answers, 'nearest_price');
        $band = TypeSafeClient::choice($answers, 'estimate_band');
        $detail = TypeSafeClient::noul($answers, 'enough_detail');
        $unusual = TypeSafeClient::noul($answers, 'unusual');
        $negotiating = TypeSafeClient::noul($answers, 'negotiating');
        $proceed = TypeSafeClient::noul($answers, 'wants_to_proceed');
        if ($type === null || $list === null || $size === null || $nearest === null || $band === null || $detail === null || $unusual === null || $negotiating === null || $proceed === null) {
            error_log('LisaQuoting: incomplete answers: ' . substr((string) json_encode($answers), 0, 400));
            return null;
        }
        $features = [];
        foreach (array_keys(self::FEATURES) as $key) {
            $features[$key] = round((float) (TypeSafeClient::noul($answers, 'feature_' . $key) ?? 0.0), 3);
        }
        $valid = array_column($prices, 'key');
        return [
            'project_type' => isset(self::TYPES[$type['choice']]) ? $type['choice'] : 'other',
            'list_price_key' => in_array($list['choice'], $valid, true) ? $list['choice'] : 'none',
            'list_confidence' => round($list['confidence'], 3),
            'nearest_price_key' => in_array($nearest['choice'], $valid, true) ? $nearest['choice'] : ($valid[0] ?? 'none'),
            'estimate_band' => isset(self::BANDS[$band['choice']]) ? $band['choice'] : 'similar',
            'scope_size' => round($size, 2),
            'enough_detail' => round($detail, 3),
            'unusual' => round($unusual, 3),
            'negotiating' => round($negotiating, 3),
            'wants_to_proceed' => round($proceed, 3),
            'features' => $features,
        ];
    }

    /**
     * The pricing decision from a scope reading and the owner's rules. Pure: no network, no AI provider.
     *
     * @param array<string,mixed> $scope
     * @param array<int,array<string,mixed>> $prices
     * @return array{decision:string,low:?float,high:?float,list_price:?float,adjustments:array<int,string>,reason:string,immediate:bool}
     */
    public static function decide(array $scope, array $prices): array
    {
        $out = ['decision' => 'owner_review', 'low' => null, 'high' => null, 'list_price' => null, 'adjustments' => [], 'reason' => '', 'immediate' => false];
        $out['immediate'] = $scope['wants_to_proceed'] >= self::PROCEED_AT;

        if ($scope['negotiating'] >= self::NEGOTIATING_AT) {
            $out['reason'] = 'the customer is negotiating on price, which you handle personally';
            $out['immediate'] = true;
            return $out;
        }
        if ($scope['project_type'] === 'other' || $scope['unusual'] >= self::UNUSUAL_AT) {
            $out['reason'] = $scope['project_type'] === 'other' ? 'the project does not fit a standard type' : 'the scope looks unusually large or complex';
            $out['immediate'] = true;
            return $out;
        }

        $chosen = null;
        foreach ($prices as $p) {
            if ($p['key'] === $scope['list_price_key']) {
                $chosen = $p;
            }
        }
        $out['list_price'] = $chosen['amount'] ?? null;

        if ($scope['enough_detail'] < self::ENOUGH_DETAIL_AT) {
            $out['decision'] = 'ask_more';
            $out['reason'] = 'not enough detail yet to price a ' . self::TYPES[$scope['project_type']];
            return $out;
        }

        $size = (int) round($scope['scope_size']); // 0..4, 2 = the standard build
        if ($chosen !== null) {
            $base = (float) $chosen['amount'];
            if ($size === 2) {
                return self::finish($out, 'list', $base, $base, 'the scope matches the listed build, so the exact list price applies');
            }
            if ($size < 2) {
                $cap = self::money('quote_max_reduction_percent') ?? 0.0;
                $factor = max(0.0, min(100.0, $cap)) / 100 * ($size === 0 ? 1.0 : 0.5);
                if ($factor <= 0) {
                    return self::finish($out, 'list', $base, $base, 'the customer needs less than the listed build, but reductions are not allowed in Settings, Quoting, so the list price stands');
                }
                $price = self::round50($base * (1 - $factor));
                $out['adjustments'][] = sprintf('reduced by %d%% for a smaller scope', (int) round($factor * 100));
                return self::finish($out, 'reduced', $price, $price, sprintf('a smaller scope than the listed build: reduced from GHS %s within your cap of %d%%', number_format($base), (int) $cap));
            }
            // Larger than the listed build: add the owner's add-on prices, if every needed feature has one.
            $needed = array_keys(array_filter($scope['features'], static fn ($p) => $p >= self::FEATURE_AT));
            $total = $base;
            $priced = $needed !== [];
            foreach ($needed as $key) {
                $add = self::money(self::FEATURES[$key]['setting']);
                if ($add === null) {
                    $priced = false;
                    break;
                }
                $total += $add;
                $out['adjustments'][] = sprintf('+ GHS %s for %s', number_format($add), self::FEATURES[$key]['label']);
            }
            if ($priced) {
                return self::finish($out, 'adjusted_up', $total, $total, 'a larger scope than the listed build: list price plus your add-on prices');
            }
            $out['adjustments'] = [];
        }

        // No listed price fits, or the extras have no price set: a bounded estimate, flagged for the owner.
        return self::estimate($out, $scope, $prices, $chosen);
    }

    /**
     * @param array<string,mixed> $out
     * @return array<string,mixed>
     */
    private static function finish(array $out, string $decision, float $low, float $high, string $reason): array
    {
        $threshold = self::money('quote_owner_review_above_ghs');
        if ($threshold !== null && $high > $threshold) {
            $out['decision'] = 'owner_review';
            $out['reason'] = sprintf('the figure (GHS %s) is above your review threshold of GHS %s', number_format($high), number_format($threshold));
            $out['immediate'] = true;
            return $out;
        }
        $out['decision'] = $decision;
        $out['low'] = $low;
        $out['high'] = $high;
        $out['reason'] = $reason;
        return $out;
    }

    /**
     * Estimate from the band Jev chose, applied to the nearest listed price. The
     * numbers come from the owner's own prices and a fixed band table; Jev only
     * picks the band.
     *
     * @param array<string,mixed>|null $chosen the exactly matching listed price, if any
     * @return array<string,mixed>
     */
    private static function estimate(array $out, array $scope, array $prices, ?array $chosen): array
    {
        $anchors = array_column($prices, 'amount');
        if ($anchors === []) {
            $out['reason'] = 'there is no listed price to anchor an estimate on (Admin, Pricing)';
            $out['immediate'] = true;
            return $out;
        }
        $ref = $chosen;
        foreach ($prices as $p) {
            if ($ref === null && $p['key'] === ($scope['nearest_price_key'] ?? '')) {
                $ref = $p;
            }
        }
        $ref ??= $prices[0];
        [$minMult, $maxMult] = self::BANDS[$scope['estimate_band']] ?? self::BANDS['similar'];
        $low = self::round50($ref['amount'] * $minMult);
        $high = self::round50($ref['amount'] * $maxMult);

        if ($low <= 0 || $low < min($anchors) * self::ESTIMATE_FLOOR || $high > max($anchors) * self::ESTIMATE_CEILING || $high > $low * self::ESTIMATE_MAX_SPREAD) {
            $out['reason'] = 'no listed price fits this project and the band falls outside a safe range of your prices';
            $out['immediate'] = true;
            return $out;
        }
        $out['list_price'] = $ref['amount'];
        $out['adjustments'][] = sprintf('estimate: %s from %s (%s)', self::BANDS[$scope['estimate_band']][2] ?? 'a similar size', $ref['text'], $ref['tier']);
        $out = self::finish($out, 'estimate', $low, $high, 'no listed price fits this exactly, so this is an estimate for you to confirm');
        // A price that is not on your list always needs your eyes.
        $out['immediate'] = true;
        return $out;
    }

    private static function round50(float $v): float
    {
        return round($v / 50) * 50;
    }

    /**
     * What Lisa is told in live mode. The decision is already made, so this is
     * written as an instruction to follow, not information to reason over, and
     * it explicitly retires the older pricing guidance in her prompt (derive a
     * range from get_site_info tiers, engineering hours, "starting prices only",
     * no ranges before contact details). Two competing sets of pricing rules is
     * what made her hesitate; this block is the single source of truth.
     */
    public static function promptNote(array $d, array $scope): string
    {
        $type = self::TYPES[$scope['project_type']];
        $fmt = static fn (float $n) => 'GHS ' . number_format($n);
        $header = "PRICING DECISION (authoritative, already decided from Caleb's own price list by a separate check). "
            . "This REPLACES every earlier pricing instruction in this conversation, including deriving a range from the get_site_info tiers, "
            . "estimating from engineering hours, and only sharing starting prices. Do not work out, adjust or second-guess a price yourself, "
            . "and do not call get_site_info to price this. Follow this block exactly.\n";
        $manner = "How to say it: give the figure plainly in your own words as a rough estimate that Caleb confirms after reviewing the details, "
            . "never offer a discount, never promise an exact final price or a delivery date, and tell them Caleb will follow up personally. "
            . "If you do not yet have a name, email or phone number for them, ask for one first, then give the figure in the same reply or the next one.";
        switch ($d['decision']) {
            case 'list':
                return $header . "Decision: use the exact listed price. This is a {$type} and it matches the listed build. "
                    . 'Say it starts from ' . $fmt((float) $d['low']) . ". {$manner}";
            case 'reduced':
                return $header . "Decision: reduce the listed price. The list price is " . $fmt((float) $d['list_price']) . ", but this {$type} is a smaller scope. "
                    . 'Offer ' . $fmt((float) $d['low']) . " for what they described, and no lower. {$manner}";
            case 'adjusted_up':
                return $header . "Decision: add to the listed price. The list price is " . $fmt((float) $d['list_price']) . ", and this {$type} needs more than the standard build. "
                    . 'With the extras the figure is ' . $fmt((float) $d['low']) . ' (' . implode('; ', $d['adjustments']) . "). {$manner}";
            case 'estimate':
                return $header . "Decision: this exact project is not on the price list, so use the estimate. Give only this rough range: "
                    . $fmt((float) $d['low']) . ' to ' . $fmt((float) $d['high']) . ". Say plainly it is an estimate Caleb will confirm, and that he has already been notified. {$manner}";
            case 'ask_more':
                $from = $d['list_price'] !== null ? ' You may say Caleb\'s published starting price for this kind of project is ' . $fmt((float) $d['list_price']) . '.' : '';
                return $header . "Decision: not enough detail to price this {$type} yet.{$from} Give no other number. Ask one or two questions "
                    . '(what pages or features it needs, whether it needs online payments, booking or user accounts, and their deadline), then continue.';
        }
        return $header . 'Decision: give no price for this one. Tell them Caleb reviews this kind of request personally and has been notified, '
            . 'and gather their contact details and a short description of what they need.';
    }

    /**
     * Called from LisaJudgment::process() for messages that look like a
     * project or pricing conversation.
     *
     * @param array{message:string,transcript:array,channel:string,session_token:?string,name:string,phone:string,is_owner:bool} $ctx
     * @return array{prompt_note:?string,scope:?array,decision:?array}
     */
    public static function process(array $ctx, \PDO $pdo): array
    {
        $empty = ['prompt_note' => null, 'scope' => null, 'decision' => null];
        $mode = self::mode();
        if ($mode === 'off') {
            return $empty;
        }
        $prices = self::priceList();
        $scope = self::assessScope($ctx['message'], $ctx['transcript'], $prices);
        if ($scope === null) {
            return $empty;
        }
        $d = self::decide($scope, $prices);
        $live = $mode === 'live';
        $token = (string) ($ctx['session_token'] ?? '');
        $givesFigure = in_array($d['decision'], ['list', 'reduced', 'adjusted_up', 'estimate'], true);

        if ($token !== '') {
            self::save($pdo, $token, $ctx, $scope, $d, $live && $givesFigure);
        }
        if ($d['immediate'] && $token !== '') {
            LisaJudgment::alertOwner('quote_now', 'quote needs you', self::summary($ctx, $scope, $d, $live), $token, $ctx['phone'], $live, $pdo);
        }

        return ['prompt_note' => $live ? self::promptNote($d, $scope) : null, 'scope' => $scope, 'decision' => $d];
    }

    /** @param array<string,mixed> $d */
    private static function save(\PDO $pdo, string $token, array $ctx, array $scope, array $d, bool $quotedToCustomer): void
    {
        $existing = $pdo->prepare('SELECT id FROM lisa_quotes WHERE session_token = ?');
        $existing->execute([$token]);
        $id = $existing->fetchColumn();
        $values = [
            $ctx['name'] !== '' ? $ctx['name'] : null,
            $ctx['phone'] !== '' ? $ctx['phone'] : null,
            $ctx['channel'],
            $scope['project_type'],
            json_encode($scope),
            $d['low'],
            $d['high'],
            $d['decision'],
            $d['reason'],
            json_encode(['list_price' => $d['list_price'], 'adjustments' => $d['adjustments']]),
        ];
        if ($id) {
            $pdo->prepare(
                "UPDATE lisa_quotes SET contact_name = COALESCE(?, contact_name), contact_phone = COALESCE(?, contact_phone), channel = ?,
                    project_type = ?, scope_json = ?, low_ghs = ?, high_ghs = ?, decision = ?, reason = ?, basis_json = ?,
                    quoted_to_customer = MAX(quoted_to_customer, ?), updated_at = datetime('now') WHERE id = ?"
            )->execute(array_merge($values, [$quotedToCustomer ? 1 : 0, $id]));
            return;
        }
        $pdo->prepare(
            'INSERT INTO lisa_quotes (contact_name, contact_phone, channel, project_type, scope_json, low_ghs, high_ghs, decision, reason, basis_json, session_token, quoted_to_customer)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute(array_merge($values, [$token, $quotedToCustomer ? 1 : 0]));
    }

    /** @param array<string,mixed> $d */
    public static function summary(array $ctx, array $scope, array $d, bool $live): string
    {
        $who = trim((string) $ctx['name']) !== '' ? $ctx['name'] : 'A customer';
        $features = [];
        foreach (self::FEATURES as $key => $f) {
            if (($scope['features'][$key] ?? 0) >= self::FEATURE_AT) {
                $features[] = $f['label'];
            }
        }
        $line = sprintf('%s on %s wants a %s', $who, ($ctx['channel'] ?? '') === 'whatsapp' ? 'WhatsApp' : 'the website chat', self::TYPES[$scope['project_type']]);
        $line .= ($features !== [] ? ' with ' . implode(', ', $features) : '') . '. ';
        $fmt = static fn ($n) => 'GHS ' . number_format((float) $n);
        $shared = $live ? 'Lisa can share it' : 'Shadow mode: Lisa did not share it';
        switch ($d['decision']) {
            case 'list':
                $line .= "Exact list price {$fmt($d['low'])}. {$shared}.";
                break;
            case 'reduced':
                $line .= "Reduced from your list price {$fmt($d['list_price'])} to {$fmt($d['low'])} for a smaller scope. {$shared}.";
                break;
            case 'adjusted_up':
                $line .= "Added to your list price {$fmt($d['list_price'])}: {$fmt($d['low'])} in total. {$shared}.";
                break;
            case 'estimate':
                $line .= "Not on your price list. Estimate {$fmt($d['low'])} to {$fmt($d['high'])}, please confirm. {$shared}.";
                break;
            case 'ask_more':
                $line .= 'Not enough detail to price yet.';
                break;
            default:
                $line .= 'No number given: ' . $d['reason'] . '.';
        }
        if (($scope['wants_to_proceed'] ?? 0) >= self::PROCEED_AT) {
            $line .= ' They want to go ahead.';
        }
        return $line;
    }

    /**
     * The "after the conversation" alert: once a conversation that produced a
     * figure or a review request has been quiet long enough, send the owner one
     * summary. Quiet hours defer it to the next run. Call from cron.
     *
     * @return int summaries handled this pass
     */
    public static function sendDueSummaries(\PDO $pdo): int
    {
        $mode = self::mode();
        if ($mode === 'off') {
            return 0;
        }
        $live = $mode === 'live';
        $hours = max(1, (int) (Settings::get('lisa_quote_summary_after_hours') ?: 2));
        try {
            $rows = $pdo->query(
                "SELECT * FROM lisa_quotes
                 WHERE summary_sent_at IS NULL AND decision IN ('list', 'reduced', 'adjusted_up', 'estimate', 'owner_review')
                   AND updated_at <= datetime('now', '-{$hours} hours')
                 ORDER BY updated_at ASC LIMIT 20"
            )->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return 0; // table appears once migrate.php has run
        }

        $n = 0;
        foreach ($rows as $r) {
            $scope = json_decode((string) $r['scope_json'], true) ?: [];
            if ($scope === []) {
                continue;
            }
            $basis = json_decode((string) $r['basis_json'], true) ?: [];
            $d = [
                'decision' => $r['decision'], 'low' => $r['low_ghs'], 'high' => $r['high_ghs'],
                'list_price' => $basis['list_price'] ?? null, 'reason' => (string) $r['reason'],
            ];
            $result = LisaJudgment::alertOwner(
                'quote_summary',
                'quote summary',
                self::summary(['name' => (string) $r['contact_name'], 'channel' => (string) $r['channel']], $scope, $d, $live),
                (string) $r['session_token'],
                (string) $r['contact_phone'],
                $live,
                $pdo
            );
            // Done once delivered (or, in shadow, recorded). A failed delivery or a quiet-hours deferral is retried next run.
            if (str_starts_with($result, 'shadow:') || str_starts_with($result, 'WhatsApp alert sent') || str_starts_with($result, 'skipped: already alerted')) {
                $pdo->prepare("UPDATE lisa_quotes SET summary_sent_at = datetime('now') WHERE id = ?")->execute([$r['id']]);
                $n++;
            }
        }
        return $n;
    }
}
