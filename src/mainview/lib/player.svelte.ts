import { combine, createStore } from "@videojs/store";
import { audioFeatures } from "@videojs/core/dom";
import type { Audio as VjsAudio } from "@videojs/core";
import type { AudioPlayerStore, PlayerTarget } from "@videojs/core/dom";
import type { Folder, Track } from "../../shared/types";
import {
	buildShuffleOrder,
	cycleRepeat as cycleRepeatMode,
	nextTrack,
	prevTrack,
	type QueueState,
	type RepeatMode,
} from "./queue";
import { bun, onTrayAction, send } from "./rpc";

export type { RepeatMode };

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
		const wasEnded = ended;
		paused = (s.paused as boolean) ?? true;
		ended = (s.ended as boolean) ?? false;
		currentTime = (s.currentTime as number) ?? 0;
		duration = (s.duration as number) ?? 0;
		volume = (s.volume as number) ?? 1;
		muted = (s.muted as boolean) ?? false;
		if (!wasEnded && ended) handleEnded();
	}

	syncFromStore();
	vjs.subscribe(() => syncFromStore());

	// Track last broadcast to avoid spamming the bun side on every timeupdate.
	let lastBroadcast = { hasTrack: false, paused: true, trackName: "" };
	function broadcastState(hasTrack: boolean, isPaused: boolean, trackName: string) {
		if (
			lastBroadcast.hasTrack === hasTrack &&
			lastBroadcast.paused === isPaused &&
			lastBroadcast.trackName === trackName
		) return;
		lastBroadcast = { hasTrack, paused: isPaused, trackName };
		try {
			send.playerState({ hasTrack, paused: isPaused, trackName });
		} catch {}
	}

	// ── Derived values ─────────────────────────────────────────────────────
	const activeFolder = $derived(
		folders.find((f) => f.path === activeFolderPath) ?? null,
	);
	const currentTrack = $derived(
		queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null,
	);
	const isPlaying = $derived(!paused);

	$effect.root(() => {
		$effect(() => {
			broadcastState(currentTrack !== null, paused, currentTrack?.name ?? "");
		});
	});

	onTrayAction((action) => {
		if (action === "prev") prev();
		else if (action === "next") next(true);
		else if (action === "toggle-play") togglePlay();
		else if (action === "stop") stop();
	});

	function snapshot(): QueueState {
		return {
			length: queue.length,
			index: queueIndex,
			shuffle,
			shuffleOrder,
			shufflePos,
			repeat,
		};
	}

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
		if (shuffle) {
			shuffleOrder = buildShuffleOrder(queue.length, idx);
			shufflePos = 0;
		}
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
		if (paused) void vjs.play().catch(() => {});
		else vjs.pause();
	}

	function stop() {
		vjs.pause();
		queue = [];
		queueIndex = -1;
	}

	function next(userInitiated = true) {
		const result = nextTrack(snapshot(), userInitiated);
		if (result.kind === "noop") return;
		if (result.kind === "stop") {
			if (result.index !== undefined) queueIndex = result.index;
			vjs.pause();
			return;
		}
		if (result.shuffleOrder) {
			shuffleOrder = result.shuffleOrder;
			shufflePos = result.shufflePos ?? 0;
		}
		loadAndPlay(result.index);
	}

	function prev() {
		const result = prevTrack(snapshot(), currentTime);
		if (result.kind === "noop") return;
		if (result.kind === "restart") {
			void vjs.seek(0);
			return;
		}
		if (result.kind === "play") {
			if (result.shufflePos !== undefined) shufflePos = result.shufflePos;
			loadAndPlay(result.index);
		}
	}

	function toggleShuffle() {
		shuffle = !shuffle;
		if (shuffle && queue.length) {
			shuffleOrder = buildShuffleOrder(queue.length, Math.max(queueIndex, 0));
			shufflePos = 0;
		}
	}

	function cycleRepeat() {
		repeat = cycleRepeatMode(repeat);
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
