import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();
export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isApp = isNative || isStandalone;
