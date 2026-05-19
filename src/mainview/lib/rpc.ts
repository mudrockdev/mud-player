import { Electroview } from "electrobun/view";
import type { MudPlayerRPC, TrayAction } from "../../shared/types";

let trayActionHandler: ((action: TrayAction) => void) | null = null;

export function onTrayAction(handler: (action: TrayAction) => void) {
	trayActionHandler = handler;
}

const rpc = Electroview.defineRPC<MudPlayerRPC>({
	handlers: {
		requests: {},
		messages: {
			trayAction: ({ action }) => trayActionHandler?.(action),
		},
	},
});

export const electroview = new Electroview({ rpc });
export const bun = rpc.request;
export const send = rpc.send;
