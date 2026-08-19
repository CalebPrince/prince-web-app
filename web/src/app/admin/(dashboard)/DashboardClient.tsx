"use client";

import { useEffect, useState } from "react";
import { 
  Kanban, Inbox, Calendar, Users, Activity, CreditCard, 
  CheckCircle2, AlertTriangle, Info, Bell, FileText
} from "lucide-react";

export default function DashboardClient({ 
  initialData, 
  notifications,
  user
}: { 
  initialData: any; 
  notifications: any;
  user: any;
}) {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Format currency
  const formatAmount = (subunits: number, currency: string) => {
    return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  // Extract a readable first name
  const firstName = user?.name?.split(/\s+/)[0] || user?.email?.split('@')[0] || "there";
  
  // Greeting based on time
  const hour = time ? time.getHours() : new Date().getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Stats Data Mapping
  const stats = [
    { 
      label: "Published projects", 
      value: initialData?.projects?.published || "0", 
      sub: initialData?.projects?.drafts > 0 ? `${initialData.projects.drafts} drafts waiting` : `${initialData?.projects?.total || 0} total`,
      icon: Kanban 
    },
    { 
      label: "Unread inquiries", 
      value: initialData?.inquiries?.unread || "0", 
      sub: `${initialData?.inquiries?.total || 0} total`,
      icon: Inbox 
    },
    { 
      label: "Recent inquiries (30d)", 
      value: initialData?.inquiries?.last_30_days || "0", 
      sub: "Active leads",
      icon: Calendar 
    },
    { 
      label: "Revenue", 
      value: initialData?.payments?.revenue_by_currency?.length > 0 
        ? initialData.payments.revenue_by_currency.map((r: any) => formatAmount(r.total, r.currency)).join(" + ")
        : "—",
      sub: initialData?.payments?.pending > 0 ? `${initialData.payments.pending} pending payments` : "No pending payments",
      icon: CreditCard
    }
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">{salutation}, {firstName}.</h2>
          <p className="text-text-2">Signed in as {user?.email} — here's how your portfolio is doing.</p>
        </div>
        {time && (
          <div className="text-right flex flex-col items-end">
            <div className="text-sm font-medium text-text-2 mb-1">
              {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(time)}
            </div>
            <div className="font-mono text-xl tracking-tight">
              {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time)}
            </div>
          </div>
        )}
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-bg-2 p-5 rounded-xl border border-hairline hover:border-accent/50 transition-colors flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
              <stat.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-2 truncate">{stat.label}</p>
              <p className="text-2xl font-semibold truncate">{stat.value}</p>
              <p className="text-xs text-text-3 truncate mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Tables (Inquiries & Payments) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Recent Inquiries */}
          <div className="bg-bg-2 rounded-xl border border-hairline overflow-hidden">
            <div className="p-5 border-b border-hairline flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Inbox className="w-4 h-4 text-accent" /> Recent Inquiries
              </h3>
              <a href="/admin/inquiries.html" className="text-sm text-text-2 hover:text-accent">View all</a>
            </div>
            <div className="divide-y divide-hairline">
              {initialData?.recent_inquiries?.length > 0 ? (
                initialData.recent_inquiries.slice(0, 5).map((inquiry: any) => (
                  <div key={inquiry.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-bg-3 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inquiry.name}</p>
                      <p className="text-sm text-text-2 truncate">{inquiry.email}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        inquiry.status === 'unread' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                        inquiry.status === 'replied' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        'bg-text-2/10 text-text-2 border-hairline'
                      }`}>
                        {inquiry.status}
                      </span>
                      <span className="text-sm text-text-3 whitespace-nowrap">
                        {new Date(inquiry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-text-2 text-sm">No recent inquiries found.</div>
              )}
            </div>
          </div>

          {/* Recent Payments */}
          <div className="bg-bg-2 rounded-xl border border-hairline overflow-hidden">
            <div className="p-5 border-b border-hairline flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-accent" /> Recent Payments
              </h3>
              <a href="/admin/payments.html" className="text-sm text-text-2 hover:text-accent">View all</a>
            </div>
            <div className="divide-y divide-hairline">
              {initialData?.recent_payments?.length > 0 ? (
                initialData.recent_payments.slice(0, 5).map((payment: any) => (
                  <div key={payment.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-bg-3 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{payment.customer_name || payment.email}</p>
                      <p className="text-sm text-text-2 truncate">{formatAmount(payment.amount, payment.currency)}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        payment.status === 'success' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        payment.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                        'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        {payment.status}
                      </span>
                      <span className="text-sm text-text-3 whitespace-nowrap">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-text-2 text-sm">No recent payments.</div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Attention & Revenue Runway */}
        <div className="space-y-8">
          
          {/* Action Queue / Notifications */}
          <div className="bg-bg-2 rounded-xl border border-hairline overflow-hidden">
            <div className="p-5 border-b border-hairline">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-accent" /> Action Queue
              </h3>
            </div>
            <div className="divide-y divide-hairline">
              {notifications?.items?.length > 0 ? (
                notifications.items.slice(0, 5).map((item: any, idx: number) => {
                  const isDanger = item.level === 'danger';
                  const isWarning = item.level === 'warning';
                  return (
                    <a key={idx} href={item.href} className="block p-4 hover:bg-bg-3 transition-colors group">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${isDanger ? 'text-red-500' : isWarning ? 'text-yellow-500' : 'text-blue-500'}`}>
                          {isDanger ? <AlertTriangle className="w-4 h-4" /> : isWarning ? <Info className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-mono uppercase text-text-3 mb-1">{item.type}</p>
                          <p className="font-medium text-sm mb-0.5 group-hover:text-accent transition-colors">{item.title}</p>
                          <p className="text-sm text-text-2 line-clamp-2">{item.detail}</p>
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="p-8 flex flex-col items-center justify-center text-center text-text-2">
                  <CheckCircle2 className="w-8 h-8 text-green-500/50 mb-3" />
                  <p className="text-sm">Inbox zero. You're all caught up!</p>
                </div>
              )}
            </div>
          </div>

          {/* Revenue Runway */}
          <div className="bg-bg-2 rounded-xl border border-hairline overflow-hidden">
            <div className="p-5 border-b border-hairline">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-500" /> Revenue Runway
              </h3>
              <p className="text-xs text-text-3 mt-1">Direct next moves protecting pipeline value.</p>
            </div>
            <div className="divide-y divide-hairline">
              {initialData?.revenue_actions?.items?.length > 0 ? (
                initialData.revenue_actions.items.slice(0, 5).map((item: any, idx: number) => (
                  <a key={idx} href={item.href} className="block p-4 hover:bg-bg-3 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded bg-text-2/10 flex items-center justify-center text-xs font-mono font-medium text-text-2 flex-shrink-0 mt-0.5">
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono uppercase text-text-3 mb-1">{item.kind}</p>
                        <p className="font-medium text-sm mb-0.5 group-hover:text-accent transition-colors truncate">{item.title}</p>
                        <p className="text-sm text-text-2 line-clamp-1 mb-1">{item.detail}</p>
                        {item.value > 0 && (
                          <span className="inline-block px-2 py-0.5 bg-green-500/10 text-green-500 text-xs rounded border border-green-500/20 font-medium">
                            {formatAmount(item.value, item.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="p-8 text-center text-text-2">
                  <p className="text-sm mb-3">Your immediate queue is clear.</p>
                  <a href="/admin/pipeline.html" className="text-sm text-accent hover:underline">Plan next action &rarr;</a>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
