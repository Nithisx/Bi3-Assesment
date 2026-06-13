import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";

export default function HistoryPage({ onViewDetails, onResumeProcessing }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_BASE}/api/batches`);
      if (!response.ok) throw new Error("Failed to load historical runs.");
      const data = await response.json();
      setBatches(data);
    } catch (err) {
      setError(err.message || "Unable to contact API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredBatches = batches.filter((batch) =>
    batch.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#F2EFEA]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Upload History Log
          </h3>
          <p className="text-xs text-[#8B8894] mt-0.5">
            List of all customer feedback uploads processed by the system
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-sm rounded bg-[#232229] border border-[#3A3842] text-[#F2EFEA] focus:outline-none focus:border-[#E8B23B] transition-colors placeholder:text-[#8B8894] w-64"
          />
          <button
            onClick={loadHistory}
            className="p-1.5 rounded bg-[#232229] border border-[#3A3842] text-[#8B8894] hover:text-[#F2EFEA] hover:bg-[#2A2931] transition-all"
            title="Refresh list"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.253 8H18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-[#232229] animate-pulse border border-[#3A3842]" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-8 text-center space-y-3">
          <p className="text-sm text-[#8B8894]">{error}</p>
          <button
            onClick={loadHistory}
            className="px-4 py-1.5 text-xs font-semibold rounded bg-[#E8B23B] text-[#18171C] hover:bg-[#d69f2e] transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#3A3842] bg-[#232229]/50 p-12 text-center">
          <p className="text-sm text-[#8B8894]">
            {searchTerm ? "No matching files found." : "No batches found. Upload a feedback CSV to begin!"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#3A3842] bg-[#232229]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#3A3842] bg-[#18171C] text-xs font-mono text-[#8B8894] uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Upload Date</th>
                <th className="px-6 py-4 font-semibold">Filename</th>
                <th className="px-6 py-4 font-semibold text-right">Rows</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3A3842]/50 text-sm">
              {filteredBatches.map((batch) => {
                const dateVal = batch.uploaded_at || "Unknown";
                
                // Status styles & badges
                let badgeClass = "";
                let statusText = batch.status;
                if (batch.status === "completed") {
                  badgeClass = "bg-[#5FAD8C]/10 text-[#5FAD8C] border-[#5FAD8C]/20";
                } else if (batch.status === "processing") {
                  badgeClass = "bg-[#E8B23B]/10 text-[#E8B23B] border-[#E8B23B]/20 animate-pulse";
                  statusText = `Analyzing (${Math.round((batch.processed_rows / batch.total_rows) * 100)}%)`;
                } else if (batch.status === "stopped") {
                  badgeClass = "bg-zinc-800 text-zinc-400 border-zinc-700";
                  statusText = "stopped";
                } else {
                  badgeClass = "bg-[#E8604C]/10 text-[#E8604C] border-[#E8604C]/20";
                }

                return (
                  <tr
                    key={batch.batch_id}
                    className="hover:bg-[#2A2931]/60 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (batch.status === "completed" || batch.status === "stopped") {
                        onViewDetails(batch.batch_id);
                      } else if (batch.status === "processing") {
                        onResumeProcessing(batch.batch_id);
                      }
                    }}
                  >
                    <td className="px-6 py-4 text-xs font-mono text-[#8B8894] whitespace-nowrap">
                      {dateVal}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#F2EFEA] max-w-xs truncate" title={batch.filename}>
                      {batch.filename}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-[#8B8894] whitespace-nowrap">
                      {batch.status === "processing" ? (
                        <span>{batch.processed_rows} / {batch.total_rows}</span>
                      ) : (
                        <span>{batch.total_rows.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs border font-medium ${badgeClass}`}>
                        {statusText}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      {batch.status === "completed" ? (
                        <button className="text-xs font-semibold text-[#E8B23B] group-hover:underline flex items-center gap-1 mx-auto">
                          View Report
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : batch.status === "processing" ? (
                        <button className="text-xs font-semibold text-[#E8B23B] hover:underline flex items-center gap-1 mx-auto">
                          Track Progress
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </button>
                      ) : batch.status === "stopped" ? (
                        <button className="text-xs font-semibold text-[#E8B23B] group-hover:underline flex items-center gap-1 mx-auto font-mono">
                          View Report
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : (
                        <span className="text-xs font-mono text-[#8B8894]">N/A</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
