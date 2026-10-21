import { useEffect, useState } from "react";

type Settings = {
  scope_explanation: string;
  gmail_mode: string;
  account: {
    id: string;
    gmail_identity: string;
    mode: string;
    paused: boolean;
    cursor_health: string;
    scan_boundary: unknown;
  } | null;
};

type ScanStatus = {
  account: { cursorHealth: string; mode: string; paused: boolean } | null;
  recentScans: {
    id: string;
    status: string;
    discoveredCount: number;
    finishedAt: string | null;
    error: string | null;
  }[];
  pendingJobs: number;
  messagesByState: Record<string, number>;
};

export function App() {
  const [password, setPassword] = useState("local-dev-only-change-me");
  const [csrf, setCsrf] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [inspectId, setInspectId] = useState("");
  const [inspect, setInspect] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function doLogin() {
    setError(null);
    const res = await fetch("/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError("Login failed");
      return;
    }
    const data = (await res.json()) as { csrf: string };
    setCsrf(data.csrf);
  }

  async function loadSettings() {
    const res = await fetch("/settings", { credentials: "include" });
    if (!res.ok) {
      setError("Not authenticated");
      return;
    }
    setSettings((await res.json()) as Settings);
  }

  async function connectMock() {
    const res = await fetch("/oauth/gmail/start?scan_kind=historical&max_messages=200", {
      credentials: "include",
    });
    if (!res.ok) {
      setError("Connect failed");
      return;
    }
    await loadSettings();
  }

  async function loadStatus() {
    if (!settings?.account?.id) return;
    const res = await fetch(`/status/scan?account_id=${settings.account.id}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    setStatus((await res.json()) as ScanStatus);
  }

  async function triggerScan() {
    if (!settings?.account?.id) return;
    const res = await fetch("/internal/scans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SCHEDULER_TOKEN ?? "local-scheduler-token-change-me"}`,
      },
      body: JSON.stringify({
        account_id: settings.account.id,
        request_id: `ui-${Date.now()}`,
        kind: "historical",
      }),
    });
    if (!res.ok) {
      setError("Scan failed");
      return;
    }
    await loadStatus();
  }

  async function runInspect() {
    if (!inspectId) return;
    const res = await fetch(`/parser/inspect/${inspectId}`, { credentials: "include" });
    if (!res.ok) {
      setError("Inspect failed");
      return;
    }
    setInspect(await res.json());
  }

  useEffect(() => {
    if (csrf) void loadSettings();
  }, [csrf]);

  return (
    <main className="page">
      <h1>Inbox Pilot</h1>
      <p className="muted">
        Stage 2 — Gmail ingestion and deterministic parsing. Dry run is the default; labels are
        per-message. Interview, offer, and rejection always need human approval later.
      </p>

      {error && <p className="error">{error}</p>}

      {!csrf ? (
        <section>
          <h2>Sign in</h2>
          <label>
            Owner password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="button" onClick={() => void doLogin()}>
            Continue
          </button>
        </section>
      ) : (
        <>
          <section>
            <h2>Mailbox</h2>
            {settings?.scope_explanation && (
              <p className="muted">{settings.scope_explanation}</p>
            )}
            {settings?.account ? (
              <ul>
                <li>Identity: {settings.account.gmail_identity}</li>
                <li>Mode: {settings.account.mode}</li>
                <li>Paused: {String(settings.account.paused)}</li>
                <li>Cursor: {settings.account.cursor_health}</li>
                <li>Gmail mode: {settings.gmail_mode}</li>
              </ul>
            ) : (
              <button type="button" onClick={() => void connectMock()}>
                Connect mock Gmail
              </button>
            )}
          </section>

          <section>
            <h2>Scan status</h2>
            <div className="row">
              <button type="button" onClick={() => void loadStatus()}>
                Refresh
              </button>
              <button type="button" onClick={() => void triggerScan()}>
                Run historical scan
              </button>
            </div>
            {status && (
              <>
                <p>Pending jobs: {status.pendingJobs}</p>
                <pre>{JSON.stringify(status.messagesByState, null, 2)}</pre>
                <ul>
                  {status.recentScans.map((s) => (
                    <li key={s.id}>
                      {s.status} — discovered {s.discoveredCount}
                      {s.error ? ` — ${s.error}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section>
            <h2>Parser inspect</h2>
            <div className="row">
              <input
                placeholder="message uuid"
                value={inspectId}
                onChange={(e) => setInspectId(e.target.value)}
              />
              <button type="button" onClick={() => void runInspect()}>
                Inspect
              </button>
            </div>
            {inspect != null && <pre>{JSON.stringify(inspect, null, 2)}</pre>}
          </section>
        </>
      )}
    </main>
  );
}
