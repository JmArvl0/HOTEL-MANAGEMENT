"use client";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("manager@haven.test");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); const result = await signIn("credentials", { email, password, redirect: false }); setLoading(false); if (result?.error) setError("That email or password doesn’t match our records."); else { router.push("/dashboard"); router.refresh(); } }
  return <main className="login-page"><section className="login-art"><Link href="/" className="brand brand-light"><span className="brand-mark"><Sparkles size={18}/></span><span>HAVEN<small>HOTEL & RESIDENCES</small></span></Link><div><p className="eyebrow light">Operations, beautifully connected</p><h1>Make every stay<br/><em>feel effortless.</em></h1><p>Reservations, rooms, service, and insights—all in one calm workspace.</p></div><small>© 2026 Haven Hotel & Residences</small></section><section className="login-form-wrap"><div className="login-form"><Link href="/" className="back-link"><ArrowLeft size={16}/> Back to hotel</Link><span className="login-icon"><LockKeyhole/></span><p className="eyebrow">Haven portal</p><h2>Welcome.</h2><p>All team members sign in here — one door for every role, from front desk to management.</p><form onSubmit={submit}><label>Work email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required/></label><div className="password-field"><label>Password<input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required/></label><button type="button" className="toggle-password" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{error && <p className="form-error">{error}</p>}<button className="btn btn-accent" disabled={loading}>{loading ? "Signing up…" : "Sign up"}<ArrowRight size={17}/></button></form><div className="demo-note"><strong>Demo access</strong><span>Use any role email such as manager@haven.test with password <b>demo123</b>.</span></div></div></section></main>;
}
