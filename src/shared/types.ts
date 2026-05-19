import type { RPCSchema } from "electrobun/bun";

export type Track = {
	path: string;
	name: string;
	folder: string;
};

export type Folder = {
	path: string;
	name: string;
	tracks: Track[];
};

export type TrayAction = "prev" | "next" | "toggle-play" | "stop";

export type PlayerState = {
	hasTrack: boolean;
	paused: boolean;
	trackName: string;
};

export type RepeatMode = "off" | "all" | "one";

export type PersistedSettings = {
	shuffle: boolean;
	repeat: RepeatMode;
	volume: number;
};

export type MudPlayerRPC = {
	bun: RPCSchema<{
		requests: {
			pickFolder: { params: {}; response: Folder | null };
			loadFolders: { params: {}; response: Folder[] };
			rescanFolder: { params: { path: string }; response: Folder | null };
			removeFolder: { params: { path: string }; response: Folder[] };
			getStreamPort: { params: {}; response: number };
			loadSettings: { params: {}; response: PersistedSettings };
		};
		messages: {
			log: { msg: string };
			playerState: PlayerState;
			saveSettings: Partial<PersistedSettings>;
		};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			trayAction: { action: TrayAction };
		};
	}>;
};
