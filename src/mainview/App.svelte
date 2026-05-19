<script lang="ts">
  import { onMount } from "svelte";
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

  function trackKey(t: { path: string }) { return t.path; }
</script>

<main>
  <aside class="sidebar">
    <div class="sidebar-head">
      <h2>Folders</h2>
      <button class="add" onclick={() => player.addFolder()} title="Import folder">+</button>
    </div>
    {#if player.folders.length === 0}
      <p class="empty">No folders yet. Click + to import.</p>
    {:else}
      <ul class="folder-list">
        {#each player.folders as folder (folder.path)}
          <li
            class="folder-item"
            class:active={folder.path === player.activeFolderPath}
          >
            <button
              class="folder-main"
              ondblclick={() => player.playFolder(folder.path, 0)}
              onclick={() => player.selectFolder(folder.path)}
              title={folder.path}
            >
              <span class="folder-name">{folder.name}</span>
              <span class="folder-count">{folder.tracks.length}</span>
            </button>
            <div class="folder-actions">
              <button class="icon-btn" title="Play" onclick={() => player.playFolder(folder.path, 0)}>▶</button>
              <button class="icon-btn" title="Rescan" onclick={() => player.rescan(folder.path)}>↻</button>
              <button class="icon-btn danger" title="Remove" onclick={() => player.removeFolder(folder.path)}>✕</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <section class="content">
    <header class="content-head">
      {#if player.activeFolder}
        <div>
          <h1>{player.activeFolder.name}</h1>
          <p class="path">{player.activeFolder.path}</p>
        </div>
        <button class="play-all" onclick={() => player.activeFolder && player.playFolder(player.activeFolder.path, 0)}>
          Play all
        </button>
      {:else}
        <div>
          <h1>mud-player</h1>
          <p class="path">Import a folder to begin</p>
        </div>
      {/if}
    </header>

    <div class="track-list">
      {#if player.activeFolder}
        {#if player.activeFolder.tracks.length === 0}
          <p class="empty">No audio files in this folder.</p>
        {:else}
          {#each player.activeFolder.tracks as track, i (trackKey(track))}
            <button
              class="track"
              class:playing={player.currentTrack?.path === track.path}
              ondblclick={() => player.playFolder(track.folder, i)}
              onclick={() => player.playFolder(track.folder, i)}
            >
              <span class="track-num">{i + 1}</span>
              <span class="track-name">{track.name}</span>
              {#if player.currentTrack?.path === track.path}
                <span class="now">{player.isPlaying ? "♪" : "❚❚"}</span>
              {/if}
            </button>
          {/each}
        {/if}
      {/if}
    </div>
  </section>

  <footer class="player-bar">
    <div class="player-info">
      {#if player.currentTrack}
        <div class="now-name">{player.currentTrack.name}</div>
        <div class="now-folder">{player.currentTrack.folder}</div>
      {:else}
        <div class="now-name muted">Nothing playing</div>
      {/if}
    </div>

    <div class="player-controls">
      <button
        class="toggle"
        class:on={player.shuffle}
        title="Shuffle"
        onclick={() => player.toggleShuffle()}
      >⇄</button>
      <button class="ctrl" title="Previous" onclick={() => player.prev()}>⏮</button>
      <button class="ctrl primary" title="Play/Pause" onclick={() => player.togglePlay()}>
        {player.isPlaying ? "⏸" : "▶"}
      </button>
      <button class="ctrl" title="Next" onclick={() => player.next(true)}>⏭</button>
      <button
        class="toggle"
        class:on={player.repeat !== "off"}
        title={player.repeat === "one" ? "Repeat one" : player.repeat === "all" ? "Repeat list" : "Repeat off"}
        onclick={() => player.cycleRepeat()}
      >
        {player.repeat === "one" ? "🔂" : "🔁"}
      </button>
    </div>

    <div class="player-scrub">
      <span class="time">{fmt(player.currentTime)}</span>
      <input
        type="range"
        min="0"
        max={player.duration || 0}
        step="0.1"
        value={player.currentTime}
        oninput={onScrub}
        disabled={!player.currentTrack}
      />
      <span class="time">{fmt(player.duration)}</span>
    </div>

    <div class="player-volume">
      <span class="vol-ic">🔊</span>
      <input
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
  main {
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: 1fr auto;
    grid-template-areas:
      "sidebar content"
      "player player";
    height: 100vh;
    background: #0f1115;
    color: #e7e9ee;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .sidebar {
    grid-area: sidebar;
    background: #0a0c10;
    border-right: 1px solid #1d2230;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #1d2230;
  }
  .sidebar-head h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8b93a7;
  }
  .add {
    width: 28px; height: 28px;
    border-radius: 6px;
    border: 1px solid #2a3245;
    background: #161a24;
    color: #e7e9ee;
    font-size: 18px;
    cursor: pointer;
  }
  .add:hover { background: #1e2433; }

  .folder-list {
    list-style: none;
    margin: 0; padding: 6px;
    overflow-y: auto;
  }
  .folder-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border-radius: 8px;
  }
  .folder-item.active { background: #1a2030; }
  .folder-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 6px;
    font-size: 13px;
    min-width: 0;
  }
  .folder-main:hover { background: #161c28; }
  .folder-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder-count {
    font-size: 11px;
    color: #8b93a7;
    background: #161c28;
    padding: 1px 6px;
    border-radius: 10px;
  }
  .folder-actions {
    display: none;
    gap: 2px;
  }
  .folder-item:hover .folder-actions { display: flex; }
  .icon-btn {
    background: transparent;
    border: none;
    color: #8b93a7;
    width: 24px; height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .icon-btn:hover { background: #1e2433; color: #e7e9ee; }
  .icon-btn.danger:hover { color: #ff7676; }

  .content {
    grid-area: content;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .content-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 28px 12px;
  }
  .content-head h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .path {
    margin: 4px 0 0;
    color: #8b93a7;
    font-size: 12px;
  }
  .play-all {
    padding: 10px 18px;
    background: #4d7cff;
    border: none;
    border-radius: 999px;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
  .play-all:hover { background: #5b87ff; }

  .track-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 18px 14px;
  }
  .track {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    color: inherit;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-size: 14px;
  }
  .track:hover { background: #161c28; }
  .track.playing { background: #1b2237; color: #b8c5ff; }
  .track-num {
    width: 28px;
    text-align: right;
    color: #8b93a7;
    font-variant-numeric: tabular-nums;
  }
  .track-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .now { color: #6e8bff; }

  .empty {
    color: #8b93a7;
    padding: 16px;
    font-size: 13px;
  }

  .player-bar {
    grid-area: player;
    display: grid;
    grid-template-columns: 260px 1fr 200px;
    align-items: center;
    gap: 16px;
    padding: 12px 18px;
    background: #0a0c10;
    border-top: 1px solid #1d2230;
  }

  .player-info {
    min-width: 0;
  }
  .now-name {
    font-weight: 600;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .now-name.muted { color: #8b93a7; font-weight: 400; }
  .now-folder {
    font-size: 11px;
    color: #8b93a7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .ctrl, .toggle {
    background: transparent;
    border: none;
    color: #cdd3e0;
    font-size: 18px;
    width: 36px; height: 36px;
    border-radius: 50%;
    cursor: pointer;
  }
  .ctrl:hover, .toggle:hover { background: #161c28; }
  .ctrl.primary {
    background: #e7e9ee;
    color: #0f1115;
    width: 40px; height: 40px;
    font-size: 16px;
  }
  .ctrl.primary:hover { background: white; }
  .toggle.on { color: #6e8bff; }

  .player-scrub {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .player-bar {
    grid-template-rows: auto auto;
  }
  .player-info { grid-row: 1 / span 2; }
  .player-volume { grid-row: 1 / span 2; }
  .time {
    font-size: 11px;
    color: #8b93a7;
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: center;
  }
  .player-scrub input,
  .player-volume input {
    flex: 1;
    appearance: none;
    height: 4px;
    background: #1d2230;
    border-radius: 2px;
    outline: none;
  }
  .player-scrub input::-webkit-slider-thumb,
  .player-volume input::-webkit-slider-thumb {
    appearance: none;
    width: 12px; height: 12px;
    background: #e7e9ee;
    border-radius: 50%;
    cursor: pointer;
  }
  .player-volume {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .vol-ic { font-size: 14px; color: #8b93a7; }
</style>
