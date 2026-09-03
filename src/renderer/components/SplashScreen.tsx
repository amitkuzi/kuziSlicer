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
      style={{
        background: '#1b1a18',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
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
              fontFamily: "'Archivo', -apple-system, sans-serif",
            }}
          >
            kuziSlicer
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
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
          {/* Left: 3D printer iso */}
          <div
            style={{
              position: 'relative',
              height: '100%',
              maxHeight: '480px',
              perspective: '2600px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transformStyle: 'preserve-3d',
                transform: 'rotateX(-20deg) rotateY(-36deg)',
              }}
            >
              {/* Enclosure box */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(247,244,238,0.4)',
                  background: 'rgba(247,244,238,0.03)',
                  transform: 'translateZ(105px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(247,244,238,0.22)',
                  transform: 'translateZ(-105px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(247,244,238,0.3)',
                  background: 'rgba(247,244,238,0.05)',
                  transform: 'rotateY(90deg) translateZ(105px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(247,244,238,0.22)',
                  transform: 'rotateY(-90deg) translateZ(105px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(247,244,238,0.3)',
                  background: 'rgba(247,244,238,0.06)',
                  transform: 'rotateX(90deg) translateZ(105px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(247,244,238,0.28)',
                  background: 'rgba(247,244,238,0.04)',
                  transform: 'rotateX(-90deg) translateZ(105px)',
                }}
              />

              {/* Heated bed */}
              <div
                style={{
                  position: 'absolute',
                  left: '14%',
                  top: '14%',
                  width: '72%',
                  height: '72%',
                  border: '1px solid oklch(0.7 0.18 46 / 0.75)',
                  background: 'oklch(0.68 0.19 45 / 0.14)',
                  transform: 'rotateX(-90deg) translateZ(92px)',
                  backgroundImage:
                    'linear-gradient(oklch(0.7 0.18 46 / 0.25) 1px, transparent 1px), linear-gradient(90deg, oklch(0.7 0.18 46 / 0.25) 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '8%',
                    right: '8%',
                    top: '16%',
                    height: '2px',
                    background: 'rgba(247,244,238,0.3)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '8%',
                    right: '8%',
                    bottom: '16%',
                    height: '2px',
                    background: 'rgba(247,244,238,0.3)',
                  }}
                />
              </div>

              {/* X gantry rail and carriage */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '26%',
                  height: '6px',
                  background: 'rgba(247,244,238,0.45)',
                  transform: 'translateZ(0px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '40%',
                  top: '26%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transform: 'translateZ(6px)',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '38px',
                    height: '26px',
                    border: '1px solid rgba(247,244,238,0.5)',
                    background: '#201f1c',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '4px',
                      top: '4px',
                      width: '10px',
                      height: '3px',
                      background: 'oklch(0.7 0.18 46 / 0.9)',
                    }}
                  />
                </div>
                <div
                  style={{
                    width: '14px',
                    height: '6px',
                    background: 'rgba(247,244,238,0.45)',
                  }}
                />
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '12px solid rgba(247,244,238,0.75)',
                  }}
                />
              </div>

              {/* Printed part on bed */}
              <div
                style={{
                  position: 'absolute',
                  left: '38%',
                  bottom: '12%',
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  alignItems: 'center',
                  gap: '2px',
                  transform: 'translateZ(0px)',
                }}
              >
                {[
                  { w: 52, o: 0.95 },
                  { w: 44, o: 0.85 },
                  { w: 34, o: 0.72 },
                  { w: 24, o: 0.6 },
                  { w: 14, o: 0.48 },
                ].map((layer, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${layer.w}px`,
                      height: '5px',
                      background: `oklch(0.64 0.19 45 / ${layer.o})`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Callouts + progress */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {[
                { num: '01', label: 'hotend profile · 0.4 mm' },
                { num: '02', label: 'build plate · 200 × 200 mm' },
                { num: '03', label: 'slicing toolpaths', active: true },
                { num: '04', label: 'g-code export', inactive: true },
              ].map((item) => (
                <div
                  key={item.num}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    opacity: item.inactive ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border:
                        item.active || item.inactive
                          ? '1.5px solid rgba(247,244,238,0.5)'
                          : '1.5px solid oklch(0.7 0.18 46)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      fontWeight: 600,
                      color: item.active
                        ? 'oklch(0.75 0.16 50)'
                        : '#f7f4ee',
                    }}
                  >
                    {item.num}
                  </span>
                  <span
                    style={{
                      width: '32px',
                      height: '1px',
                      background:
                        item.active || item.inactive
                          ? 'rgba(247,244,238,0.3)'
                          : 'oklch(0.7 0.18 46 / 0.65)',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '13px',
                      letterSpacing: '0.06em',
                      color: item.active ? '#f7f4ee' : '#ddd5ca',
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  height: '2px',
                  background: 'rgba(247,244,238,0.14)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'oklch(0.68 0.19 45)',
                    animation:
                      'kz-fill 4.2s cubic-bezier(0.2,0.8,0.2,1) infinite',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#a49c92',
                  }}
                >
                  Initializing…
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#a49c92',
                  }}
                >
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
          fontFamily: "'JetBrains Mono', monospace",
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
          0% { transform: scaleX(0.04); }
          70% { transform: scaleX(0.82); }
          100% { transform: scaleX(0.97); }
        }
      `}</style>
    </div>
  )
}
