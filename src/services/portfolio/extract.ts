import { extractGitHubLinks, type DiscoveredRepository } from "@/features/resume-matching/discovery";
import { extractResumeClaims } from "@/features/resume-matching/claims";
import type { ExtractedResumeClaim } from "@/types/analysis";

/**
 * Reads a fetched portfolio page.
 *
 * A portfolio is a *claim* surface, not an evidence surface: "I built X in
 * React" on a personal site carries exactly the weight of the same sentence on
 * a CV. So its prose is extracted as candidate claims, which the existing
 * verifier then checks against real repository evidence — never promoted to
 * evidence on its own.
 *
 * Its genuinely valuable output is links: portfolios routinely list projects
 * that never made it onto the CV, and those repositories *can* be analyzed.
 */

export interface PortfolioScan {
  finalUrl: string;
  title: string | null;
  /** Repositories found on the page, for the recruiter to confirm. */
  repositories: DiscoveredRepository[];
  /** Technologies the page claims. Candidate claims, pending verification. */
  claims: ExtractedResumeClaim[];
  textLength: number;
}

/** Strips markup without executing or rendering anything. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 160) || null : null;
}

/**
 * `href` values are read from the raw markup as well as the visible text,
 * because most portfolios link projects from an anchor rather than printing
 * the URL.
 */
function linkTargets(html: string): string {
  return [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]).join("\n");
}

export function readPortfolio(finalUrl: string, html: string): PortfolioScan {
  const text = htmlToText(html);
  const searchable = `${linkTargets(html)}\n${text}`;
  const { repositories } = extractGitHubLinks(searchable);
  // Only technology claims: free-prose bullet extraction is tuned for CV lines
  // and produces noise on marketing copy.
  const claims = extractResumeClaims(text).filter((claim) => claim.category === "technology");
  return {
    finalUrl,
    title: pageTitle(html),
    repositories,
    claims,
    textLength: text.length,
  };
}
