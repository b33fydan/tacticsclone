// Asset manifest + loader. Generated images live in /public/assets.
// Every draw call falls back to procedural shapes if an image is missing,
// but the shipped game is expected to have the full set.

export type Pose = 'idle' | 'walk' | 'attack' | 'cast' | 'ko';
const JOBS = ['bulwark', 'skywarden', 'embercaller', 'dawnmender', 'duskblade'];
const POSES: Pose[] = ['idle', 'walk', 'attack', 'cast', 'ko'];

function buildManifest(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const j of JOBS) {
    for (const p of POSES) m[`unit_${j}_${p}`] = `/assets/units/${j}_${p}.png`;
    m[`portrait_${j}`] = `/assets/portraits/${j}.png`;
  }
  for (const t of ['grass', 'dirt', 'stone', 'water', 'sand', 'cliff']) {
    m[`terr_${t}`] = `/assets/terrain/${t}.png`;
  }
  for (const p of ['tree', 'rock', 'crate', 'pillar']) {
    m[`prop_${p}`] = `/assets/props/${p}.png`;
  }
  for (const f of ['slash', 'impact', 'arrow', 'fire', 'heal', 'buff', 'revive', 'ko', 'poison']) {
    m[`fx_${f}`] = `/assets/fx/${f}.png`;
  }
  const icons = [
    'attack', 'bash', 'rampart', 'crush', 'pin', 'pierce', 'volley',
    'ember', 'lance', 'storm', 'mend', 'circle', 'bless', 'revive',
    'backstab', 'step', 'venom',
    'tonic', 'mana', 'bloom', 'leaf',
    'sword', 'bow', 'rod', 'staff', 'dagger', 'armor', 'boots', 'ring', 'charm', 'amulet',
  ];
  for (const i of icons) m[`icon_${i}`] = `/assets/icons/${i}.png`;
  // aliases: some trinkets share art
  m['icon_armlet'] = '/assets/icons/charm.png';
  m['icon_band'] = '/assets/icons/amulet.png';
  m['icon_anklet'] = '/assets/icons/boots.png';
  m['icon_pendant'] = '/assets/icons/amulet.png';
  m['bg_title'] = '/assets/ui/bg_title.png';
  m['bg_campaign'] = '/assets/ui/bg_campaign.png';
  m['banner_victory'] = '/assets/ui/banner_victory.png';
  m['banner_defeat'] = '/assets/ui/banner_defeat.png';
  return m;
}

export const MANIFEST = buildManifest();

const images = new Map<string, HTMLImageElement>();
let loadStarted = false;

export function loadAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (loadStarted) return Promise.resolve();
  loadStarted = true;
  const entries = Object.entries(MANIFEST);
  let done = 0;
  return new Promise((resolve) => {
    if (!entries.length) return resolve();
    for (const [k, url] of entries) {
      const img = new Image();
      img.onload = () => {
        images.set(k, img);
        done++;
        onProgress?.(done, entries.length);
        if (done === entries.length) resolve();
      };
      img.onerror = () => {
        done++;
        onProgress?.(done, entries.length);
        if (done === entries.length) resolve();
      };
      img.src = url;
    }
  });
}

export function getImage(key: string): HTMLImageElement | undefined {
  return images.get(key);
}

export function unitSprite(job: string, pose: Pose): HTMLImageElement | undefined {
  return images.get(`unit_${job}_${pose}`) ?? images.get(`unit_${job}_idle`);
}
