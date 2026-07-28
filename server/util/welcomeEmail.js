export function buildWelcomeEmail({ firstName = "", lastName = "" }) {
  const name =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "there";

  const subject = `Welcome to ADLM, ${name} 👋 We’re glad you’re here 🎉`;

  const html = `
  <div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a">
    <h2 style="margin:0 0 10px">Dear, ${name} 👋</h2>
    <p>Welcome to <b>ADLM Studio</b> — we’re genuinely excited to have you here.</p>

    <p>My name is Adedolapo Quasim, and together with our team, we built ADLM to solve a problem we’ve lived through ourselves:</p>
    <p>making the work of Quantity Surveyors, Consultants, and Project managers easier, faster, and more practical — the African way.</p>

    <p>ADLM isn’t just another software platform.</p>
    <p>It’s a collection of tools, training, and systems designed around how our industry actually works on this side of the world.
</p>


    <p><b>Over the next few weeks, you’ll hear from us occasionally — short emails to:</b></p>
    <ul>
      <li>Explore our products (RateGen, QUIV for Revit, ADLM Heron)</li>
      <li>Share tips on improving your workflow and productivity</li>
      <li>Learn more about how you work, so we can build better solutions for you
</li>
    </ul>

    <p><b>For now, here’s what you can explore:</b></p>
       <ul>
      <li>🔹 Access your dashboard to manage products and subscriptions</li>
      <li>🔹 Explore ADLM tools built for real-world QS workflows</li>
      <li>🔹 Learn through our trainings and tutorials </li>
    </ul> 

    <p><b>Here’s what you can do next:</b></p>
    <ul>
      <li>Explore our products (RateGen, QUIV for Revit, ADLM Heron)</li>
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

    <p style="margin-top:18px"><b>Speak soon,</b></p>

        <p style="margin-top:18px"><b>— The ADLM Team</b></p>
  </div>
  `;

  return { subject, html };
}
