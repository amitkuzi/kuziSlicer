import React, { useState } from 'react'
import { SplashScreen } from './components/SplashScreen'
import { MainWindow } from './components/MainWindow'

export const App: React.FC = () => {
  const [appReady, setAppReady] = useState(false)

  return appReady ? <MainWindow /> : <SplashScreen onComplete={() => setAppReady(true)} />
}
