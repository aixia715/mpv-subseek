import { FollowState } from "./follow-state.js";

interface BrowserTrack { id: string; label: string }
interface BrowserCue { id: string; start: number; end: number; text: string }
interface SnapshotMessage {
  type: "snapshot";
  tracks: BrowserTrack[];
  selectedTrackId: string | null;
  cues: BrowserCue[];
  activeCueIds: string[];
}
interface PlaybackMessage { type: "playback"; activeCueIds: string[] }
interface ErrorMessage { type: "error"; message: string }
type ServerMessage = SnapshotMessage | PlaybackMessage | ErrorMessage;

const timelineElement = requiredElement<HTMLElement>("timeline");
const trackSelect = requiredElement<HTMLSelectElement>("track-select");
const resumeButton = requiredElement<HTMLButtonElement>("resume-follow");
const notice = requiredElement<HTMLElement>("notice");
const follow = new FollowState();
let activeCueIds: string[] = [];
let cues: BrowserCue[] = [];

const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${socketProtocol}//${location.host}${location.search}`);

socket.addEventListener("open", () => setNotice("Connected", false));
socket.addEventListener("close", () => setNotice("mpv has closed. You can close this tab.", true));
socket.addEventListener("error", () => setNotice("Lost connection to the local companion.", true));
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data)) as ServerMessage;
  if (message.type === "snapshot") {
    cues = message.cues;
    activeCueIds = message.activeCueIds;
    renderTrackSelector(message.tracks, message.selectedTrackId);
    renderCues();
    updateActiveCues();
    setNotice(cues.length ? `${cues.length} subtitle cues` : "This track has no text cues.", false);
  } else if (message.type === "playback") {
    activeCueIds = message.activeCueIds;
    updateActiveCues();
  } else if (message.type === "error") {
    setNotice(message.message, true);
  }
});

trackSelect.addEventListener("change", () => {
  setNotice("Loading subtitle track…", false);
  socket.send(JSON.stringify({ type: "select-track", trackId: trackSelect.value }));
});

timelineElement.addEventListener("click", (event) => {
  const cue = (event.target as Element).closest<HTMLButtonElement>("[data-cue-id]");
  if (cue) socket.send(JSON.stringify({ type: "seek", cueId: cue.dataset.cueId }));
});

for (const eventName of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
  timelineElement.addEventListener(eventName, () => {
    follow.suspend();
    resumeButton.hidden = false;
  }, { passive: true });
}

resumeButton.addEventListener("click", () => {
  resumeButton.hidden = true;
  scrollToCue(follow.resume(activeCueIds));
});

function renderTrackSelector(tracks: BrowserTrack[], selectedTrackId: string | null): void {
  trackSelect.replaceChildren(...tracks.map((track) => {
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = track.label;
    option.selected = track.id === selectedTrackId;
    return option;
  }));
  trackSelect.disabled = tracks.length === 0;
}

function renderCues(): void {
  if (!cues.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No supported text subtitles were found.";
    timelineElement.replaceChildren(empty);
    return;
  }

  timelineElement.replaceChildren(...cues.map((cue) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cue";
    button.dataset.cueId = cue.id;
    button.setAttribute("aria-label", `Seek to ${formatTime(cue.start)}: ${cue.text}`);

    const time = document.createElement("span");
    time.className = "cue-time";
    time.textContent = formatTime(cue.start);
    const text = document.createElement("span");
    text.className = "cue-text";
    text.textContent = cue.text;
    button.append(time, text);
    return button;
  }));
}

function updateActiveCues(): void {
  const active = new Set(activeCueIds);
  for (const element of timelineElement.querySelectorAll<HTMLElement>("[data-cue-id]")) {
    const isActive = active.has(element.dataset.cueId ?? "");
    element.classList.toggle("active", isActive);
    if (isActive) element.setAttribute("aria-current", "true");
    else element.removeAttribute("aria-current");
  }
  scrollToCue(follow.updateActive(activeCueIds));
}

function scrollToCue(cueId: string | null): void {
  if (!cueId) return;
  timelineElement.querySelector<HTMLElement>(`[data-cue-id="${CSS.escape(cueId)}"]`)
    ?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function setNotice(message: string, error: boolean): void {
  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing browser element: ${id}`);
  return element as T;
}
