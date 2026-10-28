import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in | Kosholo" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Log in"
      description="Log in to your account to continue."
      footer={{ text: "Don't have an account?", linkText: "Sign up", href: "/register" }}
    >
      {/* useSearchParams() needs a boundary under Cache Components. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
