import React, { useEffect, useState, useRef } from "react";

const API_BASE = "http://localhost:8000";

const SENTIMENT_STYLES = {
  Negative: { bar: "bg-[#E8604C]", text: "text-[#E8604C]", dot: "bg-[#E8604C]" },
  Neutral: { bar: "bg-[#E8B23B]", text: "text-[#E8B23B]", dot: "bg-[#E8B23B]" },
  Positive: { bar: "bg-[#5FAD8C]", text: "text-[#5FAD8C]", dot: "bg-[#5FAD8C]" },
};

const CATEGORY_COLORS = {
  Delivery: "text-[#E8604C] bg-[#E8604C]/10 border-[#E8604C]/25",
  "App Bug": "text-[#5FAD8C] bg-[#5FAD8C]/10 border-[#5FAD8C]/25",
  Billing: "text-[#E8B23B] bg-[#E8B23B]/10 border-[#E8B23B]/25",
  "Staff/Support": "text-[#7C3AED] bg-[#7C3AED]/10 border-[#7C3AED]/25",
  Other: "text-[#8B8894] bg-[#8B8894]/10 border-[#8B8894]/25",
};

// Chart helper functions & components
function getChartData(results) {
  if (!results || results.length === 0) return null;
  
  const sampleRow = results[0];
  const keys = Object.keys(sampleRow);
  
  // Look for value key (e.g. 'count', 'total', 'avg', 'sum', 'rating')
  let valueKey = keys.find(k => {
    const lk = k.toLowerCase();
    return lk === 'count' || lk === 'total' || lk === 'avg' || lk === 'sum' || lk === 'rating' || lk.includes('count') || lk.includes('sum') || lk.includes('avg');
  });
  
  if (!valueKey) {
    valueKey = keys.find(k => {
      if (k === 'id') return false;
      return results.every(row => typeof row[k] === 'number');
    });
  }
  
  // Look for label key (e.g. 'timestamp', 'date', 'category', 'sentiment', 'source')
  let labelKey = keys.find(k => {
    const lk = k.toLowerCase();
    return lk === 'timestamp' || lk === 'date' || lk === 'category' || lk === 'sentiment' || lk === 'source';
  });
  
  if (valueKey && labelKey) {
    const chartType = (labelKey.toLowerCase() === 'timestamp' || labelKey.toLowerCase() === 'date') ? 'line' : 'bar';
    let data = results.map(row => ({
      label: String(row[labelKey]),
      value: Number(row[valueKey])
    }));
    
    if (chartType === 'line') {
      data.sort((a, b) => a.label.localeCompare(b.label));
    }
    
    return { chartType, data, labelName: labelKey, valueName: valueKey };
  }
  
  const hasSentiment = keys.includes('sentiment');
  const hasCategory = keys.includes('category');
  
  if (hasSentiment || hasCategory) {
    const counts = {};
    const groupKey = hasCategory ? 'category' : 'sentiment';
    
    results.forEach(row => {
      const val = row[groupKey] || 'Other';
      counts[val] = (counts[val] || 0) + 1;
    });
    
    const data = Object.entries(counts).map(([label, value]) => ({
      label,
      value
    })).sort((a, b) => b.value - a.value);
    
    return {
      chartType: 'bar',
      data,
      labelName: groupKey,
      valueName: 'count'
    };
  }
  
  return null;
}

