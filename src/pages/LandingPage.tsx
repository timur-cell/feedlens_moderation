import {
  ArrowRight,
  Check,
  SearchCheck,
  Shield,
  Bot,
  Eye,
  Zap,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 py-16 md:py-24">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40" />
        </div>

        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-background text-xs font-medium">
            <SearchCheck className="size-3 text-je-teal" />
            JamesEdition Moderation System
          </div>

          <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-medium tracking-[0.02em] leading-[1.05]">
            Feed
            <span className="text-je-teal">Lens</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground tracking-[0.3em] uppercase -mt-2">
            JamesEdition · T&amp;S
          </p>

          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Intelligent listing moderation for JamesEdition. Rules engine +
            LLM verification to maintain luxury marketplace quality at scale.
          </p>

          {!isAuthenticated && !isLoading && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button size="lg" className="text-base h-11 px-6 bg-je-teal hover:bg-je-teal/90" asChild>
                <Link to="/login">
                  Sign In
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          )}
          {isAuthenticated && (
            <div className="pt-2">
              <Button size="lg" className="text-base h-11 px-6 bg-je-teal hover:bg-je-teal/90" asChild>
                <Link to="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          )}

          <div className="flex items-center justify-center gap-6 pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Check className="size-4 text-emerald-500" />
              <span>81 moderation rules</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="size-4 text-emerald-500" />
              <span>3-tier confidence system</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <Check className="size-4 text-emerald-500" />
              <span>LLM-powered verification</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-32 border-t bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-muted-foreground mb-3 tracking-wide uppercase">
              How it works
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Smart moderation in 4 outcomes
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Every listing gets evaluated through rules, regex patterns, and
              LLM verification — with full transparency.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-background to-muted/50 border p-6 md:p-8 transition-all hover:shadow-lg hover:border-foreground/20">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 size-24 rounded-full bg-je-teal/10 blur-2xl transition-all group-hover:bg-je-teal/20" />
              <div className="relative">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-je-teal/10 mb-5">
                  <Shield className="size-5 text-je-teal" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Simple Rules</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Field checks for price, images, LQI, dimensions — instant
                  decisions with high confidence. Zero cost.
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-background to-muted/50 border p-6 md:p-8 transition-all hover:shadow-lg hover:border-foreground/20">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 size-24 rounded-full bg-purple-500/10 blur-2xl transition-all group-hover:bg-purple-500/20" />
              <div className="relative">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-purple-500/10 mb-5">
                  <Bot className="size-5 text-purple-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2">LLM Verification</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Only triggers when regex finds suspicious patterns. Claude Sonnet
                  verifies with structured scores and confidence.
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-background to-muted/50 border p-6 md:p-8 transition-all hover:shadow-lg hover:border-foreground/20">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 size-24 rounded-full bg-amber-500/10 blur-2xl transition-all group-hover:bg-amber-500/20" />
              <div className="relative">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-amber-500/10 mb-5">
                  <Eye className="size-5 text-amber-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Manual Queue</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Low-confidence cases go to human review. Full context,
                  one-click actions, and override tracking.
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-background to-muted/50 border p-6 md:p-8 md:col-span-2 lg:col-span-2 transition-all hover:shadow-lg hover:border-foreground/20">
              <div className="absolute bottom-0 left-0 -mb-8 -ml-8 size-32 rounded-full bg-emerald-500/10 blur-2xl transition-all group-hover:bg-emerald-500/20" />
              <div className="relative flex flex-col md:flex-row md:items-center gap-6">
                <div className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <Target className="size-7 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">
                    4 Outcomes: Approved • Notice • Rejected • Manual
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Every listing resolves to one of four outcomes. Approved goes
                    live. Notice goes live with seller message. Rejected gets a
                    clear reason. Manual goes to your queue.
                  </p>
                </div>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-je-teal text-white p-6 md:p-8 transition-all hover:shadow-lg">
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="size-5" />
                  <h3 className="font-semibold text-lg">Ready to moderate?</h3>
                </div>
                <p className="text-white/80 text-sm leading-relaxed mb-4">
                  Sign in to access the moderation dashboard and start reviewing listings.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white text-je-teal hover:bg-white/90"
                  asChild
                >
                  <Link to={isAuthenticated ? "/dashboard" : "/login"}>
                    {isAuthenticated ? "Dashboard" : "Sign In"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
