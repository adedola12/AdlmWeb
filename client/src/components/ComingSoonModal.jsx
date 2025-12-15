export default function ComingSoonModal({
  show,
  onClose,
  title = "Coming soon",
  message = "",
  children,
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
