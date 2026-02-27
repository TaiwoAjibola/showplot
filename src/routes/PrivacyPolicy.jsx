export default function PrivacyPolicy() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <div className="text-xl font-semibold text-slate-900">Privacy Policy</div>
        <div className="mt-1 text-sm text-slate-600">Last updated: 25 February 2026</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 leading-6">
        <p>
          This page will describe what data ShowPlot collects, how it is used, and how you can request deletion.
        </p>
        <p className="mt-3">
          Authentication is handled via Google Sign-In. We store basic profile information (name, email, picture) and
          your saved stage plots.
        </p>
        <p className="mt-3">
          For questions or requests, use the Feedback page.
        </p>
      </div>
    </div>
  )
}
