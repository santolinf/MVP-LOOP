/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Published App Store / Google Play listings. Leave unset until the app is released: the welcome page then shows an honest "launching soon" state, never a dead link. */
  readonly VITE_IOS_APP_URL?: string;
  readonly VITE_ANDROID_APP_URL?: string;
}
