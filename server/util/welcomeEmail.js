export function buildWelcomeEmail({ firstName = "", lastName = "" }) {
  const name =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "there";

  const subject = "Welcome to ADLM Studio 🎉";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a">
    <h2 style="margin:0 0 10px">Welcome, ${name} 👋</h2>
    <p>Thanks for joining <b>ADLM Studio</b> — digital tools and training for modern Quantity Surveyors.</p>

    <p><b>Here’s what you can do next:</b></p>
    <ul>
      <li>Explore our products (RateGen, Revit Plugin, PlanSwift Plugin)</li>
      <li>Start learning with our trainings & tutorials</li>
      <li>Access your dashboard to manage purchases and subscriptions</li>
    </ul>

    <p style="margin-top:16px">
      <a href="https://adlmstudio.net/products"
         style="display:inline-block;padding:10px 14px;border-radius:8px;background:#2563eb;color:white;text-decoration:none">
        Explore Products
      </a>
    </p>

    <p style="color:#334155;margin-top:18px">
      If you need help, just reply to this email or contact us at
      <a href="mailto:admin@adlmstudio.net">admin@adlmstudio.net</a>.
    </p>

    <p style="margin-top:18px"><b>— ADLM Team</b></p>
  </div>
  `;

  return { subject, html };
}
