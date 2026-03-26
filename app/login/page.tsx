"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
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
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const from = searchParams.get("from") || "/";
        router.push(from);
      } else {
        setError("Wrong password");
      }
    } catch {
      setError("Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logo}>
          <svg viewBox="0 0 40 40" width="48" height="48">
            <rect width="40" height="40" rx="8" fill="#FEEB29" />
            <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize="20" fontWeight="800" fill="#242424">N</text>
          </svg>
        </div>
        <h1 style={styles.title}>Paid Social Ad Builder</h1>
        <p style={styles.projectName}>Norton Revamp</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={styles.input}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "..." : "Enter"}
        </button>
      </form>
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
    margin: "0 0 28px",
    letterSpacing: "-0.2px",
  },
  subtitle: {
    fontSize: 13,
    color: "#999",
    margin: "0 0 20px",
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
