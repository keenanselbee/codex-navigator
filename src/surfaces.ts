export interface Surface {
  id: string;
  kind: 'sidebar' | 'panel';
  key: string | null;
  uri: string | null;
  visible: boolean;
  routeKnown: boolean;
}

export interface SurfaceState {
  protocol: 2;
  revision: number;
  activeId: string | null;
  surfaces: Surface[];
}

export function readSurfaceState(value: unknown): SurfaceState | undefined {
  if (!value || typeof value !== 'object') { return undefined; }
  const record = value as SurfaceState;
  if (record.protocol !== 2 || !Number.isSafeInteger(record.revision) || record.revision < 0
    || (record.activeId !== null && typeof record.activeId !== 'string')
    || !Array.isArray(record.surfaces) || record.surfaces.length > 200) { return undefined; }
  if (!record.surfaces.every(surface => surface && typeof surface.id === 'string'
    && (surface.kind === 'sidebar' || surface.kind === 'panel')
    && (surface.key === null || (typeof surface.key === 'string' && /^(local|remote)\/[a-zA-Z0-9_-]+$/.test(surface.key)))
    && (surface.uri === null || typeof surface.uri === 'string')
    && typeof surface.visible === 'boolean' && typeof surface.routeKnown === 'boolean')) { return undefined; }
  return record;
}
