import React from "react";

export default function ForceReinstallBanner({ data }) {
  if (!data?.active) return null;

  const message = data.message?.trim() || "A mandatory reinstall is required.";
  const installerHubUrl = data.installerHubUrl || "";
  const videoUrl = data.installerHubVideoUrl || "";

  return (
    <div className="w-full bg-red-700 text-white px-3 py-3 border-b border-red-900">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm leading-relaxed">
          <b className="mr-2 uppercase tracking-wide">Action required:</b>
          {message}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {installerHubUrl && (
            <a
              href={installerHubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-white text-red-700 font-semibold px-3 py-1.5 rounded hover:bg-red-50"
            >
              Download Installer Hub
            </a>
          )}
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-white/15 px-3 py-1.5 rounded hover:bg-white/25"
            >
              Watch setup video
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
