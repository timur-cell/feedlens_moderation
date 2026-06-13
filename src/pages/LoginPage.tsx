import { SignIn } from "@/components/SignIn";
import { TestUserLoginSection } from "@/components/TestUserLoginSection";

export function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-serif text-[36px] font-medium leading-none tracking-[0.02em]">
            Feed<span className="text-je-teal">Lens</span>
          </h1>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-je-ink-3">
            JamesEdition · T&amp;S
          </p>
          <p className="text-muted-foreground text-sm pt-1">
            Sign in to your account to continue
          </p>
        </div>

        <TestUserLoginSection />
        <SignIn />

        <p className="text-center text-sm text-muted-foreground">
          Contact your admin if you don't have credentials yet.
        </p>
      </div>
    </div>
  );
}
