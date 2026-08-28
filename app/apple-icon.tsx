import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#ffffff',
          fontSize: 108,
          fontWeight: 900,
          letterSpacing: -10,
          fontFamily: 'Arial',
        }}
      >
        <span style={{ color: '#2563eb' }}>S</span>
        <span style={{ color: '#f97316', marginLeft: -10 }}>S</span>
      </div>
    ),
    size,
  );
}
