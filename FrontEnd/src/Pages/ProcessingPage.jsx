import React, { useEffect, useState, useRef } from "react";

const API_BASE = "http://localhost:8000";

export default function ProcessingPage({ batchId, onFinished, onCancelled }) {
  const [progress, setProgress] = useState(null); // { total_rows, processed_rows, status, filename }
  const [error, setError] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isStopped, setIsStopped] = useState(false);
  const [stopping, setStopping] = useState(false);

  const timerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    // Start stopwatch
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    // Poll endpoint for status updates
    const fetchProgress = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/batch/${batchId}`);
        if (!response.ok) throw new Error("Failed to load processing details.");
        
        const data = await response.json();
        setProgress(data);

        if (data.status === "completed") {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          // Auto-trigger completion after a short visual delay
          setTimeout(() => {
            onFinished(batchId);
          }, 1500);
        } else if (data.status === "stopped") {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setIsStopped(true);
          setStopping(false);
        } else if (data.status === "failed") {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setError("The batch processing task was interrupted or failed on the backend.");
        }
      } catch (err) {
        console.warn("Polling retry error:", err);
      }
    };

    // Initial fetch and start interval
    fetchProgress();
    pollRef.current = setInterval(fetchProgress, 1000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [batchId, onFinished]);

  const handleStop = async () => {
    setStopping(true);
    try {
      const response = await fetch(`${API_BASE}/api/batch/${batchId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.detail || "Failed to send stop request.");
      }
    } catch (err) {
      console.error("Stop batch error:", err);
      alert("Failed to stop: " + err.message);
      setStopping(false);
    }
  };

  const total = progress?.total_rows || 0;
  const processed = progress?.processed_rows || 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const filename = progress?.filename || "feedback_dataset.csv";
  const status = progress?.status || "processing";

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  // Estimate remaining time: assume average ~0.7s per row for pending items
  const pendingRows = total - processed;
  const estimatedSecondsLeft = Math.ceil(pendingRows * 0.7);
  const estTimeDisplay = pendingRows > 0 ? formatTime(estimatedSecondsLeft) : "Finishing up...";

  return (
    <div className="mx-auto max-w-xl animate-fadeIn space-y-8 py-6">
      <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6 text-center space-y-6">
        <div>
          <span className="inline-block px-3 py-1 rounded-full bg-[#E8B23B]/10 text-[#E8B23B] font-mono text-xs uppercase tracking-wider mb-3">
            Active Batch Analysis
          </span>
          <h3 className="text-xl font-semibold text-[#F2EFEA] truncate" title={filename}>
            {filename}
          </h3>
          <p className="text-xs text-[#8B8894] font-mono mt-1">
            Batch ID: {batchId}
          </p>
        </div>

        {/* Big Progress Circle / Percentage */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative flex items-center justify-center">
            {/* Spinning background halo */}
            <div className="absolute h-32 w-32 rounded-full border-4 border-[#18171C]" />
            {!isStopped && status === "processing" && (
              <div className="absolute h-32 w-32 rounded-full border-4 border-t-[#E8B23B] border-r-[#E8604C] animate-spin opacity-50" />
            )}
            <div className={`text-3xl font-bold font-mono z-10 ${isStopped ? "text-[#E8604C]" : "text-[#F2EFEA]"}`}>
              {isStopped ? "STOPPED" : `${pct}%`}
            </div>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8B8894] font-mono mt-4">
            {isStopped
              ? "Analysis Aborted"
              : status === "completed"
              ? "Analysis Completed!"
              : "Processing dataset..."}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono text-[#8B8894]">
            <span>Processed: {processed} / {total} records</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#18171C] overflow-hidden border border-[#3A3842]">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isStopped
                  ? "bg-[#E8604C]"
                  : "bg-gradient-to-r from-[#E8604C] via-[#E8B23B] to-[#5FAD8C]"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#3A3842] text-left">
          <div>
            <p className="text-xs text-[#8B8894] font-mono">Elapsed Time</p>
            <p className="text-lg font-semibold text-[#F2EFEA] font-mono mt-0.5">
              {formatTime(elapsedTime)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#8B8894] font-mono">Est. Time Remaining</p>
            <p className="text-lg font-semibold text-[#E8B23B] font-mono mt-0.5">
              {isStopped ? "Stopped" : status === "completed" ? "0:00" : estTimeDisplay}
            </p>
          </div>
        </div>

        {/* Stop Controls */}
        <div className="pt-2">
          {!isStopped && status === "processing" && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-mono font-semibold transition-all border ${
                stopping
                  ? "bg-[#E8604C]/10 text-[#E8604C] border-[#E8604C]/20 cursor-not-allowed animate-pulse"
                  : "bg-transparent hover:bg-[#E8604C]/10 text-[#E8604C] border-[#E8604C]/30 hover:border-[#E8604C]/50 cursor-pointer"
              }`}
            >
              {stopping ? "Stopping active worker..." : "🛑 Stop Analysis Run"}
            </button>
          )}

          {isStopped && (
            <div className="rounded-lg border border-[#E8604C]/30 bg-[#E8604C]/5 p-4 text-center space-y-4">
              <p className="text-xs text-[#8B8894] font-mono leading-relaxed">
                The batch analyzer was stopped by the user. {processed} records were successfully processed and saved to the database.
              </p>
              <div className="flex justify-center gap-3">
                {processed > 0 && (
                  <button
                    onClick={() => onFinished(batchId)}
                    className="px-4 py-2 text-xs font-semibold rounded bg-[#E8B23B] text-[#18171C] hover:bg-[#d69f2e] transition-colors cursor-pointer"
                  >
                    View Partial Results ({processed})
                  </button>
                )}
                <button
                  onClick={onCancelled}
                  className="px-4 py-2 text-xs font-semibold rounded bg-[#232229] border border-[#3A3842] text-[#8B8894] hover:text-[#F2EFEA] hover:bg-[#2A2931] transition-colors cursor-pointer"
                >
                  Back to History Log
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Return Option */}
      {!isStopped && (
        <div className="text-center">
          <button
            onClick={onCancelled}
            className="text-xs text-[#8B8894] hover:text-[#F2EFEA] underline underline-offset-2 font-mono cursor-pointer"
          >
            Return to Dashboard / History
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-[#E8604C]/30 bg-[#E8604C]/10 p-4 text-sm text-[#E8604C] text-center">
          <span className="font-semibold font-mono">[PROCESSING FAILURE]</span> {error}
          <div className="mt-3">
            <button
              onClick={onCancelled}
              className="px-4 py-1.5 rounded bg-[#E8604C] hover:bg-[#c94d3a] text-[#F2EFEA] text-xs font-semibold cursor-pointer"
            >
              Back to Upload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
