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

  it('finds an AI image generator from the creator field or the generation settings', () => {
    expect(scanPicture(bytes('<x:xmpmeta xmp:CreatorTool="Adobe Firefly"/>')).aiTool).toBe('an AI image generator');
    expect(scanPicture(bytes('\x89PNG tEXtparameters\0a cat, Steps: 30, Sampler: Euler a, CFG scale: 7')).aiTool).toBe('an AI image generator');
  });

  it('finds a photo editor, and does not take it for an AI generator', () => {
    const f = scanPicture(bytes('<x:xmpmeta xmp:CreatorTool="Adobe Photoshop 26.1 (Windows)"/>'));
    expect(f.editedWith).toBe('a photo editor');
    expect(f.aiTool).toBeUndefined();
  });

  it('trusts a name that is also an everyday word only in the creator field', () => {
    // "gemini" in a caption is not a tool; in the creator field it is.
    expect(scanPicture(bytes('\xff\xd8 caption: gemini twins at the zoo')).aiTool).toBeUndefined();
    expect(scanPicture(bytes('<x:xmpmeta xmp:CreatorTool="Gemini"/>')).aiTool).toBe('an AI image generator');
  });

  it('says what kind of tool wrote the file, never the product name', () => {
    const files = [
      '<x:xmpmeta xmp:CreatorTool="Midjourney"/>',
      '<x:xmpmeta xmp:CreatorTool="Adobe Firefly"/>',
      '<x:xmpmeta xmp:CreatorTool="Adobe Photoshop 26.1 (Windows)"/>',
      '<x:xmpmeta xmp:CreatorTool="Canva"/>',
      '\x89PNG tEXtparameters\0a cat, Steps: 30, Sampler: Euler a, CFG scale: 7',
    ];
    for (const file of files) {
      const facts = scanPicture(bytes(file));
      const shown = [facts.aiLabel, facts.aiTool, facts.editedWith, ...facts.checks.flatMap((c) => [c.title, c.detail])].join(' | ');
      expect(shown).not.toMatch(/midjourney|firefly|adobe|photoshop|canva|stable diffusion/i);
      expect(facts.checks.some((c) => !c.ok)).toBe(true);
    }
  });

  it('never calls a file without marks authentic', () => {
    const f = scanPicture(bytes('\xff\xd8 plain jpeg bytes'));
    expect(f.checks).toHaveLength(1);
    expect(f.checks[0].title).toBe('No AI or editing marks in the file');
    expect(f.checks[0].detail).toContain('isn’t evidence either way');
  });
});
