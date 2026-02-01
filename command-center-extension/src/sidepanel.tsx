/**
 * Side Panel — Command Center UI
 * 
 * This is a "dumb" renderer that:
 * - Subscribes to tab-keyed storage
 * - Auto-updates when user switches tabs
 * - Never writes directly to storage (only via background)
 */
import { useTabContext, useTabDraft, useTabScreenshot } from "~core/storage"
import { sendToBackground } from "~core/messaging"
import "./style.css"

function SidePanel() {
    const { tabId, context, isLoading } = useTabContext()
    const { draft, clearDraft } = useTabDraft()
    const { screenshot, clearScreenshot } = useTabScreenshot()

    const handleCapture = async () => {
        await sendToBackground("CAPTURE_TAB")
    }

    const handleCopy = async () => {
        if (draft) {
            await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
        }
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4">
            {/* Header */}
            <header className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <span className="text-xl">⚡</span>
                </div>
                <div>
                    <h1 className="text-lg font-semibold">Command Center</h1>
                    <p className="text-xs text-slate-400">Tab: {tabId || "—"}</p>
                </div>
            </header>

            {/* Context Card */}
            {isLoading && (
                <div className="bg-slate-800 rounded-xl p-4 mb-4 animate-pulse">
                    <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                </div>
            )}

            {context && (
                <div className="bg-slate-800 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded-full">
                            {context.source}
                        </span>
                    </div>
                    <h2 className="font-semibold text-lg">{context.candidate.name}</h2>
                    {context.candidate.novaId && (
                        <p className="text-sm text-slate-400">Nova ID: {context.candidate.novaId}</p>
                    )}
                    {context.candidate.email && (
                        <p className="text-sm text-slate-400">{context.candidate.email}</p>
                    )}
                    {context.candidate.specialty && (
                        <p className="text-sm text-slate-400">{context.candidate.specialty}</p>
                    )}
                </div>
            )}

            {!context && !isLoading && (
                <div className="bg-slate-800/50 border border-dashed border-slate-700 rounded-xl p-6 mb-4 text-center">
                    <p className="text-slate-400 text-sm">
                        Navigate to a Nova candidate page to see context
                    </p>
                </div>
            )}

            {/* Capture Controls */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={handleCapture}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                    <span>📸</span>
                    Capture Tab
                </button>
                <button
                    onClick={() => navigator.clipboard.readText()}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                >
                    📋
                </button>
            </div>

            {/* Screenshot Preview */}
            {screenshot && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400">Screenshot captured</span>
                        <button
                            onClick={clearScreenshot}
                            className="text-xs text-red-400 hover:text-red-300"
                        >
                            Clear
                        </button>
                    </div>
                    <img
                        src={screenshot}
                        alt="Captured screenshot"
                        className="w-full rounded-lg border border-slate-700"
                    />
                </div>
            )}

            {/* Draft Card */}
            {draft && (
                <div className="bg-slate-800 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-indigo-400">Generated Draft</span>
                        <button
                            onClick={clearDraft}
                            className="text-xs text-slate-400 hover:text-slate-300"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="mb-2">
                        <span className="text-xs text-slate-500">Subject:</span>
                        <p className="font-medium">{draft.subject}</p>
                    </div>
                    <div>
                        <span className="text-xs text-slate-500">Body:</span>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{draft.body}</p>
                    </div>
                </div>
            )}

            {/* Actions */}
            {draft && (
                <div className="flex gap-2">
                    <button
                        onClick={handleCopy}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <span>📋</span>
                        Copy Draft
                    </button>
                    <a
                        href={`mailto:${context?.candidate.email || ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <span>📧</span>
                    </a>
                </div>
            )}

            {/* Mode Chips (placeholder) */}
            <div className="mt-6">
                <p className="text-xs text-slate-500 mb-2">Mode</p>
                <div className="flex gap-2 flex-wrap">
                    {["Pay Package", "Licensing", "Reassignment", "Follow-up"].map((mode) => (
                        <button
                            key={mode}
                            className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full transition-colors"
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <footer className="mt-8 text-center text-xs text-slate-500">
                <p>Command Center v1.0</p>
            </footer>
        </div>
    )
}

export default SidePanel
