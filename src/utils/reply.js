import { AttachmentBuilder } from 'discord.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, '../../assets/orbweaver-logo.png');

export function brandLogo() {
  return new AttachmentBuilder(LOGO_PATH, { name: 'orbweaver-logo.png' });
}

/** Attach the Orbweaver logo to any reply payload. */
export function withBrand(payload = {}) {
  const files = payload.files ?? [];
  const hasLogo = files.some(f => f?.name === 'orbweaver-logo.png' || f?.attachment?.name === 'orbweaver-logo.png');
  return {
    ...payload,
    files: hasLogo ? files : [brandLogo(), ...files],
  };
}