function HorizontalBarChart({ data, labelName, valueName }) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2.5 p-3 rounded-lg bg-[#18171C]/50 border border-[#3A3842]/40 animate-fadeIn">
      <p className="text-[10px] font-mono text-[#8B8894] uppercase tracking-wider mb-1">
        📊 Query Chart: Counts by {labelName}
      </p>
      <div className="space-y-2">
        {data.map((item, idx) => {
          const pct = (item.value / maxValue) * 100;
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-[#F2EFEA] font-semibold">{item.label}</span>
                <span className="text-[#E8B23B]">{item.value}</span>
              </div>
              <div className="h-1.5 w-full bg-[#18171C] rounded-full overflow-hidden border border-[#3A3842]/50">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-[#E8604C] to-[#E8B23B] transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeLineChart({ data, labelName, valueName }) {
  if (data.length < 2) {
    return <HorizontalBarChart data={data} labelName={labelName} valueName={valueName} />;
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const width = 300;
  const height = 100;
  const padding = 15;
  
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - (d.value / maxValue) * (height - padding * 2);
    return { x, y, label: d.label, value: d.value };
  });
  
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="p-3 rounded-lg bg-[#18171C]/50 border border-[#3A3842]/40 space-y-2 animate-fadeIn">
      <p className="text-[10px] font-mono text-[#8B8894] uppercase tracking-wider">
        📈 Query Chart: Trend over {labelName}
      </p>
      
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8B23B" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#E8B23B" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E8604C" />
              <stop offset="100%" stopColor="#E8B23B" />
            </linearGradient>
          </defs>
          
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#3A3842" strokeWidth="0.5" />
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#3A3842" strokeDasharray="2,2" strokeWidth="0.5" />
          
          <path d={areaPath} fill="url(#areaGrad)" />
          <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth="2" filter="url(#glow)" strokeLinecap="round" strokeLinejoin="round" />
          
          {points.map((p, i) => (
            <g key={i} className="group">
              <circle cx={p.x} cy={p.y} r="3" fill="#18171C" stroke="#E8B23B" strokeWidth="1.5" className="hover:scale-150 transition-all cursor-pointer" />
              <title>{`${p.label}: ${p.value}`}</title>
            </g>
          ))}
        </svg>
      </div>
      
      <div className="flex justify-between text-[8px] font-mono text-[#8B8894]">
        <span>{data[0].label}</span>
        <span>{data[Math.floor(data.length / 2)].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

function ChatbotResultsChart({ results }) {
  const chartInfo = getChartData(results);
  if (!chartInfo) return null;
  const { chartType, data, labelName, valueName } = chartInfo;
  if (chartType === 'line') {
    return <TimeLineChart data={data} labelName={labelName} valueName={valueName} />;
  }
  return <HorizontalBarChart data={data} labelName={labelName} valueName={valueName} />;
}

function ChatMessageItem({ msg }) {
  const [showSql, setShowSql] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isUser) {
    return (
      <div className="flex justify-end animate-fadeIn">
        <div className="max-w-[80%] bg-[#E8B23B]/10 text-[#E8B23B] border border-[#E8B23B]/20 rounded-xl px-4 py-3 text-sm">
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex justify-start animate-fadeIn w-full ${msg.isError ? "text-[#E8604C]" : ""}`}>
      <div className="max-w-[90%] w-full bg-[#18171C] border border-[#3A3842] rounded-xl p-4 space-y-4">
        {/* Summary text */}
        <div className="text-sm text-[#F2EFEA] leading-relaxed whitespace-pre-line">
          {msg.text}
        </div>

        {/* Inline Chart where appropriate */}
        {msg.results && <ChatbotResultsChart results={msg.results} />}

        {/* Generated SQL Accordion */}
        {msg.sql && (
          <div className="border border-[#3A3842]/60 rounded-lg overflow-hidden bg-[#232229]/40">
            <button
              onClick={() => setShowSql(!showSql)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-[#8B8894] hover:text-[#F2EFEA] hover:bg-[#2A2931]/30 transition-all text-left cursor-pointer"
            >
              <span>{showSql ? "▼" : "▶"} Generated PostgreSQL Query</span>
              <span className="text-[10px] bg-[#3A3842]/40 px-1.5 py-0.5 rounded text-zinc-400 font-mono">SQL</span>
            </button>
            {showSql && (
              <div className="p-3 border-t border-[#3A3842]/60 bg-[#18171C] overflow-x-auto">
                <pre className="font-mono text-xs text-[#E8B23B] select-all whitespace-pre-wrap break-all">
                  {msg.sql}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Query Results Accordion */}
        {msg.results && (
          <div className="border border-[#3A3842]/60 rounded-lg overflow-hidden bg-[#232229]/40">
            <button
              onClick={() => setShowResults(!showResults)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-[#8B8894] hover:text-[#F2EFEA] hover:bg-[#2A2931]/30 transition-all text-left cursor-pointer"
            >
              <span>{showResults ? "▼" : "▶"} Database Query Results ({msg.total_results} records)</span>
              <span className="text-[10px] bg-[#5FAD8C]/15 text-[#5FAD8C] px-1.5 py-0.5 rounded font-mono">
                {msg.total_results > 0 ? "rows found" : "empty"}
              </span>
            </button>
            {showResults && (
              <div className="border-t border-[#3A3842]/60 bg-[#18171C]">
                {msg.results.length === 0 ? (
                  <div className="p-3 text-xs italic text-[#8B8894] text-center">
                    0 rows matching query
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="border-b border-[#3A3842] bg-[#232229]/30 text-[#8B8894] font-mono">
                          <th className="px-3 py-2 font-semibold">ID</th>
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Rating</th>
                          <th className="px-3 py-2 font-semibold">Category</th>
                          <th className="px-3 py-2 font-semibold">Sentiment</th>
                          <th className="px-3 py-2 font-semibold">Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#3A3842]/30 text-[#8B8894]">
                        {msg.results.slice(0, 10).map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#232229]/25 transition-colors">
                            <td className="px-3 py-2 font-mono">{row.id}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{row.timestamp}</td>
                            <td className="px-3 py-2">{row.rating !== null ? row.rating : "-"}</td>
                            <td className="px-3 py-2">{row.category}</td>
                            <td className="px-3 py-2">{row.sentiment}</td>
                            <td className="px-3 py-2 truncate max-w-[200px]" title={row.summary}>{row.summary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {msg.total_results > 10 && (
                      <div className="p-2 text-center text-[9px] font-mono text-[#8B8894] border-t border-[#3A3842]/30">
                        Showing first 10 rows. Total query result contains {msg.total_results} rows.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BatchDetailsPage({ batchId, onBack }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Pagination State
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [activeSubTab, setActiveSubTab] = useState("overview"); // overview | table | chat

  // Chat Interface State
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState([
    {
      role: "system",
      text: "Hello! I am your AI Data Assistant. Ask me questions about the feedback in this batch (e.g. 'Show negative delivery complaints last 7 days', 'Find positive reviews from surveys', or 'Summarize key app bugs'). I will generate SQL, run it on PostgreSQL, and summarize the findings.",
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatLog]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput;
    setChatInput("");
    
    // Add user message to log and a placeholder loading status for the agent
    setChatLog((prev) => [...prev, { role: "user", text: userMessage }]);
    setChatLoading(true);
    setChatError("");

    try {
      const response = await fetch(`${API_BASE}/api/batch/${batchId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to execute chatbot query.");
      }

      const data = await response.json();
      setChatLog((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.summary,
          sql: data.sql,
          total_results: data.total_results,
          results: data.results,
        },
      ]);
    } catch (err) {
      setChatError(err.message || "Unable to connect to chat API.");
      setChatLog((prev) => [
        ...prev,
        {
          role: "system",
          text: `[Error] ${err.message || "Failed to execute database agent query."}`,
          isError: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${API_BASE}/api/batch/${batchId}/results`);
        if (!response.ok) throw new Error("Failed to load batch results.");
        const data = await response.json();
        setResults(data);
      } catch (err) {
        setError(err.message || "Connection to API failed.");
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [batchId]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <button className="text-sm font-mono text-[#8B8894] hover:text-[#F2EFEA] transition-colors flex items-center gap-2" onClick={onBack}>
          &larr; Back to History Log
        </button>
        <div className="h-10 w-1/3 bg-[#232229] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-[#232229] rounded-xl animate-pulse border border-[#3A3842]" />
          <div className="h-64 bg-[#232229] rounded-xl animate-pulse border border-[#3A3842]" />
        </div>
        <div className="h-96 bg-[#232229] rounded-xl animate-pulse border border-[#3A3842]" />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <button className="text-sm font-mono text-[#8B8894] hover:text-[#F2EFEA] transition-colors flex items-center gap-2" onClick={onBack}>
          &larr; Back to History Log
        </button>
        <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-8 text-center space-y-3">
          <p className="text-sm text-[#8B8894]">{error || "Data load failure"}</p>
          <button onClick={onBack} className="px-4 py-1.5 text-xs font-semibold rounded bg-[#E8B23B] text-[#18171C] hover:bg-[#d69f2e] transition-colors">
            Back to List
          </button>
        </div>
      </div>
    );
  }

  const { summary, sentiment_breakdown, category_breakdown, examples, records } = results;

  // Filter records
  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      rec.feedback_text.toLowerCase().includes(search.toLowerCase()) ||
      rec.summary.toLowerCase().includes(search.toLowerCase());
    const matchesSentiment = sentimentFilter === "All" || rec.sentiment === sentimentFilter;
    const matchesCategory = categoryFilter === "All" || rec.category === categoryFilter;
    return matchesSearch && matchesSentiment && matchesCategory;
  });

  // Paginated records
  const totalRecords = filteredRecords.length;
  const totalPages = Math.max(Math.ceil(totalRecords / itemsPerPage), 1);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleFilterChange = (setter, value) => {
    setter(value);
    setCurrentPage(1); // Reset to first page
  };

  // Helper for Category Bar widths
  const maxCategoryCount = Math.max(...category_breakdown.map((d) => d.count), 1);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Navigation */}
      <div>
        <button
          className="text-xs font-mono text-[#8B8894] hover:text-[#F2EFEA] transition-colors flex items-center gap-2 mb-4"
          onClick={onBack}
        >
          &larr; Back to History Log
        </button>

        {/* Title Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#3A3842] pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#E8B23B] font-mono mb-1.5">
              Batch Analysis Report
            </p>
            <h2 className="text-2xl font-bold text-[#F2EFEA] tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {summary.filename}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#8B8894] font-mono mt-2">
              <span>Date: {summary.uploaded_at}</span>
              <span>&bull;</span>
              <span>Records: {summary.processed_rows} of {summary.total_rows} processed</span>
            </div>
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#5FAD8C]/10 text-[#5FAD8C] border border-[#5FAD8C]/20 self-start md:self-auto font-mono">
            Status: {summary.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* 2-Column Grid Layout: Left for Overview/Table, Right for Chatbot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sub-Navigation Tabs */}
          <div className="flex gap-1.5 border-b border-[#3A3842]/40 pb-3">
            <button
              onClick={() => setActiveSubTab("overview")}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-medium tracking-wide transition-all border cursor-pointer ${
                activeSubTab === "overview"
                  ? "bg-[#E8B23B]/10 text-[#E8B23B] border-[#E8B23B]/30 font-semibold"
                  : "bg-transparent text-[#8B8894] border-transparent hover:text-[#F2EFEA] hover:bg-[#232229]/50"
              }`}
            >
              📊 Analytics Overview
            </button>
            <button
              onClick={() => setActiveSubTab("table")}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-medium tracking-wide transition-all border cursor-pointer ${
                activeSubTab === "table"
                  ? "bg-[#E8B23B]/10 text-[#E8B23B] border-[#E8B23B]/30 font-semibold"
                  : "bg-transparent text-[#8B8894] border-transparent hover:text-[#F2EFEA] hover:bg-[#232229]/50"
              }`}
            >
              📋 Data Table Explorer ({records.length})
            </button>
          </div>

          {/* Overview Subtab */}
          {activeSubTab === "overview" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Sentiment Spectrum */}
              <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 space-y-6">
                <h4 className="text-xs uppercase tracking-wider text-[#8B8894] font-mono">
                  Sentiment Distribution
                </h4>
                
                <div className="flex h-10 w-full overflow-hidden rounded-md gap-[3px] bg-[#18171C]">
                  {sentiment_breakdown.map((item) => {
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

                <div className="grid grid-cols-3 gap-4 pt-2">
                  {sentiment_breakdown.map((item) => {
                    const style = SENTIMENT_STYLES[item.sentiment] || {};
                    return (
                      <div key={item.sentiment} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                          <span className="text-xs font-semibold text-[#F2EFEA]">{item.sentiment}</span>
                        </div>
                        <p className="font-mono text-base font-bold text-[#F2EFEA]">
                          {item.percentage}
                        </p>
                        <p className="text-[10px] font-mono text-[#8B8894]">
                          {item.count} items
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Ranks (Top Issues) */}
              <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 space-y-6">
                <h4 className="text-xs uppercase tracking-wider text-[#8B8894] font-mono">
                  Top Issues & Categories
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    {category_breakdown.map((item, i) => {
                      const pct = (item.count / maxCategoryCount) * 100;
                      return (
                        <div key={item.category} className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[#8B8894] text-[10px]">
                                {String(i + 1).padStart(2, "0")}.
                              </span>
                              <span className="font-semibold text-[#F2EFEA]">{item.category}</span>
                            </div>
                            <span className="font-mono text-[#8B8894]">
                              {item.count} items
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-[#18171C] overflow-hidden border border-[#3A3842]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#E8604C] to-[#E8B23B] transition-all duration-700 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col justify-between">
                    <div className="text-xs text-[#8B8894] font-mono leading-relaxed bg-[#18171C] p-4 rounded-lg border border-[#3A3842] h-full flex flex-col justify-center">
                      <div>
                        <span className="text-[#E8B23B] font-semibold">Observation Summary:</span> Most issues identified focus on the highest bars on the left. Review corresponding raw feedback messages under the <strong>Data Table Explorer</strong> tab to prioritize product fixes.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Example Customer Complaints */}
              <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 space-y-4">
                <h4 className="text-xs uppercase tracking-wider text-[#8B8894] font-mono">
                  Example Customer Complaints
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-[#3A3842]/60">
                  {Object.entries(examples).map(([cat, list], idx) => {
                    if (list.length === 0) return null;
                    return (
                      <div key={cat} className={`pt-4 md:pt-0 ${idx > 0 ? "md:pl-6" : ""}`}>
                        <span className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border mb-2.5 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other}`}>
                          {cat.toUpperCase()}
                        </span>
                        <ul className="space-y-2.5">
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
            </div>
          )}

          {/* Table Subtab */}
          {activeSubTab === "table" && (
            <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-xs font-semibold text-[#F2EFEA] font-mono">
                  Processed Records List ({totalRecords})
                </h3>
                
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search feedback..."
                    value={search}
                    onChange={(e) => handleFilterChange(setSearch, e.target.value)}
                    className="px-3 py-1.5 text-xs rounded bg-[#18171C] border border-[#3A3842] text-[#F2EFEA] focus:outline-none focus:border-[#E8B23B] transition-colors placeholder:text-[#8B8894] w-48"
                  />
                  
                  <select
                    value={sentimentFilter}
                    onChange={(e) => handleFilterChange(setSentimentFilter, e.target.value)}
                    className="px-2 py-1.5 text-xs rounded bg-[#18171C] border border-[#3A3842] text-[#F2EFEA] focus:outline-none focus:border-[#E8B23B] font-mono"
                  >
                    <option value="All">All Sentiments</option>
                    <option value="Positive">Positive</option>
                    <option value="Neutral">Neutral</option>
                    <option value="Negative">Negative</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => handleFilterChange(setCategoryFilter, e.target.value)}
                    className="px-2 py-1.5 text-xs rounded bg-[#18171C] border border-[#3A3842] text-[#F2EFEA] focus:outline-none focus:border-[#E8B23B] font-mono"
                  >
                    <option value="All">All Categories</option>
                    <option value="Delivery">Delivery</option>
                    <option value="App Bug">App Bug</option>
                    <option value="Billing">Billing</option>
                    <option value="Staff/Support">Staff/Support</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-lg border border-[#3A3842]/60">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#3A3842] bg-[#18171C] text-xs font-mono text-[#8B8894] uppercase tracking-wider">
                      <th className="px-4 py-3 font-semibold w-16">ID</th>
                      <th className="px-4 py-3 font-semibold w-24">Date</th>
                      <th className="px-4 py-3 font-semibold w-28">Source</th>
                      <th className="px-4 py-3 font-semibold text-center w-16">Rating</th>
                      <th className="px-4 py-3 font-semibold w-24">Sentiment</th>
                      <th className="px-4 py-3 font-semibold w-28">Category</th>
                      <th className="px-4 py-3 font-semibold w-56">AI Summary</th>
                      <th className="px-4 py-3 font-semibold">Feedback Text</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3A3842]/40 text-xs">
                    {paginatedRecords.map((rec) => {
                      const sentStyle = SENTIMENT_STYLES[rec.sentiment] || {};
                      const catColor = CATEGORY_COLORS[rec.category] || CATEGORY_COLORS.Other;
                      
                      return (
                        <tr key={rec.id} className="hover:bg-[#2A2931]/40 transition-colors">
                          <td className="px-4 py-3.5 font-mono text-[#8B8894]">{rec.id}</td>
                          <td className="px-4 py-3.5 text-[#8B8894] whitespace-nowrap">{rec.timestamp}</td>
                          <td className="px-4 py-3.5 text-[#8B8894] truncate max-w-[110px]" title={rec.source}>
                            {rec.source}
                          </td>
                          <td className="px-4 py-3.5 text-center font-mono font-medium text-[#F2EFEA]">
                            {rec.rating !== null ? rec.rating : "-"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 font-semibold ${sentStyle.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sentStyle.dot}`} />
                              {rec.sentiment}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${catColor}`}>
                              {rec.category}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-[#F2EFEA] max-w-[220px] truncate" title={rec.summary}>
                            {rec.summary}
                          </td>
                          <td className="px-4 py-3.5 text-[#8B8894] max-w-sm truncate" title={rec.feedback_text}>
                            {rec.feedback_text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 text-xs font-mono text-[#8B8894]">
                <div>
                  Showing {totalRecords > 0 ? startIndex + 1 : 0} to{" "}
                  {Math.min(startIndex + itemsPerPage, totalRecords)} of {totalRecords}{" "}
                  records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded bg-[#18171C] border border-[#3A3842] hover:text-[#F2EFEA] hover:bg-[#232229] transition-all disabled:opacity-40 disabled:hover:text-[#8B8894] disabled:hover:bg-[#18171C]"
                  >
                    &larr; Prev
                  </button>
                  <span className="px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded bg-[#18171C] border border-[#3A3842] hover:text-[#F2EFEA] hover:bg-[#232229] transition-all disabled:opacity-40 disabled:hover:text-[#8B8894] disabled:hover:bg-[#18171C]"
                  >
                    Next &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Chat Assistant (1/3 width, static UI) */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-5 space-y-5 sticky top-6">
            <div className="border-b border-[#3A3842]/40 pb-3">
              <h3 className="text-xs font-semibold text-[#F2EFEA] font-mono flex items-center gap-2">
                🔮 AI Data Agent Chat
              </h3>
              <p className="text-[11px] text-[#8B8894] mt-1 leading-relaxed">
                Ask questions about the feedback in this batch (e.g. "Show negative delivery complaints last 7 days"). The agent will generate SQL, run it on PostgreSQL, and summarize the results.
              </p>
            </div>

            {/* Chat Window */}
            <div className="space-y-4 h-[420px] overflow-y-auto p-4 bg-[#18171C]/40 border border-[#3A3842]/60 rounded-xl flex flex-col gap-4">
              {chatLog.map((msg, index) => (
                <ChatMessageItem key={index} msg={msg} />
              ))}
              {chatLoading && (
                <div className="flex justify-start animate-fadeIn w-full">
                  <div className="max-w-[90%] w-full bg-[#18171C] border border-[#3A3842] rounded-xl px-4 py-3 text-xs text-[#8B8894] font-mono flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[#E8B23B] opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E8B23B]" />
                    </span>
                    <span>AI Data Agent is compiling SQL & querying database...</span>
                  </div>
                </div>
              )}
              {chatError && (
                <div className="text-xs text-[#E8604C] font-mono bg-[#E8604C]/5 p-3 rounded-lg border border-[#E8604C]/25 text-center">
                  [API ERROR] {chatError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                placeholder="Ask a question..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-[#18171C] border border-[#3A3842] text-[#F2EFEA] focus:outline-none focus:border-[#E8B23B] transition-colors placeholder:text-[#8B8894]"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 rounded-lg bg-[#E8B23B] hover:bg-[#d69f2e] text-[#18171C] font-semibold text-xs transition-colors disabled:opacity-40 disabled:hover:bg-[#E8B23B] disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              >
                {chatLoading ? "Querying..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
