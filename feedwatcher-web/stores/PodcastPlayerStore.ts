export const PodcastPlayerStore = defineStore("PodcastPlayerStore", {
  state: () => ({
    currentItem: null as any,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    _audio: null as HTMLAudioElement | null,
    _updateTimer: null as ReturnType<typeof setInterval> | null,
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
      this._audio = new Audio(audioUrl);
      this._audio.preload = "metadata";

      this._audio.addEventListener("loadedmetadata", () => {
        if (this._audio) {
          this.duration = this._audio.duration || 0;
        }
      });

      this._audio.addEventListener("ended", () => {
        this.isPlaying = false;
        this.currentTime = 0;
      });

      this._audio.addEventListener("error", () => {
        this.isPlaying = false;
      });

      this._startTimer();
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

    seek(seconds: number): void {
      if (this._audio) {
        this._audio.currentTime = Math.max(0, Math.min(seconds, this.duration));
        this.currentTime = this._audio.currentTime;
      }
    },

    skipForward(delta: number = 30): void {
      this.seek(this.currentTime + delta);
    },

    skipBackward(delta: number = 30): void {
      this.seek(this.currentTime - delta);
    },

    stop(): void {
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
    },

    _startTimer(): void {
      this._stopTimer();
      this._updateTimer = setInterval(() => {
        if (this._audio) {
          this.currentTime = this._audio.currentTime;
          if (this._audio.duration) {
            this.duration = this._audio.duration;
          }
        }
      }, 250);
    },

    _stopTimer(): void {
      if (this._updateTimer) {
        clearInterval(this._updateTimer);
        this._updateTimer = null;
      }
    },
  },
});

function formatTime(seconds: number): string {
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
