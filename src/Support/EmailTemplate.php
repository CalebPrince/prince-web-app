<?php

declare(strict_types=1);

namespace App\Support;

class EmailTemplate
{
    /**
     * @param array<string, scalar|null> $vars
     * @param array{subject:string,html:string,text:string} $defaults
     * @return array{subject:string,html:string,text:string}
     */
    public static function render(string $key, array $vars, array $defaults): array
    {
        $subject = Settings::get("email_tpl_{$key}_subject") ?: $defaults['subject'];
        $html = Settings::get("email_tpl_{$key}_html") ?: $defaults['html'];
        $text = Settings::get("email_tpl_{$key}_text") ?: $defaults['text'];

        return [
            'subject' => self::replace($subject, $vars, false),
            'html' => self::wrapHtml(self::replace($html, $vars, true), $key),
            'text' => self::replace($text, $vars, false),
        ];
    }

    /** @param array<string, scalar|null> $vars */
    private static function replace(string $template, array $vars, bool $escapeHtml): string
    {
        foreach ($vars as $key => $value) {
            $safe = (string) ($value ?? '');
            if ($escapeHtml) {
                $safe = htmlspecialchars($safe, ENT_QUOTES, 'UTF-8');
            }
            $template = str_replace('{{' . $key . '}}', $safe, $template);
        }
        return $template;
    }

    private static function wrapHtml(string $body, string $key): string
    {
        if (str_contains(strtolower($body), '<html')) {
            return $body;
        }

        $theme = self::theme($key);
        $brand = self::brand();
        $contacts = self::contactLine($brand);
        $logo = $brand['logo_url'] !== ''
            ? '<img src="' . self::e($brand['logo_url']) . '" width="42" height="42" alt="Prince Caleb" style="display:block;width:42px;height:42px;border-radius:12px;object-fit:cover;">'
            : '<div style="width:42px;height:42px;border-radius:12px;background:' . $theme['accent'] . ';color:#ffffff;font:bold 22px/42px Arial,sans-serif;text-align:center;">P</div>';

        return '<!doctype html><html><body style="margin:0;background:' . $theme['background'] . ';padding:24px;font-family:Arial,sans-serif;color:#17181c;">'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;margin:0 auto;">'
            . '<tr><td style="padding:0 0 14px;">'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>'
            . '<td width="52" style="vertical-align:middle;">' . $logo . '</td>'
            . '<td style="vertical-align:middle;padding-left:12px;"><div style="font-size:18px;font-weight:800;color:#111318;">Prince Caleb<span style="color:' . $theme['accent'] . ';">.</span></div><div style="font-size:12px;color:#68707c;">Web and mobile app development</div></td>'
            . '</tr></table>'
            . '</td></tr>'
            . '<tr><td style="background:' . $theme['accent'] . ';height:6px;border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>'
            . '<tr><td style="background:#ffffff;border-left:1px solid #e6e4df;border-right:1px solid #e6e4df;">'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>'
            . '<td style="padding:24px 28px 10px;">'
            . '<div style="display:inline-block;background:' . $theme['tint'] . ';color:' . $theme['accent'] . ';border:1px solid ' . $theme['soft'] . ';border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">' . self::e($theme['label']) . '</div>'
            . '</td></tr>'
            . '<tr><td style="padding:0 28px 30px;font-size:16px;line-height:1.65;">'
            . $body
            . '</td></tr></table>'
            . '</td></tr>'
            . '<tr><td style="padding:18px 28px;background:#111318;color:#cbd5e1;font-size:13px;border-radius:0 0 14px 14px;">'
            . '<div style="font-weight:700;color:#ffffff;margin-bottom:5px;">Prince Caleb</div>'
            . '<div style="line-height:1.6;">' . $contacts . '</div>'
            . '<div style="margin-top:10px;"><a href="' . self::e($brand['site_url']) . '" style="color:#ffffff;text-decoration:none;">Visit website</a> &nbsp;|&nbsp; <a href="' . self::e($brand['book_url']) . '" style="color:#ffffff;text-decoration:none;">Book a call</a></div>'
            . '</td></tr>'
            . '</table></body></html>';
    }

