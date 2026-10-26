import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "ثبت‌نام | کوشولو" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="ساخت حساب"
      description="چند ثانیه بیشتر طول نمی‌کشد."
      footer={{ text: "حساب دارید؟", linkText: "ورود", href: "/login" }}
    >
      <RegisterForm />
    </AuthCard>
  );
}
