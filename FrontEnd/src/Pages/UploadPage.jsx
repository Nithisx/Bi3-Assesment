import React, { useState, useCallback } from "react";

const API_BASE = "http://localhost:8000";

export default function UploadPage({ onUploadStarted, apiOnline }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const uploadFile = async (file) => {
    if (!file) return;
    
    // Validate file type
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a valid CSV file (.csv)");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to process the CSV file. Check formatting.");
      }

      const data = await response.json();
      onUploadStarted(data.batch_id);
    } catch (err) {
      setError(err.message || "Connection to API failed.");
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Introduction */}
      <div className="rounded-xl border border-[#3A3842] bg-[#232229] p-6">
        <h3 className="text-lg font-semibold text-[#F2EFEA] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Analyze Customer Feedback Batches
        </h3>
        <p className="text-sm text-[#8B8894] leading-relaxed">
          Upload a raw CSV file containing customer feedback. The system will automatically:
        </p>
        <ul className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono text-[#8B8894]">
          <li className="flex items-center gap-2 bg-[#18171C] p-3 rounded-lg border border-[#3A3842]">
            <span className="text-[#E8B23B]">01.</span> Clean noise & deduplicate messages
          </li>
          <li className="flex items-center gap-2 bg-[#18171C] p-3 rounded-lg border border-[#3A3842]">
            <span className="text-[#E8604C]">02.</span> Normalize varied date formats
          </li>
          <li className="flex items-center gap-2 bg-[#18171C] p-3 rounded-lg border border-[#3A3842]">
            <span className="text-[#5FAD8C]">03.</span> Extract Sentiment, Categories, & Summaries
          </li>
        </ul>
      </div>

      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed rounded-xl transition-all duration-300 p-8 text-center ${
          dragActive
            ? "border-[#E8B23B] bg-[#2A2931] scale-[1.01]"
            : "border-[#3A3842] bg-[#232229] hover:border-[#8B8894]"
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            {/* Spinning Loader */}
            <div className="h-12 w-12 rounded-full border-4 border-[#3A3842] border-t-[#E8B23B] animate-spin" />
            <div>
              <p className="text-sm font-semibold text-[#F2EFEA]">Cleaning & Preprocessing CSV...</p>
              <p className="text-xs text-[#8B8894] mt-1">Filtering duplicates, empty records, and parsing timestamps</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center max-w-md">
            {/* Upload SVG Icon */}
            <div className="mb-4 p-4 rounded-full bg-[#18171C] text-[#8B8894] group-hover:text-[#F2EFEA] border border-[#3A3842]">
              <svg className="w-8 h-8 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <p className="text-base font-semibold text-[#F2EFEA] mb-1">
              Drag & drop your feedback CSV file here
            </p>
            <p className="text-xs text-[#8B8894] mb-6 font-mono">
              Supports standard column schema: id, timestamp, source, rating, feedback_text
            </p>

            <label className="cursor-pointer inline-flex items-center justify-center px-6 py-2.5 rounded-lg text-sm font-semibold bg-[#E8B23B] hover:bg-[#d69f2e] text-[#18171C] transition-colors focus:ring-2 focus:ring-[#E8B23B] focus:ring-offset-2 focus:ring-offset-[#18171C] outline-none">
              Choose Local CSV File
              <input
                type="file"
                className="hidden"
                accept=".csv"
                onChange={handleChange}
                disabled={!apiOnline}
              />
            </label>

            {!apiOnline && (
              <p className="text-xs text-[#E8604C] mt-4 font-mono">
                [SYSTEM WARNING] API is offline. Upload is temporarily disabled.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg border border-[#E8604C]/30 bg-[#E8604C]/10 p-4 text-sm text-[#E8604C] flex gap-3 items-center">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-semibold font-mono">[ERROR]</span> {error}
          </div>
        </div>
      )}
    </div>
  );
}
