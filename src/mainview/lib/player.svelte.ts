import type { Folder, Track } from "../../shared/types";
import { bun } from "./rpc";

export type RepeatMode = "off" | "one" | "all";

function createPlayer() {
	let folders = $state<Folder[]>([]);
	let activeFolderPath = $state<string | null>(null);
	let queue = $state<Track[]>([]);
	let queueIndex = $state<number>(-1);
	let shuffle = $state<boolean>(false);
	let repeat = $state<RepeatMode>("off");
	let isPlaying = $state<boolean>(false);
	let currentTime = $state<number>(0);
	let duration = $state<number>(0);
	let volume = $state<number>(1);
	let streamPort = $state<number>(0);
	let shuffleOrder = $state<number[]>([]);
	let shufflePos = $state<number>(-1);

	const activeFolder = $derived(
		folders.find((f) => f.path === activeFolderPath) ?? null
	);
	const currentTrack = $derived(
		queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null
	);
	const streamUrl = $derived(
		currentTrack && streamPort
			? `http://127.0.0.1:${streamPort}/audio?path=${encodeURIComponent(currentTrack.path)}`
			: ""
	);

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
		if (currentTrack && currentTrack.folder === path) {
			stop();
		}
	}

	async function rescan(path: string) {
		const folder = await bun.rescanFolder({ path });
		if (!folder) return;
		folders = folders.map((f) => (f.path === path ? folder : f));
	}

	function selectFolder(path: string) {
		activeFolderPath = path;
	}

	function playFolder(path: string, startIndex = 0) {
		const folder = folders.find((f) => f.path === path);
		if (!folder || folder.tracks.length === 0) return;
		activeFolderPath = path;
		queue = folder.tracks.slice();
		queueIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
		if (shuffle) buildShuffleOrder(queueIndex);
		isPlaying = true;
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
		isPlaying = !isPlaying;
	}

	function stop() {
		isPlaying = false;
		queue = [];
		queueIndex = -1;
		currentTime = 0;
		duration = 0;
	}

	function next(userInitiated = true) {
		if (queue.length === 0) return;
		if (shuffle) {
			if (shuffleOrder.length !== queue.length) buildShuffleOrder(Math.max(queueIndex, 0));
			if (shufflePos + 1 < shuffleOrder.length) {
				shufflePos += 1;
				queueIndex = shuffleOrder[shufflePos];
				isPlaying = true;
				return;
			}
			if (repeat === "all") {
				buildShuffleOrder(-1);
				shufflePos = 0;
				queueIndex = shuffleOrder[0];
				isPlaying = true;
				return;
			}
			if (userInitiated) {
				queueIndex = shuffleOrder[shuffleOrder.length - 1];
			}
			isPlaying = false;
			return;
		}
		if (queueIndex + 1 < queue.length) {
			queueIndex += 1;
			isPlaying = true;
			return;
		}
		if (repeat === "all") {
			queueIndex = 0;
			isPlaying = true;
			return;
		}
		isPlaying = false;
	}

	function prev() {
		if (queue.length === 0) return;
		if (currentTime > 3) {
			currentTime = 0;
			return;
		}
		if (shuffle) {
			if (shufflePos > 0) {
				shufflePos -= 1;
				queueIndex = shuffleOrder[shufflePos];
				isPlaying = true;
				return;
			}
			return;
		}
		if (queueIndex > 0) {
			queueIndex -= 1;
			isPlaying = true;
			return;
		}
		if (repeat === "all") {
			queueIndex = queue.length - 1;
			isPlaying = true;
		}
	}

	function onEnded() {
		if (repeat === "one") {
			currentTime = 0;
			isPlaying = true;
			return;
		}
		next(false);
	}

	function toggleShuffle() {
		shuffle = !shuffle;
		if (shuffle && queue.length) buildShuffleOrder(Math.max(queueIndex, 0));
	}

	function cycleRepeat() {
		repeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
	}

	function seek(seconds: number) {
		currentTime = seconds;
	}

	function setVolume(v: number) {
		volume = Math.min(1, Math.max(0, v));
	}

	return {
		get folders() { return folders; },
		get activeFolderPath() { return activeFolderPath; },
		get activeFolder() { return activeFolder; },
		get queue() { return queue; },
		get queueIndex() { return queueIndex; },
		get currentTrack() { return currentTrack; },
		get streamUrl() { return streamUrl; },
		get isPlaying() { return isPlaying; },
		get shuffle() { return shuffle; },
		get repeat() { return repeat; },
		get currentTime() { return currentTime; },
		set currentTime(v: number) { currentTime = v; },
		get duration() { return duration; },
		set duration(v: number) { duration = v; },
		get volume() { return volume; },
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
		onEnded,
		toggleShuffle,
		cycleRepeat,
		seek,
		setVolume,
	};
}

export const player = createPlayer();
