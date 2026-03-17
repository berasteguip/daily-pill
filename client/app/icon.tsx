import { ImageResponse } from 'next/og';
import { PILL_EMOJI } from '@/lib/branding';

export const size = {
  width: 64,
  height: 64,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'transparent',
          fontSize: 56,
          lineHeight: 1,
        }}
      >
        {PILL_EMOJI}
      </div>
    ),
    {
      ...size,
      emoji: 'twemoji',
    }
  );
}
