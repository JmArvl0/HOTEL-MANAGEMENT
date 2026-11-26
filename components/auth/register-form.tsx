"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { FormFieldError, focusFirstFormError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import { FormEvent, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MobileNumberField } from "@/components/ui/mobile-number-field";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { authDestination } from "@/lib/auth-destination";

export function RegisterForm({ callbackUrl, booking = false }: { callbackUrl: string; booking?: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState<FormFieldErrors>({});
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState<{ field: "password" | "confirmPassword"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setFields({});
    setPasswordError(null);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (values.password !== values.confirmPassword) {
      setLoading(false);
      setPasswordError({ field: "confirmPassword", message: "Please enter the same password in both fields." });
      requestAnimationFrame(() => form.querySelector<HTMLInputElement>('[name="confirmPassword"]')?.focus());
      return;
    }
    setLoading(true); pending.current = true;
    let created = false;
    try {
    const response = await fetchPublic("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await readResponse(response).catch(() => ({}));
    if (!response.ok) {
      setLoading(false);
      setFields(body.fields ?? {});
      if (body.field && body.field !== "password" && body.field !== "confirmPassword") focusFirstFormError(form, body.fields ?? {});
      else if (body.field === "password" || body.field === "confirmPassword") {
        const field = body.field as "password" | "confirmPassword";
        setPasswordError({ field, message: body.error });
        requestAnimationFrame(() => form.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus());
      } else {
        setError(userMessage(body.error, "We couldn't create your account. Please check the details and try again."));
        requestAnimationFrame(() => errorRef.current?.focus());
      }
      return;
    }
    created = true;
    const result = await signIn("credentials", { email: values.email, password: values.password, callbackUrl, redirect: false });
    setLoading(false);
    if (!result || result.error) {
      setError("Your account is ready. Please sign in to continue.");
      return;
    }
    const fresh = await getSession();
    if (fresh?.user.otpPending) {
      router.push(`/verify?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      router.refresh();
      return;
    }
    router.push(authDestination(callbackUrl));
    router.refresh();
    } catch {
      setError(created ? "Account created. Go to sign in to continue." : "Could not confirm registration. If the account was created, you can sign in with these details.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { pending.current = false; setLoading(false); }
  }

  return (
    <>
      <div className="haven-vault__head">
        <h1>Create your account</h1>
        <p>Your room and stay details will be waiting for you.</p>
      </div>

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="haven-vault__error">
          <strong>We couldn’t create your account</strong>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="haven-vault__row">
          <label className="haven-vault__field">
            First name
            <input name="firstName" required maxLength={80} autoComplete="given-name" placeholder="Ava" {...formFieldProps(fields, "firstName", "register-field")} />
            <FormFieldError errors={fields} field="firstName" prefix="register-field" />
          </label>
          <label className="haven-vault__field">
            Last name
            <input name="lastName" required maxLength={80} autoComplete="family-name" placeholder="Reyes" {...formFieldProps(fields, "lastName", "register-field")} />
            <FormFieldError errors={fields} field="lastName" prefix="register-field" />
          </label>
        </div>
        <MobileNumberField name="phone" className="haven-vault__field" error={fields.phone} errorId="register-field-phone-error" />
        <label className="haven-vault__field">
          Email
          <input name="email" type="email" required maxLength={200} autoComplete="email" placeholder="you@haven.com" {...formFieldProps(fields, "email", "register-field")} />
          <FormFieldError errors={fields} field="email" prefix="register-field" />
        </label>
        <div className="haven-vault__row">
          <label className="haven-vault__field">
            Password
            <input name="password" type={show ? "text" : "password"} minLength={8} maxLength={128} required autoComplete="new-password" placeholder="At least 8 characters"
              aria-invalid={passwordError?.field === "password" || undefined}
              aria-describedby={passwordError?.field === "password" ? "register-password-error" : undefined}
              onInvalid={(event) => {
                if (event.currentTarget.validity.tooShort) setPasswordError({ field: "password", message: "Use at least 8 characters for your password." });
              }}
              onChange={() => setPasswordError(null)}
            />
            {passwordError?.field === "password" && <small id="register-password-error" role="alert" className="haven-vault__field-error">{passwordError.message}</small>}
            <button
              type="button"
              className="haven-vault__eye"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </label>
          <label className="haven-vault__field">
            Confirm password
            <input name="confirmPassword" type={show ? "text" : "password"} maxLength={128} required autoComplete="new-password" placeholder="Repeat password"
              aria-invalid={passwordError?.field === "confirmPassword" || undefined}
              aria-describedby={passwordError?.field === "confirmPassword" ? "register-confirm-password-error" : undefined}
              onChange={() => setPasswordError(null)}
            />
            {passwordError?.field === "confirmPassword" && <small id="register-confirm-password-error" role="alert" className="haven-vault__field-error">{passwordError.message}</small>}
          </label>
        </div>

        <p className="haven-vault__privacy">Read how Haven uses your information in the <Link href="/privacy">guest privacy notice</Link>.</p>
        <button className="haven-vault__submit" disabled={loading} aria-busy={loading}>
          {loading ? "Creating account…" : booking ? "Create account & continue" : "Create guest account"} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </form>
    </>
  );
}
