import { normaliseColour } from './colours';
import { customLabelError } from './model';

export function labelColourKey(label: string): string {
  return label.trim().toLowerCase();
}

export function readLabelColours(value: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [label, colour] of Object.entries(value).slice(0, 2000)) {
    const hex = normaliseColour(colour);
    if (!customLabelError(label) && hex) result[labelColourKey(label)] = hex;
  }
  return result;
}

// Retain conflicting explicit choices; matching legacy colours become inheritance.
export function migrateLabelColours(labels: Record<string, string>, overrides: Record<string, string>,
  saved: Record<string, string>, inherited: Record<string, string | undefined>) {
  const colours = readLabelColours(saved), chats = { ...overrides };
  let count = Object.keys(colours).length;
  const keys = Object.keys(labels).sort();
  for (const source of [overrides, inherited]) {
    for (const key of keys) {
      const label = labelColourKey(labels[key]), colour = normaliseColour(source[key]);
      if (!colours[label] && colour && count < 2000) { colours[label] = colour; count++; }
    }
  }
  for (const key of keys) {
    if (normaliseColour(chats[key]) === colours[labelColourKey(labels[key])]) delete chats[key];
  }
  return { colours, chats };
}
