import type { MessageKey } from "./messages";
export interface MediaActionState { error?: MessageKey; success?: boolean; }
export type MediaPurpose = "SHOP_LOGO" | "PROFILE" | "HAIRCUT";
export interface MediaPreview { id: string; kind: MediaPurpose; src: string; createdAt: string; consentAt: string; width: number; height: number; }
