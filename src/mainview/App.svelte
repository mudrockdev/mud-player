<script lang="ts">
    import { onMount } from "svelte";
    import {
        Pause,
        Play,
        Plus,
        Repeat,
        Repeat1,
        RotateCw,
        Shuffle,
        SkipBack,
        SkipForward,
        Volume2,
        X,
    } from "@lucide/svelte";
    import { player } from "./lib/player.svelte";

    let audio: HTMLAudioElement | undefined = $state();

    onMount(() => {
        player.init();
    });

    $effect(() => {
        if (!audio) return;
        if (player.isPlaying) audio.play().catch(() => {});
        else audio.pause();
    });

    $effect(() => {
        if (!audio) return;
        audio.volume = player.volume;
    });

    function onTimeUpdate() {
        if (!audio) return;
        player.currentTime = audio.currentTime;
    }

    function onLoadedMeta() {
        if (!audio) return;
        player.duration = audio.duration || 0;
    }

    function onScrub(e: Event) {
        if (!audio) return;
        const v = parseFloat((e.target as HTMLInputElement).value);
        audio.currentTime = v;
        player.currentTime = v;
    }

    function onVolume(e: Event) {
        player.setVolume(parseFloat((e.target as HTMLInputElement).value));
    }

    function fmt(s: number): string {
        if (!isFinite(s) || s < 0) return "0:00";
        const m = Math.floor(s / 60);
        const r = Math.floor(s % 60);
        return `${m}:${r.toString().padStart(2, "0")}`;
    }

    function trackKey(t: { path: string }) {
        return t.path;
    }
</script>

<main
    class="grid h-screen bg-[#0f1115] text-[#e7e9ee] font-sans"
    style="grid-template-columns: 280px 1fr; grid-template-rows: 1fr auto; grid-template-areas: 'sidebar content' 'player player';"
