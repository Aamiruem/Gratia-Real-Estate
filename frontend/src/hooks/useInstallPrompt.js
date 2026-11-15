import { useSyncExternalStore } from "react";
import { installState, promptInstall, subscribeInstall } from "../pwa/install";

let cached = null;
const snapshot = () => {
  const next = installState();
  if (!cached || cached.installed !== next.installed || cached.canPrompt !== next.canPrompt || cached.standalone !== next.standalone) {
    cached = next;
  }
  return cached;
};

export default function useInstallPrompt() {
  const state = useSyncExternalStore(subscribeInstall, snapshot, snapshot);
  return { ...state, promptInstall };
}
