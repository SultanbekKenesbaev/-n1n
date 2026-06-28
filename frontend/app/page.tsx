"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const plans = [
  {
    name: "Starter",
    price: "$6",
    suffix: "today",
    copy: "Your first Business AI workforce for Instagram and Telegram.",
    stats: ["1 team", "4 agents", "$20 credits"],
    features: ["Business AI team", "Tasks + activity", "Instagram + Telegram ready"],
    cta: "Start for $6"
  },
  {
    name: "Business",
    price: "$89",
    suffix: "/mo",
    copy: "More workflows, approval gates, and room to scale.",
    stats: ["3 teams", "12 agents", "$80 credits"],
    features: ["Multiple workspaces", "Priority automations", "Best value"],
    cta: "Scale up",
    popular: true
  },
  {
    name: "Agency",
    price: "$179",
    suffix: "/mo",
    copy: "Build a full AI department for client operations.",
    stats: ["10 teams", "40 agents", "$170 credits"],
    features: ["Client workspaces", "Dedicated support", "Advanced controls"],
    cta: "Go all in"
  }
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("rebly-theme");
    const nextDark = stored === "dark";
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("rebly-theme", next ? "dark" : "light");
  }

  return (
    <button className="icon-button" type="button" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function Header() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <Bot size={20} />
        </span>
        <span>Rebly AI</span>
      </Link>
      <nav className="top-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <div className="header-actions">
        <ThemeToggle />
        <Link className="button" href="/auth?mode=login">
          Log in
        </Link>
        <Link className="button primary" href="/auth?mode=signup">
          Get started
        </Link>
      </div>
    </header>
  );
}

function InstagramLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="16.7" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TelegramLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 4.8 17.9 20c-.2 1-.9 1.2-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.6-.6-.3L5.8 13.7 1.1 12.2c-1-.3-1-1 0-1.4L19.5 3.7c.9-.3 1.7.2 1.5 1.1Z" fill="currentColor" />
    </svg>
  );
}

function StepAgent({ src, alt }: { src: string; alt: string }) {
  return <Image className="step-agent" src={src} width={608} height={608} alt={alt} />;
}

export default function HomePage() {
  return (
    <div className="grid-page">
      <Header />
      <main>
        <section className="hero">
          <div className="hero-card hero-card-instagram">
            <span className="hero-card-icon instagram-mark">
              <InstagramLogo />
            </span>
            <span>
              <strong>Instagram DM</strong>
              <small>New message received</small>
            </span>
            <i aria-hidden="true" />
          </div>

          <div className="hero-card hero-card-telegram">
            <span className="hero-card-icon telegram-mark">
              <TelegramLogo />
            </span>
            <span>
              <strong>Telegram Lead</strong>
              <small>New lead captured</small>
            </span>
            <i aria-hidden="true" />
          </div>

          <div className="hero-card hero-card-crm">
            <span className="hero-card-icon crm-mark">
              <Check size={22} />
            </span>
            <span>
              <strong>CRM Update</strong>
              <small>Contact added</small>
            </span>
            <i aria-hidden="true" />
          </div>

          <div className="hero-card hero-card-follow">
            <span className="hero-card-icon follow-mark">
              <Bot size={22} />
            </span>
            <span>
              <strong>Follow-up Ready</strong>
              <small>AI agent scheduled</small>
            </span>
            <i aria-hidden="true" />
          </div>

          <Image className="hero-person hero-person-left" src="/images/member-man.png" width={608} height={608} alt="Rebly AI team member" priority />
          <Image className="hero-person hero-person-right" src="/images/member-woman.png" width={608} height={608} alt="Rebly AI team coordinator" priority />

          <div className="hero-stack">
            <h1>
              Build your <span>AI team</span> in one workspace.
            </h1>
            <p>
              Connect Instagram, Telegram, CRM and your tools. Automate conversations, follow-ups and business workflows with AI agents that work for you - 24/7.
            </p>
            <Link className="hero-main-cta" href="/auth?mode=signup">
              GET STARTED
              <ArrowRight size={24} strokeWidth={2.5} />
            </Link>
            <div className="hero-note">
              <span>
                <Check size={12} strokeWidth={3} />
              </span>
              No credit card required. Get started in minutes.
            </div>
          </div>
        </section>

        <section id="how-it-works" className="section">
          <div className="section-head">
            <p>How it works</p>
            <h2>Three simple steps to your AI team</h2>
          </div>
          <div className="steps">
            <article className="step">
              <span className="step-number">01</span>
              <div className="step-people step-people-solo">
                <StepAgent src="/images/member-woman.png" alt="Business AI agent" />
              </div>
              <h3>Subscribe</h3>
              <p>Choose a plan and open your Rebly AI workspace.</p>
            </article>
            <article className="step">
              <span className="step-number">02</span>
              <div className="step-people">
                <StepAgent src="/images/member-man.png" alt="Business AI agent" />
                <StepAgent src="/images/agents/dev.png" alt="Business AI agent" />
              </div>
              <h3>Hire your team</h3>
              <p>Business AI agents coordinate Instagram and Telegram work.</p>
            </article>
            <article className="step">
              <span className="step-number">03</span>
              <div className="step-people">
                <StepAgent src="/images/agents/nova.png" alt="Business AI agent" />
                <StepAgent src="/images/agents/coordinator.png" alt="Business AI agent" />
              </div>
              <h3>Assign tasks</h3>
              <p>Track replies, follow-ups, and daily activity in one dashboard.</p>
            </article>
          </div>
        </section>

        <section id="pricing" className="section pricing-section">
          <div className="pricing-intro">
            <div className="pricing-avatar">
              <Image src="/images/coordinator.png" width={608} height={608} alt="" />
              <strong>Accountant</strong>
            </div>
            <div className="pricing-copy">
              <p>Pricing</p>
              <h2>Choose the right size for your team</h2>
              <span>Start small, then scale your AI workforce when your automation needs grow.</span>
            </div>
          </div>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article className={`price-card ${plan.popular ? "popular" : ""}`} key={plan.name}>
                {plan.popular && <span className="badge">Most popular</span>}
                <h3>{plan.name}</h3>
                <div className="price">
                  {plan.price} <span>{plan.suffix}</span>
                </div>
                <p>{plan.copy}</p>
                <div className="plan-stats">
                  {plan.stats.map((stat) => {
                    const [value, ...label] = stat.split(" ");
                    return (
                      <span key={stat}>
                        <strong>{value}</strong>
                        {label.join(" ")}
                      </span>
                    );
                  })}
                </div>
                <ul className="feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link className={`button ${plan.popular ? "solid" : ""}`} href="/auth?mode=signup">
                  {plan.cta}
                  <Check size={16} />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

