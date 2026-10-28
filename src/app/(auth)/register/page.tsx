import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Sign up | Kosholo" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      description="It only takes a few seconds."
      footer={{ text: "Already have an account?", linkText: "Log in", href: "/login" }}
    >
      <RegisterForm />
    </AuthCard>
  );
}
