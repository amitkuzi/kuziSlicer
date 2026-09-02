import React, { useEffect, useState } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [fadeOut, setFadeOut] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + Math.random() * 40
      })
    }, 200)

    // After 2 seconds, fade out
    const timer = setTimeout(() => {
      setFadeOut(true)
      setTimeout(onComplete, 300)
    }, 2000)

    return () => {
      clearInterval(interval)
      clearTimeout(timer)
    }
  }, [onComplete])

  return (
    <div
      className={`fixed inset-0 bg-ground flex flex-col items-center justify-center ${
        fadeOut ? 'fade-out' : 'fade-in'
      }`}
    >
      {/* Logo */}
      <div className="mb-12">
        <svg
          viewBox="0 0 100 100"
          className="w-24 h-24 text-ember"
          fill="currentColor"
        >
          {/* Simple geometric logo placeholder */}
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M 50 20 L 80 80 L 20 80 Z" fill="currentColor" opacity="0.8" />
        </svg>
      </div>

      {/* Loading text */}
      <h1 className="text-3xl font-bold text-fg mb-2">kuziSlicer</h1>
      <p className="text-fg2 mb-8 text-lg">Starting kuziSlicer...</p>

      {/* Progress bar */}
      <div className="w-48 h-1 bg-fg2 rounded-full overflow-hidden">
        <div
          className="h-full bg-ember rounded-full transition-all duration-300"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* Footer text */}
      <p className="text-fg2 text-sm mt-8 opacity-60">v0.0.1</p>
    </div>
  )
}
