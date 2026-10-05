import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

// Windows SoundPlayer and ALSA aplay have no per-stream gain. Attenuate a copy, never
// the installed sound or system mixer. Unsupported formats fail into the next source.
export function attenuateWav(source: Buffer, gain: number): Buffer {
  if (source.toString('ascii', 0, 4) !== 'RIFF' || source.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Unsupported WAV');
  const end = source.readUInt32LE(4) + 8;
  if (end > source.length || gain < 0 || gain > 1 || !Number.isFinite(gain)) throw new Error('Invalid WAV or gain');
  const result = Buffer.from(source);
  let format = 0, bits = 0;
  const chunks: Array<[number, number]> = [];
  for (let offset = 12; offset + 8 <= end;) {
    const id = source.toString('ascii', offset, offset + 4), size = source.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > end) throw new Error('Truncated WAV');
    if (id === 'fmt ') {
      if (size < 16) throw new Error('Invalid WAV format');
      format = source.readUInt16LE(start); bits = source.readUInt16LE(start + 14);
      if (format === 0xfffe) {
        if (size < 40 || source.readUInt16LE(start + 16) < 22 || source.subarray(start + 26, start + 40).toString('hex') !== '000000001000800000aa00389b71') throw new Error('Unsupported WAV subtype');
        format = source.readUInt16LE(start + 24);
      }
    } else if (id === 'data') chunks.push([start, size]);
    offset = start + size + (size % 2);
  }
  if (!chunks.length || !(format === 1 && [8, 16, 24, 32].includes(bits) || format === 3 && [32, 64].includes(bits))) throw new Error('Unsupported WAV samples');
  const width = bits / 8;
  for (const [start, size] of chunks) {
    if (size % width) throw new Error('Truncated WAV samples');
    for (let offset = start; offset < start + size; offset += width) {
      if (format === 3) {
        if (bits === 32) result.writeFloatLE(source.readFloatLE(offset) * gain, offset);
        else result.writeDoubleLE(source.readDoubleLE(offset) * gain, offset);
      } else if (bits === 8) result[offset] = Math.round((source[offset] - 128) * gain) + 128;
      else result.writeIntLE(Math.round(source.readIntLE(offset, width) * gain), offset, width);
    }
  }
  return result;
}

export async function playAdjustedWav(filename: string, volume: number, play: (filename: string) => Promise<boolean>): Promise<boolean> {
  let directory: string | undefined;
  try {
    if (volume === 100) return await play(filename);
    if ((await stat(filename)).size > 16 * 1024 * 1024) return false;
    const adjusted = attenuateWav(await readFile(filename), volume / 100);
    directory = await mkdtemp(path.join(tmpdir(), 'codex-navigator-sound-'));
    const temporary = path.join(directory, 'notification.wav');
    await writeFile(temporary, adjusted, { mode: 0o600 });
    return await play(temporary);
  } catch { return false; }
  finally { if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {}); }
}
