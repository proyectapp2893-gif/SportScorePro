import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 300,
          fontWeight: 900,
          letterSpacing: -24,
          fontFamily: 'Arial',
        }}
      >
        <span style={{ color: '#2563eb' }}>S</span>
        <span style={{ color: '#f97316', marginLeft: -24 }}>S</span>
      </div>
    ),
    size,
  );
}
