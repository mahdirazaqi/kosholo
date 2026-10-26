import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "ورود | کوشولو" };

export default function LoginPage() {
  return (
    <AuthCard
      title="ورود به حساب"
      description="برای ادامه وارد حساب کاربری خود شوید."
      footer={{ text: "حساب ندارید؟", linkText: "ثبت‌نام", href: "/register" }}
    >
      {/* useSearchParams() needs a boundary under Cache Components. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
