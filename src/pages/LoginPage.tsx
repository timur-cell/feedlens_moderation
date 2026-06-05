import { Link } from "react-router-dom";
import { SignIn } from "@/components/SignIn";
import { TestUserLoginSection } from "@/components/TestUserLoginSection";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto size-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <line x1="8" y1="8" x2="14" y2="8" />
              <line x1="8" y1="11" x2="14" y2="11" />
              <line x1="8" y1="14" x2="14" y2="14" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Feed<span className="text-blue-600">Lens</span>
          </h1>
          <p className="text-xs text-muted-foreground tracking-wide">moderation</p>
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