>
    <aside
        class="flex flex-col overflow-hidden bg-[#0a0c10] border-r border-[#1d2230]"
        style="grid-area: sidebar;"
    >
        <div
            class="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-[#1d2230]"
        >
            <h2
                class="m-0 text-xs font-semibold tracking-[0.08em] uppercase text-[#8b93a7]"
            >
                Folders
            </h2>
            <button
                class="flex items-center justify-center w-7 h-7 rounded-md border border-[#2a3245] bg-[#161a24] text-[#e7e9ee] cursor-pointer hover:bg-[#1e2433]"
                onclick={() => player.addFolder()}
                title="Import folder"
                aria-label="Import folder"
            >
                <Plus size={16} />
            </button>
        </div>

        {#if player.folders.length === 0}
            <p class="text-[#8b93a7] p-4 text-[13px]">
                No folders yet. Click + to import.
            </p>
        {:else}
            <ul class="list-none m-0 p-1.5 overflow-y-auto">
                {#each player.folders as folder (folder.path)}
                    <li
                        class={[
                            "group flex items-center gap-1 px-1 py-0.5 rounded-lg",
                            folder.path === player.activeFolderPath &&
                                "bg-[#1a2030]",
                        ]}
                    >
                        <button
                            class="flex-1 flex items-center justify-between gap-2 px-2.5 py-2 bg-transparent border-none text-inherit text-left cursor-pointer rounded-md text-[13px] min-w-0 hover:bg-[#161c28]"
                            ondblclick={() => player.playFolder(folder.path, 0)}
                            onclick={() => player.selectFolder(folder.path)}
                            title={folder.path}
                        >
                            <span
                                class="overflow-hidden text-ellipsis whitespace-nowrap"
                                >{folder.name}</span
                            >
                            <span
                                class="text-[11px] text-[#8b93a7] bg-[#161c28] px-1.5 py-px rounded-full"
                                >{folder.tracks.length}</span
                            >
                        </button>
                        <div class="hidden gap-0.5 group-hover:flex">
                            <button
                                class="flex items-center justify-center bg-transparent border-none text-[#8b93a7] w-6 h-6 rounded cursor-pointer hover:bg-[#1e2433] hover:text-[#e7e9ee]"
                                title="Play"
                                aria-label="Play folder"
                                onclick={() =>
                                    player.playFolder(folder.path, 0)}
                            >
                                <Play size={14} />
                            </button>
                            <button
                                class="flex items-center justify-center bg-transparent border-none text-[#8b93a7] w-6 h-6 rounded cursor-pointer hover:bg-[#1e2433] hover:text-[#e7e9ee]"
                                title="Rescan"
                                aria-label="Rescan folder"
                                onclick={() => player.rescan(folder.path)}
                            >
                                <RotateCw size={14} />
                            </button>
                            <button
                                class="flex items-center justify-center bg-transparent border-none text-[#8b93a7] w-6 h-6 rounded cursor-pointer hover:bg-[#1e2433] hover:text-[#ff7676]"
                                title="Remove"
                                aria-label="Remove folder"
                                onclick={() => player.removeFolder(folder.path)}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </aside>

    <section class="flex flex-col overflow-hidden" style="grid-area: content;">
        <header class="flex items-center justify-between px-7 pt-6 pb-3">
            {#if player.activeFolder}
                <div>
                    <h1 class="m-0 text-[26px] font-bold">
                        {player.activeFolder.name}
                    </h1>
                    <p class="mt-1 mb-0 text-[#8b93a7] text-xs">
                        {player.activeFolder.path}
                    </p>
                </div>
                <button
                    class="px-[18px] py-2.5 bg-[#4d7cff] border-none rounded-full text-white font-semibold cursor-pointer hover:bg-[#5b87ff]"
                    onclick={() =>
                        player.activeFolder &&
                        player.playFolder(player.activeFolder.path, 0)}
                    >Play all</button
                >
            {:else}
                <div>
                    <h1 class="m-0 text-[26px] font-bold">mud-player</h1>
                    <p class="mt-1 mb-0 text-[#8b93a7] text-xs">
                        Import a folder to begin
                    </p>
                </div>
            {/if}
        </header>

        <div class="flex-1 overflow-y-auto px-[18px] pb-3.5">
            {#if player.activeFolder}
                {#if player.activeFolder.tracks.length === 0}
                    <p class="text-[#8b93a7] p-4 text-[13px]">
                        No audio files in this folder.
                    </p>
                {:else}
                    {#each player.activeFolder.tracks as track, i (trackKey(track))}
                        <button
                            class={[
                                "flex items-center gap-3.5 w-full px-3 py-2.5 bg-transparent border-none rounded-lg cursor-pointer text-left text-sm hover:bg-[#161c28]",
                                player.currentTrack?.path === track.path
                                    ? "bg-[#1b2237] text-[#b8c5ff]"
                                    : "text-inherit",
                            ]}
                            ondblclick={() =>
                                player.playFolder(track.folder, i)}
                            onclick={() => player.playFolder(track.folder, i)}
                        >
                            <span
                                class="w-7 text-right text-[#8b93a7] tabular-nums"
                                >{i + 1}</span
                            >
                            <span
                                class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                                >{track.name}</span
                            >
                            {#if player.currentTrack?.path === track.path}
                                <span class="flex items-center text-[#6e8bff]">
                                    {#if player.isPlaying}
                                        <Play size={14} />
                                    {:else}
                                        <Pause size={14} />
                                    {/if}
                                </span>
                            {/if}
                        </button>
                    {/each}
                {/if}
            {/if}
        </div>
    </section>

    <footer
        class="grid items-center gap-4 px-[18px] py-3 bg-[#0a0c10] border-t border-[#1d2230]"
        style="grid-area: player; grid-template-columns: 260px 1fr 200px; grid-template-rows: auto auto;"
    >
        <div class="min-w-0" style="grid-row: 1 / span 2;">
            {#if player.currentTrack}
                <div
                    class="font-semibold text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                >
                    {player.currentTrack.name}
                </div>
                <div
                    class="text-[11px] text-[#8b93a7] overflow-hidden text-ellipsis whitespace-nowrap"
                >
                    {player.currentTrack.folder}
                </div>
            {:else}
                <div class="text-sm text-[#8b93a7]">Nothing playing</div>
            {/if}
        </div>

        <div
            class="flex items-center justify-center gap-2.5"
            style="grid-column: 2; grid-row: 1;"
        >
            <button
                class={[
                    "flex items-center justify-center bg-transparent border-none w-9 h-9 rounded-full cursor-pointer hover:bg-[#161c28]",
                    player.shuffle ? "text-[#6e8bff]" : "text-[#cdd3e0]",
                ]}
                title="Shuffle"
                aria-label="Shuffle"
                onclick={() => player.toggleShuffle()}
            >
                <Shuffle size={18} />
            </button>
            <button
                class="flex items-center justify-center bg-transparent border-none text-[#cdd3e0] w-9 h-9 rounded-full cursor-pointer hover:bg-[#161c28]"
                title="Previous"
                aria-label="Previous"
                onclick={() => player.prev()}
            >
                <SkipBack size={18} />
            </button>
            <button
                class="flex items-center justify-center bg-[#e7e9ee] text-[#0f1115] border-none w-10 h-10 rounded-full cursor-pointer hover:bg-white"
                title="Play/Pause"
                aria-label={player.isPlaying ? "Pause" : "Play"}
                onclick={() => player.togglePlay()}
            >
                {#if player.isPlaying}
                    <Pause size={18} />
                {:else}
                    <Play size={18} />
                {/if}
            </button>
            <button
                class="flex items-center justify-center bg-transparent border-none text-[#cdd3e0] w-9 h-9 rounded-full cursor-pointer hover:bg-[#161c28]"
                title="Next"
                aria-label="Next"
                onclick={() => player.next(true)}
            >
                <SkipForward size={18} />
            </button>
            <button
                class={[
                    "flex items-center justify-center bg-transparent border-none w-9 h-9 rounded-full cursor-pointer hover:bg-[#161c28]",
                    player.repeat !== "off"
                        ? "text-[#6e8bff]"
                        : "text-[#cdd3e0]",
                ]}
                title={player.repeat === "one"
                    ? "Repeat one"
                    : player.repeat === "all"
                      ? "Repeat list"
                      : "Repeat off"}
                aria-label="Repeat"
                onclick={() => player.cycleRepeat()}
            >
                {#if player.repeat === "one"}
                    <Repeat1 size={18} />
                {:else}
                    <Repeat size={18} />
                {/if}
            </button>
        </div>

        <div
            class="flex items-center gap-2.5"
            style="grid-column: 2; grid-row: 2;"
        >
            <span
                class="text-[11px] text-[#8b93a7] tabular-nums min-w-9 text-center"
                >{fmt(player.currentTime)}</span
            >
            <input
                class="player-range flex-1"
                type="range"
                min="0"
                max={player.duration || 0}
                step="0.1"
                value={player.currentTime}
                oninput={onScrub}
                disabled={!player.currentTrack}
            />
            <span
                class="text-[11px] text-[#8b93a7] tabular-nums min-w-9 text-center"
                >{fmt(player.duration)}</span
            >
        </div>

        <div class="flex items-center gap-2" style="grid-row: 1 / span 2;">
            <span class="flex items-center text-[#8b93a7]">
                <Volume2 size={16} />
            </span>
            <input
                class="player-range flex-1"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={player.volume}
                oninput={onVolume}
            />
        </div>
    </footer>

    {#if player.streamUrl}
        <audio
            bind:this={audio}
            src={player.streamUrl}
            ontimeupdate={onTimeUpdate}
            onloadedmetadata={onLoadedMeta}
            onended={() => player.onEnded()}
            preload="auto"
        ></audio>
    {/if}
</main>

<style>
    :global(.player-range) {
        appearance: none;
        height: 4px;
        background: #1d2230;
        border-radius: 2px;
        outline: none;
    }
    :global(.player-range::-webkit-slider-thumb) {
        appearance: none;
        width: 12px;
        height: 12px;
        background: #e7e9ee;
        border-radius: 50%;
        cursor: pointer;
    }
</style>
