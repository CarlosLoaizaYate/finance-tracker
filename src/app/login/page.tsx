"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const { error } = isSignUp
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.push("/dashboard");
    };

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center",
            justifyContent: "center", background: "#f3f4f6",
            fontFamily: "'Segoe UI', sans-serif",
        }}>
            <div style={{
                background: "#fff", borderRadius: 16, padding: "40px 36px",
                boxShadow: "0 4px 20px #0001", width: 380,
            }}>
                <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "#111827" }}>
                    💰 Finance Tracker
                </h1>
                <p style={{ margin: "0 0 24px", fontSize: 14, color: "#6b7280" }}>
                    {isSignUp ? "Create your account" : "Sign in to your account"}
                </p>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                            Email
                        </label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                            required placeholder="you@email.com"
                            style={{
                                width: "100%", padding: "10px 12px", borderRadius: 8,
                                border: "1px solid #d1d5db", fontSize: 14, outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                            Password
                        </label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                            required placeholder="••••••••" minLength={6}
                            style={{
                                width: "100%", padding: "10px 12px", borderRadius: 8,
                                border: "1px solid #d1d5db", fontSize: 14, outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: "#fee2e2", color: "#991b1b", borderRadius: 8,
                            padding: "10px 14px", fontSize: 13, marginBottom: 16,
                        }}>
                            {error}
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        style={{
                            width: "100%", padding: "12px", borderRadius: 8,
                            background: loading ? "#9ca3af" : "#6366f1", color: "#fff",
                            border: "none", fontSize: 14, fontWeight: 700,
                            cursor: loading ? "not-allowed" : "pointer",
                        }}>
                        {loading ? "Loading..." : isSignUp ? "Create account" : "Sign in"}
                    </button>
                </form>

                <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#6b7280" }}>
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}
                    <button onClick={() => setIsSignUp(p => !p)}
                        style={{
                            background: "none", border: "none", color: "#6366f1",
                            fontWeight: 600, cursor: "pointer", marginLeft: 4,
                        }}>
                        {isSignUp ? "Sign in" : "Sign up"}
                    </button>
                </p>
            </div>
        </div>
    );
}