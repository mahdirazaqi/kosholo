import Link from "next/link";

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer: { text: string; linkText: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-card p-6 text-card-foreground shadow-sm sm:p-7">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {footer.text}{" "}
        <Link
          href={footer.href}
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {footer.linkText}
        </Link>
      </p>
    </div>
  );
}
