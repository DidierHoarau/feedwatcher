import axios from "axios";
import Config from "~~/services/Config";
import { AuthService } from "~~/services/AuthService";
import { EventBus, EventTypes } from "~~/services/EventBus";
import {
  PreferencesService,
  PODCAST_PLAYBACK_SPEEDS,
} from "~~/services/PreferencesService";

export const PODCAST_SPEEDS = PODCAST_PLAYBACK_SPEEDS;

// Saved positions at or below this are noise (just started listening)
const RESUME_MIN_POSITION_SECONDS = 3;
// A saved position within this of the end is "finished": restart from zero
const RESUME_END_THRESHOLD_SECONDS = 5;
const PLAYBACK_SAVE_INTERVAL_MS = 15000;

export const PodcastPlayerStore = defineStore("PodcastPlayerStore", {
  state: () => ({
    currentItem: null as any,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    _audio: null as HTMLAudioElement | null,
    _updateTimer: null as ReturnType<typeof setInterval> | null,
    _resumeAt: 0,
    _metadataLoaded: false,
    _lastSavedAt: 0,
  }),

  getters: {
    hasActiveItem(): boolean {
      return this.currentItem !== null;
    },
    formattedCurrentTime(): string {
      return formatTime(this.currentTime);
    },
    formattedDuration(): string {
      return formatTime(this.duration);
    },
    progressPercent(): number {
      if (!this.duration) return 0;
      return (this.currentTime / this.duration) * 100;
    },
  },

  actions: {
    play(item: any): void {
      // If already playing this item, just resume
      if (this.currentItem?.id === item.id && this._audio) {
        this.resume();
        return;
      }

      this.stop();

      const audioUrl = item.info?.audioUrl;
      if (!audioUrl) return;

      this.currentItem = item;
      this.playbackRate = PreferencesService.getPodcastPlaybackRate();
      this._audio = new Audio(audioUrl);
      this._audio.preload = "metadata";
      this._audio.playbackRate = this.playbackRate;
      this._metadataLoaded = false;

      this._audio.addEventListener("loadedmetadata", () => {
        if (this._audio) {
          this.duration = this._audio.duration || 0;
          this._metadataLoaded = true;
          this._applyResume();
        }
      });

      this._audio.addEventListener("ended", () => {
        this.isPlaying = false;
        this.currentTime = 0;
        this._onEnded();
      });

      this._audio.addEventListener("error", () => {
        this.isPlaying = false;
      });

      this._startTimer();
      this._fetchSavedPosition(item.id);
      this._audio
        .play()
        .then(() => {
          this.isPlaying = true;
        })
        .catch(() => {
          this.isPlaying = false;
        });
    },

    pause(): void {
      if (this._audio && this.isPlaying) {
        this._audio.pause();
        this.isPlaying = false;
        this._maybeSavePlayback(true);
      }
    },

    resume(): void {
      if (this._audio && !this.isPlaying) {
        this._audio
          .play()
          .then(() => {
            this.isPlaying = true;
          })
          .catch(() => {
            this.isPlaying = false;
          });
      }
    },

    togglePlayPause(): void {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.resume();
      }
    },

    setPlaybackRate(rate: number): void {
      this.playbackRate = this._snapPlaybackRate(rate);
      if (this._audio) {
        this._audio.playbackRate = this.playbackRate;
      }
      PreferencesService.setPodcastPlaybackRate(this.playbackRate);
    },

    cyclePlaybackRate(): void {
      const index = PODCAST_SPEEDS.indexOf(this.playbackRate);
      const nextIndex = (index + 1) % PODCAST_SPEEDS.length;
      this.setPlaybackRate(PODCAST_SPEEDS[nextIndex]);
    },

    seek(seconds: number): void {
      if (this._audio) {
        this._audio.currentTime = Math.max(0, Math.min(seconds, this.duration));
        this.currentTime = this._audio.currentTime;
        this._maybeSavePlayback();
      }
    },

    skipForward(delta: number = 30): void {
      this.seek(this.currentTime + delta);
    },

    skipBackward(delta: number = 30): void {
      this.seek(this.currentTime - delta);
    },

    stop(): void {
      this._maybeSavePlayback(true);
      this._stopTimer();
      if (this._audio) {
        this._audio.pause();
        this._audio.src = "";
        this._audio = null;
      }
      this.currentItem = null;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this._resumeAt = 0;
      this._metadataLoaded = false;
    },

    _startTimer(): void {
      this._stopTimer();
      this._updateTimer = setInterval(() => {
        if (this._audio) {
          this.currentTime = this._audio.currentTime;
          if (this._audio.duration) {
            this.duration = this._audio.duration;
          }
          this._maybeSavePlayback();
        }
      }, 250);
    },

    _stopTimer(): void {
      if (this._updateTimer) {
        clearInterval(this._updateTimer);
        this._updateTimer = null;
      }
    },

    // Apply a pending resume position once the audio metadata is available
    _applyResume(): void {
      if (this._audio && this._resumeAt > 0) {
        this._audio.currentTime = this._resumeAt;
        this.currentTime = this._resumeAt;
        this._resumeAt = 0;
      }
    },

    async _fetchSavedPosition(itemId: string): Promise<void> {
      try {
        const res = await axios.get(
          `${(await Config.get()).SERVER_URL}/items/${itemId}/playback`,
          await AuthService.getAuthHeader(),
        );
        if (this.currentItem?.id !== itemId) {
          return;
        }
        const position = Number(res.data?.positionSeconds) || 0;
        const savedDuration = Number(res.data?.durationSeconds) || 0;
        if (savedDuration > 0 && !this.duration) {
          this.duration = savedDuration;
        }
        const knownDuration = this._audio?.duration || this.duration || 0;
        if (
          position > RESUME_MIN_POSITION_SECONDS &&
          (knownDuration === 0 ||
            position < knownDuration - RESUME_END_THRESHOLD_SECONDS)
        ) {
          this.currentTime = position;
          this._resumeAt = position;
          this._applyResume();
        }
      } catch (err) {
        // Resume is best-effort: without a saved position playback just
        // starts from the beginning
        console.error("Failed to load playback position", err);
      }
    },

    async _maybeSavePlayback(force: boolean = false): Promise<void> {
      if (!this.currentItem || !this._audio) {
        return;
      }
      const now = Date.now();
      if (!force && now - this._lastSavedAt < PLAYBACK_SAVE_INTERVAL_MS) {
        return;
      }
      this._lastSavedAt = now;
      // Capture from the audio element now: stop() tears it down while this
      // save is still in flight.
      const itemId = this.currentItem.id;
      const positionSeconds = Math.floor(this._audio.currentTime || 0);
      const durationSeconds = Math.floor(this._audio.duration || 0);
      try {
        await axios.put(
          `${(await Config.get()).SERVER_URL}/items/${itemId}/playback`,
          { positionSeconds, durationSeconds },
          await AuthService.getAuthHeader(),
        );
      } catch (err) {
        // Silent failure: a background save must not alert-spam the user
        console.error("Failed to save playback position", err);
      }
    },

    // Episode finished: reset the saved position and mark the episode played
    async _onEnded(): Promise<void> {
      const endedItem = this.currentItem;
      this._lastSavedAt = 0;
      if (!endedItem) {
        return;
      }
      try {
        await axios.put(
          `${(await Config.get()).SERVER_URL}/items/${endedItem.id}/playback`,
          {
            positionSeconds: 0,
            durationSeconds: Math.floor(this._audio?.duration || this.duration || 0),
          },
          await AuthService.getAuthHeader(),
        );
      } catch (err) {
        console.error("Failed to reset playback position", err);
      }
      try {
        await axios.put(
          `${(await Config.get()).SERVER_URL}/items/status`,
          { status: "read", itemIds: [endedItem.id] },
          await AuthService.getAuthHeader(),
        );
        endedItem.status = "read";
        EventBus.emit(EventTypes.ITEMS_UPDATED, {});
      } catch (err) {
        console.error("Failed to mark episode as played", err);
      }
    },

    _snapPlaybackRate(rate: number): number {
      let best = PODCAST_SPEEDS[0];
      let bestDistance = Infinity;
      for (const speed of PODCAST_SPEEDS) {
        const distance = Math.abs(speed - rate);
        if (distance < bestDistance) {
          best = speed;
          bestDistance = distance;
        }
      }
      return best;
    },
  },
});

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(PodcastPlayerStore, import.meta.hot));
}