    /** @return array{label:string,accent:string,soft:string,tint:string,background:string} */
    private static function theme(string $key): array
    {
        $themes = [
            'payment_success' => ['label' => 'Payment confirmed', 'accent' => '#0f766e', 'soft' => '#99f6e4', 'tint' => '#ecfeff', 'background' => '#eef8f7'],
            'invoice_send' => ['label' => 'Invoice ready', 'accent' => '#2563eb', 'soft' => '#bfdbfe', 'tint' => '#eff6ff', 'background' => '#eef4ff'],
            'invoice_receipt' => ['label' => 'Receipt', 'accent' => '#15803d', 'soft' => '#bbf7d0', 'tint' => '#f0fdf4', 'background' => '#eff8f1'],
            'subscription_receipt' => ['label' => 'Subscription', 'accent' => '#7c3aed', 'soft' => '#ddd6fe', 'tint' => '#f5f3ff', 'background' => '#f4f1ff'],
            'proposal_send' => ['label' => 'Proposal', 'accent' => '#4338ca', 'soft' => '#c7d2fe', 'tint' => '#eef2ff', 'background' => '#f0f2ff'],
            'booking_client_confirmation' => ['label' => 'Booking confirmed', 'accent' => '#be123c', 'soft' => '#fecdd3', 'tint' => '#fff1f2', 'background' => '#fff1f4'],
            'booking_internal_notification' => ['label' => 'Booking alert', 'accent' => '#334155', 'soft' => '#cbd5e1', 'tint' => '#f8fafc', 'background' => '#eef2f6'],
            'appointment_reminder' => ['label' => 'Call reminder', 'accent' => '#b45309', 'soft' => '#fed7aa', 'tint' => '#fff7ed', 'background' => '#fff6eb'],
            'client_invite' => ['label' => 'Client portal', 'accent' => '#0d9488', 'soft' => '#99f6e4', 'tint' => '#f0fdfa', 'background' => '#eefaf8'],
            'client_password_reset' => ['label' => 'Security', 'accent' => '#dc2626', 'soft' => '#fecaca', 'tint' => '#fef2f2', 'background' => '#fff1f1'],
            'client_portal_message' => ['label' => 'New message', 'accent' => '#4f46e5', 'soft' => '#c7d2fe', 'tint' => '#eef2ff', 'background' => '#f1f3ff'],
            'project_request_confirmation' => ['label' => 'Project request', 'accent' => '#0891b2', 'soft' => '#a5f3fc', 'tint' => '#ecfeff', 'background' => '#edfaff'],
            'testimonial_request' => ['label' => 'Review request', 'accent' => '#a21caf', 'soft' => '#f5d0fe', 'tint' => '#fdf4ff', 'background' => '#fcf0ff'],
            'milestone_reminder' => ['label' => 'Milestone', 'accent' => '#c2410c', 'soft' => '#fed7aa', 'tint' => '#fff7ed', 'background' => '#fff5ed'],
            'inquiry_internal_notification' => ['label' => 'New inquiry', 'accent' => '#475569', 'soft' => '#cbd5e1', 'tint' => '#f8fafc', 'background' => '#f1f5f9'],
        ];

        return $themes[$key] ?? ['label' => 'Prince Caleb', 'accent' => '#0a0b0d', 'soft' => '#e5e7eb', 'tint' => '#f9fafb', 'background' => '#f6f6f4'];
    }

    /** @return array{logo_url:string,site_url:string,book_url:string,email:string,phone:string,whatsapp:string} */
    private static function brand(): array
    {
        $siteUrl = rtrim(Settings::get('email_site_url') ?: 'https://princecaleb.dev', '/');
        return [
            'logo_url' => trim((string) (Settings::get('email_brand_logo_url') ?: '')),
            'site_url' => $siteUrl,
            'book_url' => $siteUrl . '/book.html',
            'email' => Settings::get('social_email') ?: '',
            'phone' => Settings::get('contact_phone') ?: '',
            'whatsapp' => Settings::get('social_whatsapp') ?: '',
        ];
    }

