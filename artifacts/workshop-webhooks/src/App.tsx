import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getGetWorkshopSummaryQueryKey,
  getListWorkshopActivityQueryKey,
  getListWorkshopsQueryKey,
  useGetWorkshopSummary,
  useHealthCheck,
  useListWorkshopActivity,
  useListWorkshops,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Check, Circle, Clock3, Code2, Copy, Radio, RefreshCw, Sparkles, Users, Webhook, X } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const workshopsQuery = useListWorkshops({
    query: { queryKey: getListWorkshopsQueryKey(), refetchInterval: 15000, refetchOnWindowFocus: true },
  });
  const summaryQuery = useGetWorkshopSummary({
    query: { queryKey: getGetWorkshopSummaryQueryKey(), refetchInterval: 15000, refetchOnWindowFocus: true },
  });
  const activityQuery = useListWorkshopActivity({
    query: { queryKey: getListWorkshopActivityQueryKey(), refetchInterval: 15000, refetchOnWindowFocus: true },
  });
  const healthQuery = useHealthCheck({ query: { queryKey: ['/api/healthz'], refetchInterval: 30000 } });
  const workshops = workshopsQuery.data ?? [];
  const activities = activityQuery.data ?? [];
  const summary = summaryQuery.data;
  const lastActivityId = useRef<number | null>(null);
  const [celebrate, setCelebrate] = useState<{ eventId: number; name: string; amount: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activityQuery.data) return;
    const newestId = Math.max(0, ...activityQuery.data.map((item) => item.id));
    if (lastActivityId.current === null) {
      lastActivityId.current = newestId;
      return;
    }

    const newEvents = activityQuery.data
      .filter((item) => item.id > lastActivityId.current!)
      .sort((a, b) => a.id - b.id);
    lastActivityId.current = Math.max(lastActivityId.current, newestId);
    const increase = [...newEvents].reverse().find((item) => item.change === 'up');
    if (increase) {
      setCelebrate({ eventId: increase.id, name: increase.workshopName, amount: increase.changeAmount });
    }
  }, [activityQuery.data]);

  useEffect(() => {
    if (!celebrate) return;
    const timeout = window.setTimeout(() => setCelebrate(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [celebrate]);

  const isLoading = workshopsQuery.isLoading || summaryQuery.isLoading || activityQuery.isLoading;
  const isError = workshopsQuery.isError || summaryQuery.isError || activityQuery.isError;
  const latestTime = useMemo(() => {
    const last = summary?.lastUpdatedAt;
    if (!last) return 'No updates yet';
    return formatRelative(last, clock);
  }, [summary?.lastUpdatedAt, clock]);

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText('/api/webhooks/workshop-gather');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="monitor-shell min-h-[100dvh]">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Activity size={19} strokeWidth={2.4} /></div>
          <div><div className="brand-name">gather<span>/</span>watch</div><div className="brand-caption">WORKSHOP RSVP MONITOR</div></div>
        </div>
        <div className="topbar-right">
          <div className={`connection-pill ${healthQuery.data?.status === 'ok' ? 'is-live' : ''}`}>
            <span className="pulse-dot" />{healthQuery.data?.status === 'ok' ? 'API connected' : healthQuery.isError ? 'Connection issue' : 'Checking connection'}
          </div>
          <span className="topbar-clock"><Clock3 size={14} /> {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </header>

      <div className="page-wrap">
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR EVENT PULSE</div>
            <h1>Attendance,<br className="mobile-break" /> in <em>motion.</em></h1>
            <p className="intro-copy">A clear read on every seat that fills, frees up, or holds steady.</p>
          </div>
          <div className="live-note"><span className="live-note-dot" /><span>LIVE FROM WORKSHOP GATHER</span><span className="live-divider" /><RefreshCw size={12} className="sync-icon" /> 15 SEC</div>
        </section>

        {celebrate && <>
          <div className="celebration-confetti" key={`confetti-${celebrate.eventId}`} aria-hidden="true">
            {Array.from({ length: 28 }, (_, index) => <i
              key={index}
              style={{
                left: `${(index * 37 + 8) % 100}%`,
                animationDelay: `${(index % 8) * 45}ms`,
                backgroundColor: ['#4b9b76', '#efad57', '#e77865', '#6f93b7', '#a78ac3'][index % 5],
              }}
            />)}
          </div>
          <div className="celebration" key={`toast-${celebrate.eventId}`} role="status">
            <span className="celebration-icon"><Sparkles size={16} /></span>
            <div><strong>RSVPs are climbing.</strong><span>{celebrate.name} is up by {celebrate.amount}.</span></div>
            <button aria-label="Dismiss update" onClick={() => setCelebrate(null)} data-testid="button-dismiss-celebration"><X size={16} /></button>
          </div>
        </>}

        <section className="summary-grid" aria-label="Workshop overview">
          <div className="summary-card summary-primary">
            <div className="summary-top"><span>TOTAL RSVPS</span><span className="summary-icon"><Users size={16} /></span></div>
            <div className="summary-number" data-testid="text-total-rsvps">{summary ? summary.totalRsvps.toLocaleString() : <span className="skeleton-num" />}</div>
            <div className="summary-foot"><span className="summary-sub">Across {summary?.workshopCount ?? '—'} workshops</span><span className="metric-trend"><Activity size={13} /> TRACKING</span></div>
            <div className="metric-ripple"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="summary-card">
            <div className="summary-top"><span>WORKSHOPS</span><span className="summary-icon warm"><Webhook size={16} /></span></div>
            <div className="summary-number" data-testid="text-workshop-count">{summary ? summary.workshopCount : <span className="skeleton-num" />}</div>
            <div className="summary-foot"><span className="summary-sub">Currently in your orbit</span><span className="metric-ornament">01—{String(summary?.workshopCount ?? 0).padStart(2, '0')}</span></div>
          </div>
          <div className="summary-card">
            <div className="summary-top"><span>CHANGES TODAY</span><span className="summary-icon gold"><Activity size={16} /></span></div>
            <div className="summary-number" data-testid="text-updates-today">{summary ? summary.updatesToday : <span className="skeleton-num" />}</div>
            <div className="summary-foot"><span className="summary-sub">Webhook events received</span><span className="metric-ornament">TODAY</span></div>
          </div>
        </section>

        {isError && <div className="error-strip" role="alert"><span>We couldn’t reach the RSVP feed.</span><button onClick={() => { void workshopsQuery.refetch(); void summaryQuery.refetch(); void activityQuery.refetch(); }} data-testid="button-retry-feed">Try again <ArrowRight size={14} /></button></div>}

        <div className="content-grid">
          <section className="panel workshops-panel">
            <div className="panel-heading">
              <div><div className="eyebrow panel-eyebrow">ON THE RADAR</div><h2>Workshop pulse</h2></div>
              <div className="updated-label"><span className="pulse-dot small" /> Updated {latestTime}</div>
            </div>
            {isLoading ? <div className="workshop-skeletons">{[1, 2, 3].map((n) => <div className="workshop-skeleton" key={n}><i /><span /><b /></div>)}</div> :
              workshops.length === 0 ? <div className="empty-state"><div className="empty-mark"><Radio size={21} /></div><h3>It’s quiet for now.</h3><p>When Workshop Gather sends its first RSVP update, your workshops will show up here.</p></div> :
                <div className="workshop-list">
                  {workshops.map((workshop, index) => <article className="workshop-row" key={workshop.id} data-testid={`row-workshop-${workshop.id}`}>
                    <div className="workshop-index">{String(index + 1).padStart(2, '0')}</div>
                    <div className="workshop-info"><h3>{workshop.name}</h3><span>Updated {formatRelative(workshop.updatedAt, clock)}</span></div>
                    <div className="workshop-count" data-testid={`text-rsvp-count-${workshop.id}`}>{workshop.rsvps.toLocaleString()}<small>RSVPS</small></div>
                    <div className={`change-chip ${workshop.change}`} aria-label={`${workshop.change} ${workshop.changeAmount}`}>
                      {workshop.change === 'up' ? <ArrowUpRight size={15} /> : workshop.change === 'down' ? <ArrowDownRight size={15} /> : workshop.change === 'new' ? <span className="new-mark">NEW</span> : <Circle size={8} />}
                      {workshop.change === 'up' || workshop.change === 'down' ? Math.abs(workshop.changeAmount) : workshop.change === 'unchanged' ? 'steady' : 'fresh'}
                    </div>
                  </article>)}
                </div>}
            <div className="panel-bottom"><span><span className="legend-dot up" /> RSVP increase</span><span><span className="legend-dot down" /> RSVP decrease</span><span><span className="legend-dot steady" /> No change</span></div>
          </section>

          <aside className="side-stack">
            <section className="activity-panel">
              <div className="panel-heading activity-heading"><div><div className="eyebrow panel-eyebrow">THE LATEST</div><h2>Change log</h2></div><span className="activity-count">{activities.length.toString().padStart(2, '0')}</span></div>
              {isLoading ? <div className="activity-loading"><i /><i /><i /></div> :
                activities.length === 0 ? <div className="activity-empty"><Activity size={17} /><span>Updates will land here as they happen.</span></div> :
                  <div className="activity-list">{activities.slice(0, 6).map((item) => <div className="activity-item" key={item.id} data-testid={`activity-item-${item.id}`}>
                    <div className={`activity-marker ${item.change}`}><span /></div>
                    <div className="activity-detail"><strong>{item.workshopName}</strong><span>{item.previousRsvps === null ? 'First RSVP count recorded' : `${item.previousRsvps} → ${item.rsvps} RSVPs`}</span><time>{formatRelative(item.updatedAt, clock)}</time></div>
                    <div className={`activity-delta ${item.change}`}>{item.change === 'up' ? '+' : item.change === 'down' ? '−' : ''}{item.change === 'up' || item.change === 'down' ? Math.abs(item.changeAmount) : '—'}</div>
                  </div>)}</div>}
              <div className="activity-footer"><span className="pulse-dot small" /> Polling for new events</div>
            </section>

            <section className="webhook-panel">
              <div className="webhook-title"><div className="webhook-icon"><Code2 size={17} /></div><div><div className="eyebrow">CONNECT YOUR SOURCE</div><h2>One small wire.</h2></div></div>
              <p>Point Workshop Gather’s RSVP webhook at this endpoint. We’ll keep the headcount current.</p>
              <div className="endpoint"><code>/api/webhooks/workshop-gather</code><button onClick={copyWebhook} aria-label="Copy webhook path" data-testid="button-copy-endpoint">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
              <div className="webhook-hint"><span className="hint-bar" />Send <code>workshopName</code>, <code>rsvps</code>, and <code>updatedAt</code> with your shared secret.</div>
            </section>
          </aside>
        </div>

        <section className="test-panel">
          <div className="test-copy"><div className="eyebrow panel-eyebrow">CONNECT WORKSHOP GATHER</div><h2>Send the first signal.</h2><p>Post each RSVP update from a server-side action in Workshop Gather.</p><div className="test-caption"><span className="test-caption-line" />POST · JSON · ISO 8601</div></div>
          <div className="payload-card">
            <div className="payload-route"><span>POST</span> /api/webhooks/workshop-gather</div>
            <pre>{`{
  "workshopName": "Field Notes: Spring",
  "rsvps": 24,
  "updatedAt": "2027-03-01T18:30:00.000Z"
}`}</pre>
            <p>Set <code>WORKSHOP_WEBHOOK_SECRET</code> in Replit Secrets, then send the same value in the <code>X-Webhook-Secret</code> header. Keep that value in Workshop Gather’s server-side settings, never in browser code.</p>
          </div>
        </section>
        <footer className="page-footer"><span>GATHER / WATCH</span><span>LAST SIGNAL <b>{latestTime.toUpperCase()}</b></span><span>BUILT FOR THE PEOPLE IN THE ROOM</span></footer>
      </div>
    </main>
  );
}

function formatRelative(value: string, now: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  const delta = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (delta < 45) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
