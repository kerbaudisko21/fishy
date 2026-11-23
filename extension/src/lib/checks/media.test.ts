import { describe, expect, it } from 'vitest';
import { scanPicture } from './media';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('hard evidence in a picture (scanPicture)', () => {
  it('reads the IPTC "made by AI" label inside Content Credentials', () => {
    const f = scanPicture(bytes('\xff\xd8 jumb....c2pa.assertions ... "digitalSourceType":"http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"'));
    expect(f.credentials).toBe(true);
    expect(f.aiLabel).toBe('Content Credentials say it was made by AI');
    expect(f.checks[0].ok).toBe(false);
  });

  it('tells "part made by AI" from "made by AI"', () => {
    expect(scanPicture(bytes('Iptc4xmpExt:DigitalSourceType="compositeWithTrainedAlgorithmicMedia"')).aiLabel).toContain('part made by AI');
  });

  it('names the AI tool from the creator field or the Stable Diffusion settings', () => {
    expect(scanPicture(bytes('<x:xmpmeta xmp:CreatorTool="Adobe Firefly"/>')).aiTool).toBe('Adobe Firefly');
    expect(scanPicture(bytes('\x89PNG tEXtparameters\0a cat, Steps: 30, Sampler: Euler a, CFG scale: 7')).aiTool).toBe('Stable Diffusion');
  });

  it('names a photo editor', () => {
    const f = scanPicture(bytes('<x:xmpmeta xmp:CreatorTool="Adobe Photoshop 26.1 (Windows)"/>'));
    expect(f.editedWith).toBe('Photoshop');
    expect(f.aiTool).toBeUndefined();
  });

  it('never calls a file without marks authentic', () => {
    const f = scanPicture(bytes('\xff\xd8 plain jpeg bytes'));
    expect(f.checks).toHaveLength(1);
    expect(f.checks[0].title).toBe('No AI or editing marks in the file');
    expect(f.checks[0].detail).toContain('proves nothing');
  });
});
