import type { MenuItemConfig } from "electrobun/bun";
import type { PlayerState, TrayAction } from "../shared/types";

export function truncate(s: string, max: number): string {
	if (max <= 1) return s.length ? s.slice(0, max) : s;
	return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function buildTrayTitle(state: PlayerState): string {
	if (!state.hasTrack) return "mud-player";
	const icon = state.paused ? "❚❚" : "▶";
	return `${icon} ${truncate(state.trackName, 40)}`;
}

export function buildTrayMenu(
	state: PlayerState,
	windowHidden = false,
): MenuItemConfig[] {
	return [
		{
			type: "normal",
			label: state.hasTrack ? state.trackName : "(nothing playing)",
			enabled: false,
		},
		{ type: "separator" },
		{
			type: "normal",
			label: windowHidden ? "Show window" : "Hide window",
			action: "toggle-window",
		},
		{ type: "separator" },
		{
			type: "normal",
			label: "Previous",
			action: "prev",
			enabled: state.hasTrack,
		},
		{
			type: "normal",
			label: "Play",
			action: "toggle-play",
			hidden: !state.paused,
			enabled: state.hasTrack,
		},
		{
			type: "normal",
			label: "Stop",
			action: "toggle-play",
			hidden: state.paused,
			enabled: state.hasTrack,
		},
		{
			type: "normal",
			label: "Next",
			action: "next",
			enabled: state.hasTrack,
		},
		{ type: "separator" },
		{ type: "normal", label: "Quit", action: "quit" },
	];
}

const ACTIONS: ReadonlySet<TrayAction> = new Set<TrayAction>([
	"prev",
	"next",
	"toggle-play",
	"stop",
]);

export type TrayClick =
	| { kind: "icon" }
	| { kind: "toggle-window" }
	| { kind: "player"; action: TrayAction }
	| { kind: "quit" }
	| { kind: "ignore" };

/**
 * Electrobun's `tray-clicked` event fires with `action: ""` when the user
 * left-clicks the icon on platforms that distinguish icon-click from
 * menu-open. On Linux (AppIndicator) clicking the icon just opens the menu,
 * so we additionally expose a "toggle-window" menu item that yields the same
 * outcome.
 */
export function classifyTrayClick(action: string | undefined): TrayClick {
	if (action === undefined) return { kind: "ignore" };
	if (action === "") return { kind: "icon" };
	if (action === "quit") return { kind: "quit" };
	if (action === "toggle-window") return { kind: "toggle-window" };
	if (ACTIONS.has(action as TrayAction)) {
		return { kind: "player", action: action as TrayAction };
	}
	return { kind: "ignore" };
}
