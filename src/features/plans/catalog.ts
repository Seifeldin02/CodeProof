import { DEFAULT_PILOT_TIER_ID } from "@/features/auth/store";

/**
 * The plans an account or an organisation can be placed on.
 *
 * Plans are assigned by hand in the owner administration area. No payment is
 * taken anywhere in the product. The seat counts are starting points for
 * pilots and can be overridden for each organisation; they are not a published
 * price list, and no price is stored here.
 */
export interface Plan {
  /** Stored on the account or organisation. The free plan keeps the identifier accounts already use. */
  id: string;
  /** Translation key. */
  name: string;
  /** Translation key: who the plan is for. */
  summary: string;
  /** Whether the plan counts as paid in the owner dashboard. */
  paid: boolean;
  /** How many people an organisation on this plan may hold, unless overridden. */
  seats: number;
}

export const PLANS: readonly Plan[] = [
  { id: DEFAULT_PILOT_TIER_ID, name: "Free", summary: "One recruiter trying CodeProof, or a team of two.", paid: false, seats: 2 },
  { id: "pilot-self-serve", name: "Self-serve", summary: "A hiring team that sets itself up.", paid: true, seats: 5 },
  { id: "pilot-guided", name: "Guided", summary: "A hiring team we set up and support.", paid: true, seats: 10 },
  { id: "pilot-agency", name: "Agency", summary: "A recruitment agency working for several clients.", paid: true, seats: 25 },
];

export const DEFAULT_PLAN_ID = DEFAULT_PILOT_TIER_ID;

export function isKnownPlan(id: string): boolean {
  return PLANS.some((plan) => plan.id === id);
}

/** An identifier this catalogue does not know is shown as it is and treated as unpaid with one seat. */
export function planById(id: string | null | undefined): Plan {
  return PLANS.find((plan) => plan.id === id) ?? { id: id || DEFAULT_PLAN_ID, name: id || "Free", summary: "", paid: false, seats: id ? 1 : PLANS[0].seats };
}

/** Seats an organisation may hold: its own override when set, otherwise its plan's. */
export function seatLimitFor(organization: { planTierId: string; seatLimit: number | null }): number {
  return organization.seatLimit ?? planById(organization.planTierId).seats;
}
