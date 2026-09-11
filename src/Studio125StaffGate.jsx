import { useEffect, useState } from "react";

export default function Studio125StaffGate({ children }) {
  const [state, setState] = useState({ loading: true, enabled: false, authenticated: false, error: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/staff-auth", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.status === 404 || body.enabled === false) setState({ loading: false, enabled: false, authenticated: false, error: "" });
        else setState({ loading: false, enabled: true, authenticated: body.authenticated === true, error: "" });
      })
      .catch(() => { if (active) setState({ loading: false, enabled: false, authenticated: false, error: "" }); });
    return () => { active = false; };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setState((current) => ({ ...current, loading: true, error: "" }));
    const response = await fetch("/api/staff-auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    setState({ loading: false, enabled: true, authenticated: response.ok && body.authenticated === true,
      error: response.ok ? "" : body.error || "Sign-in was not accepted." });
  }

  if (!state.enabled && !state.loading) return children;
  if (state.authenticated) return children;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#121212", color: "#fff" }}>
      <form onSubmit={signIn} style={{ width: "min(420px, 100%)", display: "grid", gap: 14, padding: 28, border: "1px solid #444", borderRadius: 16, background: "#1d1d1d" }}>
        <p style={{ margin: 0, letterSpacing: ".16em", fontSize: 12 }}>STUDIO125 LIVEBOARD</p>
        <h1 style={{ margin: 0 }}>Staff sign in</h1>
        <p style={{ margin: 0, color: "#ccc" }}>Use your personal Studio125 email and password.</p>
        <label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} style={{ width: "100%", marginTop: 6, padding: 12 }} /></label>
        <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ width: "100%", marginTop: 6, padding: 12 }} /></label>
        {state.error && <p role="alert" style={{ margin: 0, color: "#ffb3b3" }}>{state.error}</p>}
        <button disabled={state.loading} type="submit" style={{ padding: 12, fontWeight: 700 }}>{state.loading ? "Checking…" : "Sign in"}</button>
      </form>
    </main>
  );
}
