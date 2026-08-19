"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { RefreshCw, Plug, Unplug, Code2 } from "lucide-react";
import { Card, Button, StatusPill, ErrorBanner } from "@/components/admin/ui";

export type ComposioAccount = {
  label: string;
  /** Composio's own status: ACTIVE, INITIATED, or absent when never connected. */
  status?: string | null;
  account_id?: string | null;
  auth_config_id?: string | null;
  last_error?: string | null;
};

/** Composio's status vocabulary, mapped onto the admin's pill tones. */
const STATUS_DISPLAY: Record<string, { text: string; tone: "green" | "amber" | "red" }> = {
  ACTIVE: { text: "Connected", tone: "green" },
  INITIATED: { text: "Pending authorization", tone: "amber" },
};

export function ComposioAccounts({
  onAuthorUrn,
}: {
  /** Lets the settings form adopt a looked-up LinkedIn URN without saving it. */
  onAuthorUrn?: (urn: string) => void;
}) {
  const [accounts, setAccounts] = useState<Record<string, ComposioAccount>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string | null>>({});
  const [tools, setTools] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await adminApi.get<Record<string, ComposioAccount>>("/api/v1/admin/composio/status"));
      setError(null);
    } catch (err) {
      setAccounts({});
      setError(err instanceof Error ? err.message : "Could not read Composio status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async (toolkit: string) => {
    setBusy(toolkit);
    setNotice(null);
    try {
      const result = await adminApi.post<{ redirect_url?: string }>(
        "/api/v1/admin/composio/connect",
        { toolkit }
      );
      if (result.redirect_url) {
        window.open(result.redirect_url, "_blank", "noopener");
        setNotice(
          "Complete the authorization in the new tab, then refresh this panel to see the updated status."
        );
      } else {
        setError("Connection started, but no authorization link came back — check Composio's dashboard.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the connection.");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const disconnect = async (toolkit: string) => {
    if (!confirm("Disconnect this account? The app will no longer be able to act on it.")) return;
    setBusy(toolkit);
    try {
      await adminApi.post("/api/v1/admin/composio/disconnect", { toolkit });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const toggleDetails = async (toolkit: string) => {
    if (details[toolkit] !== undefined && details[toolkit] !== null) {
      setDetails((prev) => ({ ...prev, [toolkit]: null }));
      return;
    }
    setDetails((prev) => ({ ...prev, [toolkit]: "Loading…" }));
    try {
      const data = await adminApi.get<unknown>(
        `/api/v1/admin/composio/connected-account-details?toolkit=${encodeURIComponent(toolkit)}`
      );
      setDetails((prev) => ({ ...prev, [toolkit]: JSON.stringify(data, null, 2) }));
    } catch (err) {
      setDetails((prev) => ({
        ...prev,
        [toolkit]: err instanceof Error ? `Error: ${err.message}` : "Error",
      }));
    }
  };

  const listLinkedInTools = async () => {
    setTools("Loading…");
    try {
      const data = await adminApi.get<unknown>("/api/v1/admin/composio/toolkit-tools?toolkit=linkedin");
      setTools(JSON.stringify(data, null, 2));
    } catch (err) {
      setTools(err instanceof Error ? `Error: ${err.message}` : "Error");
    }
  };

  const fetchAuthorUrn = async () => {
    setBusy("urn");
    try {
      const result = await adminApi.get<{ urn: string }>("/api/v1/admin/composio/linkedin-author-urn");
      onAuthorUrn?.(result.urn);
      setNotice(`Found it: ${result.urn}. Save the integrations below to keep it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look up the author URN.");
    } finally {
      setBusy(null);
    }
  };

  const entries = Object.entries(accounts);

  return (
    <Card
      title="Composio connections"
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
      bodyClassName="p-5 space-y-4"
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {notice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">
          {notice}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <p className="text-sm text-text-3">Checking connections…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-3">
          No toolkits reported. Add a Composio API key below, then refresh.
        </p>
      ) : (
        <div className="divide-y divide-hairline">
          {entries.map(([slug, account]) => {
            const display = account.status
              ? STATUS_DISPLAY[account.status] ?? { text: account.status, tone: "red" as const }
              : { text: "Not connected", tone: "amber" as const };
            const connected = !!account.account_id;
            // Composio needs the toolkit's auth config before a connection can start.
            const canConnect = !!account.auth_config_id;

            return (
              <div key={slug} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{account.label}</div>
                    <StatusPill status={display.text} tone={display.tone} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {connected && (
                      <Button variant="outline" onClick={() => toggleDetails(slug)}>
                        <Code2 className="w-4 h-4" />
                        {details[slug] ? "Hide details" : "View raw details"}
                      </Button>
                    )}
                    {connected ? (
                      <Button
                        variant="danger"
                        disabled={busy === slug}
                        onClick={() => disconnect(slug)}
                      >
                        <Unplug className="w-4 h-4" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={!canConnect || busy === slug}
                        title={canConnect ? undefined : "Add an Auth Config ID below first"}
                        onClick={() => connect(slug)}
                      >
                        <Plug className="w-4 h-4" />
                        Connect
                      </Button>
                    )}
                  </div>
                </div>

                {account.last_error && (
                  <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                    <strong>Last booking action error:</strong> {account.last_error}
                  </p>
                )}

                {details[slug] && (
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-bg-3 p-3 text-xs custom-scrollbar">
                    {details[slug]}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        <Button variant="outline" onClick={listLinkedInTools}>
          List LinkedIn tools
        </Button>
        <Button variant="outline" onClick={fetchAuthorUrn} disabled={busy === "urn"}>
          {busy === "urn" ? "Looking up…" : "Fetch LinkedIn author URN"}
        </Button>
      </div>

      {tools && (
        <pre className="max-h-72 overflow-auto rounded-md bg-bg-3 p-3 text-xs custom-scrollbar">
          {tools}
        </pre>
      )}
    </Card>
  );
}
