import React, { useState, useEffect } from "react";
import FeedbackDashboard from "./Pages/DashBoard";
import UploadPage from "./Pages/UploadPage";
import ProcessingPage from "./Pages/ProcessingPage";
import HistoryPage from "./Pages/HistoryPage";
import BatchDetailsPage from "./Pages/BatchDetailsPage";
import "./App.css";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [view, setView] = useState("dashboard"); // dashboard | upload | processing | history | batch_details
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [apiOnline, setApiOnline] = useState(null);

  // Check API health status
  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/`);
        if (res.ok) {
          setApiOnline(true);
        } else {
          setApiOnline(false);
        }
      } catch {
        setApiOnline(false);
      }
    };
    checkApiHealth();
    const interval = setInterval(checkApiHealth, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleTabChange = (newView) => {
    setView(newView);
    // Clear active batch when navigating away from details
    if (newView !== "batch_details" && newView !== "processing") {
      setActiveBatchId(null);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#18171C] text-[#F2EFEA] px-4 py-8 sm:px-10 lg:px-16 flex flex-col justify-between"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className={`mx-auto w-full flex-1 transition-all duration-300 ${view === "batch_details" || view === "dashboard" ? "max-w-[90vw]" : "max-w-5xl"}`}>
        {/* Unified Application Header */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-[#3A3842] mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#8B8894] font-mono mb-2">
              Customer Feedback BI Portal
            </p>
            <h1
              className="text-4xl font-bold tracking-tight bg-gradient-to-r from-[#F2EFEA] via-[#E8B23B] to-[#F2EFEA] bg-clip-text text-transparent flex items-center gap-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Feedback Pulse ⚡
            </h1>
          </div>

          {/* Connection Status Pulse */}
          <div className="flex items-center gap-2 self-start md:self-auto bg-[#232229] border border-[#3A3842] px-3 py-1.5 rounded-lg">
            <span className="relative flex h-2.5 w-2.5">
              {apiOnline === true && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#5FAD8C] opacity-60 animate-ping" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  apiOnline === true
                    ? "bg-[#5FAD8C]"
                    : apiOnline === false
                    ? "bg-[#E8604C]"
                    : "bg-[#8B8894]"
                }`}
              />
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#8B8894] font-mono">
              {apiOnline === true
                ? "API ONLINE"
                : apiOnline === false
                ? "API OFFLINE"
                : "CONNECTING..."}
            </span>
          </div>
        </header>

        {/* Tab Navigation (only visible when not actively processing or viewing specific details) */}
        {view !== "processing" && view !== "batch_details" && (
          <nav className="flex gap-1.5 border-b border-[#3A3842]/40 pb-4 mb-8">
            <button
              onClick={() => handleTabChange("dashboard")}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-medium tracking-wide transition-all border ${
                view === "dashboard"
                  ? "bg-[#E8B23B]/10 text-[#E8B23B] border-[#E8B23B]/30"
                  : "bg-transparent text-[#8B8894] border-transparent hover:text-[#F2EFEA] hover:bg-[#232229]/50"
              }`}
            >
              📊 Overall Summary
            </button>
            <button
              onClick={() => handleTabChange("upload")}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-medium tracking-wide transition-all border ${
                view === "upload"
                  ? "bg-[#E8B23B]/10 text-[#E8B23B] border-[#E8B23B]/30"
                  : "bg-transparent text-[#8B8894] border-transparent hover:text-[#F2EFEA] hover:bg-[#232229]/50"
              }`}
            >
              📤 Analyze New CSV
            </button>
            <button
              onClick={() => handleTabChange("history")}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-medium tracking-wide transition-all border ${
                view === "history" || view === "batch_details"
                  ? "bg-[#E8B23B]/10 text-[#E8B23B] border-[#E8B23B]/30"
                  : "bg-transparent text-[#8B8894] border-transparent hover:text-[#F2EFEA] hover:bg-[#232229]/50"
              }`}
            >
              📜 Batch History Log
            </button>
          </nav>
        )}

        {/* Body Content Rendering */}
        <main className="min-h-[400px]">
          {view === "dashboard" && <FeedbackDashboard inline={true} />}
          
          {view === "upload" && (
            <UploadPage
              apiOnline={apiOnline}
              onUploadStarted={(batchId) => {
                setActiveBatchId(batchId);
                setView("processing");
              }}
            />
          )}
          
          {view === "processing" && (
            <ProcessingPage
              batchId={activeBatchId}
              onFinished={(batchId) => {
                setActiveBatchId(batchId);
                setView("batch_details");
              }}
              onCancelled={() => setView("history")}
            />
          )}
          
          {view === "history" && (
            <HistoryPage
              onViewDetails={(batchId) => {
                setActiveBatchId(batchId);
                setView("batch_details");
              }}
              onResumeProcessing={(batchId) => {
                setActiveBatchId(batchId);
                setView("processing");
              }}
            />
          )}
          
          {view === "batch_details" && (
            <BatchDetailsPage
              batchId={activeBatchId}
              onBack={() => setView("history")}
            />
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-4xl pt-8 border-t border-[#3A3842] mt-12 text-[10px] font-mono text-[#8B8894] flex flex-col sm:flex-row justify-between gap-4">
        <div>
          Backend: {API_BASE}/api &bull; Database: bi3 postgresql &bull; Model: OpenRouter LLM
        </div>
        <div>
          Feedback Pulse BI Dashboard &copy; 2026
        </div>
      </footer>
    </div>
  );
}
