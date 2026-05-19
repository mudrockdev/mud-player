import { combine, createStore } from "@videojs/store";
import { audioFeatures } from "@videojs/core/dom";
import type { Audio as VjsAudio } from "@videojs/core";
import type { AudioPlayerStore, PlayerTarget } from "@videojs/core/dom";
import type { Folder, Track } from "../../shared/types";
import { bun } from "./rpc";

export type RepeatMode = "off" | "one" | "all";

function createPlayer() {
	// ── Application-level state (playlist/queue/shuffle/repeat) ────────────
	let folders = $state<Folder[]>([]);
	let activeFolderPath = $state<string | null>(null);
	let queue = $state<Track[]>([]);
	let queueIndex = $state<number>(-1);
	let shuffle = $state<boolean>(false);
	let repeat = $state<RepeatMode>("off");
	let streamPort = $state<number>(0);
	let shuffleOrder = $state<number[]>([]);
	let shufflePos = $state<number>(-1);

	// ── Mirror of @videojs/core store state into Svelte runes ──────────────
	let paused = $state<boolean>(true);
	let ended = $state<boolean>(false);
	let currentTime = $state<number>(0);
	let duration = $state<number>(0);
	let volume = $state<number>(1);
	let muted = $state<boolean>(false);

	// ── Headless videojs audio player ──────────────────────────────────────
	const audioEl = new Audio();
	audioEl.preload = "auto";

	const vjs = createStore<PlayerTarget>()(
		combine(...audioFeatures),
	) as unknown as AudioPlayerStore;

	vjs.attach({ media: audioEl as unknown as VjsAudio, container: null });

	function syncFromStore() {
		const s = vjs.state as Record<string, unknown>;
		const nextPaused = (s.paused as boolean) ?? true;
		const wasEnded = ended;
		paused = nextPaused;
		ended = (s.ended as boolean) ?? false;
		currentTime = (s.currentTime as number) ?? 0;
		duration = (s.duration as number) ?? 0;
		volume = (s.volume as number) ?? 1;
		muted = (s.muted as boolean) ?? false;
		if (!wasEnded && ended) handleEnded();
	}

	syncFromStore();
	vjs.subscribe(() => syncFromStore());

	// ── Derived values ─────────────────────────────────────────────────────
	const activeFolder = $derived(
		folders.find((f) => f.path === activeFolderPath) ?? null,
	);
	const currentTrack = $derived(
		queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null,
	);
	const isPlaying = $derived(!paused);


	function streamUrlFor(track: Track | null): string {
		if (!track || !streamPort) return "";
		return `http://127.0.0.1:${streamPort}/audio?path=${encodeURIComponent(track.path)}`;
	}

	// Load the source for the given queue index and start playback immediately
	// from inside the user-gesture call so autoplay policies don't block it.
	function loadAndPlay(index: number) {
		queueIndex = Math.min(Math.max(index, 0), queue.length - 1);
		const track = queue[queueIndex];
		const url = streamUrlFor(track);
		if (!url) return;
		vjs.loadSource(url);
		void vjs.play().catch((err) => {
			console.error("[player] play() failed:", err);
		});
	}

	// ── Helpers ────────────────────────────────────────────────────────────
	function buildShuffleOrder(startWith: number) {
		const order = Array.from({ length: queue.length }, (_, i) => i);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		const idx = order.indexOf(startWith);
		if (idx > 0) [order[0], order[idx]] = [order[idx], order[0]];
		shuffleOrder = order;
		shufflePos = 0;
	}

	function handleEnded() {
		if (repeat === "one") {
			void vjs.seek(0).then(() => vjs.play().catch(() => {}));
			return;
		}
		next(false);
	}

	// ── Library actions ────────────────────────────────────────────────────
	async function init() {
		streamPort = await bun.getStreamPort({});
		folders = await bun.loadFolders({});
		if (folders.length && !activeFolderPath) activeFolderPath = folders[0].path;
	}

	async function addFolder() {
		const folder = await bun.pickFolder({});
		if (!folder) return;
		const existing = folders.findIndex((f) => f.path === folder.path);
		if (existing >= 0) folders[existing] = folder;
		else folders = [...folders, folder];
		activeFolderPath = folder.path;
	}

	async function removeFolder(path: string) {
		folders = await bun.removeFolder({ path });
		if (activeFolderPath === path) {
			activeFolderPath = folders[0]?.path ?? null;
		}
		if (currentTrack && currentTrack.folder === path) stop();
	}

	async function rescan(path: string) {
		const folder = await bun.rescanFolder({ path });
		if (!folder) return;
		folders = folders.map((f) => (f.path === path ? folder : f));
	}

	function selectFolder(path: string) {
		activeFolderPath = path;
	}

	// ── Transport ──────────────────────────────────────────────────────────
	function playFolder(path: string, startIndex = 0) {
		const folder = folders.find((f) => f.path === path);
		if (!folder || folder.tracks.length === 0) return;
		activeFolderPath = path;
		queue = folder.tracks.slice();
		const idx = Math.min(Math.max(startIndex, 0), queue.length - 1);
		if (shuffle) buildShuffleOrder(idx);
		loadAndPlay(idx);
	}

	function playTrack(track: Track) {
		const folder = folders.find((f) => f.path === track.folder);
		if (!folder) return;
		const idx = folder.tracks.findIndex((t) => t.path === track.path);
		if (idx < 0) return;
		playFolder(folder.path, idx);
	}

	function togglePlay() {
		if (!currentTrack) {
			if (activeFolder && activeFolder.tracks.length) playFolder(activeFolder.path, 0);
			return;
		}
		if (paused) {
				void vjs.play().catch(() => {});
		} else {
				vjs.pause();
		}
	}

	function stop() {
		vjs.pause();
		queue = [];
		queueIndex = -1;
	}

	function next(userInitiated = true) {
		if (queue.length === 0) return;
		if (shuffle) {
			if (shuffleOrder.length !== queue.length) buildShuffleOrder(Math.max(queueIndex, 0));
			if (shufflePos + 1 < shuffleOrder.length) {
				shufflePos += 1;
				loadAndPlay(shuffleOrder[shufflePos]);
				return;
			}
			if (repeat === "all") {
				buildShuffleOrder(-1);
				shufflePos = 0;
				loadAndPlay(shuffleOrder[0]);
				return;
			}
			if (userInitiated) queueIndex = shuffleOrder[shuffleOrder.length - 1];
				vjs.pause();
			return;
		}
		if (queueIndex + 1 < queue.length) {
			loadAndPlay(queueIndex + 1);
			return;
		}
		if (repeat === "all") {
			loadAndPlay(0);
			return;
		}
		vjs.pause();
	}

	function prev() {
		if (queue.length === 0) return;
		if (currentTime > 3) {
			void vjs.seek(0);
			return;
		}
		if (shuffle) {
			if (shufflePos > 0) {
				shufflePos -= 1;
				loadAndPlay(shuffleOrder[shufflePos]);
			}
			return;
		}
		if (queueIndex > 0) {
			loadAndPlay(queueIndex - 1);
			return;
		}
		if (repeat === "all") loadAndPlay(queue.length - 1);
	}

	function toggleShuffle() {
		shuffle = !shuffle;
		if (shuffle && queue.length) buildShuffleOrder(Math.max(queueIndex, 0));
	}

	function cycleRepeat() {
		repeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
	}

	function seek(seconds: number) {
		void vjs.seek(seconds);
	}

	function setVolume(v: number) {
		vjs.setVolume(v);
	}

	function toggleMuted() {
		vjs.toggleMuted();
	}

	return {
		// library
		get folders() { return folders; },
		get activeFolderPath() { return activeFolderPath; },
		get activeFolder() { return activeFolder; },
		get queue() { return queue; },
		get queueIndex() { return queueIndex; },
		get currentTrack() { return currentTrack; },
		// playback
		get isPlaying() { return isPlaying; },
		get paused() { return paused; },
		get currentTime() { return currentTime; },
		get duration() { return duration; },
		get volume() { return volume; },
		get muted() { return muted; },
		get shuffle() { return shuffle; },
		get repeat() { return repeat; },
		// actions
		init,
		addFolder,
		removeFolder,
		rescan,
		selectFolder,
		playFolder,
		playTrack,
		togglePlay,
		stop,
		next,
		prev,
		toggleShuffle,
		cycleRepeat,
		seek,
		setVolume,
		toggleMuted,
	};
}

export const player = createPlayer();
