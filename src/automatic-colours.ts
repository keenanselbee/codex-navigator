import { colourLab, labColour, normaliseColour, repositoryColourKey } from './colours';

export function contrastRatio(colour: string, background: string): number {
  const luminance = (hex: string) => [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(colour), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Keep the assigned hue; adapt only automatic colours when the theme changes.
export function readableColour(colour: string, background: string): string {
  if (contrastRatio(colour, background) >= 4.5) return colour;
  const lab = colourLab(colour);
  let best = '', distance = Infinity;
  for (let step = 0; step <= 100; step++) {
    const lightness = step / 100, candidate = labColour([lightness, lab[1], lab[2]]);
    if (contrastRatio(candidate, background) >= 4.5 && Math.abs(lightness - lab[0]) < distance) {
      best = candidate; distance = Math.abs(lightness - lab[0]);
    }
  }
  return best || (contrastRatio('#FFFFFF', background) > contrastRatio('#000000', background) ? '#FFFFFF' : '#000000');
}

export function assignAutomaticColours(roots: string[], saved: Record<string, string>, custom: Record<string, string>, background: string): Record<string, string> {
  const result = { ...saved }, keys = [...new Set(roots.map(repositoryColourKey))].sort().slice(0, 500);
  if (keys.length < 2 || keys.every(key => result[key] || custom[key])) return result;
  const distance = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
  const existing = keys.map(key => custom[key] === 'none' ? undefined : normaliseColour(custom[key]) || (saved[key] ? readableColour(saved[key], background) : undefined))
    .filter((value): value is string => !!value).map(colourLab);
  const candidates: { colour: string; lab: number[]; distance: number }[] = [];
  const seen = new Set<string>();
  for (const lightness of [0.65, 0.45, 0.75, 0.55, 0.35, 0.85]) {
    for (const chroma of [0.16, 0.10, 0.22]) {
      for (let hue = 0; hue < 360; hue += 10) {
        const radians = hue * Math.PI / 180;
        const colour = labColour([lightness, Math.cos(radians) * chroma, Math.sin(radians) * chroma]);
        if (seen.has(colour) || contrastRatio(colour, background) < 4.5) continue;
        seen.add(colour);
        const lab = colourLab(colour);
        candidates.push({ colour, lab, distance: existing.length ? Math.min(...existing.map(other => distance(lab, other))) : 1 });
      }
    }
  }
  if (!candidates.length) {
    const colour = readableColour('#6B8AFD', background);
    candidates.push({ colour, lab: colourLab(colour), distance: 1 });
  }
  for (const key of keys) {
    if (result[key] || custom[key] || Object.keys(result).length >= 2000) continue;
    const best = candidates.reduce((a, b) => b.distance > a.distance ? b : a);
    result[key] = best.colour;
    for (const candidate of candidates) candidate.distance = Math.min(candidate.distance, distance(candidate.lab, best.lab));
  }
  return result;
}

export function resolvedRepositoryColours(saved: Record<string, string>, custom: Record<string, string>, background: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, colour] of Object.entries(saved)) if (normaliseColour(colour)) result[key] = readableColour(colour, background);
  for (const [key, colour] of Object.entries(custom)) {
    if (colour === 'none') delete result[key];
    else if (normaliseColour(colour)) result[key] = colour;
  }
  return result;
}
