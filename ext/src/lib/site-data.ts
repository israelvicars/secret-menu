// Typed wrappers over the shared plain-JS libs (same code the CLI and tests use) plus the local index.
import { directory as directoryJs, recommend as recommendJs, searchCards as searchCardsJs, showRecommended as showRecommendedJs, CATEGORIES as CATS } from "../../../lib/discover.mjs";
import { handoffGroups as handoffGroupsJs, handoffPlan as handoffPlanJs, handoffPrompt as handoffPromptJs } from "../../../lib/handoff.mjs";
import { POPUP_TARGET } from "@/bridge/popup-api.js";
import type { Label } from "@/lib/abilities";

type Loose = (...args: any[]) => any;
export interface IndexAbility { title: string; label: Label; toolNames: string[] }
export interface SiteCard {
  site: string; host: string; name: string; title: string | null; description: string | null; category: string; categoryBasis: string; local: boolean;
  counts: { tools: number; safe?: number; view?: number; signIn?: number; changes?: number; spends?: number } | null; verifiedAt: string | null; toolsDigest: string | null;
  abilities: IndexAbility[]; oneLiner: string;
}
export interface Directory { total: number; cards: SiteCard[]; sections: { category: string; sites: SiteCard[]; total: number }[]; emptyCategories: string[] }
export interface Recommendation { items: SiteCard[]; anchor: SiteCard | null; reason: string }
export interface PlanItem { name: string; label: string }

export const CATEGORIES = CATS as string[];
export const directory = directoryJs as Loose as (entries: unknown[], o?: { perCategory?: number }) => Directory;
export const recommend = recommendJs as Loose as (entries: unknown[], o?: { limit?: number }) => Recommendation;
export const searchCards = searchCardsJs as Loose as (cards: SiteCard[], q: string) => SiteCard[];
export const showRecommended = showRecommendedJs as Loose as (items: SiteCard[], displayed: SiteCard[], o?: { query?: string }) => boolean;
export const handoffGroups = handoffGroupsJs as Loose as (abilities: IndexAbility[], o?: { allowChanges?: boolean; allowSpends?: boolean }) => { run: IndexAbility[]; ask: IndexAbility[]; never: IndexAbility[] };
export const handoffPlan = handoffPlanJs as Loose as (abilities: IndexAbility[], o?: { allowChanges?: boolean; allowSpends?: boolean }) => { run: PlanItem[]; ask: PlanItem[]; never: PlanItem[] };
export const handoffPrompt = handoffPromptJs as Loose as (o: { host: string; task?: string; abilities: IndexAbility[]; allowChanges?: boolean; allowSpends?: boolean }) => string;

// The explain index the CLI writes (DATA_HOME/index), read by the native host. Read-only.
export { isNoBridge } from "@/lib/no-bridge";

export async function loadIndex(): Promise<{ home: string; entries: unknown[] }> {
  const reply = await chrome.runtime.sendMessage({ target: POPUP_TARGET, method: "index_list" });
  if (!reply) throw new Error("The extension's background worker did not answer.");
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}
