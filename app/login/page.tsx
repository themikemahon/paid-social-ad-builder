"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AuthMode = 'site' | 'user';

function LoginForm() {
  const [mode, setMode] = useState<AuthMode>('site');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === 'user') {
        // Email + password JWT login
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('auth_token', data.token);
          const from = searchParams.get("from") || "/dashboard";
          router.push(from);
        } else {
          // Requirement 2.2: don't reveal which credential was wrong
          setError("Invalid credentials");
        }
      } else {
        // Existing site-password flow
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          const from = searchParams.get("from") || "/dashboard";
          window.location.href = from;
        } else {
          setError("Wrong password");
        }
      }
    } catch {
      setError("Something went wrong");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <div style={styles.logo}>
        <svg viewBox="0 0 40 40" width="48" height="48">
          <rect width="40" height="40" rx="8" fill="#FEEB29" />
          <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize="20" fontWeight="800" fill="#242424">N</text>
        </svg>
      </div>
      <h1 style={styles.title}>Paid Social Ad Builder</h1>
      <p style={styles.projectName}>Norton Revamp</p>

      {/* Mode toggle */}
      <div style={styles.modeToggle}>
        <button
          type="button"
          onClick={() => { setMode('site'); setError(''); }}
          style={{ ...styles.modeBtn, ...(mode === 'site' ? styles.modeBtnActive : {}) }}
        >
          Site Password
        </button>
        <button
          type="button"
          onClick={() => { setMode('user'); setError(''); }}
          style={{ ...styles.modeBtn, ...(mode === 'user' ? styles.modeBtnActive : {}) }}
        >
          User Login
        </button>
      </div>

      {mode === 'user' && (
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ ...styles.input, marginBottom: 8 }}
          autoFocus
        />
      )}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        style={styles.input}
        autoFocus={mode === 'site'}
      />
      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={loading} style={styles.button}>
        {loading ? "..." : mode === 'user' ? "Sign In" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={styles.wrapper}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f0f0",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: "#f0f0f0",
    borderRadius: 12,
    padding: "40px 36px",
    width: 340,
    maxWidth: "90vw",
    textAlign: "center" as const,
  },
  logo: { marginBottom: 16 },
  title: {
    fontSize: 18,
    fontWeight: 800,
    color: "#242424",
    margin: "0 0 2px",
    letterSpacing: "-0.3px",
  },
  projectName: {
    fontSize: 14,
    fontWeight: 500,
    color: "#999",
    margin: "0 0 20px",
    letterSpacing: "-0.2px",
  },
  modeToggle: {
    display: "flex",
    gap: 0,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden" as const,
    border: "1px solid #ddd",
  },
  modeBtn: {
    flex: 1,
    padding: "8px 0",
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    background: "#fff",
    color: "#999",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  modeBtnActive: {
    background: "#242424",
    color: "#fff",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  error: {
    color: "#e53935",
    fontSize: 12,
    margin: "8px 0 0",
  },
  button: {
    width: "100%",
    padding: "10px 0",
    background: "#242424",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: 12,
  },
};
