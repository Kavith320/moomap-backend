"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    if (localStorage.getItem("adminToken")) {
      router.push("/");
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Authenticate with backend API
      const res = await fetch(`${API_URL}/api/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mobile, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed. Please check credentials.");
      }

      const token = data.token;

      // 2. Verify admin credentials via stats endpoint
      const statsRes = await fetch(`${API_URL}/api/admin/stats`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (statsRes.status === 403) {
        throw new Error("Access Denied: You do not have administrative privileges.");
      }

      if (!statsRes.ok) {
        throw new Error("Administrative session validation failed.");
      }

      // Save credentials and redirect
      localStorage.setItem("adminToken", token);
      localStorage.setItem("adminUser", JSON.stringify(data.user));
      router.push("/");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", overflow: "hidden" }}>
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-icon" style={{ display: 'flex', justifyContent: 'center' }}>
              <img src="/logo.png" alt="MooMap Logo" style={{ width: "64px", height: "64px", objectFit: "contain" }} />
            </div>
            <h1>MooMap Admin</h1>
            <p>Enter your administrative credentials</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="mobile">Mobile Number</label>
              <input
                type="tel"
                id="mobile"
                placeholder="e.g. 0771234567"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {!loading ? (
                <span className="btn-text">Log In</span>
              ) : (
                <span className="spinner"></span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
