export const PRODUCT_NAME = "PiDeck";
export const APP_SLUG = "pideck";
export const STORAGE_PREFIX = `${APP_SLUG}-`;
export const DND_FILE_MIME = `application/x-${APP_SLUG}-file`;
export const EVENT_PREFIX = `${APP_SLUG}:`;

export const BRAND_MARK_SEGMENTS = {
	p: "M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z",
	i: "M517.36 400 H634.72 V634.72 H517.36 Z",
} as const;

export const BRAND_MARK_PATH = Object.values(BRAND_MARK_SEGMENTS).join(" ");