    /** @param array{logo_url:string,site_url:string,book_url:string,email:string,phone:string,whatsapp:string} $brand */
    private static function contactLine(array $brand): string
    {
        $parts = [];
        if ($brand['email'] !== '') {
            $parts[] = '<a href="mailto:' . self::e($brand['email']) . '" style="color:#cbd5e1;text-decoration:none;">' . self::e($brand['email']) . '</a>';
        }
        if ($brand['phone'] !== '') {
            $parts[] = '<span>' . self::e($brand['phone']) . '</span>';
        }
        if ($brand['whatsapp'] !== '') {
            $parts[] = '<a href="' . self::e($brand['whatsapp']) . '" style="color:#cbd5e1;text-decoration:none;">WhatsApp</a>';
        }

        return $parts ? implode(' &nbsp;|&nbsp; ', $parts) : 'Custom websites, web apps, mobile apps, and automation.';
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    /** @return array<string, array{subject:string,html:string,text:string}> */
    public static function defaults(): array
    {
        return [
            'payment_success' => [
                'subject' => 'Payment received - next steps for {{description}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Payment received.</h1><p>Hi {{name}},</p><p>Thanks for your payment of <strong>{{currency}} {{amount}}</strong> for <strong>{{description}}</strong>. It has been received and confirmed.</p><p><strong>Next steps:</strong></p><ol><li>I will review the details and reach out within 1 business day.</li><li>If we have not already, book a kickoff call here: <a href="{{booking_url}}">{{booking_url}}</a></li><li>Please gather brand assets, examples you like, and must-have features.</li></ol><p>Looking forward to working with you,<br>Prince Caleb</p>',
                'text' => "Hi {{name}},\n\nThanks for your payment of {{currency}} {{amount}} for {{description}}. It has been received and confirmed.\n\nNext steps:\n1. I will review the details and reach out within 1 business day.\n2. If we have not already, book a kickoff call here: {{booking_url}}\n3. Please gather brand assets, examples you like, and must-have features.\n\nLooking forward to working with you,\nPrince Caleb",
            ],
            'invoice_send' => [
                'subject' => 'Invoice {{invoice_number}} from Prince Caleb - {{currency}} {{amount}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Your invoice is ready.</h1><p>Hi {{client_name}},</p><p>Invoice <strong>{{invoice_number}}</strong> for <strong>{{currency}} {{amount}}</strong> is ready.</p><p>{{due_line}}</p><p><a href="{{invoice_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">View and pay invoice</a></p><p>If anything looks off, just reply to this email.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{currency}} {{amount}} is ready.\n{{due_line}}\n\nView and pay it here:\n{{invoice_url}}\n\nIf anything looks off, just reply to this email.\n\nPrince Caleb",
            ],
            'invoice_receipt' => [
                'subject' => 'Receipt for invoice {{invoice_number}} - {{currency}} {{amount}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Payment confirmed.</h1><p>Hi {{client_name}},</p><p>Thanks. Your payment of <strong>{{currency}} {{amount}}</strong> for invoice <strong>{{invoice_number}}</strong> has been received.</p><p>Your invoice now shows as paid and doubles as your receipt.</p><p><a href="{{invoice_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">View receipt</a></p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nThanks. Your payment of {{currency}} {{amount}} for invoice {{invoice_number}} has been received.\n\nYour invoice now shows as paid and doubles as your receipt:\n{{invoice_url}}\n\nPrince Caleb",
            ],
            'subscription_receipt' => [
                'subject' => 'Receipt: {{plan_name}} - {{currency}} {{amount}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Recurring payment received.</h1><p>Hi {{client_name}},</p><p>Your recurring payment of <strong>{{currency}} {{amount}}</strong> for <strong>{{plan_name}}</strong> was processed successfully.</p><p>Reference: <strong>{{reference}}</strong></p><p>No action is needed. If anything looks wrong, just reply.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nYour recurring payment of {{currency}} {{amount}} for {{plan_name}} was processed successfully.\nReference: {{reference}}\n\nNo action is needed. If anything looks wrong, just reply.\n\nPrince Caleb",
            ],
            'proposal_send' => [
                'subject' => 'Your project proposal is ready',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Your proposal is ready.</h1><p>Hi {{client_name}},</p><p>Your project proposal, <strong>{{proposal_title}}</strong>, is ready for review.</p><p><a href="{{proposal_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">Review proposal</a></p><p>Open the link to review the scope, timeline, terms, and payment milestones. If anything needs adjusting, just reply to this email.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nYour project proposal, {{proposal_title}}, is ready for review:\n\n{{proposal_url}}\n\nOpen the link to review the scope, timeline, terms, and payment milestones. If anything needs adjusting, just reply to this email.\n\nPrince Caleb",
            ],
            'booking_client_confirmation' => [
                'subject' => 'Your call is booked - {{date}} at {{time}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Your call is booked.</h1><p>Hi {{client_name}},</p><p>You are booked in for <strong>{{date}}</strong> at <strong>{{time}}</strong> ({{timezone}}).</p><p>{{topic_line}}</p><p>If you need to reschedule or cancel, just reply to this email.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nYou are booked in for {{date}} at {{time}} ({{timezone}}).\n{{topic_line}}\n\nIf you need to reschedule or cancel, just reply to this email.\n\nPrince Caleb",
            ],
            'booking_internal_notification' => [
                'subject' => 'New booking: {{date}} {{time}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">New booking confirmed.</h1><p><strong>Name:</strong> {{client_name}}<br><strong>Email:</strong> {{client_email}}<br><strong>Phone:</strong> {{client_phone}}<br><strong>Topic:</strong> {{topic}}<br><strong>Date:</strong> {{date}}<br><strong>Time:</strong> {{time}} ({{timezone}})</p>',
                'text' => "New booking confirmed\nName: {{client_name}}\nEmail: {{client_email}}\nPhone: {{client_phone}}\nTopic: {{topic}}\nDate: {{date}}\nTime: {{time}} ({{timezone}})",
            ],
            'appointment_reminder' => [
                'subject' => 'Reminder: your call is tomorrow at {{time}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">A quick reminder.</h1><p>Hi {{client_name}},</p><p>Your call is scheduled for tomorrow, <strong>{{date}}</strong> at <strong>{{time}}</strong> ({{timezone}}).</p><p>{{topic_line}}</p><p>If you need to reschedule or cancel, just reply to this email.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nYour call is scheduled for tomorrow, {{date}} at {{time}} ({{timezone}}).\n{{topic_line}}\n\nIf you need to reschedule or cancel, just reply to this email.\n\nPrince Caleb",
            ],
            'client_invite' => [
                'subject' => 'You are invited to your client portal',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Your client portal is ready.</h1><p>Hi {{client_name}},</p><p>You can now track your project status, milestones, files, and messages in one place.</p><p><a href="{{portal_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">Set up access</a></p><p>This link expires in 7 days.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nYou can now track your project status, milestones, files, and messages in one place:\n\n{{portal_url}}\n\nThis link expires in 7 days.\n\nPrince Caleb",
            ],
            'client_password_reset' => [
                'subject' => 'Reset your client portal password',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Reset your password.</h1><p>Hi {{client_name}},</p><p>Use the button below to reset your client portal password.</p><p><a href="{{reset_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">Reset password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>',
                'text' => "Hi {{client_name}},\n\nUse this link to reset your client portal password:\n\n{{reset_url}}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.",
            ],
            'client_portal_message' => [
                'subject' => 'New message from Prince Caleb',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">You have a new message.</h1><p>Hi {{client_name}},</p><p>You have a new message in your client portal:</p><blockquote style="margin:16px 0;padding:14px 16px;border-left:4px solid #0a0b0d;background:#f6f6f4;">{{message_body}}</blockquote><p><a href="{{portal_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">Open client portal</a></p>',
                'text' => "Hi {{client_name}},\n\nYou have a new message in your client portal:\n\n{{message_body}}\n\n{{portal_url}}",
            ],
            'project_request_confirmation' => [
                'subject' => 'We received your project request',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Request received.</h1><p>Hi {{client_name}},</p><p>Thanks for the details. I will review your <strong>{{project_type}}</strong> request with a <strong>{{budget}}</strong> budget and <strong>{{timeline}}</strong> timeline, then get back to you within a couple of business days.</p><p>If anything changes in the meantime, just reply to this email.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nThanks for the details. I will review your project request ({{project_type}}, {{budget}} budget, {{timeline}} timeline) and get back to you within a couple of business days.\n\nIf anything changes in the meantime, just reply to this email.\n\nPrince Caleb",
            ],
            'testimonial_request' => [
                'subject' => 'Quick favor - mind leaving a review?',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Could you leave a quick review?</h1><p>Hi {{client_name}},</p><p>Thanks again for working together{{project_reference_line}}. If you have two minutes, I would really appreciate a short review to share with future clients.</p><p><a href="{{testimonial_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">Leave a review</a></p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nThanks again for working together{{project_reference_line}}. If you have two minutes, I would really appreciate a short review to share with future clients:\n\n{{testimonial_url}}\n\nPrince Caleb",
            ],
            'milestone_reminder' => [
                'subject' => 'Reminder: {{milestone_title}} payment is still pending',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">Milestone payment reminder.</h1><p>Hi {{client_name}},</p><p>Just a reminder that the <strong>{{milestone_title}}</strong> milestone (<strong>{{currency}} {{amount}}</strong>) on your <strong>{{proposal_title}}</strong> project is still unpaid.</p><p><a href="{{payment_url}}" style="display:inline-block;background:#0a0b0d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;">Pay milestone</a></p><p>If you have already sent this another way or have questions, just reply.</p><p>Prince Caleb</p>',
                'text' => "Hi {{client_name}},\n\nJust a reminder that the {{milestone_title}} milestone ({{currency}} {{amount}}) on your {{proposal_title}} project is still unpaid:\n\n{{payment_url}}\n\nIf you have already sent this another way or have questions, just reply.\n\nPrince Caleb",
            ],
            'inquiry_internal_notification' => [
                'subject' => '{{notification_type}} from {{client_name}}',
                'html' => '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0a0b0d;">{{notification_type}}</h1><p><strong>Name:</strong> {{client_name}}<br><strong>Email:</strong> {{client_email}}</p><p>{{details_html}}</p><blockquote style="margin:16px 0;padding:14px 16px;border-left:4px solid #0a0b0d;background:#f6f6f4;">{{message_body}}</blockquote>',
                'text' => "Name: {{client_name}}\nEmail: {{client_email}}\n\n{{details_text}}{{message_body}}\n\n- sent automatically from the princecaleb.dev {{source_label}}.",
            ],
        ];
    }
}
