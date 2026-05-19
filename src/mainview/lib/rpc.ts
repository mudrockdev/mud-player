import { Electroview } from "electrobun/view";
import type { MudPlayerRPC } from "../../shared/types";

const rpc = Electroview.defineRPC<MudPlayerRPC>({
	handlers: { requests: {}, messages: {} },
});

export const electroview = new Electroview({ rpc });
export const bun = rpc.request;
export const send = rpc.send;
