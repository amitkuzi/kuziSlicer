import React, { useEffect, useState } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true)
      setTimeout(onComplete, 300)
    }, 3000)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div
      className={`fixed inset-0 ${fadeOut ? 'fade-out' : 'fade-in'}`}
      style={{ background: '#1b1a18', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Grid background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(247,244,238,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(247,244,238,0.04) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />

      {/* Header */}
      <div style={{ position: 'relative', padding: '60px 80px 0', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '18px' }}>
          <div
            style={{
              fontSize: '42px',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              color: '#f7f4ee',
              lineHeight: 1,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            kuziSlicer
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'oklch(0.7 0.16 48)',
            }}
          >
            assembly · rev A
          </div>
        </div>
        <div
          style={{
            marginTop: '60px',
            height: '1px',
            background: 'rgba(247,244,238,0.16)',
          }}
        />
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          padding: '40px 80px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr',
            gap: '80px',
            alignItems: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Left: Simple 3D printer icon */}
          <div
            style={{
              position: 'relative',
              height: '100%',
              maxHeight: '480px',
              perspective: '2600px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 256 256" width="200" height="200" style={{ opacity: 0.8 }}>
              {/* Simplified printer */}
              <rect x="40" y="40" width="176" height="176" fill="none" stroke="rgba(247,244,238,0.3)" strokeWidth="2" rx="8" />
              <rect x="80" y="80" width="96" height="96" fill="none" stroke="rgba(228,99,45,0.4)" strokeWidth="2" />
              <circle cx="128" cy="100" r="8" fill="rgba(228,99,45,0.6)" />
              <rect x="100" y="140" width="56" height="12" fill="rgba(228,99,45,0.5)" rx="4" />
              <line x1="40" y1="180" x2="216" y2="180" stroke="rgba(247,244,238,0.2)" strokeWidth="2" />
            </svg>
          </div>

          {/* Right: Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {['hotend profile · 0.4 mm', 'build plate · 200 × 200 mm', 'slicing toolpaths', 'g-code export'].map((label, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: i < 3 ? 1 : 0.5 }}>
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: `1.5px solid ${i === 2 ? 'oklch(0.7 0.18 46)' : 'rgba(247,244,238,0.5)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: i === 2 ? 'oklch(0.75 0.16 50)' : '#f7f4ee',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ width: '32px', height: '1px', background: 'rgba(247,244,238,0.3)' }} />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      letterSpacing: '0.06em',
                      color: i === 2 ? '#f7f4ee' : '#ddd5ca',
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ height: '2px', background: 'rgba(247,244,238,0.14)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'oklch(0.68 0.19 45)',
                    width: '62%',
                    animation: 'kz-fill 4.2s cubic-bezier(0.2,0.8,0.2,1) infinite',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a49c92' }}>
                  Initializing…
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a49c92' }}>
                  v0.0.1
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'relative',
          padding: '0 80px 60px',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'monospace',
          fontSize: '10px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(247,244,238,0.3)',
          zIndex: 10,
        }}
      >
        <span>assembly · rev A</span>
        <span>kuziSlicer FDM engine</span>
      </div>

      <style>{`
        @keyframes kz-fill {
          0% { width: 4%; }
          70% { width: 82%; }
          100% { width: 97%; }
        }
      `}</style>
    </div>
  )
}
