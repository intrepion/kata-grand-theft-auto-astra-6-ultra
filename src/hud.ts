export interface HudState {
  cash: number;
  wanted: number;
  speed: number;
  vehicle: string;
  health: number;
  missionTitle: string;
  missionText: string;
  missionStep: number;
  district: string;
  onFoot: boolean;
  paused: boolean;
  missionCount: number;
  reward: number;
}

interface HudActions {
  start: () => void;
  togglePause: () => void;
  toggleSound: () => boolean;
  interact: () => void;
  reset: () => void;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing HUD element: ${id}`);
  return found as T;
}

export class HUD {
  private readonly cash = element("cash");
  private readonly wanted = element("wanted");
  private readonly speed = element("speed");
  private readonly vehicle = element("vehicle-name");
  private readonly healthFill = element("health-fill");
  private readonly healthValue = element("health-value");
  private readonly missionTitle = element("mission-title");
  private readonly missionText = element("mission-text");
  private readonly missionCount = element("mission-count");
  private readonly missionReward = element("mission-reward-amount");
  private readonly district = element("district");
  private readonly driveStatus = element("drive-status");
  private readonly speedProgress = element("speed-progress");
  private readonly interactionText = element("interaction-text");
  private readonly pauseModal = element("pause-modal");
  private readonly helpModal = element("help-modal");
  private readonly resultModal = element("result-modal");
  private readonly steps = Array.from(
    document.querySelectorAll<HTMLElement>(".mission-step"),
  );
  private started = false;
  private helping = false;
  private paused = false;
  private resumeAfterHelp = false;
  private focusedModal: HTMLElement | null = element("welcome-modal");
  private last = new Map<string, string>();

  constructor(private readonly actions: HudActions) {
    element("start-button").addEventListener("click", () => {
      this.started = true;
      element("welcome-modal").classList.add("hidden");
      document.body.classList.add("game-started");
      actions.start();
      this.focusGame();
    });
    element("pause-button").addEventListener("click", () => {
      if (!this.started) return;
      if (this.helping) this.closeHelp();
      else actions.togglePause();
    });
    element("resume-button").addEventListener("click", () => {
      actions.togglePause();
      this.focusGame();
    });
    element("sound-button").addEventListener("click", () => {
      const enabled = actions.toggleSound();
      const button = element("sound-button");
      button.setAttribute(
        "aria-label",
        enabled ? "Mute sound" : "Enable sound",
      );
      button.setAttribute("title", enabled ? "Mute sound" : "Enable sound");
      button.setAttribute("aria-pressed", String(enabled));
      document
        .getElementById("sound-waves")
        ?.setAttribute(
          "d",
          enabled
            ? "M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"
            : "m16 9 5 6m0-6-5 6",
        );
      this.toast(enabled ? "Sound on. Tune into the city." : "Sound muted.");
    });
    element("help-button").addEventListener("click", () => {
      if (!this.started) return;
      this.resumeAfterHelp = !this.paused;
      this.helping = true;
      this.helpModal.classList.remove("hidden");
      this.pauseModal.classList.add("hidden");
      if (this.resumeAfterHelp) actions.togglePause();
      element("close-help").focus();
    });
    element("pause-help").addEventListener("click", () =>
      element("help-button").click(),
    );
    element("close-help").addEventListener("click", () => this.closeHelp());
    element("help-done").addEventListener("click", () => this.closeHelp());
    element("reset-button").addEventListener("click", () => {
      actions.reset();
      this.helpModal.classList.add("hidden");
      this.helping = false;
    });
    element("interact-touch").addEventListener("click", () =>
      actions.interact(),
    );
    element("result-done").addEventListener("click", () => {
      this.resultModal.classList.add("hidden");
      if (this.paused) actions.togglePause();
      this.focusGame();
    });
    document.getElementById("game")?.setAttribute("tabindex", "0");
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const modal = this.activeModal();
      if (!modal) return;
      const buttons = Array.from(
        modal.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
      );
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    });
    element("start-button").focus({ preventScroll: true });
  }

  private activeModal(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".modal-backdrop:not(.hidden)");
  }

  private focusGame(): void {
    document.getElementById("game")?.focus({ preventScroll: true });
  }

  private closeHelp(): void {
    this.helping = false;
    this.helpModal.classList.add("hidden");
    if (this.resumeAfterHelp && this.paused) this.actions.togglePause();
    this.focusGame();
  }

  private setText(key: string, target: HTMLElement, value: string): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    target.textContent = value;
  }

  update(state: HudState): void {
    this.setText(
      "cash",
      this.cash,
      `$${Math.round(state.cash).toLocaleString("en-US")}`,
    );
    this.setText(
      "speed",
      this.speed,
      String(Math.max(0, Math.round(state.speed))).padStart(3, "0"),
    );
    this.setText("vehicle", this.vehicle, state.vehicle.toUpperCase());
    this.setText(
      "health",
      this.healthValue,
      String(Math.round(Math.max(0, state.health))),
    );
    this.setText("mission-title", this.missionTitle, state.missionTitle);
    this.setText("mission-text", this.missionText, state.missionText);
    this.setText(
      "mission-count",
      this.missionCount,
      `STORY / ${String(state.missionCount + 1).padStart(2, "0")}`,
    );
    this.setText(
      "mission-reward",
      this.missionReward,
      `+$${Math.round(state.reward).toLocaleString("en-US")}`,
    );
    this.setText("district", this.district, state.district.toUpperCase());
    this.setText(
      "drive-status",
      this.driveStatus,
      state.onFoot ? "ON FOOT" : "ENJOY THE RIDE",
    );
    this.setText(
      "interaction",
      this.interactionText,
      state.onFoot ? "ENTER A NEARBY VEHICLE" : "EXIT VEHICLE",
    );
    const health = Math.min(100, Math.max(0, state.health));
    this.healthFill.style.width = `${health}%`;
    this.healthFill.style.background =
      health < 30 ? "var(--orange)" : "var(--paper)";
    this.speedProgress.style.width = `${Math.min(100, state.speed / 1.6)}%`;
    const wanted = Math.min(5, Math.max(0, Math.ceil(state.wanted)));
    if (this.last.get("wanted") !== String(wanted)) {
      this.last.set("wanted", String(wanted));
      Array.from(this.wanted.children).forEach((star, index) =>
        star.classList.toggle("lit", index < wanted),
      );
      this.wanted.setAttribute("aria-label", `Wanted level ${wanted} of 5`);
    }
    if (this.last.get("step") !== String(state.missionStep)) {
      this.last.set("step", String(state.missionStep));
      this.steps.forEach((step, index) => {
        step.classList.toggle("active", index === state.missionStep);
        step.classList.toggle("complete", index < state.missionStep);
        step.querySelector("i")!.textContent =
          index < state.missionStep ? "✓" : String(index + 1).padStart(2, "0");
      });
    }
    if (this.paused !== state.paused) {
      this.paused = state.paused;
      if (!state.paused) this.resultModal.classList.add("hidden");
      if (!state.paused && this.helping) {
        this.helping = false;
        this.helpModal.classList.add("hidden");
      }
    }
    this.pauseModal.classList.toggle(
      "hidden",
      !state.paused ||
        !this.started ||
        this.helping ||
        !this.resultModal.classList.contains("hidden"),
    );
    const activeModal = this.activeModal();
    if (activeModal !== this.focusedModal) {
      this.focusedModal = activeModal;
      if (activeModal)
        activeModal
          .querySelector<HTMLButtonElement>("button")
          ?.focus({ preventScroll: true });
      else this.focusGame();
    }
  }

  toast(message: string, kind: "info" | "success" | "danger" = "info"): void {
    const region = element("toast-region");
    const toast = document.createElement("div");
    toast.className = `toast ${kind}`;
    toast.textContent = message;
    region.append(toast);
    while (region.children.length > 3) region.firstElementChild?.remove();
    window.setTimeout(() => {
      toast.classList.add("leaving");
      window.setTimeout(() => toast.remove(), 350);
    }, 4200);
  }

  showResult(title: string, body: string): void {
    element("result-title").textContent = title;
    element("result-body").textContent = body;
    this.resultModal.classList.remove("hidden");
    this.pauseModal.classList.add("hidden");
    if (!this.paused) this.actions.togglePause();
    element("result-done").focus();
  }
}
