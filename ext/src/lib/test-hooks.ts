// Stable ids and accessible names that UI tests (agent-desktop, CDP) rely on. See TESTING.md.
// Kept free of React/JSX so node --test can import it directly.
export const MAIN_ID = "sm-main";
export const MAIN_STATE_ID = "sm-main-state";
export const POPUP_MAIN_LABEL = "Secret Menu popup";
export const PAGE_MAIN_LABEL = "Secret Menu abilities page";
export const ABILITIES_PAGE_TITLE = "Secret Menu: Abilities";
export const detailsId = (index: number) => `sm-details-${index}`;
export function stateName(state: { kind: string; reason?: string }): string {
  return state.kind === "empty" ? `empty-${state.reason}` : state.kind;
}
