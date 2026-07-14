export const VIDEO_ASSET_VERSION = 'llast-20260715'

export function versionVideoAssetUrl(url: string) {
  return `${url}?v=${VIDEO_ASSET_VERSION}`
}
