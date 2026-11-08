import { App } from '@capacitor/app';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';

type PauseCallback = () => void;
type ResumeCallback = () => void;

const pauseListeners:  PauseCallback[]  = [];
const resumeListeners: ResumeCallback[] = [];

export function onPause(cb: PauseCallback):  void { pauseListeners.push(cb); }
export function onResume(cb: ResumeCallback): void { resumeListeners.push(cb); }

export async function initAppLifecycle(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await KeepAwake.keepAwake();

  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      resumeListeners.forEach(cb => cb());
    } else {
      pauseListeners.forEach(cb => cb());
    }
  });
}
