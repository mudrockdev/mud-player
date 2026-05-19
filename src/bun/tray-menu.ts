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

export function buildTrayMenu(state: PlayerState): MenuItemConfig[] {
	return [
		{
			type: "normal",
			label: state.hasTrack ? state.trackName : "(nothing playing)",
			enabled: false,
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
	| { kind: "player"; action: TrayAction }
	| { kind: "quit" }
	| { kind: "ignore" };

export function classifyTrayClick(action: string | undefined): TrayClick {
	if (!action) return { kind: "ignore" };
	if (action === "quit") return { kind: "quit" };
	if (ACTIONS.has(action as TrayAction)) {
		return { kind: "player", action: action as TrayAction };
	}
	return { kind: "ignore" };
}
