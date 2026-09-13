import * as path from 'node:path';

export function normaliseColour(value: unknown): string | undefined {
  if (typeof value !== 'string') { return; }
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) { return hex.toUpperCase(); }
  if (/^#[0-9a-f]{3}$/i.test(hex)) { return '#' + [...hex.slice(1)].map(char => char + char).join('').toUpperCase(); }
  return undefined;
}

export function readColours(value: unknown, kind: 'chat' | 'repository'): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return result; }
  for (const [key, valueColour] of Object.entries(value)) {
    const colour = normaliseColour(valueColour);
    const validKey = kind === 'chat' ? /^(local|remote)\/[a-zA-Z0-9_-]+$/.test(key)
      : path.isAbsolute(key) && key.length <= 4096 && !/[\x00-\x1f]/.test(key);
    if (colour && validKey) { result[kind === 'repository' ? repositoryColourKey(key) : key] = colour; }
  }
  return result;
}

export function repositoryColourKey(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// Equal-weight Oklab mixing; clamp the result to displayable sRGB.
// Conversion: https://bottosson.github.io/posts/oklab/
export function blendColours(colours: string[]): string | undefined {
  const valid = colours.map(normaliseColour).filter((value): value is string => !!value);
  if (!valid.length) { return; }
  if (valid.length === 1) { return valid[0]; }
  const sums = [0, 0, 0];
  for (const colour of valid) {
    const [r, g, b] = [1, 3, 5].map(offset => {
      const channel = parseInt(colour.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    sums[0] += 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    sums[1] += 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    sums[2] += 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  }
  const [L, a, b] = sums.map(value => value / valid.length);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(channel => {
    const clamped = Math.max(0, Math.min(1, channel));
    const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}

export function inheritedColour(override: unknown, roots: string[], repositories: Record<string, string>): string | undefined {
  return normaliseColour(override) ?? blendColours([...new Set(roots.map(repositoryColourKey))].sort()
    .map(root => repositories[root]).filter(Boolean));
}
