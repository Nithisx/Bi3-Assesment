import React, { useEffect, useState, useCallback } from "react";

// Point this at your running FastAPI instance
const API_BASE = "http://localhost:8000";

const SENTIMENT_STYLES = {
  Negative: { bar: "bg-[#E8604C]", text: "text-[#E8604C]", dot: "bg-[#E8604C]" },
  Neutral: { bar: "bg-[#E8B23B]", text: "text-[#E8B23B]", dot: "bg-[#E8B23B]" },
  Positive: { bar: "bg-[#5FAD8C]", text: "text-[#5FAD8C]", dot: "bg-[#5FAD8C]" },
};

const SENTIMENT_ORDER = ["Negative", "Neutral", "Positive"];

function StatusPulse({ status }) {
  const isOnline = status === "online";
  const isError = status === "error";
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        {isOnline && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#5FAD8C] opacity-60 animate-ping" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            isOnline ? "bg-[#5FAD8C]" : isError ? "bg-[#E8604C]" : "bg-[#8B8894]"
          }`}
        />
      </span>
      <span className="text-xs uppercase tracking-[0.2em] text-[#8B8894] font-mono">
        {isOnline ? "API online" : isError ? "API unreachable" : "Checking API…"}
      </span>
    </div>
  );
}

function SectionLabel({ eyebrow, title }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.25em] text-[#8B8894] font-mono mb-1">{eyebrow}</p>
      <h2 className="text-2xl font-semibold text-[#F2EFEA]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {title}
      </h2>
    </div>
  );
}

function SentimentSpectrum({ data, loading, error }) {
  if (loading) {
    return <div className="h-24 rounded-xl bg-[#232229] animate-pulse" />;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 text-sm text-[#8B8894]">
        Sentiment data didn't load. Check that the API is running and reachable.
      </div>
    );
  }

  const ordered = SENTIMENT_ORDER.map((label) =>
    data.find((d) => d.sentiment === label)
  ).filter(Boolean);

  return (
    <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6">
      {/* Spectrum bar */}
      <div className="flex h-10 w-full overflow-hidden rounded-md gap-[3px] bg-[#18171C]">
        {ordered.map((item) => {
          const pct = parseFloat(item.percentage);
          const style = SENTIMENT_STYLES[item.sentiment] || {};
          if (pct === 0) return null;
          return (
            <div
              key={item.sentiment}
              className={`${style.bar} h-full transition-all duration-700 ease-out`}
              style={{ width: `${pct}%` }}
              title={`${item.sentiment}: ${item.percentage}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ordered.map((item) => {
          const style = SENTIMENT_STYLES[item.sentiment] || {};
          return (
            <div key={item.sentiment} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${style.dot} flex-shrink-0`} />
              <div>
                <p className="text-sm text-[#F2EFEA] font-medium">{item.sentiment}</p>
                <p className="font-mono text-xs text-[#8B8894]">
                  <span className={`${style.text} font-semibold`}>{item.percentage}</span>
                  {"  ·  "}
                  {item.count.toLocaleString()} responses
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryRanking({ data, loading, error }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-[#232229] animate-pulse" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 text-sm text-[#8B8894]">
        Category data didn't load. Check that the API is running and reachable.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      {data.map((item, i) => {
        const pct = (item.count / max) * 100;
        return (
          <div
            key={item.category}
            className="flex items-center gap-4 rounded-lg border border-[#3A3842] bg-[#232229] px-4 py-3"
          >
            <span className="font-mono text-xs text-[#8B8894] w-6 flex-shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium text-[#F2EFEA] truncate">{item.category}</span>
                <span className="font-mono text-sm text-[#8B8894] flex-shrink-0 ml-3">
                  {item.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#18171C] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#E8604C] to-[#E8B23B] transition-all duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CATEGORY_COLORS = {
  Delivery: "text-[#E8604C] bg-[#E8604C]/10 border-[#E8604C]/25",
  "App Bug": "text-[#5FAD8C] bg-[#5FAD8C]/10 border-[#5FAD8C]/25",
  Billing: "text-[#E8B23B] bg-[#E8B23B]/10 border-[#E8B23B]/25",
  "Staff/Support": "text-[#7C3AED] bg-[#7C3AED]/10 border-[#7C3AED]/25",
  Other: "text-[#8B8894] bg-[#8B8894]/10 border-[#8B8894]/25",
};

function ExampleComplaints({ data, loading, error }) {
  if (loading) {
    return <div className="h-48 rounded-xl bg-[#232229] animate-pulse border border-[#3A3842]" />;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 text-sm text-[#8B8894]">
        Example complaints didn't load. Check that the API is running and reachable.
      </div>
    );
  }

  const entries = Object.entries(data || {});
  const hasExamples = entries.some(([_, list]) => list && list.length > 0);

  if (!hasExamples) {
    return (
      <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 text-sm text-[#8B8894] italic text-center">
        No representative feedback examples analyzed yet. Upload a batch to populate.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 space-y-4">
      <div className="space-y-4 divide-y divide-[#3A3842]/60">
        {entries.map(([cat, list], idx) => {
          if (!list || list.length === 0) return null;
          return (
            <div key={cat} className={`pt-4 ${idx === 0 ? "pt-0 border-t-0" : ""}`}>
              <span className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border mb-2.5 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other}`}>
                {cat.toUpperCase()}
              </span>
              <ul className="space-y-2">
                {list.map((ex, i) => (
                  <li key={i} className="text-xs italic text-[#8B8894] leading-relaxed border-l-2 border-[#3A3842] pl-3">
                    "{ex}"
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FeedbackDashboard({ inline = false }) {
  const [status, setStatus] = useState("loading"); // loading | online | error
  const [sentiment, setSentiment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [examples, setExamples] = useState({});
  const [sentimentState, setSentimentState] = useState("loading"); // loading | ready | error
  const [categoryState, setCategoryState] = useState("loading");
  const [examplesState, setExamplesState] = useState("loading");
  const [lastSync, setLastSync] = useState(null);

  const loadAll = useCallback(async () => {
    setStatus("loading");
    setSentimentState("loading");
    setCategoryState("loading");
    setExamplesState("loading");

    // Root status check
    try {
      const res = await fetch(`${API_BASE}/`);
      if (!res.ok) throw new Error("Bad response");
      setStatus("online");
    } catch {
      setStatus("error");
    }

    // Sentiment breakdown
    try {
      const res = await fetch(`${API_BASE}/api/sentiment`);
      if (!res.ok) throw new Error("Bad response");
      const json = await res.json();
      setSentiment(json);
      setSentimentState("ready");
    } catch {
      setSentimentState("error");
    }

    // Category breakdown
    try {
      const res = await fetch(`${API_BASE}/api/categories`);
      if (!res.ok) throw new Error("Bad response");
      const json = await res.json();
      setCategories(json);
      setCategoryState("ready");
    } catch {
      setCategoryState("error");
    }

    // Examples list
    try {
      const res = await fetch(`${API_BASE}/api/examples`);
      if (!res.ok) throw new Error("Bad response");
      const json = await res.json();
      setExamples(json);
      setExamplesState("ready");
    } catch {
      setExamplesState("error");
    }

    setLastSync(new Date());
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const dashboardContent = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn">
      {/* Left Column: Sentiment Spectrum & Examples */}
      <div className="space-y-8">
        <section>
          <SectionLabel eyebrow="Pulse Check" title="Sentiment Spectrum" />
          <SentimentSpectrum data={sentiment} loading={sentimentState === "loading"} error={sentimentState === "error"} />
        </section>

        <section>
          <SectionLabel eyebrow="Customer Voice" title="Example Complaints" />
          <ExampleComplaints data={examples} loading={examplesState === "loading"} error={examplesState === "error"} />
        </section>
      </div>

      {/* Right Column: Category Rankings */}
      <section>
        <SectionLabel eyebrow="System Issues" title="Top Complaint Categories" />
        <CategoryRanking data={categories} loading={categoryState === "loading"} error={categoryState === "error"} />
      </section>
    </div>
  );

  if (inline) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#232229] border border-[#3A3842] px-4 py-3 rounded-xl gap-2">
          <div className="text-xs text-[#8B8894] font-mono">
            Overall stats calculated from all uploaded batch records.
          </div>
          <button
            onClick={loadAll}
            className="text-xs font-mono text-[#E8B23B] hover:underline flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.253 8H18" />
            </svg>
            Refresh Summary
          </button>
        </div>
        {dashboardContent}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full bg-[#18171C] text-[#F2EFEA] px-6 py-10 sm:px-10 lg:px-16"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12 pb-6 border-b border-[#3A3842]">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#8B8894] font-mono mb-2">
              Customer Feedback BI
            </p>
            <h1
              className="text-4xl sm:text-5xl font-bold tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Feedback Pulse
            </h1>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <StatusPulse status={status} />
            <button
              onClick={loadAll}
              className="text-xs font-mono text-[#8B8894] hover:text-[#F2EFEA] underline underline-offset-2 transition-colors"
            >
              Refresh data
            </button>
            {lastSync && (
              <p className="text-xs font-mono text-[#8B8894]">
                Last synced {lastSync.toLocaleTimeString()}
              </p>
            )}
          </div>
        </header>

        {dashboardContent}

        <footer className="pt-6 border-t border-[#3A3842] text-xs font-mono text-[#8B8894] mt-12">
          Source: {API_BASE}/api — Swagger docs at {API_BASE}/docs
        </footer>
      </div>
    </div>
  );
}